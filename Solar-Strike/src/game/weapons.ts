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

