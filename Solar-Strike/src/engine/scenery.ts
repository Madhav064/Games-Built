// Space backdrop, sun, atmosphere glow and a cloud layer that impacts punch holes in.

import * as THREE from 'three';
import { Simplex3, mulberry32 } from './noise';
import type { CloudDef } from './planets';

export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.6)'));
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createStarfield(): THREE.Points {
  const rand = mulberry32(1234);
  const count = 4000;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const u = rand() * 2 - 1, th = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    const r = 380 + rand() * 60;
    pos[i * 3] = s * Math.cos(th) * r;
    pos[i * 3 + 1] = u * r;
    pos[i * 3 + 2] = s * Math.sin(th) * r;
    const warm = rand();
    const b = 0.5 + rand() * 0.5;
    col[i * 3] = b * (warm > 0.7 ? 1 : 0.8);
    col[i * 3 + 1] = b * 0.85;
    col[i * 3 + 2] = b * (warm < 0.3 ? 1 : 0.8);
    size[i] = rand() < 0.03 ? 3.2 : 1 + rand() * 1.3;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } },
    vertexShader: `
      attribute float size; varying vec3 vColor; uniform float uPixelRatio;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uPixelRatio;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(vColor, 1.0 - smoothstep(0.15, 0.5, d));
      }`,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

/** Distant sun glow placed along the light direction. */
export function createSun(direction: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  const core = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture('rgba(255,245,220,1)', 'rgba(255,200,120,0)'),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  core.scale.setScalar(40);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture('rgba(255,180,90,0.5)', 'rgba(255,120,40,0)'),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  halo.scale.setScalar(140);
  g.add(halo, core);
  g.position.copy(direction).multiplyScalar(300);
  return g;
}

export function createAtmosphere(radius: number, color: number, strength: number, sunDir: THREE.Vector3): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uStrength: { value: strength },
      uSun: { value: sunDir.clone().normalize() },
    },
    vertexShader: `
      varying vec3 vNormal; varying vec3 vView;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vNormal = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uStrength; uniform vec3 uSun;
      varying vec3 vNormal; varying vec3 vView;
      void main() {
        float rim = 1.0 - max(dot(vNormal, vView), 0.0);
        float glow = pow(rim, 3.0);
        float lit = clamp(dot(vNormal, uSun) * 0.8 + 0.35, 0.0, 1.0);
        gl_FragColor = vec4(uColor * glow * lit * uStrength * 1.6, glow * lit * uStrength);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 48), mat);
}

const CW = 768, CH = 384;

/** A cloud shell drawn on a canvas so explosions can blow holes in it. */
export class CloudLayer {
  readonly mesh: THREE.Mesh;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private readonly baseOpacity: number;

  constructor(radius: number, def: CloudDef, seed: number) {
    const canvas = document.createElement('canvas');
    canvas.width = CW; canvas.height = CH;
    this.ctx = canvas.getContext('2d')!;
    const img = this.ctx.createImageData(CW, CH);
    const noise = new Simplex3(seed + 77);
    const col = new THREE.Color(def.color);
    for (let y = 0; y < CH; y++) {
      const theta = ((y + 0.5) / CH) * Math.PI;
      for (let x = 0; x < CW; x++) {
        const phi = ((x + 0.5) / CW) * Math.PI * 2;
        // Same convention as THREE.SphereGeometry.
        const dx = -Math.cos(phi) * Math.sin(theta), dy = Math.cos(theta), dz = Math.sin(phi) * Math.sin(theta);
        // Swirl: warp the lookup with low-frequency noise.
        const w = noise.noise(dx * 1.5, dy * 1.5, dz * 1.5) * 0.6;
        let n = noise.fbm(dx * 2.6 + w, dy * 5.2 + w, dz * 2.6 - w, 5) * 0.5 + 0.5;
        n = (n - (1 - def.coverage)) / def.coverage;
        const a = Math.max(0, Math.min(1, n * 1.8));
        const i = (y * CW + x) * 4;
        img.data[i] = col.r * 255; img.data[i + 1] = col.g * 255; img.data[i + 2] = col.b * 255;
        img.data[i + 3] = a * 255;
      }
    }
    this.ctx.putImageData(img, 0, 0);
    this.tex = new THREE.CanvasTexture(canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.baseOpacity = def.opacity;
    const mat = new THREE.MeshStandardMaterial({
      map: this.tex, transparent: true, opacity: def.opacity, depthWrite: false, roughness: 1,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 48), mat);
  }

  /** Clear a soft hole around a world-space point. `angle` is in radians. */
  punch(worldPoint: THREE.Vector3, angle: number): void {
    const local = this.mesh.worldToLocal(worldPoint.clone()).normalize();
    const theta = Math.acos(Math.max(-1, Math.min(1, local.y)));
    let phi = Math.atan2(local.z, -local.x);
    if (phi < 0) phi += Math.PI * 2;
    const px = (phi / (Math.PI * 2)) * CW;
    const py = (theta / Math.PI) * CH;
    const ry = (angle / Math.PI) * CH;
    const rx = ry / Math.max(0.15, Math.sin(theta)); // stretch near the poles
    const g = this.ctx;
    g.save();
    g.globalCompositeOperation = 'destination-out';
    for (const ox of [-CW, 0, CW]) {
      g.save();
      g.translate(px + ox, py);
      g.scale(rx / ry, 1);
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, ry);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(0.6, 'rgba(0,0,0,0.8)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(0, 0, ry, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    g.restore();
    this.tex.needsUpdate = true;
  }

  /** Fade clouds as the planet loses its atmosphere. */
  setHealth(h: number): void {
    (this.mesh.material as THREE.MeshStandardMaterial).opacity = this.baseOpacity * Math.max(0, Math.min(1, h));
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.tex.dispose();
    this.mesh.removeFromParent();
  }
}

