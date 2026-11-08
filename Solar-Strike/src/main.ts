import './ui/styles.css';
import { Game } from './game/game';
import { COIN, Hud } from './ui/hud';
import { Progress, type Rank, type Settings } from './game/progress';
import { PLANETS, type PlanetDef } from './engine/planets';
import { WEAPONS, type WeaponDef } from './game/weapons';
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

  const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

  const syncWallet = () => {
    hud.setCoins(progress.state.coins);
    hud.setOwned(progress.state.ownedWeapons, progress.state.ownedPlanets);
    hud.setRank(progress.rank, progress.rankProgress);
  };

  const applySettings = (s: Settings) => {
    sfx.setVolume(s.masterVolume, s.sfxVolume);
    // The platform's mute always wins over the in-game setting.
    sfx.setMuted(s.muted || sdk.getPlatformSettings().muteAudio);
    game.rig.shakeEnabled = s.screenShake;
    hud.applySettings(s);
  };

  // ---------------------------------------------------------------------------
  // Flow
  // ---------------------------------------------------------------------------
  const enterPlanet = async (id: string) => {
    const def = PLANETS.find(p => p.id === id) ?? PLANETS[0];
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
    sdk.gameplayStart();
    refreshPause();
  };

  const goToMenu = () => {
    sdk.gameplayStop();
    inGame = false;
    resultsShown = false;
    hud.hideSettings();
    hud.hideShop();
    hud.hidePlanets();
    hud.hideResults();
    if (hud.clearTrials()) game.selectWeapon(WEAPONS[0].id);
    game.setInputEnabled(false);
    game.timeScale = 1;
    // A fresh planet spins behind the menu.
    game.resetPlanet();
    game.rig.reset();
    game.rig.zoom(1.25);
    hud.showMenu();
    refreshPause();
  };

  /** Rebuild the current planet; a break ad may play if the last one was destroyed. */
  const rebuild = async () => {
    hud.hideResults();
    resultsShown = false;
    sdk.gameplayStop();
    if (game.destroyed) await breakAd();
    rewardedThisBreak = false;
    game.resetPlanet();
    resumeIfPlaying();
  };

  const unlocked = (name: string) => {
    sfx.purchase();
    hud.toast(`Unlocked ${name}!`, 'level', 2600);
    syncWallet();
  };

  const buyWeapon = (w: WeaponDef): boolean => {
    if (!progress.buy('weapon', w.id, w.price)) { hud.toast('Not enough coins'); return false; }
    unlocked(w.name);
    return true;
  };
  const buyPlanet = (p: PlanetDef): boolean => {
    if (!progress.buy('planet', p.id, p.price)) { hud.toast('Not enough coins'); return false; }
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

  const onRankUp = (rank: Rank) => {
    sfx.levelUp();
    sdk.happyTime(); // reserved for rank-ups: QA says happytime is for real achievements only
    hud.toast(`Rank up! ${rank.name}`, 'level', 3500);
  };

  game.events.onStats = s => hud.setStats(s.population, s.total, s.health);
  game.events.onPlanetLoaded = p => hud.setPlanet(p);
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
  };
  game.events.onPlanetDestroyed = ({ planet, killed, xp, shots }) => {
    if (resultsShown || !inGame) return;
    resultsShown = true;
    progress.state.planetsDestroyed++;
    progress.state.peopleKilled += killed;
    progress.queueSave();
    lastDestroyXp = xp;
    lastDestroyKilled = killed;
    lastDestroyShots = shots;
    sdk.gameplayStop();
    hud.showResults(planet, killed, xp * COINS_PER_XP, sdk.canShowRewarded(), shots);
  };

  // Audio and settings: saved preferences, the CrazyGames mute setting, and ads.
  applySettings(progress.state.settings);
  sdk.onPlatformSettingsChange(() => applySettings(progress.state.settings));
  sdk.onAdPlayback(playing => { adPlaying = playing; sfx.setAdMuted(playing); refreshPause(); });

  syncWallet();
  // A planet spins behind the main menu.
  game.setInputEnabled(false);
  game.loadPlanet(PLANETS[0]);
  game.rig.dist = 9; game.rig.zoom(1.25);
  game.start();
  sdk.loadingStop();
}

void boot().catch(err => {
  console.error('Solar Strike failed to start:', err);
  const msg = document.createElement('div');
  msg.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#04050d;color:#fff;font:1.2rem/1.5 system-ui;text-align:center;padding:2rem;z-index:9999';
  msg.innerHTML = `<div><h2 style="color:#ff6a40;margin:0 0 .5rem">Failed to launch Solar Strike</h2><p style="opacity:.7">${err?.message ?? 'Unknown error'}</p><button onclick="location.reload()" style="margin-top:1rem;padding:.5rem 1.5rem;border:1px solid #555;border-radius:6px;background:transparent;color:#fff;cursor:pointer;font-size:1rem">Retry</button></div>`;
  document.body.appendChild(msg);
});
