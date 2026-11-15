// Bonus targets circling the planet: satellites, space stations and small moons.
// They orbit the planet centre (not the spinning surface) and can be shot down for coins.

import * as THREE from 'three';
import type { PlanetDef } from '../engine/planets';

export type OrbiterKind = 'satellite' | 'station' | 'moon';

export interface Orbiter {
  kind: OrbiterKind;
  mesh: THREE.Object3D;
  /** Current world position (updated every frame). */
  pos: THREE.Vector3;
  radius: number;
  hp: number;
  alive: boolean;
  /** Orbit: radius, angular speed (rad/s), phase, and the orbit plane's basis. */
  orbitR: number;
  speed: number;
  phase: number;
  u: THREE.Vector3;
  v: THREE.Vector3;
  blink?: THREE.Mesh;
}

/** Coins for shooting one down. */
export const ORBITER_REWARD: Record<OrbiterKind, number> = { satellite: 20, station: 60, moon: 40 };
const HP: Record<OrbiterKind, number> = { satellite: 1, station: 3, moon: 4 };
const HIT_R: Record<OrbiterKind, number> = { satellite: 0.16, station: 0.26, moon: 0.22 };

export class Orbiters {
  readonly group = new THREE.Group();
  readonly list: Orbiter[] = [];
  private t = 0;
  private readonly tmp = new THREE.Vector3();

  constructor(def: PlanetDef) {
    const o = def.orbiters ?? {};
    const add = (kind: OrbiterKind, n = 0) => { for (let i = 0; i < n; i++) this.spawn(kind, this.list.length); };
    add('station', o.stations);
    add('satellite', o.satellites);
    add('moon', o.moons);
    this.update(0);
  }

  private spawn(kind: OrbiterKind, index: number): void {
    // Spread orbits out: different radii, tilts and directions.
    const tilt = (Math.random() - 0.5) * 1.6;
    const yaw = Math.random() * Math.PI * 2;
    const u = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
    const v = new THREE.Vector3(-Math.sin(yaw) * Math.cos(tilt), Math.sin(tilt), Math.cos(yaw) * Math.cos(tilt));
    const orbitR = kind === 'moon' ? 3.0 + index * 0.3 + Math.random() * 0.2 : 2.55 + Math.random() * 0.6;
    const period = kind === 'moon' ? 40 + Math.random() * 20 : 14 + Math.random() * 10;
    const mesh = kind === 'moon' ? makeMoon() : kind === 'station' ? makeStation() : makeSatellite();
    this.group.add(mesh);
    const blink = mesh.getObjectByName('blink') as THREE.Mesh | undefined;
    this.list.push({
      kind, mesh, pos: new THREE.Vector3(), radius: HIT_R[kind], hp: HP[kind], alive: true,
      orbitR, speed: ((Math.random() < 0.5 ? -1 : 1) * Math.PI * 2) / period, phase: Math.random() * Math.PI * 2, u, v, blink,
    });
  }

  update(dt: number): void {
    this.t += dt;
    for (const o of this.list) {
      if (!o.alive) continue;
      const a = o.phase + o.speed * this.t;
      o.pos.copy(o.u).multiplyScalar(Math.cos(a) * o.orbitR).addScaledVector(o.v, Math.sin(a) * o.orbitR);
      o.mesh.position.copy(o.pos);
      // Satellites keep their panels square to the planet; moons tumble slowly.
      if (o.kind === 'moon') o.mesh.rotation.y += dt * 0.2;
      else o.mesh.lookAt(0, 0, 0);
      if (o.blink) o.blink.visible = Math.sin(this.t * 6 + o.phase * 3) > 0.6;
    }
  }

  /** The living orbiter within `extra` of a world point, if any. */
  near(p: THREE.Vector3, extra = 0): Orbiter | null {
    for (const o of this.list) if (o.alive && o.pos.distanceTo(p) < o.radius + extra) return o;
    return null;
  }

  /** Closest living orbiter hit by a ray (direction normalised), with its distance. */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3): { orbiter: Orbiter; dist: number } | null {
    let best: { orbiter: Orbiter; dist: number } | null = null;
    for (const o of this.list) {
      if (!o.alive) continue;
      const along = this.tmp.copy(o.pos).sub(origin).dot(dir);
      if (along < 0) continue;
      const closest = this.tmp.copy(origin).addScaledVector(dir, along).distanceTo(o.pos);
      // A little forgiving: tiny targets on a phone are hard to tap.
      if (closest < o.radius * 1.35 && (!best || along < best.dist)) best = { orbiter: o, dist: along };
    }
    return best;
  }

  /** Damage an orbiter. Returns true if this destroyed it. */
  hit(o: Orbiter, damage = 1): boolean {
    if (!o.alive) return false;
    o.hp -= damage;
    if (o.hp > 0) return false;
    o.alive = false;
    o.mesh.removeFromParent();
    return true;
  }

  dispose(): void {
    this.group.traverse(obj => {
      const m = obj as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (m.material) (m.material as THREE.Material).dispose();
    });
    this.group.removeFromParent();
  }
}

// ------------------------------------------------------------
// Models (built from primitives; no asset files)
// ------------------------------------------------------------
const metal = () => new THREE.MeshStandardMaterial({ color: 0xc9ccd4, metalness: 0.7, roughness: 0.35 });
const panelMat = () => new THREE.MeshStandardMaterial({ color: 0x1d3f8a, metalness: 0.4, roughness: 0.3, emissive: 0x0a1a40, emissiveIntensity: 0.6, side: THREE.DoubleSide });

function blinkLight(color: number, size: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(size, 6, 6), new THREE.MeshBasicMaterial({ color }));
  m.name = 'blink';
  return m;
}

function makeSatellite(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.09), metal());
  const panelGeo = new THREE.PlaneGeometry(0.13, 0.06);
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(panelGeo, panelMat());
    p.position.x = side * 0.1;
    g.add(p);
  }
  const dish = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.03, 10, 1, true), metal());
  dish.rotation.x = Math.PI / 2;
  dish.position.z = 0.06;
  const light = blinkLight(0xff3030, 0.012);
  light.position.set(0, 0.04, 0);
  g.add(body, dish, light);
  return g;
}

function makeStation(): THREE.Group {
  const g = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 10), metal());
  hub.rotation.z = Math.PI / 2;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.014, 6, 24), metal());
  const panelGeo = new THREE.PlaneGeometry(0.08, 0.2);
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(panelGeo, panelMat());
    p.position.x = side * 0.19;
    g.add(p);
  }
  const light = blinkLight(0x40ff80, 0.014);
  light.position.set(0, 0.05, 0);
  g.add(hub, ring, light);
  return g;
}

function makeMoon(): THREE.Mesh {
  const geo = new THREE.IcosahedronGeometry(0.16, 1);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const s = 0.85 + Math.random() * 0.3;
    p.setXYZ(i, p.getX(i) * s, p.getY(i) * s, p.getZ(i) * s);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x8a8076, roughness: 1, flatShading: true }));
}
