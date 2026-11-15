// Heavy, deterministic planet data built from noise: the surface lookup (height, colour,
// land) and the cloud pattern. Pure maths with no three.js or DOM, so it also runs inside
// the planet worker (planetWorker.ts) without pulling the renderer into that bundle.

import { Simplex3, mulberry32 } from './noise';
import type { CloudDef, PlanetDef } from './planets';
import { EARTH_MAP_B64, EARTH_PALETTE_SIZE } from './earthMap';

/** Decoded real Earth map (see scripts/build-earth-map.py), in surface-lookup layout. */
let earthMap: { palette: Uint8Array; land: Uint8Array; index: Uint8Array } | null = null;
function getEarthMap(): NonNullable<typeof earthMap> {
  if (earthMap) return earthMap;
  const bin = atob(EARTH_MAP_B64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const p = EARTH_PALETTE_SIZE * 3, n = LUT_W * LUT_H;
  const land = new Uint8Array(n);
  for (let i = 0; i < n; i++) land[i] = (bytes[p + (i >> 3)] >> (i & 7)) & 1;
  earthMap = { palette: bytes.subarray(0, p), land, index: bytes.subarray(p + n / 8, p + n / 8 + n) };
  return earthMap;
}

/** Surface lookup size (latitude/longitude grid). */
export const LUT_W = 512;
export const LUT_H = 256;
/** Cloud canvas size. */
export const CLOUD_W = 768;
export const CLOUD_H = 384;

export interface SurfaceData {
  /** Height offset in voxels at each lat/long cell. */
  height: Float32Array;
  /** Surface colour, sRGB 0..255, three bytes per cell. */
  color: Uint8Array;
  /** 1 where the surface is land (people can live there). */
  land: Uint8Array;
}

type Rgb = [number, number, number];

function hexToRgb(hex: number): Rgb {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const u = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

const toByte = (v: number) => Math.max(0, Math.min(255, v * 255));

interface Crater { x: number; y: number; z: number; cosR: number; depth: number }

export function buildSurface(def: PlanetDef): SurfaceData {
  const height = new Float32Array(LUT_W * LUT_H);
  const color = new Uint8Array(LUT_W * LUT_H * 3);
  const land = new Uint8Array(LUT_W * LUT_H);

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
      height[idx] = h * def.terrainAmp;
      land[idx] = isOcean ? 0 : 1;

      // Colour
      const jitter = detail.noise(x * 9, y * 9, z * 9) * 0.06;
      let col: Rgb;
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
      color[idx * 3] = toByte(col[0] * (1 + jitter));
      color[idx * 3 + 1] = toByte(col[1] * (1 + jitter));
      color[idx * 3 + 2] = toByte(col[2] * (1 + jitter));
    }
  }
  return { height, color, land };
}

/** Cloud cover alpha (0..255) on a CLOUD_W x CLOUD_H equirectangular canvas. */
export function buildCloudAlpha(def: CloudDef, seed: number): Uint8Array {
  const out = new Uint8Array(CLOUD_W * CLOUD_H);
  const noise = new Simplex3(seed + 77);
  for (let y = 0; y < CLOUD_H; y++) {
    const theta = ((y + 0.5) / CLOUD_H) * Math.PI;
    for (let x = 0; x < CLOUD_W; x++) {
      const phi = ((x + 0.5) / CLOUD_W) * Math.PI * 2;
      // Same convention as THREE.SphereGeometry.
      const dx = -Math.cos(phi) * Math.sin(theta), dy = Math.cos(theta), dz = Math.sin(phi) * Math.sin(theta);
      // Swirl: warp the lookup with low-frequency noise.
      const w = noise.noise(dx * 1.5, dy * 1.5, dz * 1.5) * 0.6;
      let n = noise.fbm(dx * 2.6 + w, dy * 5.2 + w, dz * 2.6 - w, 5) * 0.5 + 0.5;
      n = (n - (1 - def.coverage)) / def.coverage;
      out[y * CLOUD_W + x] = Math.round(Math.max(0, Math.min(1, n * 1.8)) * 255);
    }
  }
  return out;
}
