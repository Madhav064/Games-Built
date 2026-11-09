// DOM user interface: main menu, planet select, shop, settings, HUD, results, toasts.

import { GAME_NAME } from '../config/brand';
import { PLANETS, type PlanetDef } from '../engine/planets';
import { WEAPONS, type WeaponDef } from '../game/weapons';
import type { Rank, Settings } from '../game/progress';

export interface HudHandlers {
  onPlay: () => void;
  onOpenShop: () => void;
  onCloseShop: () => void;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  onSelectPlanet: (p: PlanetDef) => void;
  onLockedPlanet: (p: PlanetDef) => void;
  onSelectWeapon: (w: WeaponDef) => void;
  onLockedWeapon: (w: WeaponDef) => void;
  onBuy: (kind: 'weapon' | 'planet', id: string) => void;
  onFreeCoins: () => void;
  onReset: () => void;
  onOpenPlanets: () => void;
  onToggleSlowMo: () => boolean;
  onToggleSpin: () => boolean;
  onSettingsChange: (s: Settings) => void;
  onResetProgress: () => void;
  onMainMenu: () => void;
  onDoubleRewards: () => void;
  onSmashAgain: () => void;
  onChoosePlanet: () => void;
  onBackFromPlanets: () => void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

const ICONS = {
  planets: '<circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="2"/><ellipse cx="12" cy="12" rx="11" ry="3.5" fill="none" stroke="currentColor" stroke-width="1.6" transform="rotate(-20 12 12)"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M4 3v5h5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  slow: '<circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 13V8.5M9 2h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  spin: '<path d="M20 12a8 8 0 0 1-14.9 4M4 12a8 8 0 0 1 14.9-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M19 3v5h-5M5 21v-5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  gear: '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.5 7.5 0 0 0 7 6.5l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.5 7.5 0 0 0 2.6-1.5l2.4 1 2-3.4Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  shop: '<path d="M4 9h16l-1.2 10.2a2 2 0 0 1-2 1.8H7.2a2 2 0 0 1-2-1.8Z" fill="currentColor" opacity=".9"/><path d="M8.5 9V7a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  play: '<path d="M8 5.5v13l10.5-6.5Z" fill="currentColor"/>',
  home: '<path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1Z" fill="currentColor"/>',
  close: '<path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
};

const svg = (body: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;

/** Gold coin icon (inline, sized by CSS). */
export const COIN = '<svg class="coin" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#f5b52a"/><circle cx="12" cy="12" r="10" fill="none" stroke="#a8670c" stroke-width="1.6"/><circle cx="12" cy="12" r="6.4" fill="none" stroke="#ffe58a" stroke-width="1.6"/><path d="M12 8.2v7.6" stroke="#a8670c" stroke-width="2" stroke-linecap="round"/></svg>';

/** Rank badge: a tier-coloured hexagon with one to three pips (Platinum gets a star). */
function rankBadge(rank: Rank): string {
  const pips = rank.tier === 'platinum' ? 0 : (rank.index % 3) + 1;
  const pipSvg = Array.from({ length: pips }, (_, i) => {
    const x = 12 + (i - (pips - 1) / 2) * 4.2;
    return `<circle cx="${x}" cy="12.5" r="1.5" fill="#0b0f1e"/>`;
  }).join('');
  const star = rank.tier === 'platinum'
    ? '<path d="M12 7.2l1.5 3.1 3.4.5-2.5 2.4.6 3.4-3-1.6-3 1.6.6-3.4-2.5-2.4 3.4-.5Z" fill="#0b0f1e"/>'
    : '';
  return `<svg class="rank-badge tier-${rank.tier}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.8 21 7v10l-9 5.2L3 17V7Z" fill="var(--tier)"/><path d="M12 1.8 21 7v10l-9 5.2L3 17V7Z" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1"/>${pipSvg}${star}</svg>`;
}

export function formatPeople(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 1 : 2) + ' billion';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' million';
  return Math.round(n).toLocaleString('en-US');
}

const formatCoins = (n: number) => Math.round(n).toLocaleString('en-US');

function planetSwatch(p: PlanetDef): string {
  if (p.id === 'sun') {
    return 'radial-gradient(circle at 35% 35%, #fff 0%, #ffe066 25%, #ff7700 60%, #cc2200 100%)';
  }
  if (p.id === 'saturn') {
    return 'radial-gradient(circle at 35% 35%, #f5ecd0 0%, #dfcb9e 40%, #a48250 80%, #1a140a 100%)';
  }
  const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
  const c = p.colors;
  const a = p.seaLevel !== null ? hex(c.ocean) : hex(c.mid);
  const b = p.seaLevel !== null ? hex(c.low) : hex(c.high);
  return `radial-gradient(circle at 32% 30%, ${hex(c.peak)} 0%, ${b} 22%, ${a} 55%, #05060c 100%)`;
}

export class Hud {
  private readonly root: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly planetsScreen: HTMLElement;
  private readonly shop: HTMLElement;
  private readonly settings: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly results: HTMLElement;
  private readonly toastBox: HTMLElement;
  private readonly calloutBox: HTMLElement;
  private readonly busy: HTMLElement;
  private dialogCount = 0;
  /** Called when a modal dialog opens or the last one closes (main pauses the game). */
  onDialogChange: ((open: boolean) => void) | null = null;
  private readonly rankChips: { badge: HTMLElement; name: HTMLElement; fill: HTMLElement }[] = [];
  private readonly coinTexts: HTMLElement[] = [];
  private readonly planetName: HTMLElement;
  private readonly popText: HTMLElement;
  private readonly integrityFill: HTMLElement;
  private readonly weaponBar: HTMLElement;
  private readonly weaponInfo: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly btnSlow: HTMLButtonElement;
  private readonly btnSpin: HTMLButtonElement;
  private readonly planetGrid: HTMLElement;
  private readonly shopGrid: HTMLElement;
  private readonly shopTabs: HTMLButtonElement[] = [];
  private readonly freeCoinsBtn: HTMLButtonElement;
  private readonly menuBtnInSettings: HTMLButtonElement;
  private shopTab: 'weapon' | 'planet' = 'weapon';
  private selectedWeapon = WEAPONS[0].id;
  private coins = 0;
  private ownedWeapons = new Set<string>();
  private ownedPlanets = new Set<string>();
  private trialWeapons = new Set<string>();
  private currentPlanetId: string | null = null;
  private settingsState: Settings | null = null;

