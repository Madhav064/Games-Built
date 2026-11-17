// Planetary defences (Earth 2099, Kepler-442b). Mechanics follow the genre leader's design:
//  - Shield: a bubble that absorbs shots and beams. It weakens with every hit and recharges;
//    when it breaks it stays down for a while, then reboots if any ground generator survives.
//    Destroy every generator while it's down and it's gone for good.
//  - Missile bases: launch an interceptor at the nearest incoming shot, then reload.
//  - Defence satellites: orbit and burn incoming shots down with a short beam, then cool down.
// Nothing here ever damages the player; it only stops shots. Every piece can be destroyed.

import * as THREE from 'three';
import { CENTER, VOXEL, WORLD_RADIUS } from '../engine/voxelPlanet';

export type DefenceKind = 'shield' | 'generator' | 'base' | 'satellite';

/** Coins for knocking each piece out. */
export const DEFENCE_REWARD: Record<DefenceKind, number> = { shield: 50, generator: 60, base: 40, satellite: 30 };

export const SHIELD_R = WORLD_RADIUS * 1.22;
const SHIELD_MAX = 100;
const SHIELD_DOWN_TIME = 10;
const SHIELD_REGEN = 6; // per second, after a short pause
const BASE_RANGE = 1.7;
const BASE_RELOAD = 1.6;
const INTERCEPTOR_SPEED = 6.5;
const SAT_RANGE = 1.5;
const SAT_BEAM_TIME = 0.28;
const SAT_COOLDOWN = 2.2;

/** What the defences need to know about a player shot. */
export interface Target { pos: THREE.Vector3; interceptable: boolean }

interface Ground {
  kind: 'generator' | 'base';
  g: THREE.Vector3;
  mesh: THREE.Group;
  alive: boolean;
  reload: number;
  light?: THREE.MeshBasicMaterial;
}

interface Interceptor { mesh: THREE.Mesh; pos: THREE.Vector3; vel: THREE.Vector3; target: Target; age: number; base: Ground }

interface Satellite {
  mesh: THREE.Group; pos: THREE.Vector3; orbitR: number; speed: number; phase: number;
  u: THREE.Vector3; v: THREE.Vector3; hp: number; alive: boolean;
  cooldown: number; beamT: number; target: Target | null; beam: THREE.Line;
}

export class Defences {
  /** World-space parts: shield bubble, satellites, interceptors. */
  readonly group = new THREE.Group();
  private readonly ground: Ground[] = [];
  private readonly sats: Satellite[] = [];
  private readonly interceptors: Interceptor[] = [];
  private shieldMesh: THREE.Mesh | null = null;
  private shieldMat: THREE.ShaderMaterial | null = null;
  private integrity = SHIELD_MAX;
  private downFor = 0;
  private sinceHit = 0;
  private t = 0;
  private collapsed = false;
  private readonly tmp = new THREE.Vector3();
  /** A piece was destroyed (or the shield broke) at this world point. */
  onDown: ((kind: DefenceKind, at: THREE.Vector3) => void) | null = null;
  /** An interceptor or satellite beam reached its target: the game removes that shot. */
  onIntercept: ((target: Target, at: THREE.Vector3) => void) | null = null;

  /**
   * `parent` is the planet group (ground sites ride along as it spins).
   * `sites` are surface grid points to build on, already chosen on land by the game.
   */
  constructor(
    private readonly parent: THREE.Object3D,
    spec: NonNullable<import('../engine/planets').PlanetDef['defences']>,
    sites: THREE.Vector3[],
    private readonly gridToWorld: (g: THREE.Vector3, out: THREE.Vector3) => THREE.Vector3,
  ) {
    let s = 0;
    if (spec.shield) {
      for (let i = 0; i < 3 && s < sites.length; i++) this.addGround('generator', sites[s++]);
      this.buildShield();
    }
    for (let i = 0; i < (spec.missileBases ?? 0) && s < sites.length; i++) this.addGround('base', sites[s++]);
    for (let i = 0; i < (spec.satellites ?? 0); i++) this.addSatellite(i);
  }

