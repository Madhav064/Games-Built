// Planet break-up: split the remaining voxel field into Voronoi fragments,
// mesh each one and let them drift apart with glowing cut faces.

import * as THREE from 'three';
import { surfaceNets } from './surfaceNets';
import { mulberry32 } from './noise';
import { GRID, CENTER, VOXEL, RADIUS_VOX, type VoxelPlanet, type ShadeOut } from './voxelPlanet';

interface Fragment {
  mesh: THREE.Mesh;
  pivot: THREE.Group;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
}

export class Shatter {
  readonly group = new THREE.Group();
  private readonly fragments: Fragment[] = [];
  private time = 0;

  constructor(planet: VoxelPlanet, material: THREE.Material, count = 28, seed = Date.now() & 0xffff) {
    const rand = mulberry32(seed);
    // Inherit the planet's transform so fragments start exactly where the planet was.
    planet.group.updateMatrixWorld();
    this.group.matrix.copy(planet.group.matrixWorld);
    this.group.matrix.decompose(this.group.position, this.group.quaternion, this.group.scale);

    const S = 2; // downsample
    const n = GRID / S;
    const c = (n - 1) / 2;
    const field = new Float32Array(n * n * n);
    const fullC = CENTER;
    for (let z = 0; z < n; z++)
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const fx = Math.min(GRID - 1, Math.round(x * S + (S - 1) / 2));
          const fy = Math.min(GRID - 1, Math.round(y * S + (S - 1) / 2));
          const fz = Math.min(GRID - 1, Math.round(z * S + (S - 1) / 2));
          field[x + y * n + z * n * n] = planet.field[fx + fy * GRID + fz * GRID * GRID] / S;
        }