  constructor(root: HTMLElement, private readonly h: HudHandlers) {
    this.root = root;

    // ---- Main menu ----
    this.menu = el('div', 'screen menu-screen');
    const menuTop = el('div', 'menu-top');
    menuTop.append(this.makeRankChip(), this.makeCoinChip());
    const menuCenter = el('div', 'menu-center');
    const logo = el('h1', 'logo', `<span>${GAME_NAME.split(' ')[0]}</span> ${GAME_NAME.split(' ').slice(1).join(' ')}`);
    const tag = el('p', 'tagline', 'Planet destruction sandbox');
    const play = el('button', 'btn btn-primary btn-big', `${svg(ICONS.play)} PLAY`);
    play.onclick = () => this.h.onPlay();
    const row = el('div', 'menu-row');
    const shopBtn = el('button', 'btn btn-menu', `${svg(ICONS.shop)}<span>Shop</span>`);
    shopBtn.onclick = () => this.h.onOpenShop();
    const setBtn = el('button', 'btn btn-menu', `${svg(ICONS.gear)}<span>Settings</span>`);
    setBtn.onclick = () => this.h.onOpenSettings();
    row.append(shopBtn, setBtn);
    menuCenter.append(logo, tag, play, row);
    this.menu.append(menuTop, menuCenter);

    // ---- Planet select ----
    this.planetsScreen = el('div', 'screen planets-screen hidden');
    const pHead = el('div', 'panel-head', '<h2>Choose a target</h2>');
    const pRight = el('div', 'panel-head-right');
    const pClose = el('button', 'btn btn-ghost', 'Back');
    pClose.onclick = () => this.h.onBackFromPlanets();
    pRight.append(this.makeCoinChip(), pClose);
    pHead.append(pRight);
    this.planetGrid = el('div', 'planet-grid');
    const pPanel = el('div', 'panel');
    pPanel.append(pHead, this.planetGrid);
    this.planetsScreen.append(pPanel);

    // ---- Shop ----
    this.shop = el('div', 'screen overlay-screen hidden');
    const sPanel = el('div', 'panel shop-panel');
    const sHead = el('div', 'panel-head', '<h2>Shop</h2>');
    const sRight = el('div', 'panel-head-right');
    const sClose = el('button', 'icon-btn', svg(ICONS.close));
    sClose.setAttribute('aria-label', 'Close shop');
    sClose.onclick = () => this.h.onCloseShop();
    sRight.append(this.makeCoinChip(), sClose);
    sHead.append(sRight);
    const tabs = el('div', 'tabs');
    for (const [kind, label] of [['weapon', 'Weapons'], ['planet', 'Planets']] as const) {
      const t = el('button', 'tab', label);
      t.onclick = () => { this.shopTab = kind; this.renderShop(); };
      t.dataset.kind = kind;
      this.shopTabs.push(t);
      tabs.append(t);
    }
    this.freeCoinsBtn = el('button', 'btn btn-reward btn-small', `<span class="ad-tag">AD</span> Free ${COIN} 150`);
    this.freeCoinsBtn.onclick = () => this.h.onFreeCoins();
    const sBar = el('div', 'shop-bar');
    sBar.append(tabs, this.freeCoinsBtn);
    this.shopGrid = el('div', 'shop-grid');
    sPanel.append(sHead, sBar, this.shopGrid);
    this.shop.append(sPanel);

    // ---- Settings ----
    this.settings = el('div', 'screen overlay-screen hidden');
    const stPanel = el('div', 'panel settings-panel');
    const stHead = el('div', 'panel-head', '<h2>Settings</h2>');
    const stClose = el('button', 'icon-btn', svg(ICONS.close));
    stClose.setAttribute('aria-label', 'Close settings');
    stClose.onclick = () => this.h.onCloseSettings();
    stHead.append(stClose);
    const stBody = el('div', 'settings-body');
    stBody.append(
      this.slider('Master volume', 'masterVolume'),
      this.slider('Effects volume', 'sfxVolume'),
      this.toggle('Mute all sound', 'muted'),
      this.toggle('Screen shake', 'screenShake'),
      this.toggle('Show control hints', 'hints'),
    );
    const stFoot = el('div', 'settings-foot');
    this.menuBtnInSettings = el('button', 'btn btn-ghost', `${svg(ICONS.home)} Main menu`);
    this.menuBtnInSettings.onclick = () => this.h.onMainMenu();
    const resetBtn = el('button', 'btn btn-danger', 'Reset progress');
    resetBtn.onclick = () => this.h.onResetProgress();
    stFoot.append(this.menuBtnInSettings, resetBtn);
    stPanel.append(stHead, stBody, stFoot);
    this.settings.append(stPanel);

    // ---- HUD ----
    this.hud = el('div', 'hud hidden');
    const top = el('div', 'hud-top');
    const left = el('div', 'hud-left');
    const leftRow = el('div', 'hud-left-row');
    const btnHome = el('button', 'icon-btn home-btn', svg(ICONS.home));
    btnHome.title = 'Main menu';
    btnHome.setAttribute('aria-label', 'Main menu');
    btnHome.onclick = () => this.h.onMainMenu();
    leftRow.append(btnHome, this.makeRankChip());
    left.append(leftRow, this.makeCoinChip());

    const center = el('div', 'chip planet-chip');
    this.planetName = el('div', 'planet-name', 'Earth');
    this.popText = el('div', 'pop-text', '');
    const integ = el('div', 'integrity');
    this.integrityFill = el('div', 'integrity-fill');
    integ.append(this.integrityFill);
    center.append(this.planetName, this.popText, integ);

    const tools = el('div', 'tools');
    const mk = (icon: string, label: string) => {
      const b = el('button', 'icon-btn', svg(icon));
      b.title = label;
      b.setAttribute('aria-label', label);
      return b;
    };
    const btnPlanets = mk(ICONS.planets, 'Planets');
    btnPlanets.onclick = () => this.h.onOpenPlanets();
    const btnReset = mk(ICONS.reset, 'Rebuild planet');
    btnReset.onclick = () => this.h.onReset();
    this.btnSlow = mk(ICONS.slow, 'Slow motion');
    this.btnSlow.onclick = () => this.btnSlow.classList.toggle('on', this.h.onToggleSlowMo());
    this.btnSpin = mk(ICONS.spin, 'Planet spin');
    this.btnSpin.classList.add('on');
    this.btnSpin.onclick = () => this.btnSpin.classList.toggle('on', this.h.onToggleSpin());
    const btnShop = mk(ICONS.shop, 'Shop');
    btnShop.onclick = () => this.h.onOpenShop();
    const btnSettings = mk(ICONS.gear, 'Settings');
    btnSettings.onclick = () => this.h.onOpenSettings();
    tools.append(btnPlanets, btnReset, this.btnSlow, this.btnSpin, btnShop, btnSettings);
    top.append(left, center, tools);

    const bottom = el('div', 'hud-bottom');
    this.weaponInfo = el('div', 'weapon-info');
    this.weaponBar = el('div', 'weapon-bar');
    this.hint = el('div', 'hint', 'Click / tap to fire &middot; right-drag or two fingers to rotate &middot; scroll / pinch to zoom');
    bottom.append(this.weaponInfo, this.weaponBar, this.hint);
    this.hud.append(top, bottom);

    // ---- Results ----
    this.results = el('div', 'screen results-screen hidden');

    this.toastBox = el('div', 'toasts');
    this.calloutBox = el('div', 'callouts');
    // Blocks all input while an ad is being requested (QA rule).
    this.busy = el('div', 'screen busy-screen hidden', '<div class="spinner"></div>');
    root.append(this.hud, this.menu, this.planetsScreen, this.results, this.shop, this.settings, this.calloutBox, this.toastBox, this.busy);
    this.renderWeapons();
  }

