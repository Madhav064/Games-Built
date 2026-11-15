import './ui/styles.css';
import { Game } from './game/game';
import { COIN, Hud } from './ui/hud';
import { Progress, type Rank, type Settings } from './game/progress';
import { PLANETS, type PlanetDef } from './engine/planets';
import { prewarm } from './engine/planetCache';
import { WEAPONS, type WeaponDef } from './game/weapons';
import { applyMissionEvent, describeMission, ensureMissions, missionProgressText, type MissionContext, type MissionEvent } from './game/missions';
import { ACHIEVEMENTS, checkAchievements, claimedTiers } from './game/achievements';
import { ORBITER_REWARD } from './game/orbiters';
import * as sdk from './sdk/crazygames';
import * as sfx from './audio/sfx';

// Break ads (CrazyGames QA): only at a natural break after a planet is destroyed, never on
// menu/shop/settings navigation, not in the first 90 s, at most every 2 minutes here (the SDK
// also enforces its own 3-minute cap).
const SESSION_START = performance.now();
const AD_FIRST_DELAY = 90_000;
const AD_COOLDOWN = 120_000;
let lastBreakAd = -Infinity;

/** Coins earned per point of XP. */
const COINS_PER_XP = 1;
/** Coins from the shop's rewarded-ad bundle, and how often it can be claimed. */
const FREE_COINS = 150;
const FREE_COINS_COOLDOWN = 180_000;
/** One-time coins on a new player's first results screen. */
const STARTER_COINS = 300;

// Dev only: `?mute` silences everything from the first frame (survives Vite reloads, never ships).
if (import.meta.env.DEV && new URLSearchParams(location.search).has('mute')) sfx.setDevMute(true);

