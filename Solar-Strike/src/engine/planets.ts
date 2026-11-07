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

export const PLANETS: PlanetDef[] = [
  {
    id: 'earth',
    name: 'Earth',
    blurb: 'Home. 8 billion people. Oceans, forests and a molten heart.',
    seed: 7,
    population: 8_100_000_000,
    terrainAmp: 1.8,
    terrainFreq: 1.6,
    seaLevel: 0.1,
    iceCap: 0.82,
    craters: 0,
    colors: {
      deepOcean: 0x0a2a5e, ocean: 0x14508f, shore: 0xc9b77c,
      low: 0x2f6b25, mid: 0x4f7a2c, high: 0x8a7452, peak: 0xe9ecef, ice: 0xf2f6fa,
      crust: 0x6b5a4a, mantle: 0x8a2a10, outerCore: 0xff7a1a, innerCore: 0xfff2b0,
    },
    clouds: { color: 0xffffff, coverage: 0.42, opacity: 0.85 },
    atmosphere: { color: 0x5aa8ff, strength: 1.0 },
    price: 0,
  },
  {
    id: 'mars',
    name: 'Mars',
    blurb: 'The red planet. Dusty canyons, polar ice and a few hopeful colonists.',
    seed: 23,
    population: 120_000,
    terrainAmp: 2.4,
    terrainFreq: 1.3,
    seaLevel: null,
    iceCap: 0.88,
    craters: 18,
    colors: {
      deepOcean: 0, ocean: 0, shore: 0,
      low: 0x8c3b1e, mid: 0xb1562c, high: 0xc77a4a, peak: 0xd9a27a, ice: 0xf4ece4,
      crust: 0x6e3420, mantle: 0x7a2410, outerCore: 0xff6a10, innerCore: 0xffe7a0,
    },
    clouds: null,
    atmosphere: { color: 0xff9a6a, strength: 0.45 },
    price: 0,
  },
  {
    id: 'moon',
    name: 'The Moon',
    blurb: 'Grey, cratered and quiet. A small research base lives here.',
    seed: 101,
    population: 2_400,
    terrainAmp: 1.2,
    terrainFreq: 2.2,
    seaLevel: null,
    iceCap: 2,
    craters: 60,
    colors: {
      deepOcean: 0, ocean: 0, shore: 0,
      low: 0x55565a, mid: 0x77787c, high: 0x9a9b9f, peak: 0xbfc0c4, ice: 0xd8d8dc,
      crust: 0x5c5b58, mantle: 0x6a2a14, outerCore: 0xff7a20, innerCore: 0xfff0c0,
    },
    clouds: null,
    atmosphere: null,
    price: 0,
  },
  {
    id: 'venus',
    name: 'Venus',
    blurb: 'A volcanic hellscape. Crushing pressure, acid clouds and 460°C surface heat.',
    seed: 42,
    population: 0,
    terrainAmp: 2.0,
    terrainFreq: 1.4,
    seaLevel: null,
    iceCap: 2,
    craters: 8,
    colors: {
      deepOcean: 0, ocean: 0, shore: 0,
      low: 0x8a6a30, mid: 0xb5843a, high: 0xd4a04a, peak: 0xe8c870, ice: 0xf0d080,
      crust: 0x6b4a22, mantle: 0xa83a10, outerCore: 0xff8a20, innerCore: 0xfff4c0,
    },
    clouds: { color: 0xf0d8a0, coverage: 0.65, opacity: 0.92 },
    atmosphere: { color: 0xffc860, strength: 1.3 },
    price: 0,
  },
];