  // ---------------- Shared widgets ----------------
  private makeRankChip(): HTMLElement {
    const chip = el('div', 'chip rank-chip');
    const badge = el('div', 'rank-badge-wrap');
    const info = el('div', 'rank-info');
    const name = el('div', 'rank-name', 'Bronze I');
    const bar = el('div', 'xp-bar');
    const fill = el('div', 'xp-fill');
    bar.append(fill);
    info.append(name, bar);
    chip.append(badge, info);
    this.rankChips.push({ badge, name, fill });
    return chip;
  }

  private makeCoinChip(): HTMLElement {
    const chip = el('div', 'chip coin-chip', COIN);
    const t = el('span', 'coin-text', '0');
    chip.append(t);
    this.coinTexts.push(t);
    return chip;
  }

  private slider(label: string, key: 'masterVolume' | 'sfxVolume'): HTMLElement {
    const row = el('label', 'set-row');
    const input = el('input', 'set-slider');
    input.type = 'range'; input.min = '0'; input.max = '100'; input.step = '1';
    input.dataset.key = key;
    const val = el('span', 'set-val', '');
    input.oninput = () => {
      if (!this.settingsState) return;
      this.settingsState[key] = Number(input.value) / 100;
      val.textContent = `${input.value}%`;
      this.h.onSettingsChange({ ...this.settingsState });
    };
    row.append(el('span', 'set-label', label), input, val);
    return row;
  }