    // Seeds: a shell of large plates plus a few inner pieces.
    const R = RADIUS_VOX / S;
    const seeds: number[] = [];
    for (let k = 0; k < count; k++) {
      const u = rand() * 2 - 1, th = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const rr = k < count * 0.75 ? R * (0.55 + rand() * 0.4) : R * rand() * 0.45;
      seeds.push(c + s * Math.cos(th) * rr, c + u * rr, c + s * Math.sin(th) * rr);
    }
    const owner = new Int16Array(n * n * n).fill(-1);
    const minB = new Int32Array(count * 3).fill(1 << 20);
    const maxB = new Int32Array(count * 3).fill(-1);
    for (let z = 0; z < n; z++)
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const i = x + y * n + z * n * n;
          if (field[i] <= 0) continue;
          let best = 0, bestD = Infinity;
          for (let k = 0; k < count; k++) {
            const dx = x - seeds[k * 3], dy = y - seeds[k * 3 + 1], dz = z - seeds[k * 3 + 2];
            const d = dx * dx + dy * dy + dz * dz;
            if (d < bestD) { bestD = d; best = k; }
          }
          owner[i] = best;
          minB[best * 3] = Math.min(minB[best * 3], x); maxB[best * 3] = Math.max(maxB[best * 3], x);
          minB[best * 3 + 1] = Math.min(minB[best * 3 + 1], y); maxB[best * 3 + 1] = Math.max(maxB[best * 3 + 1], y);
          minB[best * 3 + 2] = Math.min(minB[best * 3 + 2], z); maxB[best * 3 + 2] = Math.max(maxB[best * 3 + 2], z);
        }

    const o: ShadeOut = { r: 0, g: 0, b: 0, glow: 0, surf: 0 };
    for (let k = 0; k < count; k++) {
      if (maxB[k * 3] < 0) continue;
      const bx0 = minB[k * 3] - 1, by0 = minB[k * 3 + 1] - 1, bz0 = minB[k * 3 + 2] - 1;
      const sx = maxB[k * 3] - bx0 + 2, sy = maxB[k * 3 + 1] - by0 + 2, sz = maxB[k * 3 + 2] - bz0 + 2;
      if (sx < 3 || sy < 3 || sz < 3) continue;
      const sub = new Float32Array(sx * sy * sz).fill(-0.5);
      let cnt = 0, mx = 0, my = 0, mz = 0;
      for (let z = 1; z < sz - 1; z++)
        for (let y = 1; y < sy - 1; y++)
          for (let x = 1; x < sx - 1; x++) {
            const gi = (x + bx0) + (y + by0) * n + (z + bz0) * n * n;
            const o = owner[gi];
            const si = x + y * sx + z * sx * sy;
            if (o === k) {
              // Keep the real (smooth) outer surface; flatten values deep inside.
              sub[si] = Math.min(field[gi], 1.0);
              cnt++; mx += x + bx0; my += y + by0; mz += z + bz0;
            } else if (o === -1) {
              sub[si] = Math.max(field[gi], -1.0);
            }
          }
      if (cnt < 6) continue;
      mx /= cnt; my /= cnt; mz /= cnt;
      const data = surfaceNets(sub, sx, sy, sz, 0, 0, 0, sx, sy, sz);
      if (!data) continue;
      const nv = data.vertexCount;
      const pos = data.positions;
      const colors = new Float32Array(nv * 3);
      const glow = new Float32Array(nv);
      const surf = new Float32Array(nv);
      const scorch = new Float32Array(nv);
      // Centroid in local world units.
      const cxw = (mx * S + (S - 1) / 2 - fullC) * VOXEL;
      const cyw = (my * S + (S - 1) / 2 - fullC) * VOXEL;
      const czw = (mz * S + (S - 1) / 2 - fullC) * VOXEL;
      for (let v = 0; v < nv; v++) {
        // grid (downsampled) -> full-grid offset from centre (voxels)
        const gx = (pos[v * 3] + bx0) * S + (S - 1) / 2 - fullC;
        const gy = (pos[v * 3 + 1] + by0) * S + (S - 1) / 2 - fullC;
        const gz = (pos[v * 3 + 2] + bz0) * S + (S - 1) / 2 - fullC;
        const si = Math.min(GRID - 1, Math.max(0, Math.round(gx + fullC)))
          + Math.min(GRID - 1, Math.max(0, Math.round(gy + fullC))) * GRID
          + Math.min(GRID - 1, Math.max(0, Math.round(gz + fullC))) * GRID * GRID;
        planet.shade(gx, gy, gz, o);
        colors[v * 3] = o.r; colors[v * 3 + 1] = o.g; colors[v * 3 + 2] = o.b;
        surf[v] = o.surf;
        scorch[v] = planet.scorch[si] / 255;
        // Fresh fracture faces glow hot.
        const r = Math.hypot(gx, gy, gz);
        const surfR = RADIUS_VOX + planet.surface.heightAt(gx, gy, gz);
        glow[v] = Math.min(0.9, o.glow * 0.45) + (surfR - r > 2 ? 0.35 : 0.05);
        // Keep planet-local positions (the shader derives surface UVs from them).
        pos[v * 3] = gx * VOXEL;
        pos[v * 3 + 1] = gy * VOXEL;
        pos[v * 3 + 2] = gz * VOXEL;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
      geo.setAttribute('aSurf', new THREE.BufferAttribute(surf, 1));
      geo.setAttribute('aScorch', new THREE.BufferAttribute(scorch, 1));
      geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
      geo.computeBoundingSphere();
      // Pivot at the fragment centroid so it spins about its own centre.
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.set(-cxw, -cyw, -czw);
      const pivot = new THREE.Group();
      pivot.position.set(cxw, cyw, czw);
      pivot.add(mesh);
      this.group.add(pivot);
      const out = new THREE.Vector3(cxw, cyw, czw);
      const dist = out.length();
      if (dist < 1e-3) out.set(rand() - 0.5, rand() - 0.5, rand() - 0.5);
      out.normalize();
      const speed = 0.12 + rand() * 0.22 + (dist / (RADIUS_VOX * VOXEL)) * 0.18;
      this.fragments.push({
        mesh,
        pivot,
        vel: out.multiplyScalar(speed).add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.12)),
        spin: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.8),
      });
    }
  }

  /** Cooling factor: fracture glow fades over time. */
  update(dt: number): void {
    this.time += dt;
    const drag = Math.exp(-dt * 0.25);
    for (const f of this.fragments) {
      f.pivot.position.addScaledVector(f.vel, dt);
      f.vel.multiplyScalar(drag);
      f.pivot.rotation.x += f.spin.x * dt;
      f.pivot.rotation.y += f.spin.y * dt;
      f.pivot.rotation.z += f.spin.z * dt;
    }
    // Cool the fracture faces after a few seconds.
    if (this.time > 1.5 && this.time < 14 && Math.floor(this.time * 4) !== Math.floor((this.time - dt) * 4)) {
      const k = 0.95;
      for (const f of this.fragments) {
        const g = f.mesh.geometry.getAttribute('aGlow') as THREE.BufferAttribute;
        const arr = g.array as Float32Array;
        for (let i = 0; i < arr.length; i++) arr[i] = Math.max(0, arr[i] * k - 0.002);
        g.needsUpdate = true;
      }
    }
  }

  dispose(): void {
    for (const f of this.fragments) f.mesh.geometry.dispose();
    this.group.removeFromParent();
  }
}
