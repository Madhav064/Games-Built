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
    id: 'cryo',
    name: 'Cryo Beam',
    category: 'Energy',
    blurb: 'Freezes the ground solid. Frozen rock SHATTERS when anything hits it.',
    price: 450,
    color: '#38e1ff',
    icon: '<path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="3" fill="currentColor"/>',
    beam: { width: 0.07, drillRate: 0, drillRadius: 3.4, heat: 0, color: 0x38e1ff, pitch: 1.6, isCryo: true },
  },
];

export function weaponById(id: string): WeaponDef {
  return WEAPONS.find(w => w.id === id) ?? WEAPONS[0];
}
