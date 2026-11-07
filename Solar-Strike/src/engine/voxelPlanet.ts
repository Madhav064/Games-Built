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

export class VoxelPlanet {
  readonly group = new THREE.Group();
  readonly field = new Float32Array(GRID * GRID * GRID);
  readonly heat = new Float32Array(GRID * GRID * GRID);
  readonly scorch = new Uint8Array(GRID * GRID * GRID);
  readonly surface: PlanetSurface;
  readonly chunks: Chunk[] = [];
  solidInitial = 0;
  solid = 0;
  coreInitial = 0;
  core = 0;

  private readonly rough = new Simplex3(99);
  private readonly hotChunks = new Set<Chunk>();
  private heatTimer = 0;
  private readonly layer: {
    crust: [number, number, number]; mantle: [number, number, number];
    outer: [number, number, number]; inner: [number, number, number];
  };
  private readonly invMatrix = new THREE.Matrix4();

  readonly material: THREE.MeshStandardMaterial;
  private readonly surfaceTexture: THREE.Texture;

  constructor(readonly def: PlanetDef) {
    this.surface = new PlanetSurface(def);
    this.surfaceTexture = this.surface.createTexture();
    this.material = createPlanetMaterial(this.surfaceTexture);
    const c = def.colors;
    this.layer = { crust: hexRgb(c.crust), mantle: hexRgb(c.mantle), outer: hexRgb(c.outerCore), inner: hexRgb(c.innerCore) };
    for (let cz = 0; cz < NC; cz++)
      for (let cy = 0; cy < NC; cy++)
        for (let cx = 0; cx < NC; cx++)
          this.chunks.push({ cx, cy, cz, mesh: null, geomDirty: true, attrDirty: false, hot: false, sampleIndex: null, baseGlow: null });
    this.generate();
    for (const ch of this.chunks) this.rebuildChunk(ch);
  }

  // ----------------------------------------------------------
  // Generation
  // ----------------------------------------------------------
  private generate(): void {
    const f = this.field;
    let solid = 0, core = 0;
    for (let z = 0; z < GRID; z++) {
      const dz = z - CENTER;
      for (let y = 0; y < GRID; y++) {
        const dy = y - CENTER;
        for (let x = 0; x < GRID; x++) {
          const dx = x - CENTER;
          const r = Math.hypot(dx, dy, dz);
          const i = x + y * GRID + z * NXY;
          // Skip the lookup far from the surface.
          let surfR = RADIUS_VOX;
          if (r > RADIUS_VOX - 4 && r < RADIUS_VOX + 6) surfR += this.surface.heightAt(dx, dy, dz);
          let v = surfR - r;
          // Keep the grid border empty so meshes are always closed.
          if (x === 0 || y === 0 || z === 0 || x === GRID - 1 || y === GRID - 1 || z === GRID - 1) v = -1;
          f[i] = v;
          if (v > 0) {
            solid++;
            if (r < CORE_R) core++;
          }
        }
      }
    }
    this.solid = this.solidInitial = solid;
    this.core = this.coreInitial = core;
  }

}
