// Caches the expensive per-planet data so loading a planet is fast:
// - surface lookup + cloud pattern, built ahead of time in a worker (prewarm) or on
//   demand on the main thread if the worker hasn't got there yet.
// About 1.3 MB per planet for the surface and clouds.

import { buildCloudAlpha, buildSurface, type SurfaceData } from './planetData';
import type { PlanetDef } from './planets';

export interface PlanetData { surface: SurfaceData; clouds: Uint8Array | null }

const cache = new Map<string, PlanetData>();
const queue: PlanetDef[] = [];
let busy: string | null = null;
let worker: Worker | null | undefined;

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./planetWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: string } & PlanetData>) => {
      const { id, surface, clouds } = e.data;
      if (!cache.has(id)) cache.set(id, { surface, clouds });
      busy = null;
      pump();
    };
    // No module workers (very old browsers) or the worker crashed: build on demand instead.
    worker.onerror = () => { worker?.terminate(); worker = null; busy = null; queue.length = 0; };
  } catch {
    worker = null;
  }
  return worker;
}

function pump(): void {
  if (busy) return;
  const w = getWorker();
  if (!w) return;
  let def: PlanetDef | undefined;
  while ((def = queue.shift()) && cache.has(def.id)) { /* already built */ }
  if (!def) return;
  busy = def.id;
  w.postMessage({ def });
}

/** Build these planets' data in the background, in order. */
export function prewarm(defs: PlanetDef[]): void {
  for (const d of defs) {
    if (!cache.has(d.id) && busy !== d.id && !queue.some(q => q.id === d.id)) queue.push(d);
  }
  pump();
}

/** The planet's data: from the cache, or built right now if it isn't ready. */
export function planetData(def: PlanetDef): PlanetData {
  let d = cache.get(def.id);
  if (!d) {
    d = { surface: buildSurface(def), clouds: def.clouds ? buildCloudAlpha(def.clouds, def.seed) : null };
    cache.set(def.id, d);
  }
  return d;
}
