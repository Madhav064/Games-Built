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

  // ----------------------------------------------------------
  // Coordinate helpers
  // ----------------------------------------------------------
  /** World position -> grid coordinates (writes into `out`). */
  worldToGrid(world: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    this.group.updateMatrixWorld();
    this.invMatrix.copy(this.group.matrixWorld).invert();
    out.copy(world).applyMatrix4(this.invMatrix).divideScalar(VOXEL).addScalar(CENTER);
    return out;
  }

  /** Grid coordinates -> world position. */
  gridToWorld(grid: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    this.group.updateMatrixWorld();
    out.copy(grid).subScalar(CENTER).multiplyScalar(VOXEL).applyMatrix4(this.group.matrixWorld);
    return out;
  }

  /** Trilinear field value at grid coordinates. */
  sample(gx: number, gy: number, gz: number): number {
    if (gx < 0 || gy < 0 || gz < 0 || gx >= GRID - 1 || gy >= GRID - 1 || gz >= GRID - 1) return -1;
    const x0 = Math.floor(gx), y0 = Math.floor(gy), z0 = Math.floor(gz);
    const tx = gx - x0, ty = gy - y0, tz = gz - z0;
    const i = x0 + y0 * GRID + z0 * NXY;
    const f = this.field;
    const c00 = f[i] * (1 - tx) + f[i + 1] * tx;
    const c10 = f[i + GRID] * (1 - tx) + f[i + GRID + 1] * tx;
    const c01 = f[i + NXY] * (1 - tx) + f[i + NXY + 1] * tx;
    const c11 = f[i + NXY + GRID] * (1 - tx) + f[i + NXY + GRID + 1] * tx;
    return (c00 * (1 - ty) + c10 * ty) * (1 - tz) + (c01 * (1 - ty) + c11 * ty) * tz;
  }

  isSolidWorld(world: THREE.Vector3, tmp: THREE.Vector3): boolean {
    this.worldToGrid(world, tmp);
    return this.sample(tmp.x, tmp.y, tmp.z) > 0;
  }

  /** March a world-space ray into the field. Returns the hit in grid coords or null. */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 | null {
    const o = this.worldToGrid(origin, new THREE.Vector3());
    const end = this.worldToGrid(origin.clone().add(dir), new THREE.Vector3());
    const d = end.sub(o).normalize();
    // Bounding sphere around the planet.
    const bound = RADIUS_VOX + 6;
    const oc = o.clone().subScalar(CENTER);
    const b = oc.dot(d), c = oc.lengthSq() - bound * bound;
    const disc = b * b - c;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    let t = Math.max(0, -b - sq);
    const tFar = -b + sq;
    if (tFar < 0) return null;
    const step = 0.45;
    let prevT = t;
    while (t < tFar) {
      const v = this.sample(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t);
      if (v > 0) {
        let lo = prevT, hi = t;
        for (let k = 0; k < 8; k++) {
          const mid = (lo + hi) / 2;
          if (this.sample(o.x + d.x * mid, o.y + d.y * mid, o.z + d.z * mid) > 0) hi = mid;
          else lo = mid;
        }
        return out.set(o.x + d.x * hi, o.y + d.y * hi, o.z + d.z * hi);
      }
      prevT = t;
      t += step;
    }
    return null;
  }

  // ----------------------------------------------------------
  // Damage
  // ----------------------------------------------------------
  /** Remove a (slightly ragged) sphere of material. Radius is in voxels. */
  carve(cx: number, cy: number, cz: number, radius: number, roughness = 0.35): CarveResult {
    const f = this.field;
    const r = radius + 1;
    const x0 = Math.max(1, Math.floor(cx - r)), x1 = Math.min(GRID - 2, Math.ceil(cx + r));
    const y0 = Math.max(1, Math.floor(cy - r)), y1 = Math.min(GRID - 2, Math.ceil(cy + r));
    const z0 = Math.max(1, Math.floor(cz - r)), z1 = Math.min(GRID - 2, Math.ceil(cz + r));
    let removed = 0, coreRemoved = 0;
    const noiseScale = 0.35;
    for (let z = z0; z <= z1; z++) {
      for (let y = y0; y <= y1; y++) {
        let i = x0 + y * GRID + z * NXY;
        for (let x = x0; x <= x1; x++, i++) {
          const dx = x - cx, dy = y - cy, dz = z - cz;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist > r + 1) continue;
          let d = dist - radius;
          if (roughness > 0) d += this.rough.noise(x * noiseScale, y * noiseScale, z * noiseScale) * roughness * Math.min(radius, 4);
          const old = f[i];
          if (d < old) {
            f[i] = d;
            if (old > 0 && d <= 0) {
              removed++;
              const rx = x - CENTER, ry = y - CENTER, rz = z - CENTER;
              if (rx * rx + ry * ry + rz * rz < CORE_R * CORE_R) coreRemoved++;
            }
          }
        }
      }
    }
    this.solid -= removed;
    this.core -= coreRemoved;
    this.markRegion(x0, y0, z0, x1, y1, z1, 'geom');
    return { removed, coreRemoved };
  }

  /** Add heat (0..~2) with smooth falloff. Also leaves a permanent scorch mark. */
  addHeat(cx: number, cy: number, cz: number, radius: number, amount: number): void {
    const r = radius;
    const x0 = Math.max(1, Math.floor(cx - r)), x1 = Math.min(GRID - 2, Math.ceil(cx + r));
    const y0 = Math.max(1, Math.floor(cy - r)), y1 = Math.min(GRID - 2, Math.ceil(cy + r));
    const z0 = Math.max(1, Math.floor(cz - r)), z1 = Math.min(GRID - 2, Math.ceil(cz + r));
    const h = this.heat, s = this.scorch, f = this.field;
    for (let z = z0; z <= z1; z++) {
      for (let y = y0; y <= y1; y++) {
        let i = x0 + y * GRID + z * NXY;
        for (let x = x0; x <= x1; x++, i++) {
          if (f[i] < -2) continue; // only near or inside the surface
          const dx = x - cx, dy = y - cy, dz = z - cz;
          const d2 = (dx * dx + dy * dy + dz * dz) / (r * r);
          if (d2 >= 1) continue;
          const k = (1 - d2) * (1 - d2) * amount;
          h[i] = Math.min(2.5, h[i] + k);
          const sc = Math.min(255, Math.round(k * 180));
          if (sc > s[i]) s[i] = sc;
        }
      }
    }
    this.markRegion(x0, y0, z0, x1, y1, z1, 'heat');
  }

  /** Heat a thin expanding ring on the surface (shockwave fire front). */
  heatRing(cx: number, cy: number, cz: number, ringRadius: number, width: number, amount: number): void {
    const r = ringRadius + width;
    const x0 = Math.max(1, Math.floor(cx - r)), x1 = Math.min(GRID - 2, Math.ceil(cx + r));
    const y0 = Math.max(1, Math.floor(cy - r)), y1 = Math.min(GRID - 2, Math.ceil(cy + r));
    const z0 = Math.max(1, Math.floor(cz - r)), z1 = Math.min(GRID - 2, Math.ceil(cz + r));
    const h = this.heat, s = this.scorch, f = this.field;
    for (let z = z0; z <= z1; z++) {
      for (let y = y0; y <= y1; y++) {
        let i = x0 + y * GRID + z * NXY;
        for (let x = x0; x <= x1; x++, i++) {
          const fv = f[i];
          if (fv < -1.5 || fv > 2.5) continue; // surface shell only
          const dx = x - cx, dy = y - cy, dz = z - cz;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const band = Math.abs(dist - ringRadius) / width;
          if (band >= 1) continue;
          const k = (1 - band) * amount;
          h[i] = Math.min(2.5, h[i] + k);
          const sc = Math.min(255, Math.round(k * 140));
          if (sc > s[i]) s[i] = sc;
        }
      }
    }
    this.markRegion(x0, y0, z0, x1, y1, z1, 'heat');
  }

  private markRegion(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, kind: 'geom' | 'heat'): void {
    const a = (v: number) => Math.max(0, Math.min(NC - 1, Math.floor((v - 2) / CHUNK)));
    const b = (v: number) => Math.max(0, Math.min(NC - 1, Math.floor((v + 2) / CHUNK)));
    for (let cz = a(z0); cz <= b(z1); cz++)
      for (let cy = a(y0); cy <= b(y1); cy++)
        for (let cx = a(x0); cx <= b(x1); cx++) {
          const ch = this.chunks[cx + cy * NC + cz * NC * NC];
          if (kind === 'geom') ch.geomDirty = true;
          else {
            ch.attrDirty = true;
            ch.hot = true;
            this.hotChunks.add(ch);
          }
        }
  }

  get integrity(): number { return this.solid / this.solidInitial; }
  get coreIntegrity(): number { return this.core / this.coreInitial; }

  // ----------------------------------------------------------
  // Per-frame update
  // ----------------------------------------------------------
  update(dt: number, budgetMs = 7): void {
    // Heat decays a few times per second.
    this.heatTimer += dt;
    if (this.heatTimer > 1 / 12) {
      const k = Math.exp(-this.heatTimer * 0.45);
      this.heatTimer = 0;
      for (const ch of this.hotChunks) {
        const max = this.decayBlock(ch, k);
        ch.attrDirty = true;
        if (max < 0.01) {
          ch.hot = false;
          this.hotChunks.delete(ch);
        }
      }
    }

    const start = performance.now();
    for (const ch of this.chunks) {
      if (ch.geomDirty) {
        this.rebuildChunk(ch);
        if (performance.now() - start > budgetMs) break;
      }
    }
    for (const ch of this.chunks) {
      if (ch.attrDirty && !ch.geomDirty) this.refreshAttributes(ch);
    }
  }

  private decayBlock(ch: Chunk, k: number): number {
    const h = this.heat;
    // Ice thaws slower than rock cools, leaving time to shatter frozen ground.
    const kCold = Math.pow(k, 0.35);
    let max = 0;
    const x0 = ch.cx * CHUNK, y0 = ch.cy * CHUNK, z0 = ch.cz * CHUNK;
    for (let z = z0; z < z0 + CHUNK; z++)
      for (let y = y0; y < y0 + CHUNK; y++) {
        let i = x0 + y * GRID + z * NXY;
        for (let x = 0; x < CHUNK; x++, i++) {
          const v = h[i];
          if (v === 0) continue;
          const nv = v * (v < 0 ? kCold : k);
          h[i] = Math.abs(nv) < 0.005 ? 0 : nv;
          const absV = Math.abs(nv);
          if (absV > max) max = absV;
        }
      }
    return max;
  }

}
