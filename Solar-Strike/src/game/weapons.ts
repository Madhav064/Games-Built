// Weapon definitions. Each weapon has its own mechanic; the data here tunes it.
// Units: crater/heat radii are in voxels (planet radius = 38), speeds in world units/s.

export type WeaponCategory = 'Energy' | 'Projectiles' | 'Cosmic';

export interface ImpactSpec {
  /** Crater radius in voxels. */
  crater: number;
  /** Extra heat radius multiplier around the crater. */
  heatRadius: number;
  /** Heat added at the centre (0..2.5). */
  heat: number;
  /** Max debris rocks thrown. */
  debris: number;
  /** Debris launch speed. */
  debrisSpeed: number;
  /** Fire particles in the burst. */
  fire: number;
  /** Flash sprite size (world). */
  flash: number;
  /** Surface shockwave ring radius in voxels (0 = none). */
  shockwave: number;
  /** The shockwave front wipes out cities as it passes (Nuke). */
  shockKill?: boolean;
  /** Heat the shockwave front leaves behind (default 0.16). */
  shockHeat?: number;
  /** Camera shake 0..1. */
  shake: number;
  /** Explosion sound size 0..1. */
  boom: number;
  /** Planet stability (0..1) this hit drains. The planet breaks when stability reaches 0. */
  stability: number;
}

export interface BeamSpec {
  width: number;
  /** Drill speed in voxels per second (0 = does not dig). */
  drillRate: number;
  drillRadius: number;
  heat: number;
  color: number;
  pitch: number;
  /** Planet stability drained per second while the beam is on the planet (scaled up by Nova charge). */
  stability: number;
  /** Freezes instead of burning. Frozen ground shatters when hit. */
  isCryo?: boolean;
  /** Beam grows while held: radius and width ramp to these over `time` seconds. */
  charge?: { time: number; maxRadius: number; maxWidth: number; endColor: number };
}

export interface ProjectileSpec {
  speed: number;
  /** Visual size (world). */
  size: number;
  model: 'missile' | 'warhead' | 'rock' | 'rod' | 'singularity' | 'blob';
  trailColor: number;
  /** Projectiles per click. */
  cluster: number;
  /** Spread radius (voxels) for clusters. */
  spread: number;
  /** Seconds between shots when holding. */
  cooldown: number;
  /** How hard it steers toward the target (default 6). Low values give lobbed arcs. */
  homing?: number;
  /**
   * Where every shot starts, fixed relative to the camera so a weapon always fires from the same spot:
   * 'behind' (just behind and below the view, default), 'above' (above the top of the screen),
   * 'edge' (the bottom-right edge, same as the beams) or 'surface' (right at the tap point).
   */
  launch?: 'behind' | 'above' | 'edge' | 'surface';
  impact: ImpactSpec;
  isBlackHole?: boolean;
  isKinetic?: boolean;
  /** Leaves a pool of lava that keeps burning and spreads. */
  lava?: { radius: number; duration: number };
  /** Throws rocks that fall back and punch secondary craters. */
  ejecta?: { count: number; crater: number; minRange: number; maxRange: number };
  /** Splits near the target into a ring of warheads. */
  split?: { count: number; ringRadius: number; impact: ImpactSpec };
  /** Drills a shaft toward the core and blows a cavity at the bottom. */
  lance?: { depth: number; radius: number; cavity: number };
}

export interface WeaponDef {
  id: string;
  name: string;
  category: WeaponCategory;
  blurb: string;
  /** Coins to unlock in the shop (0 = free). */
  price: number;
  color: string;
  icon: string; // inline SVG body (24x24 viewBox)
  beam?: BeamSpec;
  projectile?: ProjectileSpec;
}

