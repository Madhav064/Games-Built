// The destructible planet: a signed-distance voxel field split into chunks.
// Weapons carve the field and add heat; dirty chunks are re-meshed with
// Surface Nets. Colours come from depth (surface -> crust -> mantle -> core).

import * as THREE from 'three';
import { surfaceNets } from './surfaceNets';
import { PlanetSurface, type PlanetDef } from './planets';
import { Simplex3 } from './noise';
import { createPlanetMaterial } from './planetMaterial';

export const GRID = 96;
const CHUNK = 16;
const NC = GRID / CHUNK;
const NXY = GRID * GRID;
export const RADIUS_VOX = 38;
export const WORLD_RADIUS = 2;
export const VOXEL = WORLD_RADIUS / RADIUS_VOX;
export const CENTER = (GRID - 1) / 2;
const CORE_R = RADIUS_VOX * 0.5;

const tmpColor = new Float32Array(3);

/** Hex (sRGB) -> linear rgb triple, matching how vertex colours are rendered. */
function hexRgb(hex: number): [number, number, number] {
  const c = new THREE.Color().setHex(hex);
  return [c.r, c.g, c.b];
}

export interface ShadeOut { r: number; g: number; b: number; glow: number; surf: number }
const shadeOut: ShadeOut = { r: 0, g: 0, b: 0, glow: 0, surf: 0 };

interface Chunk {
  cx: number; cy: number; cz: number;
  mesh: THREE.Mesh | null;
  geomDirty: boolean;
  attrDirty: boolean;
  hot: boolean;
  sampleIndex: Int32Array | null;
  baseGlow: Float32Array | null;
}

export interface CarveResult {
  /** Solid samples removed. */
  removed: number;
  /** Removed samples that were inside the core. */
  coreRemoved: number;
}

