// Visual effects: glowing particles, rock debris, flashes, shockwave rings and beams.

import * as THREE from 'three';
import { radialTexture } from './scenery';

// ------------------------------------------------------------
// Additive glowing particles (fire, sparks, smoke-glow, trails)
// ------------------------------------------------------------
export interface ParticleSpawn {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  r: number; g: number; b: number;
  size: number; life: number;
  drag?: number;
  /** Pull toward the planet centre (world origin). */
  gravity?: number;
  /** Size multiplier reached at end of life. */
  grow?: number;
}

export class Particles {
  readonly points: THREE.Points;
  private readonly max: number;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly baseSize: Float32Array;
  private readonly drag: Float32Array;
  private readonly grav: Float32Array;
  private readonly grow: Float32Array;
  private next = 0;
  private live = 0;

  constructor(max = 6000) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.grow = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64) },
        uScale: { value: window.innerHeight / 2 },
        uBright: { value: 0.6 },
      },
      vertexShader: `
        attribute float size; attribute float alpha;
        varying vec3 vColor; varying float vAlpha; uniform float uScale;
        void main() {
          vColor = color; vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / max(-mv.z, 0.1);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uMap; uniform float uBright; varying vec3 vColor; varying float vAlpha;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vColor * t.a * vAlpha * uBright, 1.0);
        }`,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  setViewportHeight(h: number): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = h / 2;
  }

  spawn(p: ParticleSpawn): void {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    if (this.life[i] <= 0) this.live++;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = p.vx; this.vel[i * 3 + 1] = p.vy; this.vel[i * 3 + 2] = p.vz;
    this.col[i * 3] = p.r; this.col[i * 3 + 1] = p.g; this.col[i * 3 + 2] = p.b;
    this.baseSize[i] = p.size;
    this.life[i] = this.maxLife[i] = p.life;
    this.drag[i] = p.drag ?? 1.5;
    this.grav[i] = p.gravity ?? 0;
    this.grow[i] = p.grow ?? 1;
  }

  update(dt: number): void {
    if (this.live <= 0) return;
    let live = 0;
    for (let i = 0; i < this.max; i++) {
      let l = this.life[i];
      if (l <= 0) continue;
      l -= dt;
      this.life[i] = l;
      if (l <= 0) { this.alpha[i] = 0; this.size[i] = 0; continue; }
      live++;
      const k = Math.exp(-this.drag[i] * dt);
      const i3 = i * 3;
      let vx = this.vel[i3] * k, vy = this.vel[i3 + 1] * k, vz = this.vel[i3 + 2] * k;
      const g = this.grav[i];
      if (g !== 0) {
        const px = this.pos[i3], py = this.pos[i3 + 1], pz = this.pos[i3 + 2];
        const r2 = px * px + py * py + pz * pz + 0.5;
        const s = -g * dt / (r2 * Math.sqrt(r2));
        vx += px * s; vy += py * s; vz += pz * s;
      }
      this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
      this.pos[i3] += vx * dt; this.pos[i3 + 1] += vy * dt; this.pos[i3 + 2] += vz * dt;
      const t = 1 - l / this.maxLife[i]; // 0 -> 1
      this.alpha[i] = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
      this.size[i] = this.baseSize[i] * (1 + (this.grow[i] - 1) * t);
    }
    this.live = live;
    const geo = this.points.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
    geo.attributes.alpha.needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
    this.alpha.fill(0);
    this.size.fill(0);
    this.live = 0;
    this.points.geometry.attributes.size.needsUpdate = true;
  }
}

// ------------------------------------------------------------
// Rock debris (instanced, lit, glows while hot)
// ------------------------------------------------------------
export class Debris {
  readonly mesh: THREE.InstancedMesh;
  private readonly max: number;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly rot: Float32Array;
  private readonly spin: Float32Array;
  private readonly scale: Float32Array;
  private readonly life: Float32Array;
  private readonly heat: Float32Array;
  private readonly glowAttr: THREE.InstancedBufferAttribute;
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  /** Returns true if a world point is inside solid planet. */
  collide: ((x: number, y: number, z: number) => boolean) | null = null;
  gravity = 2.2;
  /** Points that pull debris in and swallow it (black holes). */
  attractors: { x: number; y: number; z: number; strength: number }[] = [];
  /** Camera position: debris that drifts too close fades out instead of filling the screen. */
  camera: THREE.Vector3 | null = null;

