// Background worker: builds a planet's surface lookup and cloud pattern off the main
// thread, so switching planets doesn't freeze the game. See planetCache.ts.

import { buildCloudAlpha, buildSurface } from './planetData';
import type { PlanetDef } from './planets';

interface WorkerScope {
  onmessage: ((e: MessageEvent<{ def: PlanetDef }>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;

scope.onmessage = e => {
  const def = e.data.def;
  const surface = buildSurface(def);
  const clouds = def.clouds ? buildCloudAlpha(def.clouds, def.seed) : null;
  const transfer: Transferable[] = [surface.height.buffer, surface.color.buffer, surface.land.buffer];
  if (clouds) transfer.push(clouds.buffer);
  scope.postMessage({ id: def.id, surface, clouds }, transfer);
};