export const WEAPONS: WeaponDef[] = [
  {
    id: 'laser',
    name: 'Laser',
    category: 'Energy',
    blurb: 'Hold and drag to carve a thin glowing trench.',
    price: 0,
    color: '#ff4d4d',
    icon: '<path d="M3.5 20.5 13 11" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><circle cx="16" cy="8" r="3.4" fill="currentColor"/><path d="M16 1.8v1.8M22.2 8h-1.8M20.4 3.6l-1.3 1.3M20.4 12.4l-1.3-1.3M11.6 3.6l1.3 1.3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    beam: { width: 0.05, drillRate: 16, drillRadius: 2.4, heat: 0.9, color: 0xff3030, pitch: 1, stability: 0.012 },
  },
  {
    id: 'missile',
    name: 'Missile',
    category: 'Projectiles',
    blurb: 'Fast guided missile. Tap for one, hold for a volley.',
    price: 0,
    color: '#ffd166',
    icon: '<path d="M14.2 4.6c2.5-1.2 5-1.6 5.9-1.1.5.9.1 3.4-1.1 5.9L12.4 16l-4.4-4.4z" fill="currentColor"/><circle cx="15.8" cy="8.2" r="1.5" fill="#0b0f1e" opacity=".55"/><path d="M8.2 11.8 4.4 12.4 3 14.6l4.3.6M12.2 15.8l-.6 3.8L9.4 21l-.6-4.3" fill="currentColor" opacity=".75"/><path d="M7.2 16.8 3.6 20.4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" opacity=".55"/>',
    projectile: {
      speed: 7, size: 0.07, model: 'missile', trailColor: 0xffa040, cluster: 1, spread: 0, cooldown: 0.18,
      impact: { crater: 3.2, heatRadius: 1.8, heat: 1.2, debris: 14, debrisSpeed: 0.9, fire: 60, flash: 0.9, shockwave: 0, shake: 0.12, boom: 0.15, stability: 0.0035 },
    },
  },
  {
    id: 'mortar',
    name: 'Plasma Mortar',
    category: 'Energy',
    blurb: 'Lobs molten plasma. Leaves lava pools that keep burning and spreading.',
    price: 300,
    color: '#ff8a30',
    icon: '<path d="M3 20.5c1.8-7.6 6.4-11.7 11.4-12.3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="0.1 3.4"/><circle cx="17.6" cy="8" r="4.3" fill="currentColor"/><circle cx="16.4" cy="6.8" r="1.5" fill="#fff" opacity=".55"/><path d="M15.4 15v2.4M19.6 14v3.8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    projectile: {
      speed: 3.6, size: 0.1, model: 'blob', trailColor: 0xff8a30, cluster: 1, spread: 0, cooldown: 0.7, homing: 1.6,
      impact: { crater: 2.5, heatRadius: 2, heat: 2.2, debris: 10, debrisSpeed: 0.8, fire: 120, flash: 1.6, shockwave: 0, shake: 0.15, boom: 0.3, stability: 0.012 },
      lava: { radius: 9, duration: 4.5 },
    },
  },
  {
    id: 'cryo',
    name: 'Cryo Beam',
    category: 'Energy',
    blurb: 'Freezes the ground solid. Frozen rock SHATTERS when anything hits it.',
    price: 450,
    color: '#38e1ff',
    icon: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.2v19.6M3.5 7.1l17 9.8M3.5 16.9l17-9.8"/><path d="M9.4 3.8 12 6l2.6-2.2M9.4 20.2 12 18l2.6 2.2M3.2 10.4l3.3-.6-1.1-3.2M20.8 13.6l-3.3.6 1.1 3.2M3.2 13.6l3.3.6-1.1 3.2M20.8 10.4l-3.3-.6 1.1-3.2"/></g><circle cx="12" cy="12" r="2" fill="currentColor"/>',
    beam: { width: 0.07, drillRate: 0, drillRadius: 3.4, heat: 0, color: 0x38e1ff, pitch: 1.6, isCryo: true, stability: 0.004 },
  },
  {
    id: 'nuke',
    name: 'Nuke',
    category: 'Projectiles',
    blurb: 'Small crater, enormous burning shockwave that sweeps cities away.',
    price: 650,
    color: '#9cff57',
    icon: '<circle cx="12" cy="12" r="10.4" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="1.9" fill="currentColor"/><path d="M10.5 9.4 8 5.07A8 8 0 0 1 16 5.07L13.5 9.4A3 3 0 0 0 10.5 9.4ZM15 12h5A8 8 0 0 1 16 18.93l-2.5-4.33A3 3 0 0 0 15 12ZM9 12H4A8 8 0 0 0 8 18.93l2.5-4.33A3 3 0 0 1 9 12Z" fill="currentColor"/>',
    projectile: {
      speed: 4.5, size: 0.12, model: 'warhead', trailColor: 0xfff080, cluster: 1, spread: 0, cooldown: 0.9,
      impact: { crater: 4, heatRadius: 2.6, heat: 2.0, debris: 40, debrisSpeed: 1.0, fire: 300, flash: 4.5, shockwave: 34, shockKill: true, shockHeat: 0.3, shake: 0.55, boom: 0.75, stability: 0.06 },
    },
  },
  {
    id: 'meteors',
    name: 'Meteor Storm',
    category: 'Cosmic',
    blurb: 'Hold to rain meteors wherever you point.',
    price: 850,
    color: '#ff8c42',
    icon: '<path d="M3.6 4.2 8.8 9.4M12 3.4l3.6 3.6M2.8 12.2l4.4 4.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity=".5"/><circle cx="11" cy="11.2" r="2.9" fill="currentColor"/><circle cx="17.6" cy="8.6" r="2.2" fill="currentColor"/><circle cx="9.2" cy="18.2" r="2.3" fill="currentColor"/><circle cx="18.4" cy="18" r="1.6" fill="currentColor" opacity=".75"/>',
    projectile: {
      speed: 5, size: 0.12, model: 'rock', trailColor: 0xff6a20, cluster: 1, spread: 4, cooldown: 0.11, launch: 'above',
      impact: { crater: 2.8, heatRadius: 1.6, heat: 1.3, debris: 10, debrisSpeed: 0.9, fire: 50, flash: 1.1, shockwave: 0, shake: 0.08, boom: 0.18, stability: 0.003 },
    },
  },
  {
    id: 'asteroid',
    name: 'Asteroid',
    category: 'Cosmic',
    blurb: 'One giant crater. Its debris rains back down and punches more craters.',
    price: 1100,
    color: '#c9a27e',
    icon: '<path d="M8 3.4 14 2.6l4.9 3 2.1 5.7-1.6 6.1-5.3 3.5-6.5-.6L3.3 16.2l-.6-6.3z" fill="currentColor"/><circle cx="9.4" cy="9.4" r="2.1" fill="#0b0f1e" opacity=".35"/><circle cx="15" cy="14.6" r="2.9" fill="#0b0f1e" opacity=".3"/><circle cx="15.6" cy="7.4" r="1.2" fill="#0b0f1e" opacity=".3"/><circle cx="7.6" cy="15" r="1" fill="#0b0f1e" opacity=".3"/>',
    projectile: {
      speed: 3.2, size: 0.34, model: 'rock', trailColor: 0xff7a30, cluster: 1, spread: 0, cooldown: 1.2, launch: 'above',
      impact: { crater: 11, heatRadius: 1.6, heat: 1.6, debris: 160, debrisSpeed: 1.3, fire: 360, flash: 4.2, shockwave: 24, shake: 0.75, boom: 0.9, stability: 0.1 },
      ejecta: { count: 9, crater: 3, minRange: 13, maxRange: 26 },
    },
  },
  {
    id: 'splitter',
    name: 'Splitter',
    category: 'Projectiles',
    blurb: 'One rocket that splits just before impact into a ring of six warheads.',
    price: 1400,
    color: '#ff4dff',
    icon: '<path d="M12 2 14.2 5.8V9H9.8V5.8z" fill="currentColor"/><path d="M12 11v6.4M11.4 11 6.6 16.6M12.6 11l4.8 5.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="1.6 2.2"/><circle cx="12" cy="20" r="2.2" fill="currentColor"/><circle cx="5.4" cy="18.6" r="2.2" fill="currentColor"/><circle cx="18.6" cy="18.6" r="2.2" fill="currentColor"/>',
    projectile: {
      speed: 5, size: 0.11, model: 'warhead', trailColor: 0xff80ff, cluster: 1, spread: 0, cooldown: 1.4,
      impact: { crater: 4.5, heatRadius: 2, heat: 1.5, debris: 40, debrisSpeed: 1.0, fire: 140, flash: 2.2, shockwave: 10, shake: 0.3, boom: 0.45, stability: 0.02 },
      split: {
        count: 6, ringRadius: 10,
        impact: { crater: 4.5, heatRadius: 2, heat: 1.5, debris: 40, debrisSpeed: 1.0, fire: 140, flash: 2.2, shockwave: 10, shake: 0.3, boom: 0.45, stability: 0.02 },
      },
    },
  },
  {
    id: 'lance',
    name: 'Core Lance',
    category: 'Cosmic',
    blurb: 'A tungsten lance that drills straight down and detonates in the core.',
    price: 1800,
    color: '#00e5ff',
    icon: '<circle cx="12" cy="15.6" r="6.6" fill="none" stroke="currentColor" stroke-width="1.8" opacity=".55"/><circle cx="12" cy="15.6" r="2.3" fill="currentColor"/><path d="M12 1.6V12" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M8.8 9.6 12 13.2l3.2-3.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    projectile: {
      speed: 13, size: 0.16, model: 'rod', trailColor: 0x70f0ff, cluster: 1, spread: 0, cooldown: 1.3, launch: 'edge',
      isKinetic: true,
      impact: { crater: 3, heatRadius: 1.6, heat: 1.2, debris: 60, debrisSpeed: 1.6, fire: 120, flash: 3.0, shockwave: 12, shake: 0.5, boom: 0.6, stability: 0.05 },
      lance: { depth: 0.9, radius: 2.4, cavity: 7.5 },
    },
  },
  {
    id: 'black-hole',
    name: 'Black Hole',
    category: 'Cosmic',
    blurb: 'Sticks to the surface, drags in rock and debris, grows, then collapses.',
    price: 2400,
    color: '#c056ff',
    icon: '<circle cx="12" cy="12" r="5" fill="currentColor"/><circle cx="12" cy="12" r="3.3" fill="#0b0f1e"/><ellipse cx="12" cy="12" rx="10.6" ry="3.8" fill="none" stroke="currentColor" stroke-width="2" transform="rotate(-20 12 12)"/>',
    projectile: {
      speed: 4.2, size: 0.28, model: 'singularity', trailColor: 0xcc44ff, cluster: 1, spread: 0, cooldown: 2.0,
      isBlackHole: true,
      impact: { crater: 12, heatRadius: 0.8, heat: 0.1, debris: 50, debrisSpeed: 0.4, fire: 60, flash: 5.5, shockwave: 30, shake: 0.9, boom: 1.0, stability: 0.12 },
    },
  },
  {
    id: 'nova',
    name: 'Nova Beam',
    category: 'Energy',
    blurb: 'Charges while held: starts as a thin ray, ends as a planet-cutting lance.',
    price: 3200,
    color: '#ffd060',
    icon: '<path d="M9.5 12h12.3" stroke="currentColor" stroke-width="3.6" stroke-linecap="round"/><path d="M9.5 12h12.3" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".7"/><path d="M6.2 5.6 7.6 10.6 12.6 12 7.6 13.4 6.2 18.4 4.8 13.4 0 12 4.8 10.6z" fill="currentColor"/>',
    beam: {
      width: 0.03, drillRate: 20, drillRadius: 1.6, heat: 2.4, color: 0xffa020, pitch: 0.5, stability: 0.01,
      charge: { time: 3.5, maxRadius: 8.5, maxWidth: 0.24, endColor: 0xfff2c0 },
    },
  },
];

export function weaponById(id: string): WeaponDef {
  return WEAPONS.find(w => w.id === id) ?? WEAPONS[0];
}