  constructor(max = 1400) {
    this.max = max;
    const geo = new THREE.IcosahedronGeometry(1, 0);
    // Squash vertices a little so rocks look less uniform.
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.8 + (i % 3) * 0.15), p.getY(i) * 0.85, p.getZ(i));
    geo.computeVertexNormals();
    this.glowAttr = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iGlow', this.glowAttr);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true });
    mat.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float iGlow;\nvarying float vGlow;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = iGlow;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vGlow;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += mix(vec3(1.0,0.25,0.03), vec3(1.0,0.8,0.4), clamp(vGlow-0.6,0.0,1.0)) * vGlow * 0.9;`);
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.rot = new Float32Array(max * 3);
    this.spin = new Float32Array(max * 3);
    this.scale = new Float32Array(max);
    this.life = new Float32Array(max);
    this.heat = new Float32Array(max);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < max; i++) {
      this.mesh.setMatrixAt(i, zero);
      this.mesh.setColorAt(i, white);
    }
  }

  spawn(pos: THREE.Vector3, vel: THREE.Vector3, size: number, color: THREE.Color, heat: number, life = 7): void {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = pos.x; this.pos[i3 + 1] = pos.y; this.pos[i3 + 2] = pos.z;
    this.vel[i3] = vel.x; this.vel[i3 + 1] = vel.y; this.vel[i3 + 2] = vel.z;
    this.rot[i3] = Math.random() * 6; this.rot[i3 + 1] = Math.random() * 6; this.rot[i3 + 2] = Math.random() * 6;
    this.spin[i3] = (Math.random() - 0.5) * 8; this.spin[i3 + 1] = (Math.random() - 0.5) * 8; this.spin[i3 + 2] = (Math.random() - 0.5) * 8;
    this.scale[i] = size;
    this.life[i] = life * (0.7 + Math.random() * 0.6);
    this.heat[i] = heat;
    this.mesh.setColorAt(i, color);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    const g = this.gravity;
    for (let i = 0; i < this.max; i++) {
      let l = this.life[i];
      if (l <= 0) continue;
      l -= dt;
      const i3 = i * 3;
      let px = this.pos[i3], py = this.pos[i3 + 1], pz = this.pos[i3 + 2];
      let vx = this.vel[i3], vy = this.vel[i3 + 1], vz = this.vel[i3 + 2];
      const r2 = px * px + py * py + pz * pz + 0.05;
      const s = -g * dt / (r2 * Math.sqrt(r2));
      vx += px * s; vy += py * s; vz += pz * s;
      let pulled = false;
      for (const a of this.attractors) {
        const ax = a.x - px, ay = a.y - py, az = a.z - pz;
        const d2 = ax * ax + ay * ay + az * az;
        if (d2 < 0.012) { l = 0; break; } // swallowed
        if (d2 < 2.5) pulled = true;
        const f = Math.min(30, a.strength / (d2 + 0.05)) * dt / Math.sqrt(d2);
        vx += ax * f; vy += ay * f; vz += az * f;
      }
      px += vx * dt; py += vy * dt; pz += vz * dt;
      // Landing: falling debris that re-enters the planet comes to rest and fades.
      if (!pulled && this.collide && (vx * px + vy * py + vz * pz) < 0 && this.collide(px, py, pz)) {
        vx *= 0.1; vy *= 0.1; vz *= 0.1;
        px -= this.vel[i3] * dt * 0.9; py -= this.vel[i3 + 1] * dt * 0.9; pz -= this.vel[i3 + 2] * dt * 0.9;
        l = Math.min(l, 0.6);
      }
      if (r2 > 900) l = 0; // left the scene
      if (this.camera) {
        const cx = px - this.camera.x, cy = py - this.camera.y, cz = pz - this.camera.z;
        if (cx * cx + cy * cy + cz * cz < 2.2) l = Math.min(l, 0.25);
      }
      this.pos[i3] = px; this.pos[i3 + 1] = py; this.pos[i3 + 2] = pz;
      this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
      this.rot[i3] += this.spin[i3] * dt; this.rot[i3 + 1] += this.spin[i3 + 1] * dt; this.rot[i3 + 2] += this.spin[i3 + 2] * dt;
      this.heat[i] *= Math.exp(-dt * 0.9);
      this.life[i] = l;
      const fade = l <= 0 ? 0 : Math.min(1, l / 0.6);
      const sc = this.scale[i] * fade;
      this.e.set(this.rot[i3], this.rot[i3 + 1], this.rot[i3 + 2]);
      this.q.setFromEuler(this.e);
      this.v.set(px, py, pz);
      this.s.set(sc, sc, sc);
      this.m.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
      this.glowAttr.setX(i, this.heat[i]);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.glowAttr.needsUpdate = true;
  }

  clear(): void {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.max; i++) {
      this.life[i] = 0;
      this.mesh.setMatrixAt(i, zero);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ------------------------------------------------------------
// Flashes (bright expanding sprites)
// ------------------------------------------------------------
interface Flash { sprite: THREE.Sprite; t: number; dur: number; size: number }

export class Flashes {
  /** Global brightness and size of impact flashes (big additive sprites wash the screen out). */
  static strength = 0.45;
  static sizeScale = 0.6;
  readonly group = new THREE.Group();
  private readonly pool: Flash[] = [];
  private readonly tex = radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 128);

  spawn(pos: THREE.Vector3, size: number, color: THREE.ColorRepresentation, dur = 0.5): void {
    let f = this.pool.find(p => p.t >= p.dur);
    if (!f) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
      }));
      f = { sprite, t: 0, dur: 0, size: 0 };
      this.pool.push(f);
      this.group.add(sprite);
    }
    f.sprite.position.copy(pos);
    (f.sprite.material as THREE.SpriteMaterial).color.set(color);
    f.t = 0; f.dur = dur; f.size = size;
    f.sprite.visible = true;
  }

  update(dt: number): void {
    for (const f of this.pool) {
      if (f.t >= f.dur) { f.sprite.visible = false; continue; }
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      f.sprite.scale.setScalar(f.size * Flashes.sizeScale * (0.4 + 0.6 * Math.sqrt(k)));
      (f.sprite.material as THREE.SpriteMaterial).opacity = (1 - k) * (1 - k) * Flashes.strength;
    }
  }
}

// ------------------------------------------------------------
// Shockwave rings that hug the planet surface
// ------------------------------------------------------------
interface Ring { mesh: THREE.Mesh; t: number; dur: number; size: number }

export class Rings {
  private readonly pool: Ring[] = [];
  private readonly geo = new THREE.RingGeometry(0.82, 1, 64);

  /** `parent` should be the planet group so the ring rotates with the surface. */
  spawn(parent: THREE.Object3D, localPos: THREE.Vector3, normal: THREE.Vector3, size: number, color: THREE.ColorRepresentation, dur = 1.6): void {
    let r = this.pool.find(p => p.t >= p.dur);
    if (!r) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      r = { mesh: new THREE.Mesh(this.geo, mat), t: 0, dur: 0, size: 0 };
      this.pool.push(r);
    }
    parent.add(r.mesh);
    r.mesh.position.copy(localPos).addScaledVector(normal, 0.03);
    r.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    (r.mesh.material as THREE.MeshBasicMaterial).color.set(color);
    r.t = 0; r.dur = dur; r.size = size;
    r.mesh.visible = true;
  }

  update(dt: number): void {
    for (const r of this.pool) {
      if (r.t >= r.dur) { r.mesh.visible = false; continue; }
      r.t += dt;
      const k = Math.min(1, r.t / r.dur);
      const s = r.size * (0.05 + 0.95 * (1 - Math.pow(1 - k, 2.5)));
      r.mesh.scale.setScalar(s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.55;
    }
  }

  clear(): void {
    for (const r of this.pool) { r.t = r.dur; r.mesh.visible = false; r.mesh.removeFromParent(); }
  }
}

// ------------------------------------------------------------
// Beam (core + soft glow cylinder) between two world points
// ------------------------------------------------------------
export class Beam {
  readonly group = new THREE.Group();
  private readonly core: THREE.Mesh;
  private readonly glow: THREE.Mesh;
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly dir = new THREE.Vector3();
  private flicker = 0;

  constructor(color: THREE.ColorRepresentation, width: number) {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
    geo.translate(0, 0.5, 0);
    this.core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.glow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.core.scale.set(width * 0.35, 1, width * 0.35);
    this.glow.scale.set(width, 1, width);
    this.group.add(this.glow, this.core);
    this.group.visible = false;
  }

  setColor(color: THREE.ColorRepresentation): void {
    (this.glow.material as THREE.MeshBasicMaterial).color.set(color);
  }

  show(from: THREE.Vector3, to: THREE.Vector3, width: number, dt: number): void {
    this.dir.subVectors(to, from);
    const len = this.dir.length();
    this.group.position.copy(from);
    this.group.quaternion.setFromUnitVectors(this.up, this.dir.normalize());
    this.flicker += dt * 40;
    const w = width * (0.85 + Math.sin(this.flicker) * 0.15);
    this.core.scale.set(w * 0.32, len, w * 0.32);
    this.glow.scale.set(w, len, w);
    this.group.visible = true;
  }

  hide(): void { this.group.visible = false; }
}