async function boot(): Promise<void> {
  await sdk.initSDK();
  sdk.loadingStart();

  const device = sdk.deviceType();
  const progress = new Progress();
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const game = new Game(canvas, device !== 'desktop');

  let inGame = false;
  let resultsShown = false;
  let adPlaying = false;
  /** A rewarded ad was watched at this break, so no break ad follows it (QA: never both). */
  let rewardedThisBreak = false;
  let lastDestroyXp = 0;
  let lastDestroyKilled = 0;
  let lastDestroyShots = 0;
  /** Extra reward lines on the results screen (the one-time starter bonus). */
  let lastDestroyExtras: { value: string; label: string }[] = [];

  const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

  const syncWallet = () => {
    hud.setCoins(progress.state.coins);
    hud.setOwned(progress.state.ownedWeapons, progress.state.ownedPlanets);
    hud.setRank(progress.rank, progress.rankProgress);
  };

  // ---------------------------------------------------------------------------
  // Missions and achievements
  // ---------------------------------------------------------------------------
  const missionCtx = (): MissionContext => ({
    ownedWeapons: progress.state.ownedWeapons, ownedPlanets: progress.state.ownedPlanets, currentPlanet: game.planetDef.id,
  });

  /** Push the current missions and achievements to the Goals screen. */
  const refreshGoals = () => {
    const s = progress.state;
    ensureMissions(s.missions, missionCtx()); // never show an empty list, whatever reset the save
    const missions = s.missions.map(m => {
      const text = missionProgressText(m);
      return { text: describeMission(m), progress: text, frac: text === null ? 0 : m.progress / m.target, reward: m.reward };
    });
    const achievements = ACHIEVEMENTS.map(def => {
      const claimed = claimedTiers(s, def.id);
      const done = claimed >= def.tiers.length;
      const next = def.tiers[Math.min(claimed, def.tiers.length - 1)];
      const value = def.value(s);
      const frac = done ? 1 : Math.min(1, value / next.target);
      const progressText = done ? 'Complete' : next.target <= 10000 ? `${fmt(Math.min(value, next.target))} / ${fmt(next.target)}` : `${Math.floor(frac * 100)}%`;
      return { name: def.name, desc: def.desc(next.target), icon: def.icon, tiers: def.tiers.length, claimed, frac, progress: progressText, reward: done ? null : next.reward };
    });
    hud.setGoals(missions, achievements);
  };

  /** Pay out newly reached achievement tiers. */
  const checkAch = () => {
    const got = checkAchievements(progress.state);
    if (!got.length) return;
    for (const { def, tier } of got) {
      const reward = def.tiers[tier].reward;
      progress.addCoins(reward);
      hud.toast(`Achievement: ${def.name} · ${COIN} +${fmt(reward)}`, 'level', 3400);
    }
    sfx.levelUp();
    sdk.happyTime(); // a real achievement (QA: happytime only for those, sparingly)
    syncWallet();
    progress.queueSave();
    refreshGoals();
  };

  /** Feed an event to the missions; completed ones pay out and are replaced. */
  const missionEvent = (e: MissionEvent) => {
    if (!inGame) return;
    ensureMissions(progress.state.missions, missionCtx());
    const done = applyMissionEvent(progress.state.missions, e, missionCtx());
    for (const m of done) {
      progress.addCoins(m.reward);
      hud.toast(`Mission complete: ${describeMission(m)} · ${COIN} +${fmt(m.reward)}`, 'level', 3400);
    }
    if (done.length) { sfx.purchase(); syncWallet(); }
    progress.queueSave();
    refreshGoals();
  };

  /** Per-planet tracking for missions: weapons used and people lost so far. */
  const weaponsUsed = new Set<string>();
  let killedOnPlanet = 0;

  const applySettings = (s: Settings) => {
    sfx.setVolume(s.masterVolume, s.sfxVolume);
    // The platform's mute always wins over the in-game setting.
    sfx.setMuted(s.muted || sdk.getPlatformSettings().muteAudio);
    game.rig.shakeEnabled = s.screenShake;
    hud.applySettings(s);
  };

  // ---------------------------------------------------------------------------
  // Pausing and gameplayStart/Stop: any menu or dialog over the game is a break.
  // ---------------------------------------------------------------------------
  /**
   * Held while a dialog leads into an ad (weapon trial), so closing the dialog doesn't
   * resume gameplay for a moment before the ad request. Play resumes once the ad is done.
   */
  let adFlowHold = 0;
  const menuOverGame = () => hud.shopOpen || hud.settingsOpen || hud.planetsOpen || hud.goalsOpen || hud.dialogOpen || adFlowHold > 0;
  const refreshPause = () => game.setPaused(adPlaying || (inGame && menuOverGame()));
  /** Call after closing anything: resumes gameplay if nothing else is covering it. */
  const resumeIfPlaying = () => {
    if (inGame && !resultsShown && !menuOverGame()) sdk.gameplayStart();
    refreshPause();
  };
  const pauseForMenu = () => {
    if (inGame) sdk.gameplayStop();
    refreshPause();
  };

  const openOverlay = (show: () => void) => { sfx.click(); show(); pauseForMenu(); };
  const closeOverlay = (hide: () => void) => { sfx.click(); hide(); resumeIfPlaying(); };

  // ---------------------------------------------------------------------------
  // Ads: input is blocked by a spinner until the SDK answers.
  // ---------------------------------------------------------------------------
  const withSpinner = async <T,>(fn: () => Promise<T>): Promise<T> => {
    hud.setBusy(true);
    try { return await fn(); } finally { hud.setBusy(false); }
  };

  const breakAd = async (): Promise<void> => {
    if (rewardedThisBreak) return;
    const now = performance.now();
    if (now - SESSION_START < AD_FIRST_DELAY || now - lastBreakAd < AD_COOLDOWN) return;
    if (!sdk.isOnCrazyGames()) return;
    lastBreakAd = now;
    await withSpinner(() => sdk.requestBreakAd());
  };

  const rewardedAd = async (): Promise<boolean> => {
    const ok = await withSpinner(() => sdk.requestRewardedAd());
    if (!ok) hud.toast(sdk.canShowRewarded() ? 'No ad available right now. Try again later.' : 'Ads are not available right now');
    return ok;
  };

  const freeCoinsLeft = () => Math.max(0, (progress.state.freeCoinsAt + FREE_COINS_COOLDOWN - Date.now()) / 1000);
  const refreshFreeCoins = () => hud.setFreeCoins(sdk.canShowRewarded(), freeCoinsLeft(), FREE_COINS);
  window.setInterval(() => { if (hud.shopOpen) refreshFreeCoins(); }, 1000);

  // ---------------------------------------------------------------------------
  // Flow
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // First-minute help: "tap the planet" pointer, then two one-line tips.
  // ---------------------------------------------------------------------------
  const refreshTips = () => {
    const s = progress.state;
    const on = inGame && !resultsShown && !game.destroyed && s.settings.hints;
    hud.showTapPrompt(on && s.tipsDone === 0);
    const verb = hud.deviceType === 'desktop' ? 'click' : 'tap';
    if (!on || s.tipsDone === 0 || s.tipsDone >= 3) hud.showTip(null);
    else if (s.tipsDone === 1) hud.showTip(`Nice! Now <b>hold</b> your ${verb} to fire a volley`, game.weapon.projectile ? null : 'missile');
    else hud.showTip('Try the free <b>Laser</b>: select it, then hold and drag across the planet', game.weapon.id === 'laser' ? null : 'laser');
  };
  /** Marks tip `n` (1..3) done if it's the current one. */
  const completeTip = (n: number) => {
    if (progress.state.tipsDone !== n - 1) return;
    progress.state.tipsDone = n;
    progress.queueSave();
    refreshTips();
  };

  /** Load a planet behind a quick fade. A brand-new player's first planet breaks twice as fast. */
  const loadBehindFade = (work: () => void) => hud.fadeThrough(() => {
    game.setEasyBreak(progress.state.planetsDestroyed === 0);
    work();
  });

  const enterPlanet = async (id: string) => {
    const def = PLANETS.find(p => p.id === id) ?? PLANETS[0];
    await loadBehindFade(() => {
      hud.hidePlanets();
      hud.hideResults();
      resultsShown = false;
      rewardedThisBreak = false;
      progress.state.lastPlanet = def.id;
      progress.queueSave();
      // Trials last for one planet; drop back to a weapon the player owns.
      if (hud.clearTrials()) game.selectWeapon(WEAPONS[0].id);
      game.loadPlanet(def);
      if (!inGame) {
        inGame = true;
        game.setInputEnabled(true);
        hud.hideMenu();
        hud.showHud();
        game.rig.reset();
      }
    });
    refreshTips();
    sdk.gameplayStart();
    refreshPause();
  };

  /** Back to the main menu, with a fresh copy of `planet` (default: the current one) behind it. */
  const goToMenu = async (planet?: PlanetDef) => {
    sdk.gameplayStop();
    inGame = false;
    resultsShown = false;
    refreshTips();
    await loadBehindFade(() => {
      hud.hideSettings();
      hud.hideShop();
      hud.hideGoals();
      hud.hidePlanets();
      hud.hideResults();
      if (hud.clearTrials()) game.selectWeapon(WEAPONS[0].id);
      game.setInputEnabled(false);
      game.timeScale = 1;
      // A fresh planet spins behind the menu.
      if (planet) game.loadPlanet(planet); else game.resetPlanet();
      game.rig.reset();
      game.rig.zoom(1.25);
      hud.showMenu();
    });
    refreshPause();
  };

  /** Rebuild the current planet; a break ad may play if the last one was destroyed. */
  const rebuild = async () => {
    sdk.gameplayStop();
    if (game.destroyed) await breakAd();
    rewardedThisBreak = false;
    await loadBehindFade(() => {
      hud.hideResults();
      resultsShown = false;
      game.resetPlanet();
    });
    refreshTips();
    resumeIfPlaying();
  };

  const unlocked = (name: string) => {
    sfx.purchase();
    hud.toast(`Unlocked ${name}!`, 'level', 2600);
    syncWallet();
    // New gear can open up new missions (e.g. Cryo -> shatter goals) and the arsenal achievement.
    ensureMissions(progress.state.missions, missionCtx());
    checkAch();
    refreshGoals();
  };

  const buyWeapon = (w: WeaponDef): boolean => {
    if (!progress.buy('weapon', w.id, w.price)) { hud.toast('Not enough coins'); return false; }
    unlocked(w.name);
    return true;
  };
  const buyPlanet = (p: PlanetDef): boolean => {
    if (!progress.buy('planet', p.id, p.price)) { hud.toast('Not enough coins'); return false; }
    prewarm([p]);
    unlocked(p.name);
    return true;
  };

  const selectPlanet = async (p: PlanetDef) => {
    sfx.click();
    hud.hidePlanets();
    hud.hideResults();
    // Switching away from a destroyed planet is a natural break; switching mid-play is navigation.
    if (inGame && game.destroyed) { sdk.gameplayStop(); await breakAd(); }
    await enterPlanet(p.id);
  };

  const hud = new Hud(document.getElementById('ui')!, {
    // One click from the menu straight into gameplay (QA: at most one click before play).
    onPlay: () => {
      sfx.click();
      const id = progress.ownsPlanet(progress.state.lastPlanet) ? progress.state.lastPlanet : PLANETS[0].id;
      void enterPlanet(id);
    },
    onOpenShop: () => openOverlay(() => { hud.showShop(); refreshFreeCoins(); }),
    onOpenGoals: () => openOverlay(() => { refreshGoals(); hud.showGoals(); }),
    onCloseGoals: () => closeOverlay(() => hud.hideGoals()),
    onCloseShop: () => closeOverlay(() => hud.hideShop()),
    onOpenSettings: () => openOverlay(() => hud.showSettings(progress.state.settings, inGame)),
    onCloseSettings: () => closeOverlay(() => hud.hideSettings()),
    onSelectPlanet: p => void selectPlanet(p),
    onLockedPlanet: async p => {
      sfx.click();
      const coins = progress.state.coins;
      const can = coins >= p.price;
      const body = can
        ? `${p.blurb} You have ${fmt(coins)} coins.`
        : `You need ${fmt(p.price - coins)} more coins. Earn coins by destroying planets.`;
      const pick = await hud.choose(`Unlock ${p.name}?`, body, [{ label: `${COIN} ${fmt(p.price)}`, cls: 'btn-buy', disabled: !can }]);
      if (pick === 0 && buyPlanet(p)) void selectPlanet(p);
    },
    onSelectWeapon: w => { sfx.click(); game.selectWeapon(w.id); hud.selectWeapon(w.id); refreshTips(); },
    onLockedWeapon: async w => {
      sfx.click();
      const coins = progress.state.coins;
      const can = coins >= w.price;
      const ads = sdk.canShowRewarded();
      const body = `${w.blurb} ` + (can ? `You have ${fmt(coins)} coins.` : `You need ${fmt(w.price - coins)} more coins.`)
        + (ads ? ' Or watch a short ad to try it on this planet.' : '');
      const options = [{ label: `${COIN} ${fmt(w.price)}`, cls: 'btn-buy', disabled: !can }];
      if (ads) options.push({ label: '<span class="ad-tag">AD</span> Try it', cls: 'btn-reward', disabled: false });
      adFlowHold++;
      try {
        const pick = await hud.choose(w.name, body, options);
        if (pick === 0) {
          if (buyWeapon(w)) { game.selectWeapon(w.id); hud.selectWeapon(w.id); }
        } else if (pick === 1 && await rewardedAd()) {
          hud.grantTrial(w.id);
          game.selectWeapon(w.id);
          hud.selectWeapon(w.id);
          sfx.purchase();
          hud.toast(`${w.name} unlocked for this planet!`, 'level', 2600);
        }
      } finally {
        adFlowHold--;
        resumeIfPlaying();
      }
    },
    onBuy: (kind, id) => {
      if (kind === 'weapon') {
        const w = WEAPONS.find(x => x.id === id);
        if (w) buyWeapon(w);
      } else {
        const p = PLANETS.find(x => x.id === id);
        if (p) buyPlanet(p);
      }
    },
    onFreeCoins: async () => {
      sfx.click();
      if (freeCoinsLeft() > 0) return;
      if (await rewardedAd()) {
        progress.state.freeCoinsAt = Date.now();
        progress.addCoins(FREE_COINS);
        sfx.purchase();
        hud.toast(`+${FREE_COINS} ${COIN}`, 'xp');
        syncWallet();
      }
      refreshFreeCoins();
    },
    onReset: () => { sfx.click(); void rebuild(); },
    onOpenPlanets: () => openOverlay(() => hud.showPlanets(game.planetDef.id)),
    onToggleSlowMo: () => { game.timeScale = game.timeScale < 1 ? 1 : 0.3; return game.timeScale < 1; },
    onToggleSpin: () => { game.spin = !game.spin; return game.spin; },
    onSettingsChange: s => {
      progress.state.settings = s;
      progress.queueSave();
      refreshTips();
      applySettings(s);
    },
    onResetProgress: async () => {
      sfx.click();
      const ok = await hud.confirm('Reset all progress?', 'Your rank, coins and unlocked weapons and planets will be lost. Settings are kept. This cannot be undone.', 'Reset', 'Cancel', 'btn-danger');
      if (!ok) return;
      progress.reset();
      game.selectWeapon(WEAPONS[0].id);
      hud.selectWeapon(WEAPONS[0].id);
      syncWallet();
      ensureMissions(progress.state.missions, missionCtx());
      refreshGoals();
      await goToMenu(progress.ownsPlanet(game.planetDef.id) ? undefined : PLANETS[0]);
      // Fresh start: back to the new-player Missile.
      game.selectWeapon('missile');
      hud.selectWeapon('missile');
      hud.toast('Progress reset');
    },
    onMainMenu: () => { sfx.click(); void goToMenu(); },
    onDoubleRewards: async () => {
      if (await rewardedAd()) {
        rewardedThisBreak = true;
        const rank = progress.addXp(lastDestroyXp);
        progress.addCoins(lastDestroyXp * COINS_PER_XP);
        sfx.purchase();
        hud.toast(`+${fmt(lastDestroyXp * COINS_PER_XP)} bonus ${COIN}`, 'xp');
        if (rank) onRankUp(rank);
        syncWallet();
      }
    },
    onSmashAgain: () => { sfx.click(); void rebuild(); },
    onChoosePlanet: () => {
      sfx.click();
      hud.hideResults();
      hud.showPlanets(game.planetDef.id);
    },
    onBackFromPlanets: () => {
      sfx.click();
      hud.hidePlanets();
      if (resultsShown) {
        hud.showResults(game.planetDef, lastDestroyKilled, lastDestroyXp * COINS_PER_XP, sdk.canShowRewarded() && !rewardedThisBreak, lastDestroyShots, lastDestroyExtras);
      }
      resumeIfPlaying();
    },
  });

  hud.onDialogChange = open => (open ? pauseForMenu() : resumeIfPlaying());
  hud.setDevice(device);

  const onRankUp = (rank: Rank) => {
    sfx.levelUp();
    sdk.happyTime(); // reserved for rank-ups: QA says happytime is for real achievements only
    hud.toast(`Rank up! ${rank.name}`, 'level', 3500);
  };

  game.events.onStats = s => {
    hud.setStats(s.population, s.total, s.health);
    // People lost since the last update count toward missions and the extinction achievement.
    const killed = s.total - s.population;
    const delta = killed - killedOnPlanet;
    if (inGame && delta > 0) {
      killedOnPlanet = killed;
      progress.state.peopleKilled += delta;
      missionEvent({ type: 'killed', people: delta });
      checkAch();
    }
  };
  game.events.onPlanetLoaded = p => {
    hud.setPlanet(p);
    weaponsUsed.clear();
    killedOnPlanet = 0;
  };
  game.events.onOrbiterDown = kind => {
    if (!inGame) return;
    // Bonus coins (and the same XP), plus mission and achievement progress.
    const reward = ORBITER_REWARD[kind];
    const rank = progress.addXp(reward);
    progress.addCoins(reward);
    hud.coinGain(reward);
    progress.state.satellitesDown++;
    syncWallet();
    if (rank) onRankUp(rank);
    missionEvent({ type: 'satellite' });
    checkAch();
  };
  game.events.onShatter = () => {
    if (!inGame) return;
    progress.state.shatters++;
    missionEvent({ type: 'shatter' });
    checkAch();
  };
  game.events.onPlanetBroken = ({ planet, seconds }) => {
    if (!inGame) return;
    const s = progress.state;
    s.planetsDestroyed++;
    if (!s.destroyedPlanets.includes(planet.id)) s.destroyedPlanets.push(planet.id);
    if (s.fastestDestroy <= 0 || seconds < s.fastestDestroy) s.fastestDestroy = seconds;
    missionEvent({ type: 'destroyed', planet: planet.id, seconds, weapons: [...weaponsUsed] });
    checkAch();
  };
  game.events.onCallout = text => hud.callout(text);
  game.events.onXp = amount => {
    if (!inGame) return;
    const rank = progress.addXp(amount);
    progress.addCoins(amount * COINS_PER_XP);
    hud.coinGain(amount * COINS_PER_XP);
    syncWallet();
    if (rank) onRankUp(rank);
  };
  game.events.onShotFired = () => {
    progress.state.shotsFired++;
    progress.queueSave();
    completeTip(1);
    if (!inGame) return;
    weaponsUsed.add(game.weapon.id);
    missionEvent({ type: 'shot' });
    checkAch();
  };
  game.events.onPlanetDestroyed = ({ planet, killed, xp, shots }) => {
    if (resultsShown || !inGame) return;
    resultsShown = true;
    progress.queueSave();
    lastDestroyXp = xp;
    lastDestroyKilled = killed;
    lastDestroyShots = shots;
    lastDestroyExtras = [];
    // One-time starter coins so a new player can unlock a first weapon right away.
    if (!progress.state.starterBonus) {
      progress.state.starterBonus = true;
      progress.addCoins(STARTER_COINS);
      syncWallet();
      lastDestroyExtras.push({ label: 'Starter bonus', value: `${COIN} +${fmt(STARTER_COINS)}` });
    }
    sdk.gameplayStop();
    refreshTips();
    hud.showResults(planet, killed, xp * COINS_PER_XP, sdk.canShowRewarded(), shots, lastDestroyExtras);
  };
  game.events.onCooldown = f => hud.setCooldown(f);
  game.events.onFireHeld = weaponId => {
    if (WEAPONS.find(x => x.id === weaponId)?.projectile) completeTip(2);
    if (weaponId === 'laser') completeTip(3);
  };

  // Audio and settings: saved preferences, the CrazyGames mute setting, and ads.
  applySettings(progress.state.settings);
  sdk.onPlatformSettingsChange(() => applySettings(progress.state.settings));
  sdk.onAdPlayback(playing => { adPlaying = playing; sfx.setAdMuted(playing); refreshPause(); });

  // Dev-only test helpers. `import.meta.env.DEV` is false in `npm run build`, so none of
  // this ships to CrazyGames.
  if (import.meta.env.DEV) {
    const giveCoins = (n: number) => { progress.addCoins(n); progress.saveNow(); syncWallet(); hud.toast(`DEV: +${fmt(n)} ${COIN}`, 'xp'); };
    Object.assign(window, { __game: game, __hud: hud, __enter: enterPlanet, __progress: progress, __sync: syncWallet, __coins: giveCoins, __sfx: sfx });
    // http://localhost:5191/?coins=50000 adds coins on load.
    const params = new URLSearchParams(location.search);
    const devCoins = Number(params.get('coins'));
    if (devCoins > 0) {
      giveCoins(devCoins);
      // Drop just `coins` so a refresh doesn't add them again (keeps `?mute`).
      params.delete('coins');
      history.replaceState(null, '', location.pathname + (params.size ? `?${params}` : ''));
    }
  }

  syncWallet();
  // A planet spins behind the main menu.
  game.setInputEnabled(false);
  game.loadPlanet(PLANETS[0]);
  game.rig.dist = 9; game.rig.zoom(1.25);
  // New players start on the Missile: one tap, instant boom.
  if (progress.state.tipsDone === 0) { game.selectWeapon('missile'); hud.selectWeapon('missile'); }
  // Missions are always topped up to three; tiers already earned by older saves pay out now.
  ensureMissions(progress.state.missions, missionCtx());
  checkAch();
  refreshGoals();
  game.start();
  sdk.loadingStop();
  // Build the other owned planets in a background worker so switching to them is quick.
  prewarm(PLANETS.filter(p => progress.ownsPlanet(p.id)));
}

void boot().catch(err => {
  console.error('Solar Strike failed to start:', err);
  const msg = document.createElement('div');
  msg.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#04050d;color:#fff;font:1.2rem/1.5 system-ui;text-align:center;padding:2rem;z-index:9999';
  msg.innerHTML = `<div><h2 style="color:#ff6a40;margin:0 0 .5rem">Failed to launch Solar Strike</h2><p style="opacity:.7">${err?.message ?? 'Unknown error'}</p><button onclick="location.reload()" style="margin-top:1rem;padding:.5rem 1.5rem;border:1px solid #555;border-radius:6px;background:transparent;color:#fff;cursor:pointer;font-size:1rem">Retry</button></div>`;
  document.body.appendChild(msg);
});
