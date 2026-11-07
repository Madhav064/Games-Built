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

// ------------------------------------------------------------
// Precomputed surface lookup (latitude/longitude grid)
// ------------------------------------------------------------

const LUT_W = 512;
const LUT_H = 256;

function hexToRgb(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  const u = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

interface Crater { x: number; y: number; z: number; cosR: number; depth: number }

export class PlanetSurface {
  /** Height offset in voxels at each lat/long cell. */
  readonly height = new Float32Array(LUT_W * LUT_H);
  /** Surface colour (rgb) at each cell. */
  readonly color = new Float32Array(LUT_W * LUT_H * 3);
  /** 1 where the surface is land (people can live there). */
  readonly land = new Uint8Array(LUT_W * LUT_H);

  constructor(readonly def: PlanetDef) {
    const noise = new Simplex3(def.seed);
    const detail = new Simplex3(def.seed + 1000);
    const rand = mulberry32(def.seed * 31 + 5);
    const craters: Crater[] = [];
    for (let i = 0; i < def.craters; i++) {
      const u = rand() * 2 - 1, th = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const size = 0.04 + Math.pow(rand(), 3) * 0.22;
      craters.push({ x: s * Math.cos(th), y: u, z: s * Math.sin(th), cosR: Math.cos(size), depth: 0.6 + rand() * 0.6 });
    }

    const c = def.colors;
    const deepOcean = hexToRgb(c.deepOcean), ocean = hexToRgb(c.ocean), shore = hexToRgb(c.shore);
    const low = hexToRgb(c.low), midC = hexToRgb(c.mid), high = hexToRgb(c.high), peak = hexToRgb(c.peak);
    const ice = hexToRgb(c.ice);

    for (let j = 0; j < LUT_H; j++) {
      const lat = ((j + 0.5) / LUT_H) * Math.PI - Math.PI / 2; // -pi/2..pi/2
      const cl = Math.cos(lat), sl = Math.sin(lat);
      for (let i = 0; i < LUT_W; i++) {
        const lon = ((i + 0.5) / LUT_W) * Math.PI * 2 - Math.PI;
        const x = cl * Math.cos(lon), y = sl, z = cl * Math.sin(lon);
        const f = def.terrainFreq;
        let n = noise.fbm(x * f, y * f, z * f, 6);
        n += 0.35 * (noise.ridged(x * f * 1.7 + 5, y * f * 1.7, z * f * 1.7) - 0.35);
        // Craters: bowl with a raised rim.
        for (const cr of craters) {
          const d = x * cr.x + y * cr.y + z * cr.z;
          if (d > cr.cosR - 0.02) {
            const r = (1 - d) / (1 - cr.cosR); // 0 centre .. 1 rim
            if (r < 1) n -= cr.depth * 0.5 * (1 - r * r);
            else n += 0.12 * cr.depth * Math.max(0, 1 - (r - 1) * 6);
          }
        }
        const idx = j * LUT_W + i;
        const sea = def.seaLevel;
        const isOcean = sea !== null && n < sea;
        const h = isOcean ? sea! : n;
        this.height[idx] = h * def.terrainAmp;
        this.land[idx] = isOcean ? 0 : 1;

        // Colour
        const jitter = detail.noise(x * 9, y * 9, z * 9) * 0.06;
        let col: [number, number, number];
        if (isOcean) {
          col = mix(deepOcean, ocean, 1 - Math.min(1, (sea! - n) * 4));
        } else {
          const above = sea === null ? (n + 1) / 2 : (n - sea) / (1 - sea);
          if (above < 0.3) col = mix(low, midC, above / 0.3 + jitter * 3);
          else if (above < 0.55) col = mix(midC, high, (above - 0.3) / 0.25 + jitter * 3);
          else col = mix(high, peak, (above - 0.55) / 0.3 + jitter * 2);
          // Dry belts near the tropics on wet worlds.
          if (sea !== null) {
            const dry = Math.max(0, 1 - Math.abs(Math.abs(lat) - 0.4) * 5) * (detail.noise(x * 2, y * 2, z * 2) * 0.5 + 0.5);
            col = mix(col, high, dry * 0.7);
            // Thin sandy coasts, blended rather than a hard band.
            col = mix(col, shore, 0.45 * (1 - Math.min(1, above / 0.02)));
          }
        }
        const capT = Math.abs(sl) + detail.noise(x * 4, y * 4, z * 4) * 0.06;
        if (capT > def.iceCap) col = mix(col, ice, (capT - def.iceCap) * 25);
        col = [col[0] * (1 + jitter), col[1] * (1 + jitter), col[2] * (1 + jitter)];
        this.color[idx * 3] = col[0];
        this.color[idx * 3 + 1] = col[1];
        this.color[idx * 3 + 2] = col[2];
      }
    }
  }

  /** The surface colours as an sRGB texture (sampled per pixel in the planet shader). */
  createTexture(): THREE.DataTexture {
    const data = new Uint8Array(LUT_W * LUT_H * 4);
    for (let i = 0; i < LUT_W * LUT_H; i++) {
      data[i * 4] = Math.max(0, Math.min(255, this.color[i * 3] * 255));
      data[i * 4 + 1] = Math.max(0, Math.min(255, this.color[i * 3 + 1] * 255));
      data[i * 4 + 2] = Math.max(0, Math.min(255, this.color[i * 3 + 2] * 255));
      data[i * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, LUT_W, LUT_H, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  private cell(dx: number, dy: number, dz: number): { fi: number; fj: number } {
    const len = Math.hypot(dx, dy, dz) || 1;
    const lat = Math.asin(Math.max(-1, Math.min(1, dy / len)));
    const lon = Math.atan2(dz, dx);
    return {
      fi: ((lon + Math.PI) / (Math.PI * 2)) * LUT_W - 0.5,
      fj: ((lat + Math.PI / 2) / Math.PI) * LUT_H - 0.5,
    };
  }

  /** Bilinear height offset (voxels) in direction (dx,dy,dz). */
  heightAt(dx: number, dy: number, dz: number): number {
    const { fi, fj } = this.cell(dx, dy, dz);
    const i0 = Math.floor(fi), j0 = Math.floor(fj);
    const tx = fi - i0, ty = fj - j0;
    const ia = ((i0 % LUT_W) + LUT_W) % LUT_W, ib = (ia + 1) % LUT_W;
    const ja = Math.max(0, Math.min(LUT_H - 1, j0)), jb = Math.max(0, Math.min(LUT_H - 1, j0 + 1));
    const h = this.height;
    const a = h[ja * LUT_W + ia] * (1 - tx) + h[ja * LUT_W + ib] * tx;
    const b = h[jb * LUT_W + ia] * (1 - tx) + h[jb * LUT_W + ib] * tx;
    return a * (1 - ty) + b * ty;
  }

  /** Nearest-cell surface colour and land flag. */
  sample(dx: number, dy: number, dz: number, out: Float32Array): boolean {
    const { fi, fj } = this.cell(dx, dy, dz);
    const i = ((Math.round(fi) % LUT_W) + LUT_W) % LUT_W;
    const j = Math.max(0, Math.min(LUT_H - 1, Math.round(fj)));
    const idx = j * LUT_W + i;
    out[0] = this.color[idx * 3];
    out[1] = this.color[idx * 3 + 1];
    out[2] = this.color[idx * 3 + 2];
    return this.land[idx] === 1;
  }
}
