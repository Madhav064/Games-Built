// Civilian ships on inhabited worlds (not Earth): small craft cruising low over the surface.
// They turn away from incoming shots and black holes, and after a while climb out to space
// while new ones arrive, so traffic never stops. Blasts, beams and passing shots destroy them.

import * as THREE from 'three';
import { WORLD_RADIUS } from '../engine/voxelPlanet';

/** Coins for each ship destroyed. */
export const SHIP_REWARD = 15;

const CRUISE_ALT = [1.07, 1.13]; // x planet radius
const SPACE_ALT = 2.6;
const DANGER_RANGE = 0.75;

interface Ship {
  mesh: THREE.Group;
  /** Unit direction from the planet centre. */
  n: THREE.Vector3;
  /** Unit heading, tangent to the sphere. */
  t: THREE.Vector3;
  alt: number;
  cruiseAlt: number;
  speed: number;
  state: 'arrive' | 'cruise' | 'leave';
  life: number;
  wander: number;
  blink: THREE.Mesh;
  alive: boolean;
}

export class CivilianShips {
  readonly group = new THREE.Group();
  private readonly ships: Ship[] = [];
  private t = 0;
  private fleeing = false;
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();

  constructor(count: number) {
    for (let i = 0; i < count; i++) this.spawn(i < count * 0.7 ? 'cruise' : 'arrive');
  }

  get alive(): number { return this.ships.filter(s => s.alive).length; }

  private spawn(state: Ship['state']): void {
    const n = new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.5) * 1.4, Math.random() - 0.5).normalize();
    const t = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    t.addScaledVector(n, -t.dot(n)).normalize();
    const cruiseAlt = CRUISE_ALT[0] + Math.random() * (CRUISE_ALT[1] - CRUISE_ALT[0]);
    const { mesh, blink } = makeShip(Math.random() < 0.5 ? 0xe7e9ee : 0xf0c27a);
    this.group.add(mesh);
    this.ships.push({
      mesh, n, t, alt: state === 'arrive' ? SPACE_ALT : cruiseAlt, cruiseAlt,
      speed: 0.32 + Math.random() * 0.18, state, life: 18 + Math.random() * 22, wander: Math.random() * 10, blink, alive: true,
    });
  }

  /** The planet broke apart: everyone runs for space. */
  flee(): void {
    this.fleeing = true;
    for (const s of this.ships) if (s.alive) { s.state = 'leave'; s.speed *= 1.8; }
  }

  /** `dangers`: world points ships try to steer away from (incoming shots, black holes, beam hits). */
  update(dt: number, dangers: THREE.Vector3[]): void {
    this.t += dt;
    for (let i = this.ships.length - 1; i >= 0; i--) {
      const s = this.ships[i];
      if (!s.alive) { this.ships.splice(i, 1); continue; }
      s.life -= dt;
      if (s.state === 'cruise' && s.life <= 0) s.state = 'leave';
      // Altitude: arrive by descending, leave by climbing out.
      const goalAlt = s.state === 'leave' ? SPACE_ALT + 0.5 : s.cruiseAlt;
      s.alt += (goalAlt - s.alt) * Math.min(1, dt * (s.state === 'leave' ? 0.7 : 1.1));
      if (s.state === 'arrive' && Math.abs(s.alt - s.cruiseAlt) < 0.01) s.state = 'cruise';
      if (s.state === 'leave' && s.alt > SPACE_ALT) {
        s.mesh.removeFromParent();
        this.ships.splice(i, 1);
        if (!this.fleeing) this.spawn('arrive');
        continue;
      }
      // Steering: gentle wander, plus a hard turn away from nearby danger.
      let turn = Math.sin(this.t * 0.4 + s.wander) * 0.35;
      const pos = this.tmp.copy(s.n).multiplyScalar(s.alt * WORLD_RADIUS);
      let boost = 1;
      for (const d of dangers) {
        const dist = d.distanceTo(pos);
        if (dist > DANGER_RANGE) continue;
        // Which side of our heading is the danger on? Turn the other way.
        const side = this.tmp2.copy(s.n).cross(s.t).dot(d.clone().sub(pos));
        turn += (side > 0 ? -1 : 1) * 3.2 * (1 - dist / DANGER_RANGE);
        boost = 1.8;
      }
      s.t.applyAxisAngle(s.n, turn * dt).normalize();
      // Move along the great circle.
      s.n.addScaledVector(s.t, (s.speed * boost * dt) / (s.alt * WORLD_RADIUS)).normalize();
      s.t.addScaledVector(s.n, -s.t.dot(s.n)).normalize();
      s.mesh.position.copy(s.n).multiplyScalar(s.alt * WORLD_RADIUS);
      s.mesh.up.copy(s.n);
      s.mesh.lookAt(this.tmp.copy(s.mesh.position).add(s.t));
      s.blink.visible = Math.sin(this.t * 7 + s.wander) > 0.5;
    }
  }

  private kill(s: Ship): void {
    s.alive = false;
    s.mesh.removeFromParent();
  }

  /** Destroy every ship within `r` world units of p; returns their positions (for effects). */
  blast(p: THREE.Vector3, r: number): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (const s of this.ships) {
      if (s.alive && s.mesh.position.distanceTo(p) < r) { out.push(s.mesh.position.clone()); this.kill(s); }
    }
    return out;
  }

  /** Destroy ships a ray passes within `r` of (beams); returns their positions. */
  rayBlast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, r: number): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (const s of this.ships) {
      if (!s.alive) continue;
      const along = this.tmp.copy(s.mesh.position).sub(origin).dot(dir);
      if (along < 0 || along > maxDist) continue;
      if (this.tmp.copy(origin).addScaledVector(dir, along).distanceTo(s.mesh.position) < r) {
        out.push(s.mesh.position.clone());
        this.kill(s);
      }
    }
    return out;
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

/** A small shuttle: hull, wings, glowing engine and a blinking light. Points along +Z. */
function makeShip(color: number): { mesh: THREE.Group; blink: THREE.Mesh } {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.4 });
  const hull = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.075, 8), hullMat);
  hull.rotation.x = Math.PI / 2;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.004, 0.025), hullMat);
  wing.position.z = -0.012;
  const engine = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: 0x7fd8ff }));
  engine.position.z = -0.04;
  const blink = new THREE.Mesh(new THREE.SphereGeometry(0.007, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff4040 }));
  blink.position.set(0, 0.012, -0.01);
  g.add(hull, wing, engine, blink);
  return { mesh: g, blink };
}
