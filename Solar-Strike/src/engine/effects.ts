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

