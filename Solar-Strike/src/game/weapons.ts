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
}

export interface BeamSpec {
  width: number;
  /** Drill speed in voxels per second (0 = does not dig). */
  drillRate: number;
  drillRadius: number;
  heat: number;
  color: number;
  pitch: number;
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
    icon: '<path d="M3 21 L14 10" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><circle cx="16.5" cy="7.5" r="4" fill="currentColor" opacity=".35"/><circle cx="16.5" cy="7.5" r="2" fill="currentColor"/>',
    beam: { width: 0.05, drillRate: 16, drillRadius: 2.4, heat: 0.9, color: 0xff3030, pitch: 1 },
  },
  {
    id: 'missile',
    name: 'Missile',
    category: 'Projectiles',
    blurb: 'Fast guided missile. Tap for one, hold for a volley.',
    price: 0,
    color: '#ffd166',
    icon: '<path d="M5 19 L15 9 L19 5 L18 10 L9 19 Z" fill="currentColor"/><path d="M5 19 L3 21 M7 21 L5 19 L3 17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    projectile: {
      speed: 7, size: 0.07, model: 'missile', trailColor: 0xffa040, cluster: 1, spread: 0, cooldown: 0.18,
      impact: { crater: 3.2, heatRadius: 1.8, heat: 1.2, debris: 14, debrisSpeed: 0.9, fire: 60, flash: 0.9, shockwave: 0, shake: 0.12, boom: 0.15 },
    },
  },
  {
    id: 'mortar',
    name: 'Plasma Mortar',
    category: 'Energy',
    blurb: 'Lobs molten plasma. Leaves lava pools that keep burning and spreading.',
    price: 300,
    color: '#ff8a30',
    icon: '<path d="M4 20 Q9 4 18 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2 2.4" stroke-linecap="round"/><circle cx="18" cy="9" r="3.4" fill="currentColor"/><path d="M3 21h8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    projectile: {
      speed: 3.6, size: 0.1, model: 'blob', trailColor: 0xff8a30, cluster: 1, spread: 0, cooldown: 0.7, homing: 1.6,
      impact: { crater: 2.5, heatRadius: 2, heat: 2.2, debris: 10, debrisSpeed: 0.8, fire: 120, flash: 1.6, shockwave: 0, shake: 0.15, boom: 0.3 },
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
    icon: '<path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="3" fill="currentColor"/>',
    beam: { width: 0.07, drillRate: 0, drillRadius: 3.4, heat: 0, color: 0x38e1ff, pitch: 1.6, isCryo: true },
  },
  {
    id: 'nuke',
    name: 'Nuke',
    category: 'Projectiles',
    blurb: 'Small crater, enormous burning shockwave that sweeps cities away.',
    price: 650,
    color: '#9cff57',
    icon: '<circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M12 3 a9 9 0 0 1 7.8 4.5 L14.6 10.5 a3 3 0 0 0 -2.6 -1.5 Z M4.2 7.5 A9 9 0 0 1 12 3 M3.4 15.5 L8.6 12.5 a3 3 0 0 0 1.4 2.6 L7 20.2 A9 9 0 0 1 3.4 15.5 Z M20.6 15.5 A9 9 0 0 1 17 20.2 L14 15.1 a3 3 0 0 0 1.4 -2.6 Z" fill="currentColor"/>',
    projectile: {
      speed: 4.5, size: 0.12, model: 'warhead', trailColor: 0xfff080, cluster: 1, spread: 0, cooldown: 0.9,
      impact: { crater: 4, heatRadius: 2.6, heat: 2.0, debris: 40, debrisSpeed: 1.0, fire: 300, flash: 4.5, shockwave: 34, shockKill: true, shockHeat: 0.3, shake: 0.55, boom: 0.75 },
    },
  },
  {
    id: 'meteors',
    name: 'Meteor Storm',
    category: 'Cosmic',
    blurb: 'Hold to rain meteors wherever you point.',
    price: 850,
    color: '#ff8c42',
    icon: '<circle cx="6" cy="4" r="1.8" fill="currentColor"/><circle cx="12" cy="7" r="2.2" fill="currentColor"/><circle cx="18" cy="5" r="1.5" fill="currentColor"/><circle cx="9" cy="13" r="1.6" fill="currentColor"/><circle cx="16" cy="15" r="1.4" fill="currentColor"/><path d="M6 4l-2 4M12 7l-1 5M18 5l-1 5M9 13l-1 4M16 15l0 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity=".5"/>',
    projectile: {
      speed: 5, size: 0.12, model: 'rock', trailColor: 0xff6a20, cluster: 1, spread: 4, cooldown: 0.11,
      impact: { crater: 2.8, heatRadius: 1.6, heat: 1.3, debris: 10, debrisSpeed: 0.9, fire: 50, flash: 1.1, shockwave: 0, shake: 0.08, boom: 0.18 },
    },
  },
  {
    id: 'asteroid',
    name: 'Asteroid',
    category: 'Cosmic',
    blurb: 'One giant crater. Its debris rains back down and punches more craters.',
    price: 1100,
    color: '#c9a27e',
    icon: '<path d="M7 6 L13 4 L18 7 L20 13 L16 19 L9 20 L4 15 L4 9 Z" fill="currentColor"/><circle cx="10" cy="10" r="1.6" fill="#000" opacity=".35"/><circle cx="14.5" cy="14" r="2.2" fill="#000" opacity=".3"/>',
    projectile: {
      speed: 3.2, size: 0.34, model: 'rock', trailColor: 0xff7a30, cluster: 1, spread: 0, cooldown: 1.2,
      impact: { crater: 11, heatRadius: 1.6, heat: 1.6, debris: 160, debrisSpeed: 1.3, fire: 360, flash: 4.2, shockwave: 24, shake: 0.75, boom: 0.9 },
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
    icon: '<path d="M12 2 L13 8 L12 9 L11 8 Z" fill="currentColor"/><path d="M12 9 L6 18 M12 9 L9 19 M12 9 L12 20 M12 9 L15 19 M12 9 L18 18" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="6" cy="18" r="1.8" fill="currentColor"/><circle cx="9" cy="19" r="1.8" fill="currentColor"/><circle cx="12" cy="20" r="1.8" fill="currentColor"/><circle cx="15" cy="19" r="1.8" fill="currentColor"/><circle cx="18" cy="18" r="1.8" fill="currentColor"/>',
    projectile: {
      speed: 5, size: 0.11, model: 'warhead', trailColor: 0xff80ff, cluster: 1, spread: 0, cooldown: 1.4,
      impact: { crater: 4.5, heatRadius: 2, heat: 1.5, debris: 40, debrisSpeed: 1.0, fire: 140, flash: 2.2, shockwave: 10, shake: 0.3, boom: 0.45 },
      split: {
        count: 6, ringRadius: 10,
        impact: { crater: 4.5, heatRadius: 2, heat: 1.5, debris: 40, debrisSpeed: 1.0, fire: 140, flash: 2.2, shockwave: 10, shake: 0.3, boom: 0.45 },
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
    icon: '<path d="M11 2 L13 2 L13 17 L15 17 L12 22 L9 17 L11 17 Z" fill="currentColor"/><line x1="6" y1="8" x2="6" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="18" y1="8" x2="18" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    projectile: {
      speed: 13, size: 0.16, model: 'rod', trailColor: 0x70f0ff, cluster: 1, spread: 0, cooldown: 1.3,
      isKinetic: true,
      impact: { crater: 3, heatRadius: 1.6, heat: 1.2, debris: 60, debrisSpeed: 1.6, fire: 120, flash: 3.0, shockwave: 12, shake: 0.5, boom: 0.6 },
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
    icon: '<circle cx="12" cy="12" r="4.2" fill="currentColor" opacity=".25"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.4"/><ellipse cx="12" cy="12" rx="9" ry="3.5" fill="none" stroke="currentColor" stroke-width="2" transform="rotate(-30 12 12)"/><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 3"/>',
    projectile: {
      speed: 4.2, size: 0.28, model: 'singularity', trailColor: 0xcc44ff, cluster: 1, spread: 0, cooldown: 2.0,
      isBlackHole: true,
      impact: { crater: 12, heatRadius: 0.8, heat: 0.1, debris: 50, debrisSpeed: 0.4, fire: 60, flash: 5.5, shockwave: 30, shake: 0.9, boom: 1.0 },
    },
  },
];

export function weaponById(id: string): WeaponDef {
  return WEAPONS.find(w => w.id === id) ?? WEAPONS[0];
}
