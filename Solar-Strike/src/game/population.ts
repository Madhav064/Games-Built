// Cities on the planet surface: they light up the night side and are wiped out
// when the ground under them is carved away or burns.

import * as THREE from 'three';
import { mulberry32 } from '../engine/noise';
import { CENTER, GRID, RADIUS_VOX, VOXEL, type VoxelPlanet } from '../engine/voxelPlanet';

export class Population {
  readonly points: THREE.Points;
  readonly total: number;
  private readonly grid: Float32Array; // city positions in grid coords
  private readonly share: Float32Array;
  private readonly alive: Uint8Array;
  private readonly alpha: Float32Array;
  private aliveShare = 1;
  private timer = 0;
  private readonly count: number;
  /** Called with the number of cities lost in an update. */
  onCitiesLost: ((n: number) => void) | null = null;

  constructor(private readonly planet: VoxelPlanet, sunDir: THREE.Vector3) {
    const def = planet.def;
    this.total = def.population;
    const rand = mulberry32(def.seed * 7 + 3);
    const target = def.population <= 0 ? 0
      : def.population > 1e9 ? 900 : def.population > 1e5 ? 70 : def.population > 1000 ? 14 : 6;
    const pos: number[] = [];
    const share: number[] = [];
    const tmp = new Float32Array(3);
    let tries = 0;
    // Cluster cities: pick hub directions, then scatter around them.
    const hubs: THREE.Vector3[] = [];
    while (hubs.length < Math.max(1, Math.round(target / 25)) && tries < 5000) {
      tries++;
      const v = new THREE.Vector3(rand() * 2 - 1, (rand() * 2 - 1) * 0.85, rand() * 2 - 1).normalize();
      if (planet.surface.sample(v.x, v.y, v.z, tmp)) hubs.push(v);
    }
    tries = 0;
    while (pos.length / 3 < target && tries < target * 60 && hubs.length > 0) {
      tries++;
      const hub = hubs[Math.floor(rand() * hubs.length)];
      const v = hub.clone().add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.55)).normalize();
      if (Math.abs(v.y) > 0.8) continue;
      if (!planet.surface.sample(v.x, v.y, v.z, tmp)) continue;
      const r = RADIUS_VOX + planet.surface.heightAt(v.x, v.y, v.z) - 0.7;
      pos.push(CENTER + v.x * r, CENTER + v.y * r, CENTER + v.z * r);
      share.push(Math.pow(rand(), 3) * 9 + 0.2);
    }
    this.count = pos.length / 3;
    this.grid = new Float32Array(pos);
    const sum = share.reduce((a, b) => a + b, 0) || 1;
    this.share = new Float32Array(share.map(s => s / sum));
    this.alive = new Uint8Array(this.count).fill(1);
    this.alpha = new Float32Array(this.count).fill(1);

    const local = new Float32Array(this.count * 3);
    const size = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) {
      local[i * 3] = (this.grid[i * 3] - CENTER) * VOXEL * 1.004;
      local[i * 3 + 1] = (this.grid[i * 3 + 1] - CENTER) * VOXEL * 1.004;
      local[i * 3 + 2] = (this.grid[i * 3 + 2] - CENTER) * VOXEL * 1.004;
      size[i] = 1.5 + this.share[i] * 260;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(local, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uSun: { value: sunDir.clone().normalize() }, uScale: { value: window.innerHeight / 2 } },
      vertexShader: `
        attribute float size; attribute float alpha; uniform vec3 uSun; uniform float uScale;
        varying float vA;
        void main() {
          vec3 wn = normalize(mat3(modelMatrix) * position);
          float night = smoothstep(0.15, -0.25, dot(wn, uSun));
          vA = alpha * (0.08 + night);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = min(size, 7.0) * 0.012 * uScale / max(-mv.z, 0.1);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = (1.0 - smoothstep(0.0, 0.5, d)) * vA;
          gl_FragColor = vec4(vec3(1.0, 0.78, 0.42) * a * 1.6, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  get remaining(): number { return Math.round(this.total * this.aliveShare); }
  get killed(): number { return this.total - this.remaining; }

  setViewportHeight(h: number): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = h / 2;
  }

  /** Check cities against carved ground and heat a few times per second. */
  update(dt: number): void {
    this.timer += dt;
    if (this.timer < 0.2 || this.count === 0) return;
    this.timer = 0;
    let lost = 0;
    const p = this.planet;
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i]) continue;
      const gx = this.grid[i * 3], gy = this.grid[i * 3 + 1], gz = this.grid[i * 3 + 2];
      const si = Math.round(gx) + Math.round(gy) * GRID + Math.round(gz) * GRID * GRID;
      if (p.sample(gx, gy, gz) <= 0 || p.heat[si] > 0.35 || p.scorch[si] > 70) {
        this.kill(i);
        lost++;
      }
    }
    if (lost > 0) this.commit(lost);
  }

  /** Instantly kill every city within `radius` voxels of a grid point. */
  blast(cx: number, cy: number, cz: number, radius: number): void {
    let lost = 0;
    const r2 = radius * radius;
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i]) continue;
      const dx = this.grid[i * 3] - cx, dy = this.grid[i * 3 + 1] - cy, dz = this.grid[i * 3 + 2] - cz;
      if (dx * dx + dy * dy + dz * dz < r2) { this.kill(i); lost++; }
    }
    if (lost > 0) this.commit(lost);
  }

  killAll(): void {
    let lost = 0;
    for (let i = 0; i < this.count; i++) if (this.alive[i]) { this.kill(i); lost++; }
    this.aliveShare = 0;
    if (lost > 0) this.commit(lost);
  }

  private kill(i: number): void {
    this.alive[i] = 0;
    this.alpha[i] = 0;
    this.aliveShare -= this.share[i];
  }

  private commit(lost: number): void {
    if (this.aliveShare < 1e-6) this.aliveShare = 0;
    this.points.geometry.attributes.alpha.needsUpdate = true;
    this.onCitiesLost?.(lost);
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.points.removeFromParent();
  }
}