  /** How many ground sites this spec needs. */
  static sitesNeeded(spec: NonNullable<import('../engine/planets').PlanetDef['defences']>): number {
    return (spec.shield ? 3 : 0) + (spec.missileBases ?? 0);
  }

  get shieldUp(): boolean { return !!this.shieldMesh && !this.collapsed && this.downFor <= 0 && this.integrity > 0; }
  /** 0..1 for the HUD, or null when this planet has no shield. */
  get shieldLevel(): number | null { return this.shieldMesh ? (this.shieldUp ? this.integrity / SHIELD_MAX : 0) : null; }

  // ---------------- building ----------------
  private addGround(kind: Ground['kind'], g: THREE.Vector3): void {
    const local = g.clone().subScalar(CENTER).multiplyScalar(VOXEL);
    const mesh = kind === 'generator' ? makeGenerator() : makeBase();
    mesh.position.copy(local);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), local.clone().normalize());
    this.parent.add(mesh);
    const light = (mesh.getObjectByName('light') as THREE.Mesh | undefined)?.material as THREE.MeshBasicMaterial | undefined;
    this.ground.push({ kind, g: g.clone(), mesh, alive: true, reload: Math.random() * BASE_RELOAD, light });
  }

  private buildShield(): void {
    this.shieldMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
      uniforms: {
        uColor: { value: new THREE.Color(0x48d8ff) },
        uLevel: { value: 1 },
        uTime: { value: 0 },
        uHits: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, -10)) },
      },
      vertexShader: `
        varying vec3 vN; varying vec3 vW; varying vec3 vV;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
          vV = normalize(cameraPosition - w.xyz);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uLevel; uniform float uTime; uniform vec4 uHits[6];
        varying vec3 vN; varying vec3 vW; varying vec3 vV;
        void main() {
          float rim = pow(1.0 - abs(dot(vN, vV)), 2.6);
          // Faint hex-ish shimmer so the bubble reads as a force field.
          float bands = 0.5 + 0.5 * sin(dot(vW, vec3(23.0, 17.0, 29.0)) + uTime * 1.5);
          float a = rim * (0.35 + 0.45 * uLevel) + 0.03 + bands * 0.025;
          vec3 col = uColor;
          for (int i = 0; i < 6; i++) {
            float age = uTime - uHits[i].w;
            if (age < 0.0 || age > 0.9) continue;
            float d = distance(normalize(vW), normalize(uHits[i].xyz));
            float ring = smoothstep(0.08, 0.0, abs(d - age * 0.9)) * (1.0 - age / 0.9);
            float core = smoothstep(0.25, 0.0, d) * (1.0 - age / 0.9);
            a += ring * 0.9 + core * 0.6;
            col = mix(col, vec3(0.85, 0.97, 1.0), clamp(ring + core, 0.0, 1.0));
          }
          gl_FragColor = vec4(col * a, a);
        }`,
    });
    this.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(SHIELD_R, 64, 48), this.shieldMat);
    this.group.add(this.shieldMesh);
  }

  private addSatellite(i: number): void {
    const tilt = (Math.random() - 0.5) * 1.8;
    const yaw = (i / 4) * Math.PI * 2 + Math.random();
    const u = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
    const v = new THREE.Vector3(-Math.sin(yaw) * Math.cos(tilt), Math.sin(tilt), Math.cos(yaw) * Math.cos(tilt));
    const mesh = makeDefenceSat();
    this.group.add(mesh);
    const beam = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xff4a4a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending }),
    );
    beam.visible = false;
    beam.frustumCulled = false;
    this.group.add(beam);
    this.sats.push({
      mesh, pos: new THREE.Vector3(), orbitR: 2.75 + Math.random() * 0.35, speed: ((Math.random() < 0.5 ? -1 : 1) * Math.PI * 2) / (20 + Math.random() * 10),
      phase: Math.random() * Math.PI * 2, u, v, hp: 2, alive: true, cooldown: Math.random(), beamT: 0, target: null, beam,
    });
  }

  // ---------------- per frame ----------------
  update(dt: number, targets: Target[]): void {
    this.t += dt;
    this.sinceHit += dt;
    if (this.collapsed) { this.updateInterceptors(dt, targets); return; }

    // Shield recharge / reboot.
    if (this.shieldMesh && this.shieldMat) {
      if (this.downFor > 0) {
        this.downFor -= dt;
        if (this.downFor <= 0) {
          if (this.ground.some(gr => gr.kind === 'generator' && gr.alive)) this.integrity = SHIELD_MAX * 0.5;
          else this.downFor = Infinity; // no power left: stays down
        }
      } else if (this.sinceHit > 2) {
        this.integrity = Math.min(SHIELD_MAX, this.integrity + SHIELD_REGEN * dt);
      }
      this.shieldMesh.visible = this.shieldUp;
      this.shieldMat.uniforms.uTime.value = this.t;
      this.shieldMat.uniforms.uLevel.value = this.integrity / SHIELD_MAX;
    }

    // Generator / base lights pulse; bases fire at the nearest incoming shot.
    const baseWorld = this.tmp;
    for (const gr of this.ground) {
      if (!gr.alive) continue;
      if (gr.light) gr.light.color.setHex(Math.sin(this.t * (gr.kind === 'base' ? 4 : 2) + gr.g.x) > 0.3 ? (gr.kind === 'base' ? 0xff5040 : 0x50e8ff) : 0x202838);
      if (gr.kind !== 'base') continue;
      gr.reload -= dt;
      if (gr.reload > 0 || this.interceptors.some(i => i.base === gr)) continue;
      this.gridToWorld(gr.g, baseWorld);
      let best: Target | null = null, bestD = BASE_RANGE;
      for (const t of targets) {
        if (!t.interceptable || this.interceptors.some(i => i.target === t)) continue;
        const d = t.pos.distanceTo(baseWorld);
        // Only shots coming down on this side of the planet.
        if (d < bestD && t.pos.clone().sub(baseWorld).dot(baseWorld) > 0) { best = t; bestD = d; }
      }
      if (best) { this.launchInterceptor(gr, baseWorld.clone(), best); gr.reload = BASE_RELOAD; }
    }
    this.updateInterceptors(dt, targets);

    // Satellites: orbit, pick a target in range, burn it for a moment, cool down.
    for (const s of this.sats) {
      if (!s.alive) continue;
      const a = s.phase + s.speed * this.t;
      s.pos.copy(s.u).multiplyScalar(Math.cos(a) * s.orbitR).addScaledVector(s.v, Math.sin(a) * s.orbitR);
      s.mesh.position.copy(s.pos);
      s.mesh.lookAt(0, 0, 0);
      s.cooldown -= dt;
      if (s.target && !targets.includes(s.target)) { s.target = null; s.beamT = 0; }
      if (!s.target && s.cooldown <= 0) {
        let bestD = SAT_RANGE;
        for (const t of targets) {
          if (!t.interceptable || this.sats.some(o => o.target === t)) continue;
          const d = t.pos.distanceTo(s.pos);
          if (d < bestD) { bestD = d; s.target = t; }
        }
        s.beamT = 0;
      }
      if (s.target) {
        s.beamT += dt;
        const pts = s.beam.geometry.attributes.position as THREE.BufferAttribute;
        pts.setXYZ(0, s.pos.x, s.pos.y, s.pos.z);
        pts.setXYZ(1, s.target.pos.x, s.target.pos.y, s.target.pos.z);
        pts.needsUpdate = true;
        s.beam.visible = true;
        if (s.beamT >= SAT_BEAM_TIME) {
          this.onIntercept?.(s.target, s.target.pos.clone());
          s.target = null;
          s.cooldown = SAT_COOLDOWN;
        }
      }
      if (!s.target) s.beam.visible = false;
    }
  }

  private launchInterceptor(base: Ground, from: THREE.Vector3, target: Target): void {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd080 }),
    );
    const up = from.clone().normalize();
    const pos = from.clone().addScaledVector(up, 0.03);
    mesh.position.copy(pos);
    this.group.add(mesh);
    this.interceptors.push({ mesh, pos, vel: up.multiplyScalar(2), target, age: 0, base });
  }

  private updateInterceptors(dt: number, targets: Target[]): void {
    for (let i = this.interceptors.length - 1; i >= 0; i--) {
      const it = this.interceptors[i];
      it.age += dt;
      const alive = targets.includes(it.target);
      if (!alive || it.age > 3 || this.collapsed) {
        it.mesh.removeFromParent();
        it.mesh.geometry.dispose();
        (it.mesh.material as THREE.Material).dispose();
        this.interceptors.splice(i, 1);
        continue;
      }
      const want = it.target.pos.clone().sub(it.pos).normalize().multiplyScalar(INTERCEPTOR_SPEED);
      it.vel.lerp(want, Math.min(1, dt * 7));
      it.pos.addScaledVector(it.vel, dt);
      it.mesh.position.copy(it.pos);
      if (it.pos.distanceTo(it.target.pos) < 0.09) {
        this.onIntercept?.(it.target, it.pos.clone());
        it.mesh.removeFromParent();
        it.mesh.geometry.dispose();
        (it.mesh.material as THREE.Material).dispose();
        this.interceptors.splice(i, 1);
      }
    }
  }

  /** Interceptor positions this frame (for trails). */
  get interceptorPositions(): THREE.Vector3[] { return this.interceptors.map(i => i.pos); }

  // ---------------- taking damage ----------------
  /** A shot hit the shield at world point `at`. Returns true if the shield absorbed it. */
  shieldHit(at: THREE.Vector3, damage: number): boolean {
    if (!this.shieldUp || !this.shieldMat) return false;
    const hits = this.shieldMat.uniforms.uHits.value as THREE.Vector4[];
    hits.sort((a, b) => a.w - b.w)[0].set(at.x, at.y, at.z, this.t);
    this.damageShield(damage, at);
    return true;
  }

  /** A beam is playing on the shield (`amount` per second scaled by dt by the caller). */
  shieldBeam(at: THREE.Vector3, amount: number): void {
    if (!this.shieldUp || !this.shieldMat) return;
    const hits = this.shieldMat.uniforms.uHits.value as THREE.Vector4[];
    const oldest = hits.sort((a, b) => a.w - b.w)[0];
    if (this.t - hits[hits.length - 1].w > 0.12) oldest.set(at.x, at.y, at.z, this.t);
    this.damageShield(amount, at);
  }

  private damageShield(amount: number, at: THREE.Vector3): void {
    this.sinceHit = 0;
    this.integrity -= amount;
    if (this.integrity <= 0) {
      this.integrity = 0;
      this.downFor = SHIELD_DOWN_TIME;
      this.onDown?.('shield', at.clone());
    }
  }

  /** Ray (unit dir) to the shield's outer surface, if the shield is up and the ray hits it. */
  raycastShield(origin: THREE.Vector3, dir: THREE.Vector3): number | null {
    if (!this.shieldUp) return null;
    const b = origin.dot(dir);
    const c = origin.lengthSq() - SHIELD_R * SHIELD_R;
    const disc = b * b - c;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    return t > 0 ? t : null;
  }

  /** A blast of `radius` voxels at grid point g wrecks ground sites it reaches. */
  blast(g: THREE.Vector3, radius: number): void {
    for (const gr of this.ground) {
      if (!gr.alive || gr.g.distanceTo(g) > radius + 1.5) continue;
      gr.alive = false;
      gr.mesh.removeFromParent();
      this.onDown?.(gr.kind, this.gridToWorld(gr.g, new THREE.Vector3()));
    }
  }

  /** Living defence satellite within `extra` of p. */
  nearSatellite(p: THREE.Vector3, extra = 0): Satellite | null {
    for (const s of this.sats) if (s.alive && s.pos.distanceTo(p) < 0.15 + extra) return s;
    return null;
  }

  raycastSatellite(origin: THREE.Vector3, dir: THREE.Vector3): { sat: Satellite; dist: number } | null {
    let best: { sat: Satellite; dist: number } | null = null;
    for (const s of this.sats) {
      if (!s.alive) continue;
      const along = this.tmp.copy(s.pos).sub(origin).dot(dir);
      if (along < 0) continue;
      if (this.tmp.copy(origin).addScaledVector(dir, along).distanceTo(s.pos) < 0.2 && (!best || along < best.dist)) best = { sat: s, dist: along };
    }
    return best;
  }

  hitSatellite(s: Satellite, damage: number): void {
    if (!s.alive) return;
    s.hp -= damage;
    if (s.hp > 0) return;
    s.alive = false;
    s.target = null;
    s.mesh.removeFromParent();
    s.beam.visible = false;
    this.onDown?.('satellite', s.pos.clone());
  }

  /** The planet broke apart: the shield and every station go dark. */
  collapse(): void {
    this.collapsed = true;
    if (this.shieldMesh) this.shieldMesh.visible = false;
    for (const s of this.sats) s.beam.visible = false;
  }

  dispose(): void {
    for (const gr of this.ground) gr.mesh.removeFromParent();
    const disposeTree = (o: THREE.Object3D) => o.traverse(obj => {
      const m = obj as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (m.material) (m.material as THREE.Material).dispose();
    });
    for (const gr of this.ground) disposeTree(gr.mesh);
    disposeTree(this.group);
    this.group.removeFromParent();
  }
}

