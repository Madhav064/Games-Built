// Core game: scene, input, weapons, impacts, planet lifecycle.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { VoxelPlanet, VOXEL, WORLD_RADIUS, RADIUS_VOX, CENTER } from '../engine/voxelPlanet';
import { PLANETS, type PlanetDef } from '../engine/planets';
import { CloudLayer, createAtmosphere, createRings, createStarfield, createSun } from '../engine/scenery';
import { Beam, Debris, Flashes, Particles, Rings } from '../engine/effects';
import { Shatter } from '../engine/shatter';
import { Population } from './population';
import { CameraRig } from './cameraRig';
import { WEAPONS, weaponById, type ImpactSpec, type ProjectileSpec, type WeaponDef } from './weapons';
import * as sfx from '../audio/sfx';

interface Projectile {
  spec: ProjectileSpec;
  impact: ImpactSpec;
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  target: THREE.Vector3; // grid coords (rotates with planet)
  trailTimer: number;
  age: number;
  homing: number;
  /** Collisions are ignored until this age (ejecta start inside their crater). */
  armAt: number;
  canSplit: boolean;
  /**
   * Grid point above the target on the player's line of sight. The projectile flies here
   * first, then straight down that line, so it lands exactly where the player clicked.
   */
  approach: THREE.Vector3 | null;
}

interface Shockwave {
  cx: number; cy: number; cz: number; maxR: number; t: number; dur: number; tick: number;
  heat: number; kill: boolean;
}

/** Burning, spreading lava left by the Plasma Mortar. */
interface LavaPool { g: THREE.Vector3; t: number; dur: number; radius: number; tick: number }

/** Core Lance shaft being drilled toward the centre. */
interface LanceDrill {
  g: THREE.Vector3; dir: THREE.Vector3; depth: number; progress: number; carved: number;
  radius: number; cavity: number;
}

/** Small rocks thrown out by an asteroid impact. */
const EJECTA_SPEC: ProjectileSpec = {
  speed: 2.2, size: 0.07, model: 'rock', trailColor: 0xff7a30, cluster: 1, spread: 0, cooldown: 0,
  impact: { crater: 3, heatRadius: 1.6, heat: 1.2, debris: 8, debrisSpeed: 0.8, fire: 40, flash: 1.0, shockwave: 0, shake: 0.05, boom: 0.12 },
};

interface ActiveSingularity {
  group: THREE.Group;
  pos: THREE.Vector3;
  gridPos: THREE.Vector3;
  age: number;
  duration: number;
  carveRadius: number;
  tickTimer: number;
}

export interface GameEvents {
  onStats?: (s: { population: number; total: number; health: number }) => void;
  onXp?: (amount: number) => void;
  onPlanetDestroyed?: (s: { planet: PlanetDef; killed: number; xp: number; shots: number }) => void;
  onPlanetLoaded?: (p: PlanetDef) => void;
  onShotFired?: () => void;
  /** Big centre-screen callout, e.g. "SHATTER!". */
  onCallout?: (text: string) => void;
}

