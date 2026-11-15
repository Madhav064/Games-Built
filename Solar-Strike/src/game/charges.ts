// Sleeper Charges: charges that stick in the ground and wait. They go off when the player
// presses Detonate (one after another, like a chain) or when any blast, beam or black hole
// reaches them. A detonating charge can set off its neighbours the same way.

import * as THREE from 'three';
import { CENTER, VOXEL } from '../engine/voxelPlanet';

export const MAX_CHARGES = 12;
/** Seconds between charges when the Detonate button chains them. */
const CHAIN_DELAY = 0.16;
/** Fuse when a nearby blast sets a charge off (short, so chains ripple outward). */
const SYMPATHETIC_FUSE = 0.09;

interface Charge {
  g: THREE.Vector3;
  mesh: THREE.Group;
  light: THREE.MeshBasicMaterial;
  /** Seconds until it explodes; -1 while sleeping. */
  fuse: number;
  age: number;
}

const bodyGeo = new THREE.CylinderGeometry(0.035, 0.045, 0.07, 10);
const capGeo = new THREE.SphereGeometry(0.022, 10, 8);
const ringGeo = new THREE.RingGeometry(0.05, 0.065, 20);

export class SleeperCharges {
  private charges: Charge[] = [];
  private readonly bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a2d34, metalness: 0.6, roughness: 0.45 });
  private readonly ringMat = new THREE.MeshBasicMaterial({ color: 0xff2a4a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
  /** Called whenever the number of planted charges changes. */
  onCountChanged: ((n: number) => void) | null = null;

  /** `parent` is the planet group, so charges ride along as it spins. */
  constructor(private readonly parent: THREE.Object3D) {}

  get count(): number { return this.charges.length; }
  get full(): boolean { return this.charges.length >= MAX_CHARGES; }

  /** Stick a charge into the surface at grid point g. */
  plant(g: THREE.Vector3): boolean {
    if (this.full) return false;
    const local = g.clone().subScalar(CENTER).multiplyScalar(VOXEL);
    const normal = local.clone().normalize();
    const mesh = new THREE.Group();
    const light = new THREE.MeshBasicMaterial({ color: 0xff2a4a });
    const body = new THREE.Mesh(bodyGeo, this.bodyMat);
    body.position.y = 0.02;
    const cap = new THREE.Mesh(capGeo, light);
    cap.position.y = 0.06;
    const ring = new THREE.Mesh(ringGeo, this.ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.004;
    mesh.add(body, cap, ring);
    mesh.position.copy(local);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    this.parent.add(mesh);
    this.charges.push({ g: g.clone(), mesh, light, fuse: -1, age: 0 });
    this.onCountChanged?.(this.charges.length);
    return true;
  }

  /** A blast of `radius` voxels at g sets off every sleeping charge it reaches. */
  trigger(g: THREE.Vector3, radius: number): void {
    for (const c of this.charges) {
      if (c.fuse < 0 && c.g.distanceTo(g) <= radius) c.fuse = SYMPATHETIC_FUSE + Math.random() * 0.05;
    }
  }

  /** A shockwave front at distance r (voxels) from g sets off charges it passes over. */
  triggerRing(g: THREE.Vector3, r: number, width: number): void {
    for (const c of this.charges) {
      if (c.fuse < 0 && Math.abs(c.g.distanceTo(g) - r) <= width) c.fuse = SYMPATHETIC_FUSE;
    }
  }

  /** Detonate button: set them all off one after another, nearest-neighbour order. */
  detonateAll(): void {
    const sleeping = this.charges.filter(c => c.fuse < 0);
    if (!sleeping.length) return;
    let cur = sleeping.shift()!;
    let t = 0.05;
    cur.fuse = t;
    while (sleeping.length) {
      let best = 0;
      for (let i = 1; i < sleeping.length; i++) {
        if (sleeping[i].g.distanceToSquared(cur.g) < sleeping[best].g.distanceToSquared(cur.g)) best = i;
      }
      cur = sleeping.splice(best, 1)[0];
      t += CHAIN_DELAY;
      cur.fuse = t;
    }
  }

  /** Blink, count fuses down and explode. `explode` gets the grid point of each blast. */
  update(dt: number, explode: (g: THREE.Vector3) => void): void {
    let changed = false;
    // Iterate over a copy: an explosion can arm (but never remove) other charges.
    for (const c of [...this.charges]) {
      c.age += dt;
      const armed = c.fuse >= 0;
      const rate = armed ? 14 : 2.2;
      const on = Math.sin(c.age * rate * Math.PI * 2) > (armed ? -0.2 : 0.55);
      c.light.color.setHex(on ? (armed ? 0xffe060 : 0xff2a4a) : 0x3a0a12);
      if (!armed) continue;
      c.fuse -= dt;
      if (c.fuse > 0) continue;
      this.remove(c);
      changed = true;
      explode(c.g);
    }
    if (changed) this.onCountChanged?.(this.charges.length);
  }

  private remove(c: Charge): void {
    const i = this.charges.indexOf(c);
    if (i >= 0) this.charges.splice(i, 1);
    c.mesh.removeFromParent();
    c.light.dispose();
  }

  dispose(): void {
    for (const c of [...this.charges]) this.remove(c);
    this.bodyMat.dispose();
    this.ringMat.dispose();
    this.onCountChanged?.(0);
  }
}