// ------------------------------------------------------------
// Models (primitives only)
// ------------------------------------------------------------
const steel = () => new THREE.MeshStandardMaterial({ color: 0x9aa3b4, metalness: 0.7, roughness: 0.35 });

function light(color: number, r: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshBasicMaterial({ color }));
  m.name = 'light';
  return m;
}

/** Shield generator: a squat base with a glowing core and a ring. */
function makeGenerator(): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.03, 12), steel());
  base.position.y = 0.015;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.08, 8), steel());
  mast.position.y = 0.07;
  const core = light(0x50e8ff, 0.024);
  core.position.y = 0.12;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.006, 6, 20), steel());
  ring.position.y = 0.12;
  ring.rotation.x = Math.PI / 2;
  g.add(base, mast, core, ring);
  return g;
}

/** Missile base: a pad with an angled launcher and a warning light. */
function makeBase(): THREE.Group {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.1), steel());
  pad.position.y = 0.01;
  const launcher = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.07, 0.035), new THREE.MeshStandardMaterial({ color: 0x4a5160, metalness: 0.5, roughness: 0.5 }));
  launcher.position.y = 0.05;
  launcher.rotation.z = 0.35;
  const lamp = light(0xff5040, 0.012);
  lamp.position.set(0.035, 0.03, 0.035);
  g.add(pad, launcher, lamp);
  return g;
}

/** Armed satellite: dark body, red emitter facing the planet. */
function makeDefenceSat(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), new THREE.MeshStandardMaterial({ color: 0x3a3f4a, metalness: 0.7, roughness: 0.3 }));
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x5a1820, metalness: 0.4, roughness: 0.4, emissive: 0x300508, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.045), panelMat);
    p.position.x = side * 0.1;
    g.add(p);
  }
  const emitter = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4a4a }));
  emitter.position.z = 0.055;
  g.add(body, emitter);
  return g;
}