const SUN_DIR = new THREE.Vector3(1, 0.3, -0.3).normalize();

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly rig: CameraRig;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly particles = new Particles(7000);
  private readonly debris = new Debris(1500);
  private readonly flashes = new Flashes();
  private readonly rings = new Rings();
  private readonly beam = new Beam(0xff3030, 0.05);
  private readonly clock = new THREE.Timer();

  planet: VoxelPlanet | null = null;
  planetDef: PlanetDef = PLANETS[0];
  private clouds: CloudLayer | null = null;
  private atmosphere: THREE.Mesh | null = null;
  private planetRings: THREE.Mesh | null = null;
  private atmoStrength = 1;
  private population: Population | null = null;
  private shatter: Shatter | null = null;
  destroyed = false;

  weapon: WeaponDef = WEAPONS[0];
  private projectiles: Projectile[] = [];
  private shockwaves: Shockwave[] = [];
  private singularities: ActiveSingularity[] = [];
  private lavaPools: LavaPool[] = [];
  private lances: LanceDrill[] = [];
  /** Seconds the current beam has been held (Nova Beam charge). */
  private beamHold = 0;
  private shatterCalloutAt = 0;
  private readonly impactLight: THREE.PointLight;
  private firing = false;
  private pointerNdc = new THREE.Vector2();
  private cooldown = 0;
  private stopBeamSound: (() => void) | null = null;
  private beamHitTimer = 0;

  timeScale = 1;
  /** Disabled behind the title screen. */
  inputEnabled = true;
  spin = true;
  paused = false;
  private xpEarned = 0;
  private shotsThisPlanet = 0;
  /** Bumped on every planet load, so delayed callbacks from an old planet are ignored. */
  private planetGen = 0;
  private beamAcc = 0;
  private lastIntegrity = 1;
  private lastKilledShare = 0;
  private statsTimer = 0;

  readonly events: GameEvents = {};

  // Input state
  private pointers = new Map<number, { x: number; y: number; type: string; button: number }>();
  private pinchDist = 0;
  private firePointer: number | null = null;

  private readonly raycaster = new THREE.Raycaster();
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpC = new THREE.Vector3();
  private readonly tmpColor = new THREE.Color();
  private readonly tmpColor2 = new THREE.Color();
  private beamShatterAt = 0;

  /** `mobile`: phone/tablet per CrazyGames system info; lowers render cost. */
  constructor(private readonly canvas: HTMLCanvasElement, mobile = false) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.setClearColor(0x020309);

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.05, 1000);
    this.rig = new CameraRig(this.camera);

    // Lights
    const sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
    sun.position.copy(SUN_DIR).multiplyScalar(10);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0x2a3655, 0.35));
    this.scene.add(createStarfield());
    this.scene.add(createSun(SUN_DIR));
    this.impactLight = new THREE.PointLight(0xffa040, 0, 18, 1.2);
    this.scene.add(this.impactLight);

    this.scene.add(this.particles.points, this.debris.mesh, this.flashes.group, this.beam.group);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), GLOW.bloomStrength, GLOW.bloomRadius, GLOW.bloomThreshold);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.debris.camera = this.camera.position;
    this.debris.collide = (x, y, z) => {
      if (!this.planet || this.destroyed) return false;
      return this.planet.isSolidWorld(this.tmpC.set(x, y, z), this.tmpB);
    };

    this.bindInput();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  // ----------------------------------------------------------
  // Planet lifecycle
  // ----------------------------------------------------------
  loadPlanet(def: PlanetDef): void {
    this.clearPlanet();
    this.planetDef = def;
    this.destroyed = false;
    this.debris.gravity = 2.2;
    this.rig.resetZoom();
    const planet = new VoxelPlanet(def);
    this.planet = planet;
    this.scene.add(planet.group);
    planet.group.rotation.y = Math.random() * Math.PI * 2;
    if (def.clouds) {
      this.clouds = new CloudLayer(WORLD_RADIUS * 1.035, def.clouds, def.seed);
      planet.group.add(this.clouds.mesh);
    }
    if (def.atmosphere) {
      this.atmoStrength = def.atmosphere.strength;
      this.atmosphere = createAtmosphere(WORLD_RADIUS * 1.07, def.atmosphere.color, def.atmosphere.strength, SUN_DIR);
      this.scene.add(this.atmosphere);
    }
    if (def.rings) {
      // In the scene, not the spinning planet group: a tilted child would wobble as the planet turns.
      this.planetRings = createRings(def.rings.innerRadius, def.rings.outerRadius, def.rings.color, def.rings.opacity, def.rings.tilt);
      // Tip toward the default camera too, so the rings read as an open ellipse, not a line.
      this.planetRings.rotation.x = 0.38;
      this.scene.add(this.planetRings);
    }
    this.population = new Population(planet, SUN_DIR);
    this.population.setViewportHeight(window.innerHeight);
    planet.group.add(this.population.points);
    this.lastIntegrity = 1;
    this.lastKilledShare = 0;
    this.xpEarned = 0;
    this.shotsThisPlanet = 0;
    this.planetGen++;
    this.events.onPlanetLoaded?.(def);
    this.emitStats();
  }

  resetPlanet(): void {
    this.loadPlanet(this.planetDef);
  }

  private clearPlanet(): void {
    this.stopFiring();
    for (const p of this.projectiles) p.mesh.removeFromParent();
    this.projectiles = [];
    this.shockwaves = [];
    for (const s of this.singularities) s.group.removeFromParent();
    this.singularities = [];
    this.lavaPools = [];
    this.lances = [];
    this.debris.attractors = [];
    this.particles.clear();
    this.debris.clear();
    this.rings.clear();
    this.population?.dispose();
    this.population = null;
    this.clouds?.dispose();
    this.clouds = null;
    if (this.planetRings) {
      this.planetRings.geometry.dispose();
      (this.planetRings.material as THREE.Material).dispose();
      this.planetRings.removeFromParent();
      this.planetRings = null;
    }
    if (this.atmosphere) {
      this.atmosphere.geometry.dispose();
      (this.atmosphere.material as THREE.Material).dispose();
      this.atmosphere.removeFromParent();
      this.atmosphere = null;
    }
    this.shatter?.dispose();
    this.shatter = null;
    this.planet?.dispose();
    this.planet = null;
  }

  selectWeapon(id: string): void {
    this.stopFiring();
    this.weapon = weaponById(id);
    if (this.weapon.beam) this.beam.setColor(this.weapon.beam.color);
  }

  // ----------------------------------------------------------
  // Input
  // ----------------------------------------------------------
  private bindInput(): void {
    const c = this.canvas;
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('pointerdown', e => {
      sfx.unlockAudio();
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType, button: e.button });
      const touches = [...this.pointers.values()].filter(p => p.type === 'touch');
      if (touches.length >= 2) {
        // Second finger: switch from firing to camera control.
        this.stopFiring();
        this.pinchDist = this.touchDistance();
        return;
      }
      if (e.button === 0) {
        this.setPointer(e.clientX, e.clientY);
        this.firePointer = e.pointerId;
        this.startFiring();
      }
    });
    c.addEventListener('pointermove', e => {
      const p = this.pointers.get(e.pointerId);
      const touches = [...this.pointers.values()].filter(q => q.type === 'touch');
      if (p && touches.length >= 2 && p.type === 'touch') {
        // Two-finger orbit (average move) + pinch zoom.
        this.rig.rotate((e.clientX - p.x) / 2, (e.clientY - p.y) / 2);
        p.x = e.clientX; p.y = e.clientY;
        const d = this.touchDistance();
        if (this.pinchDist > 0 && d > 0) this.rig.zoom(this.pinchDist / d);
        this.pinchDist = d;
        return;
      }
      if (p && (p.button === 2 || p.button === 1)) {
        this.rig.rotate(e.clientX - p.x, e.clientY - p.y);
      }
      if (p) { p.x = e.clientX; p.y = e.clientY; }
      if (this.firePointer === e.pointerId || e.pointerType === 'mouse') this.setPointer(e.clientX, e.clientY);
    });
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.firePointer === e.pointerId) {
        this.firePointer = null;
        this.stopFiring();
      }
      if ([...this.pointers.values()].filter(p => p.type === 'touch').length < 2) this.pinchDist = 0;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    // Alt-tab or a system dialog while holding fire never sends pointerup: stop the beam.
    window.addEventListener('blur', () => {
      this.pointers.clear();
      this.pinchDist = 0;
      this.firePointer = null;
      this.stopFiring();
    });
    c.addEventListener('wheel', e => {
      e.preventDefault();
      this.rig.zoom(Math.exp(e.deltaY * 0.0012));
    }, { passive: false });
    window.addEventListener('keydown', e => {
      if (e.target instanceof HTMLInputElement) return; // settings sliders use arrow keys
      // Keep arrows/space from scrolling the CrazyGames page around the game iframe.
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
      if (!this.inputEnabled || this.paused) return;
      // e.code is the physical key, so WASD stays in the same place on AZERTY (ZQSD) etc.
      const step = 40;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.rig.rotate(-step, 0);
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.rig.rotate(step, 0);
      if (e.code === 'ArrowUp' || e.code === 'KeyW') this.rig.rotate(0, -step);
      if (e.code === 'ArrowDown' || e.code === 'KeyS') this.rig.rotate(0, step);
      if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') this.rig.zoom(0.9);
      if (e.key === '-' || e.code === 'NumpadSubtract') this.rig.zoom(1.1);
    });
  }

  private touchDistance(): number {
    const t = [...this.pointers.values()].filter(p => p.type === 'touch');
    if (t.length < 2) return 0;
    return Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y);
  }

  private setPointer(x: number, y: number): void {
    this.pointerNdc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  }

  private startFiring(): void {
    if (this.paused || this.destroyed || !this.inputEnabled) return;
    this.firing = true;
    if (this.weapon.beam) {
      this.shotsThisPlanet++;
      this.events.onShotFired?.();
      if (!this.stopBeamSound) this.stopBeamSound = sfx.beamLoop(this.weapon.beam.pitch);
    }
    if (this.weapon.projectile && this.cooldown <= 0) this.fireProjectile();
  }

  stopFiring(): void {
    this.firing = false;
    this.beamAcc = 0;
    this.beamHold = 0;
    this.beam.hide();
    if (this.stopBeamSound) { this.stopBeamSound(); this.stopBeamSound = null; }
  }

  /** Planet hit under the pointer, in grid coordinates. */
  private aim(out: THREE.Vector3): THREE.Vector3 | null {
    if (!this.planet) return null;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    return this.planet.raycast(this.raycaster.ray.origin, this.raycaster.ray.direction, out);
  }

  // ----------------------------------------------------------
  // Weapons
  // ----------------------------------------------------------
  private fireProjectile(): void {
    const spec = this.weapon.projectile!;
    const planet = this.planet;
    if (!planet) return;
    const hit = this.aim(new THREE.Vector3());
    if (!hit) return;
    this.cooldown = spec.cooldown;
    for (let k = 0; k < spec.cluster; k++) {
      let target = hit.clone();
      if (spec.spread > 0) {
        target.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(spec.spread * 2));
        target = this.surfacePoint(target) ?? hit.clone();
      }
      const targetWorld = planet.gridToWorld(target, new THREE.Vector3());
      // Launch from off-screen, from the camera's side of the planet.
      const toCam = this.camera.position.clone().sub(targetWorld).normalize();
      const side = new THREE.Vector3().crossVectors(toCam, this.camera.up).normalize();
      const up = new THREE.Vector3().crossVectors(side, toCam).normalize();
      const dist = spec.model === 'rock' ? 10 : 7;
      const lob = (spec.homing ?? 6) < 3;
      const start = targetWorld.clone()
        .addScaledVector(toCam, dist * (lob ? 0.35 : 0.55))
        .addScaledVector(side, (Math.random() < 0.5 ? -1 : 1) * dist * (0.5 + Math.random() * 0.3))
        .addScaledVector(up, lob ? -dist * 0.15 : dist * (0.25 + Math.random() * 0.35));
      const vel = targetWorld.clone().sub(start).normalize();
      // Lobbed shots leave upward and curve down onto the target.
      if (lob) vel.addScaledVector(up, 1.1).normalize();
      // Waypoint on the camera ray above the target (grid space, so it turns with the planet).
      const toCamG = planet.worldToGrid(this.camera.position, new THREE.Vector3()).sub(target).normalize();
      const approach = target.clone().addScaledVector(toCamG, lob ? 20 : 12);
      this.launch(spec, spec.impact, start, vel.multiplyScalar(spec.speed), target, { canSplit: !!spec.split, approach });
    }
    sfx.whoosh(spec.model === 'rock' ? 1.6 : 0.5, spec.model === 'rock' ? 0.5 : 1.2);
    this.shotsThisPlanet++;
    this.events.onShotFired?.();
  }

  private launch(
    spec: ProjectileSpec, impact: ImpactSpec, start: THREE.Vector3, vel: THREE.Vector3, target: THREE.Vector3,
    o: { homing?: number; canSplit?: boolean; armAt?: number; size?: number; approach?: THREE.Vector3 } = {},
  ): void {
    const mesh = this.makeProjectileMesh(spec.model, o.size ?? spec.size);
    mesh.position.copy(start);
    this.scene.add(mesh);
    this.projectiles.push({
      spec, impact, mesh, pos: start.clone(), vel: vel.clone(), target: target.clone(), trailTimer: 0, age: 0,
      homing: o.homing ?? spec.homing ?? 6, armAt: o.armAt ?? 0, canSplit: o.canSplit ?? false,
      approach: o.approach?.clone() ?? null,
    });
  }

  private removeProjectile(i: number): void {
    const p = this.projectiles[i];
    p.mesh.removeFromParent();
    p.mesh.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (m.material) (m.material as THREE.Material).dispose();
    });
    this.projectiles.splice(i, 1);
  }

  /** Project a grid point onto the current surface, along the line to the centre. */
  private surfacePoint(g: THREE.Vector3): THREE.Vector3 | null {
    const planet = this.planet;
    if (!planet) return null;
    const dir = g.clone().subScalar(CENTER);
    if (dir.lengthSq() < 1e-6) return null;
    dir.normalize();
    const c = new THREE.Vector3(CENTER, CENTER, CENTER);
    const originW = planet.gridToWorld(c.clone().addScaledVector(dir, RADIUS_VOX + 8), new THREE.Vector3());
    const dirW = planet.gridToWorld(c, new THREE.Vector3()).sub(originW).normalize();
    return planet.raycast(originW, dirW, new THREE.Vector3());
  }

  /** Two unit vectors tangent to the surface at grid point g. */
  private tangents(g: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
    const n = g.clone().subScalar(CENTER).normalize();
    const ref = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const t1 = new THREE.Vector3().crossVectors(n, ref).normalize();
    return [t1, new THREE.Vector3().crossVectors(n, t1)];
  }

  private makeProjectileMesh(model: ProjectileSpec['model'], size: number): THREE.Object3D {
    if (model === 'rock') {
      const geo = new THREE.IcosahedronGeometry(size, 1);
      const p = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const s = 0.8 + Math.random() * 0.35;
        p.setXYZ(i, p.getX(i) * s, p.getY(i) * s, p.getZ(i) * s);
      }
      geo.computeVertexNormals();
      return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x6b5847, roughness: 1, flatShading: true, emissive: 0x401000, emissiveIntensity: 0.6 }));
    }
    if (model === 'blob') {
      const g = new THREE.Group();
      g.add(
        new THREE.Mesh(new THREE.SphereGeometry(size * 0.6, 12, 10), new THREE.MeshBasicMaterial({ color: 0xfff0c0 })),
        new THREE.Mesh(new THREE.SphereGeometry(size, 12, 10), new THREE.MeshBasicMaterial({
          color: 0xff7a20, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
        })),
      );
      return g;
    }
    if (model === 'rod') {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(size * 0.08, size * 0.08, size * 2.2, 8),
        new THREE.MeshStandardMaterial({ color: 0x8899aa, metalness: 0.85, roughness: 0.25 }),
      );
      const tip = new THREE.Mesh(
        new THREE.ConeGeometry(size * 0.08, size * 0.5, 8),
        new THREE.MeshBasicMaterial({ color: 0x50d8ff }),
      );
      tip.position.y = size * 1.35;
      g.add(body, tip);
      return g;
    }
    if (model === 'singularity') {
      const g = new THREE.Group();
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(size * 0.55, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x000000 }),
      );
      const disk = new THREE.Mesh(
        new THREE.RingGeometry(size * 0.55, size * 1.6, 28),
        new THREE.MeshBasicMaterial({ color: 0xc44dff, side: THREE.DoubleSide, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending }),
      );
      disk.rotation.x = Math.PI / 3;
      g.add(core, disk);
      return g;
    }
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(size * 0.18, size * 0.18, size, 8),
      new THREE.MeshStandardMaterial({ color: model === 'warhead' ? 0x3a3d44 : 0xe8e8ec, metalness: 0.5, roughness: 0.4 }),
    );
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(size * 0.18, size * 0.35, 8),
      new THREE.MeshStandardMaterial({ color: model === 'warhead' ? 0xd8c020 : 0xd23b3b, metalness: 0.3, roughness: 0.5 }),
    );
    nose.position.y = size * 0.67;
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(size * 0.2, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffc070 }),
    );
    glow.position.y = -size * 0.55;
    g.add(body, nose, glow);
    return g;
  }

  private updateProjectiles(dt: number): void {
    const planet = this.planet;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const spec = p.spec;
      p.age += dt;
      if (!planet || this.destroyed) {
        this.removeProjectile(i);
        continue;
      }
      // Home in on the (rotating) target point, via the line-of-sight waypoint first.
      const targetWorld = planet.gridToWorld(p.target, this.tmpA);
      const remaining = targetWorld.distanceTo(p.pos);
      if (p.canSplit && spec.split && remaining < 1.3) {
        this.split(p);
        this.removeProjectile(i);
        continue;
      }
      if (p.approach) {
        const wp = planet.gridToWorld(p.approach, this.tmpB);
        if (wp.distanceTo(p.pos) < 0.3 || remaining < 0.5) p.approach = null;
      }
      const goal = p.approach ? planet.gridToWorld(p.approach, this.tmpB) : targetWorld;
      const want = this.tmpB.copy(goal).sub(p.pos);
      const speed = spec.speed * (1 + p.age * 0.6);
      want.normalize().multiplyScalar(speed);
      if (!p.approach && remaining < 1.0 && p.armAt === 0) {
        // Final leg: fly straight at the target so the shot can't drift off the click point.
        p.vel.copy(want).setLength(Math.max(p.vel.length(), speed));
      } else {
        p.vel.lerp(want, Math.min(1, dt * (p.approach ? Math.max(p.homing, 3) : p.homing)));
      }
      const step = p.vel.length() * dt;
      // Sub-step so fast projectiles don't tunnel through the surface.
      let hit = false;
      const armed = p.age >= p.armAt;
      const steps = Math.max(1, Math.ceil(step / (VOXEL * 1.5)));
      for (let s = 0; s < steps; s++) {
        p.pos.addScaledVector(p.vel, dt / steps);
        if (armed && planet.isSolidWorld(p.pos, this.tmpC)) { hit = true; break; }
      }
      if (armed && remaining < step) hit = true;
      p.mesh.position.copy(p.pos);
      if (spec.model === 'rock' || spec.model === 'blob') {
        p.mesh.rotation.x += dt * 1.3; p.mesh.rotation.y += dt * 0.7;
      } else {
        p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.tmpA.copy(p.vel).normalize());
      }
      // Exhaust / entry trail
      p.trailTimer -= dt;
      if (p.trailTimer <= 0) {
        p.trailTimer = 0;
        const c = this.tmpColor.set(spec.trailColor);
        const back = this.tmpA.copy(p.vel).normalize().multiplyScalar(-spec.size * 0.6);
        const nearPlanet = p.pos.length() < WORLD_RADIUS * 1.6;
        const n = spec.model === 'rock' ? (nearPlanet ? 4 : 2) : 3;
        const vlen = p.vel.length() || 1;
        for (let k = 0; k < n; k++) {
          // Spread spawns along this frame's path so fast trails stay continuous.
          const along = -Math.random() * step;
          const dirx = p.vel.x / vlen, diry = p.vel.y / vlen, dirz = p.vel.z / vlen;
          this.particles.spawn({
            x: p.pos.x + back.x + dirx * along + (Math.random() - 0.5) * spec.size * 0.4,
            y: p.pos.y + back.y + diry * along + (Math.random() - 0.5) * spec.size * 0.4,
            z: p.pos.z + back.z + dirz * along + (Math.random() - 0.5) * spec.size * 0.4,
            vx: back.x * 2 + (Math.random() - 0.5) * 0.1, vy: back.y * 2 + (Math.random() - 0.5) * 0.1, vz: back.z * 2 + (Math.random() - 0.5) * 0.1,
            r: c.r, g: c.g * (nearPlanet ? 0.8 : 1), b: c.b,
            size: spec.size * (spec.model === 'rock' ? (nearPlanet ? 1.6 : 0.8) : 1.4),
            life: spec.model === 'rock' ? 0.7 : 0.45, drag: 2, grow: 2.2,
          });
        }
      }
      if (hit) {
        // Close to the target: detonate exactly on it (sub-steps can stop a few voxels short).
        const g = remaining < 0.25 ? p.target.clone() : planet.worldToGrid(p.pos, new THREE.Vector3());
        if (spec.isBlackHole) this.spawnSingularity(p.pos.clone(), g);
        else this.impact(g, p.impact, spec);
        this.removeProjectile(i);
      } else if (p.age > 12) {
        this.removeProjectile(i);
      }
    }
  }

  /** Splitter: break into a ring of warheads around the target. */
  private split(p: Projectile): void {
    const planet = this.planet!;
    const sp = p.spec.split!;
    const [t1, t2] = this.tangents(p.target);
    const a0 = Math.random() * Math.PI * 2;
    for (let k = 0; k < sp.count; k++) {
      const a = a0 + (k / sp.count) * Math.PI * 2;
      const g = p.target.clone().addScaledVector(t1, Math.cos(a) * sp.ringRadius).addScaledVector(t2, Math.sin(a) * sp.ringRadius);
      const target = this.surfacePoint(g) ?? g;
      const vel = planet.gridToWorld(target, new THREE.Vector3()).sub(p.pos).normalize().multiplyScalar(p.spec.speed * 1.2);
      this.launch(p.spec, sp.impact, p.pos, vel, target, { size: p.spec.size * 0.7 });
    }
    this.flashes.spawn(p.pos, 0.9, 0xff80ff, 0.3);
    sfx.whoosh(0.35, 1.6);
  }

  /** Asteroid: rocks thrown out of the crater fall back and make smaller craters. */
  private throwEjecta(g: THREE.Vector3, e: NonNullable<ProjectileSpec['ejecta']>): void {
    const planet = this.planet!;
    const [t1, t2] = this.tangents(g);
    const startW = planet.gridToWorld(g, new THREE.Vector3());
    const normalW = startW.clone().normalize();
    const impact = { ...EJECTA_SPEC.impact, crater: e.crater };
    for (let k = 0; k < e.count; k++) {
      const a = Math.random() * Math.PI * 2;
      const range = e.minRange + Math.random() * (e.maxRange - e.minRange);
      const target = this.surfacePoint(g.clone().addScaledVector(t1, Math.cos(a) * range).addScaledVector(t2, Math.sin(a) * range));
      if (!target) continue;
      const start = startW.clone().addScaledVector(normalW, 0.15);
      const toTarget = planet.gridToWorld(target, new THREE.Vector3()).sub(start).normalize();
      const vel = normalW.clone().multiplyScalar(1.6 + Math.random() * 0.8).addScaledVector(toTarget, 0.6);
      this.launch(EJECTA_SPEC, impact, start, vel, target, { homing: 1.3, armAt: 0.4, size: EJECTA_SPEC.size * (0.7 + Math.random() * 0.6) });
    }
  }

  private spawnSingularity(pos: THREE.Vector3, gridPos: THREE.Vector3): void {
    const grp = new THREE.Group();
    grp.position.copy(pos);
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000 }),
    );
    const diskGeo = new THREE.RingGeometry(0.35, 1.15, 36);
    const diskMat = new THREE.MeshBasicMaterial({
      color: 0xbe4dff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    const disk = new THREE.Mesh(diskGeo, diskMat);
    disk.rotation.x = Math.PI / 3;
    grp.add(core, disk);
    this.scene.add(grp);

    this.singularities.push({
      group: grp,
      pos,
      gridPos,
      age: 0,
      duration: 5.5,
      carveRadius: 3.5,
      tickTimer: 0,
    });
    sfx.blackHoleRumble();
    this.rig.shake(0.35);
  }

  private updateSingularities(dt: number): void {
    const planet = this.planet;
    for (let i = this.singularities.length - 1; i >= 0; i--) {
      const s = this.singularities[i];
      // Ride along with the spinning planet so the visual stays on the hole it is eating.
      if (planet && !this.destroyed) {
        planet.gridToWorld(s.gridPos, s.pos);
        s.group.position.copy(s.pos);
      }
      s.age += dt;
      s.tickTimer -= dt;
      s.group.children[1].rotation.z += dt * 6;
      for (let k = 0; k < 2; k++) {
        const a = Math.random() * Math.PI * 2;
        const dist = 0.5 + Math.random() * 0.9;
        const px = s.pos.x + Math.cos(a) * dist;
        const py = s.pos.y + (Math.random() - 0.5) * 0.3;
        const pz = s.pos.z + Math.sin(a) * dist;
        this.particles.spawn({
          x: px, y: py, z: pz,
          vx: (s.pos.x - px) * 2.2 - Math.sin(a) * 0.8,
          vy: (s.pos.y - py) * 2.2,
          vz: (s.pos.z - pz) * 2.2 + Math.cos(a) * 0.8,
          r: 0.8, g: 0.3, b: 1.0,
          size: 0.05 + Math.random() * 0.04,
          life: 0.35, drag: 0.5,
        });
      }
      if (s.tickTimer <= 0 && planet && !this.destroyed) {
        s.tickTimer = 0.12;
        s.carveRadius = Math.min(13, s.carveRadius + 0.3);
        planet.carve(s.gridPos.x, s.gridPos.y, s.gridPos.z, s.carveRadius, 0.4);
        planet.addHeat(s.gridPos.x, s.gridPos.y, s.gridPos.z, s.carveRadius * 1.3, 0.3);
        this.population?.blast(s.gridPos.x, s.gridPos.y, s.gridPos.z, s.carveRadius * 1.4);
        // Tear rock off the surrounding ground and drag it in.
        for (let k = 0; k < 3; k++) {
          const off = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
            .normalize().multiplyScalar(s.carveRadius * (1.2 + Math.random()));
          const sp = this.surfacePoint(off.add(s.gridPos));
          if (!sp) continue;
          planet.debrisColor(sp.x, sp.y, sp.z, this.tmpColor);
          const w = planet.gridToWorld(sp, new THREE.Vector3());
          const v = w.clone().normalize().multiplyScalar(0.4).addScaledVector(s.pos.clone().sub(w).normalize(), 0.3);
          this.debris.spawn(w, v, VOXEL * (0.3 + Math.random() * 0.7), this.tmpColor, 0.3, 4);
        }
        this.rig.shake(0.012);
      }
      if (s.age >= s.duration) {
        sfx.singularityCollapse();
        this.flashes.spawn(s.pos, 8.5, 0xffffff, 0.7);
        this.flashes.spawn(s.pos, 14, 0xb040ff, 1.2);
        const norm = s.pos.clone().normalize();
        this.rings.spawn(this.scene, s.pos, norm, 24, 0xc050ff, 2.2);
        if (planet && !this.destroyed) {
          planet.carve(s.gridPos.x, s.gridPos.y, s.gridPos.z, 15, 0.4);
          planet.addHeat(s.gridPos.x, s.gridPos.y, s.gridPos.z, 22, 1.8);
        }
        this.rig.shake(0.9);
        s.group.removeFromParent();
        this.singularities.splice(i, 1);
      }
    }
    this.debris.attractors = this.singularities.map(s => ({ x: s.pos.x, y: s.pos.y, z: s.pos.z, strength: 1.2 }));
  }

  /** Explosion at grid point g. Frozen ground shatters into a much bigger crater. */
  private impact(g: THREE.Vector3, s: ImpactSpec, proj?: ProjectileSpec): void {
    const planet = this.planet;
    if (!planet) return;
    const frozen = planet.coldAt(g.x, g.y, g.z, Math.max(2, s.crater * 0.6)) < -0.4;
    const crater = frozen ? s.crater * 1.7 : s.crater;
    const res = planet.carve(g.x, g.y, g.z, crater);
    planet.addHeat(g.x, g.y, g.z, crater * s.heatRadius, s.heat);
    this.population?.blast(g.x, g.y, g.z, crater * 1.2);

    const world = planet.gridToWorld(g, new THREE.Vector3());
    const normal = world.clone().normalize();
    const local = g.clone().subScalar(CENTER).multiplyScalar(VOXEL);
    const localNormal = local.clone().normalize();

    this.impactLight.position.copy(world).addScaledVector(normal, 0.45);
    const lightCol = proj?.isKinetic ? 0x60e8ff : s.boom > 0.6 ? 0xffdfb0 : 0xff7722;
    this.impactLight.color.set(lightCol);
    this.impactLight.intensity = Math.min(10, 2 + s.boom * 8);

    this.flashes.spawn(world.clone().addScaledVector(normal, 0.05), s.flash, 0xffe0b0, 0.35 + s.boom * 0.5);
    this.flashes.spawn(world, s.flash * 0.6, 0xff6a20, 0.8 + s.boom);
    if (s.shockwave > 0) {
      this.rings.spawn(planet.group, local, localNormal, s.shockwave * VOXEL * 1.1, s.shockKill ? 0xfff0a0 : 0xffc070, 1.4 + s.boom);
      this.shockwaves.push({
        cx: g.x, cy: g.y, cz: g.z, maxR: s.shockwave, t: 0, dur: 1.2 + s.boom * 1.2, tick: 0,
        heat: s.shockHeat ?? 0.16, kill: !!s.shockKill,
      });
    }

    // Fire burst (hemisphere around the surface normal)
    for (let k = 0; k < s.fire; k++) {
      const v = this.randomHemisphere(normal, 0.85);
      const sp = (0.2 + Math.random() * 0.9) * (0.4 + s.boom * 1.4);
      const hot = Math.random();
      this.particles.spawn({
        x: world.x, y: world.y, z: world.z,
        vx: v.x * sp, vy: v.y * sp, vz: v.z * sp,
        r: 1, g: 0.35 + hot * 0.5, b: 0.08 + hot * 0.15,
        size: (0.05 + Math.random() * 0.12) * (0.6 + s.boom * 1.5),
        life: 0.4 + Math.random() * (0.6 + s.boom), drag: 2.4, gravity: 0.3, grow: 1.8,
      });
    }

    // Rock debris scaled by how much was actually removed.
    const n = Math.min(s.debris, Math.round(res.removed / 4) + 3);
    for (let k = 0; k < n; k++) {
      const v = this.randomHemisphere(normal, 0.6);
      const sp = s.debrisSpeed * (0.3 + Math.random() * 0.8);
      const off = this.tmpA.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(crater * 0.8);
      planet.debrisColor(g.x + off.x, g.y + off.y, g.z + off.z, this.tmpColor);
      const pos = world.clone().addScaledVector(normal, 0.03);
      this.debris.spawn(pos, v.multiplyScalar(sp), VOXEL * (0.2 + Math.random() * Math.random() * 1.2) * (0.55 + s.boom * 0.6), this.tmpColor, 0.4 + Math.random() * 0.8);
    }

    if (frozen) this.shatterFx(world, normal, crater);
    if (proj?.lava) this.lavaPools.push({ g: g.clone(), t: 0, dur: proj.lava.duration, radius: proj.lava.radius, tick: 0 });
    if (proj?.ejecta) this.throwEjecta(g, proj.ejecta);
    if (proj?.lance) {
      const dir = new THREE.Vector3(CENTER, CENTER, CENTER).sub(g);
      const depth = dir.length() * proj.lance.depth;
      this.lances.push({ g: g.clone(), dir: dir.normalize(), depth, progress: 0, carved: 0, radius: proj.lance.radius, cavity: proj.lance.cavity });
    }

    this.clouds?.punch(world, (crater * (1.4 + s.boom)) / RADIUS_VOX);
    this.rig.shake(s.shake);
    sfx.explosion(s.boom);
  }

  /** Ice shards, a cold flash and a callout when frozen ground breaks. */
  private shatterFx(world: THREE.Vector3, normal: THREE.Vector3, size: number): void {
    for (let k = 0; k < 90; k++) {
      const v = this.randomHemisphere(normal, 1.0);
      const sp = 0.5 + Math.random() * 1.6;
      this.particles.spawn({
        x: world.x, y: world.y, z: world.z, vx: v.x * sp, vy: v.y * sp, vz: v.z * sp,
        r: 0.6, g: 0.92, b: 1, size: 0.04 + Math.random() * 0.08, life: 0.5 + Math.random() * 0.6, drag: 1.6, gravity: 0.4,
      });
    }
    const ice = new THREE.Color().setRGB(0.75, 0.92, 1);
    for (let k = 0; k < 24; k++) {
      const v = this.randomHemisphere(normal, 0.8).multiplyScalar(0.6 + Math.random());
      this.debris.spawn(world.clone().addScaledVector(normal, 0.04), v, VOXEL * (0.3 + Math.random() * 0.8) * Math.min(2, size / 5), ice, 0, 5);
    }
    this.flashes.spawn(world, Math.min(4, size * 0.25), 0x9ae8ff, 0.4);
    sfx.freezeBurst();
    const now = performance.now();
    if (now - this.shatterCalloutAt > 900) {
      this.shatterCalloutAt = now;
      this.events.onCallout?.('SHATTER!');
    }
  }

  /** Plasma Mortar lava: keeps burning, melts a basin and spreads for a few seconds. */
  private updateLava(dt: number): void {
    const planet = this.planet;
    for (let i = this.lavaPools.length - 1; i >= 0; i--) {
      const L = this.lavaPools[i];
      L.t += dt;
      L.tick -= dt;
      if (!planet || this.destroyed || L.t >= L.dur) { this.lavaPools.splice(i, 1); continue; }
      const grow = Math.min(1, L.t / (L.dur * 0.6));
      const r = L.radius * (0.35 + 0.65 * grow);
      if (L.tick <= 0) {
        L.tick = 0.12;
        planet.addHeat(L.g.x, L.g.y, L.g.z, r, 0.45);
        planet.carve(L.g.x, L.g.y, L.g.z, r * 0.42, 0.6);
        this.population?.blast(L.g.x, L.g.y, L.g.z, r * 0.9);
      }
      // Bubbling sparks across the pool.
      const w = planet.gridToWorld(L.g, this.tmpA);
      const n = this.tmpB.copy(w).normalize();
      for (let k = 0; k < 2; k++) {
        const off = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
        off.addScaledVector(n, -off.dot(n)).normalize().multiplyScalar(Math.random() * r * VOXEL);
        const v = this.randomHemisphere(n, 0.5).multiplyScalar(0.15 + Math.random() * 0.3);
        this.particles.spawn({
          x: w.x + off.x, y: w.y + off.y, z: w.z + off.z, vx: v.x, vy: v.y, vz: v.z,
          r: 1, g: 0.45 + Math.random() * 0.3, b: 0.1, size: 0.05 + Math.random() * 0.07,
          life: 0.5 + Math.random() * 0.4, drag: 1.2, gravity: 0.25, grow: 1.5,
        });
      }
    }
  }

  private randomHemisphere(n: THREE.Vector3, spread: number): THREE.Vector3 {
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    if (v.dot(n) < 0) v.negate();
    return v.multiplyScalar(spread).add(n).normalize();
  }

  private updateBeam(dt: number): void {
    const spec = this.weapon.beam;
    const planet = this.planet;
    if (!spec || !this.firing || !planet || this.destroyed) { this.beam.hide(); return; }
    // Nova Beam: grows wider, hotter and whiter the longer it is held.
    this.beamHold += dt;
    let radius = spec.drillRadius, width = spec.width;
    let charge = 0;
    if (spec.charge) {
      const k = Math.min(1, this.beamHold / spec.charge.time);
      charge = k * k * (3 - 2 * k);
      radius += (spec.charge.maxRadius - radius) * charge;
      width += (spec.charge.maxWidth - width) * charge;
      this.beam.setColor(this.tmpColor.set(spec.color).lerp(this.tmpColor2.set(spec.charge.endColor), charge));
      this.rig.shake(0.012 * charge);
    }
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const ray = this.raycaster.ray;
    // Emitter sits off-screen to the upper right of the view.
    const right = this.tmpA.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const up = this.tmpB.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const from = this.camera.position.clone().addScaledVector(right, 2.2).addScaledVector(up, 1.6)
      .addScaledVector(ray.direction, 0.8);
    let hitG = planet.raycast(ray.origin, ray.direction, new THREE.Vector3());
    if (!hitG) {
      this.beam.show(from, ray.origin.clone().addScaledVector(ray.direction, 30), width, dt);
      return;
    }
    // Drill along the beam direction (in grid space). Each carve bites about a voxel
    // deeper, so carve on a fixed 60 Hz step: same drilling speed at any frame rate,
    // and slow motion slows it down.
    const dirG = planet.worldToGrid(ray.origin.clone().add(ray.direction), new THREE.Vector3())
      .sub(planet.worldToGrid(ray.origin, new THREE.Vector3())).normalize();
    const STEP = 1 / 60;
    this.beamAcc = Math.min(this.beamAcc + dt, STEP * 4);
    let frozenHit = false;
    while (hitG && this.beamAcc >= STEP) {
      this.beamAcc -= STEP;
      let r = radius;
      // Burning beams slice through frozen ground far faster.
      if (!spec.isCryo && planet.coldAt(hitG.x, hitG.y, hitG.z, r) < -0.4) { r *= 1.8; frozenHit = true; }
      if (spec.drillRate > 0) {
        const adv = spec.drillRate * STEP;
        const c = hitG.clone().addScaledVector(dirG, adv - r * 0.7);
        planet.carve(c.x, c.y, c.z, r, 0.15);
      }
      if (spec.isCryo) {
        planet.freeze(hitG.x, hitG.y, hitG.z, r * 2.8, 3.2 * STEP * 6);
      } else {
        planet.addHeat(hitG.x, hitG.y, hitG.z, r * 2.2, spec.heat * STEP * 6);
      }
      this.population?.blast(hitG.x, hitG.y, hitG.z, r * 1.2);
      if (this.beamAcc >= STEP) hitG = planet.raycast(ray.origin, ray.direction, hitG) ?? null;
    }
    if (!hitG) {
      this.beam.show(from, ray.origin.clone().addScaledVector(ray.direction, 30), width, dt);
      return;
    }

    const hitW = planet.gridToWorld(hitG, new THREE.Vector3());
    this.beam.show(from, hitW, width, dt);
    const normal = hitW.clone().normalize();
    if (frozenHit && performance.now() - this.beamShatterAt > 220) {
      this.beamShatterAt = performance.now();
      this.shatterFx(hitW, normal, radius * 1.8);
    }
    // Sparks + molten spatter or frost crystals
    const scale = 1 + charge * 2;
    const bc = this.tmpColor.set(spec.color);
    if (spec.isCryo) {
      for (let k = 0; k < 3; k++) {
        const v = this.randomHemisphere(normal, 1.2);
        const sp = 0.3 + Math.random() * 0.7;
        this.particles.spawn({
          x: hitW.x, y: hitW.y, z: hitW.z, vx: v.x * sp, vy: v.y * sp, vz: v.z * sp,
          r: 0.5, g: 0.9, b: 1.0, size: 0.04 + Math.random() * 0.05,
          life: 0.3 + Math.random() * 0.3, drag: 1.8, gravity: 0.2,
        });
      }
      this.particles.spawn({ x: hitW.x, y: hitW.y, z: hitW.z, vx: 0, vy: 0, vz: 0, r: 0.6, g: 0.95, b: 1.0, size: 0.32, life: 0.08 });
      if (Math.random() < 0.12) sfx.freezeBurst();
    } else {
      for (let k = 0; k < 3 + Math.round(charge * 5); k++) {
        const v = this.randomHemisphere(normal, 1.2);
        const sp = (0.4 + Math.random() * 0.8) * scale;
        this.particles.spawn({
          x: hitW.x, y: hitW.y, z: hitW.z, vx: v.x * sp, vy: v.y * sp, vz: v.z * sp,
          r: 1, g: 0.5 + Math.random() * 0.4, b: 0.2, size: (0.03 + Math.random() * 0.05) * scale,
          life: 0.25 + Math.random() * 0.4, drag: 1.5, gravity: 0.6,
        });
      }
      this.particles.spawn({ x: hitW.x, y: hitW.y, z: hitW.z, vx: 0, vy: 0, vz: 0, r: bc.r, g: bc.g * 0.6 + 0.3, b: bc.b * 0.6 + 0.2, size: 0.3 * scale, life: 0.08 });
    }
    this.beamHitTimer -= dt;
    if (this.beamHitTimer <= 0) {
      this.beamHitTimer = 0.07;
      if (spec.drillRate > 0) {
        planet.debrisColor(hitG.x, hitG.y, hitG.z, this.tmpColor);
        const v = this.randomHemisphere(normal, 0.7).multiplyScalar((0.5 + Math.random() * 0.6) * scale);
        this.debris.spawn(hitW.clone().addScaledVector(normal, 0.04), v, VOXEL * (0.2 + Math.random() * 0.4) * scale, this.tmpColor, 1.2, 4);
      }
      this.clouds?.punch(hitW, 0.05 * scale);
    }
    this.rig.shake(0.004);
  }

  // ----------------------------------------------------------
  // Destruction
  // ----------------------------------------------------------
  private destroyPlanet(): void {
    const planet = this.planet;
    if (!planet || this.destroyed) return;
    this.destroyed = true;
    this.stopFiring();
    const killedBefore = this.population?.killed ?? 0;
    this.population?.killAll();

    this.shatter = new Shatter(planet, planet.material);
    this.scene.add(this.shatter.group);
    planet.group.visible = false;
    this.clouds?.mesh.removeFromParent();
    if (this.atmosphere) this.atmosphere.visible = false;
    if (this.planetRings) this.planetRings.visible = false;

    this.flashes.spawn(new THREE.Vector3(), 12, 0xfff4e0, 0.9);
    this.flashes.spawn(new THREE.Vector3(), 7, 0xff7a20, 2.2);
    this.flashes.spawn(new THREE.Vector3(), 18, 0xffa060, 1.4);
    for (let k = 0; k < 1600; k++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      const sp = 0.6 + Math.random() * 3.2;
      const r = Math.random() * WORLD_RADIUS;
      const hot = Math.random();
      this.particles.spawn({
        x: v.x * r, y: v.y * r, z: v.z * r, vx: v.x * sp, vy: v.y * sp, vz: v.z * sp,
        r: 0.9, g: 0.25 + hot * 0.5, b: 0.04 + hot * 0.2, size: 0.06 + Math.random() * 0.22,
        life: 0.8 + Math.random() * 2, drag: 0.8, grow: 1.8,
      });
    }
    const c = new THREE.Color();
    for (let k = 0; k < 500; k++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      const pos = v.clone().multiplyScalar(WORLD_RADIUS * (0.6 + Math.random() * 0.4));
      const gp = planet.worldToGrid(pos, new THREE.Vector3());
      planet.debrisColor(gp.x, gp.y, gp.z, c);
      this.debris.spawn(pos, v.multiplyScalar(0.8 + Math.random() * 2.4), VOXEL * (0.3 + Math.random() * 1.8), c, 1.5, 14);
    }
    this.debris.gravity = 0.4;
    const toCam = this.camera.position.clone().normalize();
    this.rings.spawn(this.scene, new THREE.Vector3(), toCam, WORLD_RADIUS * 5, 0xffb070, 3.2);
    this.rig.shake(1.2);
    this.rig.zoom(1.6);
    sfx.explosion(1);
    setTimeout(() => sfx.explosion(0.7), 180);

    const bonus = 150;
    this.awardXp(bonus);
    const killed = this.population?.total ?? killedBefore;
    // Skip the results if the player rebuilt or switched planets during the break-up.
    const gen = this.planetGen;
    setTimeout(() => {
      if (gen !== this.planetGen) return;
      this.events.onPlanetDestroyed?.({ planet: this.planetDef, killed, xp: this.xpEarned, shots: this.shotsThisPlanet });
    }, 2600);
    this.emitStats();
  }

  /** Superweapon-style instant destruction (used by debug / future weapons). */
  forceDestroy(): void { this.destroyPlanet(); }

  private awardXp(amount: number): void {
    if (amount < 0.5) return;
    this.xpEarned += amount;
    this.events.onXp?.(amount);
  }

  // ----------------------------------------------------------
  // Loop
  // ----------------------------------------------------------
  start(): void {
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private frame(): void {
    this.clock.update();
    const rawDt = Math.min(0.05, this.clock.getDelta());
    const dt = this.paused ? 0 : rawDt * this.timeScale;

    this.rig.update(rawDt);
    const planet = this.planet;

    if (!this.paused) {
      if (planet && !this.destroyed && this.spin) planet.group.rotation.y += dt * 0.05;
      if (this.clouds) this.clouds.mesh.rotation.y += dt * 0.012;

      this.cooldown -= dt;
      if (this.firing && this.weapon.projectile && this.cooldown <= 0) this.fireProjectile();
      this.updateBeam(dt);
      this.updateProjectiles(dt);
      this.updateSingularities(dt);
      this.updateLava(dt);
      this.updateLances(dt);
      this.impactLight.intensity *= Math.exp(-dt * 8);

      // Shockwave fire fronts
      for (let i = this.shockwaves.length - 1; i >= 0; i--) {
        const s = this.shockwaves[i];
        s.t += dt;
        s.tick -= dt;
        if (s.tick <= 0 && planet) {
          s.tick = 0.07;
          const k = Math.min(1, s.t / s.dur);
          const r = s.maxR * (1 - Math.pow(1 - k, 2));
          planet.heatRing(s.cx, s.cy, s.cz, r, 2.0, s.heat * (1 - k * 0.8));
          if (s.kill && !this.destroyed) this.population?.blast(s.cx, s.cy, s.cz, r);
        }
        if (s.t >= s.dur) this.shockwaves.splice(i, 1);
      }

      if (planet && !this.destroyed) {
        planet.update(dt);
        this.population?.update(dt);
        // XP: mass destroyed and population lost.
        const integ = planet.integrity;
        if (this.lastIntegrity - integ > 0.002) {
          this.awardXp((this.lastIntegrity - integ) * 300);
          this.lastIntegrity = integ;
        }
        const pop = this.population;
        if (pop && pop.total > 0) {
          const share = pop.killed / pop.total;
          if (share - this.lastKilledShare > 0.004) {
            this.awardXp((share - this.lastKilledShare) * 120);
            this.lastKilledShare = share;
          }
        }
        const h = Math.max(0, Math.min(1, (integ - 0.6) / 0.38));
        this.clouds?.setHealth(h);
        if (this.atmosphere) (this.atmosphere.material as THREE.ShaderMaterial).uniforms.uStrength.value = this.atmoStrength * (0.3 + 0.7 * h);
        if (planet.coreIntegrity < 0.8 || integ < 0.6) this.destroyPlanet();
      }
      this.shatter?.update(dt);
      this.particles.update(dt);
      this.debris.update(dt);
      this.flashes.update(dt);
      this.rings.update(dt);

      this.statsTimer -= rawDt;
      if (this.statsTimer <= 0) { this.statsTimer = 0.15; this.emitStats(); }
    }

    this.composer.render();
  }

  private emitStats(): void {
    const pop = this.population;
    this.events.onStats?.({
      population: this.destroyed ? 0 : pop?.remaining ?? 0,
      total: pop?.total ?? 0,
      health: this.destroyed ? 0 : this.health,
    });
  }

  /**
   * 1 = intact, 0 = about to break apart. The planet breaks at 60 % mass OR 80 % core,
   * so the bar follows whichever is closer to its limit.
   */
  get health(): number {
    const p = this.planet;
    if (!p) return 1;
    const mass = (p.integrity - 0.6) / 0.4;
    const core = (p.coreIntegrity - 0.8) / 0.2;
    return Math.max(0, Math.min(1, mass, core));
  }

  private resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    // Keep the planet framed on tall (portrait) screens.
    this.camera.fov = w < h ? 55 : 45;
    this.camera.updateProjectionMatrix();
    // Fit the planet (plus atmosphere and a margin) inside the narrower field of view.
    const vHalf = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    const fit = (WORLD_RADIUS * 1.25) / Math.sin(Math.min(vHalf, hHalf));
    const prevBase = this.rig.baseDist;
    this.rig.baseDist = Math.max(7.2, fit);
    if (Math.abs(prevBase - this.rig.baseDist) > 0.01) this.rig.zoom(this.rig.baseDist / prevBase);
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.setSize(w / 2, h / 2);
    this.particles.setViewportHeight(h);
    this.population?.setViewportHeight(h);
  }

  /** Called when the game must be silent and still (ads). */
  setPaused(p: boolean): void {
    this.paused = p;
    if (p) this.stopFiring();
  }

  get xpThisPlanet(): number { return this.xpEarned; }
}
