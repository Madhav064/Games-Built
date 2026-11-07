// Planet definitions + the precomputed surface (height and colour) lookup.
// Everything here is generated from noise, so planets need no texture files.

import * as THREE from 'three';
import { Simplex3, mulberry32 } from './noise';

export interface CloudDef { color: number; coverage: number; opacity: number }

export interface RingDef {
  innerRadius: number;
  outerRadius: number;
  color: number;
  opacity: number;
  tilt?: number;
}

export interface PlanetDef {
  id: string;
  name: string;
  blurb: string;
  seed: number;
  /** People living on the surface (0 = uninhabited). */
  population: number;
  /** Terrain relief in voxels. */
  terrainAmp: number;
  terrainFreq: number;
  /** Noise height (-1..1) below which the surface is ocean; null = no oceans. */
  seaLevel: number | null;
  /** abs(latitude) (0..1) above which ice caps form; >1 = none. */
  iceCap: number;
  /** Number of impact craters baked into the terrain. */
  craters: number;
  colors: {
    deepOcean: number; ocean: number; shore: number;
    low: number; mid: number; high: number; peak: number; ice: number;
    crust: number; mantle: number; outerCore: number; innerCore: number;
  };
  clouds: CloudDef | null;
  atmosphere: { color: number; strength: number } | null;
  rings?: RingDef | null;
  /** Coins to unlock in the shop (0 = free). */
  price: number;
}