  private toggle(label: string, key: 'muted' | 'screenShake' | 'hints'): HTMLElement {
    const row = el('div', 'set-row');
    const btn = el('button', 'switch');
    btn.dataset.key = key;
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-label', label);
    btn.onclick = () => {
      if (!this.settingsState) return;
      this.settingsState[key] = !this.settingsState[key];
      this.syncSettingsControls();
      this.h.onSettingsChange({ ...this.settingsState });
    };
    row.append(el('span', 'set-label', label), btn);
    return row;
  }

  private syncSettingsControls(): void {
    const s = this.settingsState;
    if (!s) return;
    this.settings.querySelectorAll<HTMLInputElement>('.set-slider').forEach(i => {
      const v = Math.round(s[i.dataset.key as 'masterVolume' | 'sfxVolume'] * 100);
      i.value = String(v);
      (i.nextElementSibling as HTMLElement).textContent = `${v}%`;
    });
    this.settings.querySelectorAll<HTMLButtonElement>('.switch').forEach(b => {
      const on = s[b.dataset.key as 'muted' | 'screenShake' | 'hints'];
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
  }

  // ---------------- Screens ----------------
  showMenu(): void { this.menu.classList.remove('hidden'); this.hud.classList.add('hidden'); }
  hideMenu(): void { this.menu.classList.add('hidden'); }
  showHud(): void { this.hud.classList.remove('hidden'); }

  showPlanets(currentId: string | null): void {
    this.hideResults();
    this.currentPlanetId = currentId;
    this.renderPlanets();
    this.planetsScreen.classList.remove('hidden');
  }

  get planetsOpen(): boolean { return !this.planetsScreen.classList.contains('hidden'); }

  private renderPlanets(): void {
    this.planetGrid.innerHTML = '';
    for (const p of PLANETS) {
      const locked = !this.ownedPlanets.has(p.id);
      const card = el('button', `planet-card${locked ? ' locked' : ''}${p.id === this.currentPlanetId ? ' current' : ''}`);
      const ball = el('div', 'planet-ball');
      ball.style.background = planetSwatch(p);
      if (p.rings) ball.classList.add('has-rings');
      const info = el('div', 'planet-info');
      info.append(
        el('div', 'pc-name', p.name),
        el('div', 'pc-blurb', p.blurb),
        el('div', 'pc-pop', p.population > 0 ? `Population ${formatPeople(p.population)}` : 'Uninhabited'),
      );
      card.append(ball, info);
      if (locked) {
        const can = this.coins >= p.price;
        card.append(el('div', `pc-lock${can ? ' can-buy' : ''}`, `${COIN} ${formatCoins(p.price)}`));
      }
      card.onclick = () => (locked ? this.h.onLockedPlanet(p) : this.h.onSelectPlanet(p));
      this.planetGrid.append(card);
    }
  }

  hidePlanets(): void { this.planetsScreen.classList.add('hidden'); }

  showShop(tab?: 'weapon' | 'planet'): void {
    if (tab) this.shopTab = tab;
    this.renderShop();
    this.shop.classList.remove('hidden');
  }

  /** Free-coins rewarded button: hidden when ads can't play, counts down while on cooldown. */
  setFreeCoins(visible: boolean, secondsLeft: number, amount: number): void {
    this.freeCoinsBtn.classList.toggle('hidden', !visible);
    const cooling = secondsLeft > 0;
    this.freeCoinsBtn.disabled = cooling;
    const t = `${Math.floor(secondsLeft / 60)}:${String(Math.ceil(secondsLeft) % 60).padStart(2, '0')}`;
    this.freeCoinsBtn.innerHTML = cooling
      ? `Free ${COIN} ${amount} in ${t}`
      : `<span class="ad-tag">AD</span> Free ${COIN} ${amount}`;
  }

  setBusy(on: boolean): void { this.busy.classList.toggle('hidden', !on); }

  setDevice(type: 'desktop' | 'tablet' | 'mobile'): void {
    this.hint.innerHTML = type === 'desktop'
      ? 'Click to fire &middot; right-drag or arrow keys to rotate &middot; scroll to zoom'
      : 'Tap to fire &middot; two fingers to rotate &middot; pinch to zoom';
  }
  hideShop(): void { this.shop.classList.add('hidden'); }
  get shopOpen(): boolean { return !this.shop.classList.contains('hidden'); }

  private renderShop(): void {
    for (const t of this.shopTabs) t.classList.toggle('active', t.dataset.kind === this.shopTab);
    this.shopGrid.innerHTML = '';
    const items = this.shopTab === 'weapon'
      ? WEAPONS.map(w => ({ id: w.id, name: w.name, blurb: w.blurb, price: w.price, owned: this.ownedWeapons.has(w.id), tag: w.category, weapon: w, planet: null as PlanetDef | null }))
      : PLANETS.map(p => ({ id: p.id, name: p.name, blurb: p.blurb, price: p.price, owned: this.ownedPlanets.has(p.id), tag: p.population > 0 ? 'Inhabited' : 'Uninhabited', weapon: null as WeaponDef | null, planet: p }));
    // Owned items last so the next thing to buy is at the top.
    items.sort((a, b) => Number(a.owned) - Number(b.owned) || a.price - b.price);
    for (const it of items) {
      const card = el('div', `shop-card${it.owned ? ' owned' : ''}`);
      const art = el('div', 'shop-art');
      if (it.weapon) {
        art.style.setProperty('--wc', it.weapon.color);
        art.innerHTML = svg(it.weapon.icon);
      } else if (it.planet) {
        const ball = el('div', 'planet-ball');
        ball.style.background = planetSwatch(it.planet);
        if (it.planet.rings) ball.classList.add('has-rings');
        art.append(ball);
      }
      const info = el('div', 'shop-info');
      info.append(el('div', 'shop-tag', it.tag), el('div', 'shop-name', it.name), el('div', 'shop-blurb', it.blurb));
      const foot = el('div', 'shop-foot');
      if (it.owned) {
        foot.append(el('div', 'owned-badge', `${svg(ICONS.check)} Owned`));
      } else {
        const can = this.coins >= it.price;
        const buy = el('button', `btn btn-buy${can ? '' : ' cant'}`, `${COIN} ${formatCoins(it.price)}`);
        buy.disabled = !can;
        buy.title = can ? `Buy ${it.name}` : `You need ${formatCoins(it.price - this.coins)} more coins`;
        buy.onclick = () => this.h.onBuy(this.shopTab, it.id);
        foot.append(buy);
        if (!can) foot.append(el('div', 'need', `${formatCoins(it.price - this.coins)} more`));
      }
      card.append(art, info, foot);
      this.shopGrid.append(card);
    }
  }

  showSettings(s: Settings, inGame: boolean): void {
    this.settingsState = { ...s };
    this.syncSettingsControls();
    this.menuBtnInSettings.classList.toggle('hidden', !inGame);
    this.settings.classList.remove('hidden');
  }
  hideSettings(): void { this.settings.classList.add('hidden'); }
  get settingsOpen(): boolean { return !this.settings.classList.contains('hidden'); }

  get dialogOpen(): boolean { return this.dialogCount > 0; }

  showResults(planet: PlanetDef, killed: number, coins: number, canDouble: boolean, shotsFired: number): void {
    this.hidePlanets();
    this.results.innerHTML = '';
    const panel = el('div', 'panel results-panel');
    panel.append(
      el('div', 'results-title', 'PLANET DESTROYED'),
      el('div', 'results-sub', planet.name),
    );
    const stats = el('div', 'results-stats');
    stats.append(
      this.stat(killed > 0 ? formatPeople(killed) : 'None', 'people lost'),
      this.stat(`${COIN} +${formatCoins(coins)}`, 'coins earned'),
    );
    if (shotsFired > 0) stats.append(this.stat(shotsFired.toLocaleString(), 'shots fired'));
    panel.append(stats);
    const actions = el('div', 'results-actions');
    if (canDouble) {
      const dbl = el('button', 'btn btn-reward', `<span class="ad-tag">AD</span> 2x coins &amp; XP`);
      dbl.onclick = () => { dbl.disabled = true; this.h.onDoubleRewards(); };
      actions.append(dbl);
    }
    const again = el('button', 'btn btn-primary', 'Smash again');
    again.onclick = () => this.h.onSmashAgain();
    const choose = el('button', 'btn btn-ghost', 'Choose planet');
    choose.onclick = () => this.h.onChoosePlanet();
    const shop = el('button', 'btn btn-ghost', `${svg(ICONS.shop)} Shop`);
    shop.onclick = () => this.h.onOpenShop();
    actions.append(again, choose, shop);
    panel.append(actions);
    this.results.append(panel);
    this.results.classList.remove('hidden');
  }

  hideResults(): void { this.results.classList.add('hidden'); }

  private stat(value: string, label: string): HTMLElement {
    const s = el('div', 'stat');
    s.append(el('div', 'stat-value', value), el('div', 'stat-label', label));
    return s;
  }

  // ---------------- Data ----------------
  setPlanet(p: PlanetDef): void { this.planetName.textContent = p.name; }

  /** `health`: 1 = intact, 0 = breaking apart. */
  setStats(population: number, total: number, health: number): void {
    const pct = Math.max(0, Math.min(1, health));
    const isCritical = pct < 0.3 && pct > 0;
    this.popText.textContent = total > 0 ? `Population ${formatPeople(population)}${isCritical ? ' (CRITICAL)' : ''}` : (isCritical ? '⚠️ CORE UNSTABLE' : 'Uninhabited');
    this.integrityFill.style.width = `${pct * 100}%`;
    this.integrityFill.classList.toggle('low', pct < 0.35);
  }

  setRank(rank: Rank, progress: number): void {
    for (const c of this.rankChips) {
      c.badge.innerHTML = rankBadge(rank);
      c.name.textContent = rank.name;
      c.name.className = `rank-name tier-text-${rank.tier}`;
      c.fill.style.width = `${Math.max(0, Math.min(1, progress)) * 100}%`;
    }
  }

  setCoins(n: number): void {
    const changed = n !== this.coins;
    this.coins = n;
    for (const t of this.coinTexts) t.textContent = formatCoins(n);
    if (changed) this.refreshPrices();
  }

  setOwned(weapons: string[], planets: string[]): void {
    this.ownedWeapons = new Set(weapons);
    this.ownedPlanets = new Set(planets);
    this.refreshPrices();
  }

  /** Re-render anything that shows prices or ownership. */
  private refreshPrices(): void {
    this.renderWeapons();
    if (this.shopOpen) this.renderShop();
    if (this.planetsOpen) this.renderPlanets();
  }

  applySettings(s: Settings): void {
    this.hint.classList.toggle('hidden', !s.hints);
    this.weaponInfo.classList.toggle('hidden', !s.hints);
  }

  grantTrial(id: string): void { this.trialWeapons.add(id); this.renderWeapons(); }

  /** Ends weapon trials. Returns true if the selected weapon was a trial and fell back to the first weapon. */
  clearTrials(): boolean {
    this.trialWeapons.clear();
    const sel = WEAPONS.find(w => w.id === this.selectedWeapon);
    const lost = !!sel && !this.isWeaponAvailable(sel);
    if (lost) this.selectedWeapon = WEAPONS[0].id;
    this.renderWeapons();
    return lost;
  }

  selectWeapon(id: string): void {
    this.selectedWeapon = id;
    this.renderWeapons();
  }

  isWeaponAvailable(w: WeaponDef): boolean {
    return this.ownedWeapons.has(w.id) || this.trialWeapons.has(w.id);
  }

  private renderWeapons(): void {
    this.weaponBar.innerHTML = '';
    for (const w of WEAPONS) {
      const available = this.isWeaponAvailable(w);
      const b = el('button', `weapon-btn${w.id === this.selectedWeapon ? ' selected' : ''}${available ? '' : ' locked'}`);
      b.style.setProperty('--wc', w.color);
      b.innerHTML = `${svg(w.icon)}<span>${w.name}</span>${available ? '' : `<em>${COIN}${formatCoins(w.price)}</em>`}`;
      if (this.trialWeapons.has(w.id) && !this.ownedWeapons.has(w.id)) b.classList.add('trial');
      b.onclick = () => {
        if (available) this.h.onSelectWeapon(w);
        else this.h.onLockedWeapon(w);
      };
      this.weaponBar.append(b);
    }
    const sel = WEAPONS.find(w => w.id === this.selectedWeapon);
    this.weaponInfo.textContent = sel ? sel.blurb : '';
  }

  // ---------------- Feedback ----------------
  toast(html: string, kind: 'info' | 'xp' | 'level' = 'info', ms = 2200): void {
    const t = el('div', `toast toast-${kind}`, html);
    this.toastBox.append(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 400);
    }, ms);
  }

