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

export function formatPeople(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 1 : 2) + ' billion';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' million';
  return Math.round(n).toLocaleString('en-US');
}

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