  /** Big centre-screen word ("SHATTER!"). */
  callout(text: string): void {
    const c = el('div', 'callout', text);
    this.calloutBox.append(c);
    setTimeout(() => c.remove(), 1100);
  }

  /** Small rising "+coins" number; batched so rapid gains don't spam. */
  private gainAccum = 0;
  private gainTimer: number | null = null;
  coinGain(amount: number): void {
    this.gainAccum += amount;
    if (this.gainTimer !== null) return;
    this.gainTimer = window.setTimeout(() => {
      this.gainTimer = null;
      const v = Math.round(this.gainAccum);
      this.gainAccum = 0;
      if (v <= 0) return;
      const f = el('div', 'xp-float', `+${v} ${COIN}`);
      this.root.append(f);
      setTimeout(() => f.remove(), 1200);
    }, 450);
  }

  /** Confirm-style dialog. Resolves with the chosen button's index, or -1 on cancel. */
  choose(title: string, body: string, options: { label: string; cls?: string; disabled?: boolean }[], cancel = 'Not now'): Promise<number> {
    return new Promise(resolve => {
      const scr = el('div', 'screen dialog-screen');
      const panel = el('div', 'panel dialog');
      panel.append(el('h3', '', title), el('p', '', body));
      const row = el('div', 'results-actions');
      if (this.dialogCount++ === 0) this.onDialogChange?.(true);
      const close = (v: number) => {
        scr.remove();
        if (--this.dialogCount === 0) this.onDialogChange?.(false);
        resolve(v);
      };
      options.forEach((o, i) => {
        const b = el('button', `btn ${o.cls ?? 'btn-primary'}`, o.label);
        b.disabled = !!o.disabled;
        b.onclick = () => close(i);
        row.append(b);
      });
      const n = el('button', 'btn btn-ghost', cancel);
      n.onclick = () => close(-1);
      row.append(n);
      panel.append(row);
      scr.append(panel);
      this.root.append(scr);
    });
  }

  confirm(title: string, body: string, ok: string, cancel = 'Not now', okCls = 'btn-reward'): Promise<boolean> {
    return this.choose(title, body, [{ label: ok, cls: okCls }], cancel).then(i => i === 0);
  }
}
