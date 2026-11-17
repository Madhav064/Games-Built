// Core game: scene, input, weapons, impacts, planet lifecycle.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { VoxelPlanet, VOXEL, WORLD_RADIUS, RADIUS_VOX, CENTER } from '../engine/voxelPlanet';
import { PLANETS, type PlanetDef } from '../engine/planets';
import { planetData } from '../engine/planetCache';
import { CloudLayer, createAtmosphere, createRings, createStarfield, createSun } from '../engine/scenery';
import { Beam, Debris, Flashes, Particles, Rings } from '../engine/effects';
import { Shatter } from '../engine/shatter';
import { Population } from './population';
import { CameraRig } from './cameraRig';
import { WEAPONS, weaponById, type ImpactSpec, type ProjectileSpec, type WeaponDef } from './weapons';
import * as sfx from '../audio/sfx';
import { Orbiters, type Orbiter, type OrbiterKind } from './orbiters';
import { SleeperCharges } from './charges';
import { CivilianShips } from './civilians';
import { Defences, SHIELD_R, type DefenceKind } from './defences';

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
  /** Aimed at an orbiting target instead of the surface. */
  orbiter: Orbiter | null;
  /** Planet defences may shoot it down (not black holes, lances or the planet's own ejecta). */
  interceptable: boolean;
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
  impact: { crater: 3, heatRadius: 1.6, heat: 1.2, debris: 8, debrisSpeed: 0.8, fire: 40, flash: 1.0, shockwave: 0, shake: 0.05, boom: 0.12, stability: 0.004 },
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
  /** Results time, ~2.6 s after the break-up starts (skipped if the player moves on first). */
  onPlanetDestroyed?: (s: { planet: PlanetDef; killed: number; xp: number; shots: number }) => void;
  /** The moment a planet breaks apart: `seconds` of play it took. */
  onPlanetBroken?: (s: { planet: PlanetDef; seconds: number }) => void;
  onPlanetLoaded?: (p: PlanetDef) => void;
  onShotFired?: () => void;
  /** Fire has been held down for a moment with this weapon (once per press). */
  onFireHeld?: (weaponId: string) => void;
  /** Reload progress of slow weapons: 1 = just fired, 0 = ready. */
  onCooldown?: (fraction: number) => void;
  /** Frozen ground shattered (at most about once a second). */
  onShatter?: () => void;
  /** An orbiting target was shot down. */
  onOrbiterDown?: (kind: OrbiterKind) => void;
  /** Big centre-screen callout, e.g. "SHATTER!". */
  onCallout?: (text: string) => void;
  /** Number of Sleeper Charges waiting in the ground changed. */
  onChargesChanged?: (count: number) => void;
  /** A civilian ship was destroyed. */
  onShipDown?: () => void;
  /** A defence was knocked out (or the shield broke). */
  onDefenceDown?: (kind: DefenceKind) => void;
  /** Shield strength 0..1, or null when the planet has no shield. */
  onShield?: (level: number | null) => void;
}

const SUN_DIR = new THREE.Vector3(1, 0.3, -0.3).normalize();

// Fixed launch spots in camera space (world units right / up / forward from the camera).
/** Beams and Core Lance: just off the bottom-right edge of the screen. */
const BEAM_EMITTER = { right: 2.0, up: -1.5, fwd: 0.8 };
/** Missiles, Mortar, Nuke, Splitter: just behind and below the camera, so shots rise in from the bottom. */
const LAUNCH_BEHIND = { right: 0.45, up: -0.8, fwd: -0.4 };
/** Asteroid, Meteor Storm: above the top of the screen. */
const LAUNCH_ABOVE = { right: 0.6, up: 3.2, fwd: 2.2 };

/** Bloom tuning. Kept subtle: strong bloom washes the screen out during big impacts. */
const GLOW = { bloomStrength: 0.38, bloomRadius: 0.35, bloomThreshold: 0.9 };

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
  private orbiters: Orbiters | null = null;
  private charges: SleeperCharges | null = null;
  private ships: CivilianShips | null = null;
  private defences: Defences | null = null;
  private lastShield: number | null = -1;
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
  /** Seconds fire has been held this press (-1 once onFireHeld has been sent). */
  private holdTime = 0;
  private lastCooldown = 0;
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
  /** 1 = steady, 0 = breaks apart. Every hit drains it (see `stability` in weapons.ts). */
  private stability = 1;
  /** Stability drain multiplier (2 on a brand-new player's first planet). */
  private stabilityScale = 1;
  /** Real seconds of unpaused play on the current planet (for timed missions). */
  planetTime = 0;
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
      this.clouds = new CloudLayer(WORLD_RADIUS * 1.035, def.clouds, planetData(def).clouds!);
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
    this.orbiters = new Orbiters(def);
    this.scene.add(this.orbiters.group);
    this.charges = new SleeperCharges(planet.group);
    this.charges.onCountChanged = n => this.events.onChargesChanged?.(n);
    if (def.civilianShips) {
      this.ships = new CivilianShips(def.civilianShips);
      this.scene.add(this.ships.group);
    }
    if (def.defences) {
      const sites = this.defenceSites(Defences.sitesNeeded(def.defences));
      this.defences = new Defences(planet.group, def.defences, sites, (g, out) => planet.gridToWorld(g, out));
      this.scene.add(this.defences.group);
      this.defences.onDown = (kind, at) => this.defenceDown(kind, at);
      this.defences.onIntercept = (t, at) => {
        const i = this.projectiles.indexOf(t as Projectile);
        if (i < 0) return;
        this.removeProjectile(i);
        this.flashes.spawn(at, 0.55, 0xffe0a0, 0.25);
        for (let k = 0; k < 12; k++) {
          const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(0.3 + Math.random() * 0.5);
          this.particles.spawn({ x: at.x, y: at.y, z: at.z, vx: v.x, vy: v.y, vz: v.z, r: 1, g: 0.8, b: 0.5, size: 0.03 + Math.random() * 0.03, life: 0.3 + Math.random() * 0.3, drag: 1.8 });
        }
        sfx.explosion(0.06);
      };
    }
    this.lastShield = -1;
    this.lastIntegrity = 1;
    this.stability = 1;
    this.planetTime = 0;
    this.flareTimer = 1.5;
    this.updateStabilityScale();
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
    this.orbiters?.dispose();
    this.orbiters = null;
    this.charges?.dispose();
    this.charges = null;
    this.ships?.dispose();
    this.ships = null;
    this.defences?.dispose();
    this.defences = null;
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

  /** Stop all input-driven effects (menus opened over the game). */
  setInputEnabled(on: boolean): void {
    this.inputEnabled = on;
    if (!on) this.stopFiring();
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
        this.stopFiring(true);
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

  /** `release`: the player let go, so a beam shrinks away; otherwise (menus, pause) it vanishes. */
  stopFiring(release = false): void {
    this.firing = false;
    this.holdTime = 0;
    this.beamAcc = 0;
    this.beamHold = 0;
    if (release) this.beam.release(); else this.beam.hide();
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
  /** An orbiter under the pointer that's in front of the planet, if any. */
  private aimOrbiter(): Orbiter | null {
    if (!this.orbiters || !this.planet) return null;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const ray = this.raycaster.ray;
    const o = this.orbiters.raycast(ray.origin, ray.direction);
    if (!o) return null;
    const g = this.planet.raycast(ray.origin, ray.direction, this.tmpA);
    if (g && this.planet.gridToWorld(g, this.tmpB).distanceTo(ray.origin) < o.dist) return null;
    return o.orbiter;
  }

  private fireProjectile(): void {
    const spec = this.weapon.projectile!;
    const planet = this.planet;
    if (!planet) return;
    // Clicked a satellite or moon: send the shot at it instead of the ground.
    const orbiter = this.aimOrbiter();
    if (orbiter) {
      this.cooldown = spec.cooldown;
      const start = this.launchPoint(spec, orbiter.pos);
      const vel = orbiter.pos.clone().sub(start).normalize().multiplyScalar(spec.speed);
      this.launch(spec, spec.impact, start, vel, planet.worldToGrid(orbiter.pos, new THREE.Vector3()), { orbiter, homing: 10 });
      sfx.launch(spec.split ? 'split' : spec.model, spec.size > 0.2);
      this.shotsThisPlanet++;
      this.events.onShotFired?.();
      return;
    }
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
      // Every shot of a weapon leaves from the same spot relative to the camera.
      const lob = (spec.homing ?? 6) < 3;
      const start = this.launchPoint(spec, targetWorld);
      const vel = targetWorld.clone().sub(start).normalize();
      // Lobbed shots leave upward and curve down onto the target.
      if (lob) vel.addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion), 1.1).normalize();
      // Waypoint on the camera ray above the target (grid space, so it turns with the planet).
      const toCamG = planet.worldToGrid(this.camera.position, new THREE.Vector3()).sub(target).normalize();
      const approach = target.clone().addScaledVector(toCamG, lob ? 20 : 12);
      this.launch(spec, spec.impact, start, vel.multiplyScalar(spec.speed), target, { canSplit: !!spec.split, approach });
    }
    sfx.launch(spec.split ? 'split' : spec.model, spec.size > 0.2);
    this.shotsThisPlanet++;
    this.events.onShotFired?.();
  }

  /** Where a shot starts (world space), fixed relative to the camera per weapon (see `ProjectileSpec.launch`). */
  private launchPoint(spec: ProjectileSpec, targetWorld: THREE.Vector3): THREE.Vector3 {
    const cam = this.camera;
    if (spec.launch === 'surface') {
      // Appears just above the tapped spot.
      return targetWorld.clone().addScaledVector(cam.position.clone().sub(targetWorld).normalize(), 0.9);
    }
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const o = spec.launch === 'edge' ? BEAM_EMITTER : spec.launch === 'above' ? LAUNCH_ABOVE : LAUNCH_BEHIND;
    const p = cam.position.clone().addScaledVector(right, o.right).addScaledVector(up, o.up).addScaledVector(fwd, o.fwd);
    // Spread weapons (Meteor Storm) come from a small patch around the spot, so the rain isn't one line.
    if (spec.spread > 0) p.addScaledVector(right, (Math.random() - 0.5) * 1.4).addScaledVector(fwd, (Math.random() - 0.5) * 1.4);
    return p;
  }

  private launch(
    spec: ProjectileSpec, impact: ImpactSpec, start: THREE.Vector3, vel: THREE.Vector3, target: THREE.Vector3,
    o: { homing?: number; canSplit?: boolean; armAt?: number; size?: number; approach?: THREE.Vector3; orbiter?: Orbiter } = {},
  ): void {
    const mesh = this.makeProjectileMesh(spec.model, o.size ?? spec.size);
    mesh.position.copy(start);
    this.scene.add(mesh);
    this.projectiles.push({
      spec, impact, mesh, pos: start.clone(), vel: vel.clone(), target: target.clone(), trailTimer: 0, age: 0,
      homing: o.homing ?? spec.homing ?? 6, armAt: o.armAt ?? 0, canSplit: o.canSplit ?? false,
      approach: o.approach?.clone() ?? null,
      orbiter: o.orbiter ?? null,
      interceptable: spec !== EJECTA_SPEC && !spec.isBlackHole && !spec.isKinetic,
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

  /** `n` well-spread surface points on land (grid coords) for defence sites. */
  private defenceSites(n: number): THREE.Vector3[] {
    const planet = this.planet!;
    const out: THREE.Vector3[] = [];
    const dirs: THREE.Vector3[] = [];
    const tmp = new Float32Array(3);
    const c = new THREE.Vector3(CENTER, CENTER, CENTER);
    for (let minAngle = 0.7; out.length < n && minAngle > 0.05; minAngle *= 0.7) {
      for (let tries = 0; tries < 600 && out.length < n; tries++) {
        const v = new THREE.Vector3(Math.random() * 2 - 1, (Math.random() * 2 - 1) * 0.8, Math.random() * 2 - 1).normalize();
        if (!planet.surface.sample(v.x, v.y, v.z, tmp)) continue;
        if (dirs.some(d => d.angleTo(v) < minAngle)) continue;
        const g = this.surfacePoint(c.clone().addScaledVector(v, RADIUS_VOX));
        if (!g) continue;
        dirs.push(v);
        out.push(g);
      }
    }
    return out;
  }

  /** A defence was knocked out: a burst of sparks, a bang, and the reward. */
  private defenceDown(kind: DefenceKind, at: THREE.Vector3): void {
    if (kind === 'shield') {
      this.flashes.spawn(new THREE.Vector3(), SHIELD_R * 2.4, 0x60e0ff, 0.6);
      this.rings.spawn(this.scene, new THREE.Vector3(), this.camera.position.clone().normalize(), SHIELD_R * 1.3, 0x80e8ff, 1.2);
      sfx.crack();
      this.events.onCallout?.('SHIELD DOWN!');
    } else {
      this.flashes.spawn(at, kind === 'satellite' ? 0.8 : 1.1, 0xffd090, 0.35);
      for (let k = 0; k < 24; k++) {
        const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(0.3 + Math.random());
        this.particles.spawn({ x: at.x, y: at.y, z: at.z, vx: v.x, vy: v.y, vz: v.z, r: 1, g: 0.6 + Math.random() * 0.3, b: 0.3, size: 0.03 + Math.random() * 0.05, life: 0.4 + Math.random() * 0.4, drag: 1.5 });
      }
      sfx.explosion(0.2);
    }
    this.rig.shake(kind === 'shield' ? 0.3 : 0.08);
    this.events.onDefenceDown?.(kind);
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
      new THREE.MeshStandardMaterial({ color: model === 'missile' ? 0xe8e8ec : 0x3a3d44, metalness: 0.5, roughness: 0.4 }),
    );
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(size * 0.18, size * 0.35, 8),
      new THREE.MeshStandardMaterial({ color: model === 'warhead' ? 0xd8c020 : model === 'charge' ? 0xff2a4a : 0xd23b3b, metalness: 0.3, roughness: 0.5 }),
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
      // Its orbiting target was destroyed by something else: fizzle out.
      if (p.orbiter && !p.orbiter.alive) {
        this.flashes.spawn(p.pos, 0.3, 0xffc080, 0.2);
        this.removeProjectile(i);
        continue;
      }
      // Home in on the (rotating) target point, via the line-of-sight waypoint first.
      const targetWorld = p.orbiter ? this.tmpA.copy(p.orbiter.pos) : planet.gridToWorld(p.target, this.tmpA);
      const remaining = targetWorld.distanceTo(p.pos);
      if (!p.orbiter && p.canSplit && spec.split && remaining < 1.3) {
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
      let hitOrbiter: Orbiter | null = null;
      let absorbed = false;
      let hitSat: ReturnType<Defences['nearSatellite']> = null;
      const armed = p.age >= p.armAt;
      const steps = Math.max(1, Math.ceil(step / (VOXEL * 1.5)));
      const shieldUp = this.defences?.shieldUp ?? false;
      for (let s = 0; s < steps; s++) {
        const prevR = p.pos.length();
        p.pos.addScaledVector(p.vel, dt / steps);
        // Crossing a planetary shield from outside: it soaks up the shot.
        if (shieldUp && prevR >= SHIELD_R && p.pos.length() < SHIELD_R) { absorbed = true; break; }
        // Anything passing close to a satellite or moon clips it.
        if (armed && this.orbiters && (hitOrbiter = this.orbiters.near(p.pos, 0.03))) break;
        if (armed && this.defences && (hitSat = this.defences.nearSatellite(p.pos, 0.02))) break;
        if (armed && planet.isSolidWorld(p.pos, this.tmpC)) { hit = true; break; }
      }
      if (p.orbiter) {
        if (!hitOrbiter && remaining < p.orbiter.radius + step) hitOrbiter = p.orbiter;
      } else if (armed && remaining < step) hit = true;
      // Shots plough straight through civilian ships.
      if (this.ships && armed) for (const at of this.ships.blast(p.pos, 0.07)) this.shipDown(at);
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
      if (absorbed) {
        // Big shots hit the shield harder; a black hole or asteroid breaks it outright.
        this.defences!.shieldHit(p.pos, Math.max(8, p.impact.stability * 1200));
        this.flashes.spawn(p.pos, 0.6 + p.impact.boom, 0x9ff0ff, 0.25);
        sfx.explosion(0.05 + p.impact.boom * 0.3);
        this.removeProjectile(i);
        continue;
      }
      if (hitSat) {
        this.defences!.hitSatellite(hitSat, spec.isBlackHole || spec.impact.stability >= 0.02 ? 9 : 1);
        this.flashes.spawn(p.pos, 0.4, 0xffd6a0, 0.2);
        this.removeProjectile(i);
        continue;
      }
      if (hitOrbiter) {
        this.orbiterHit(hitOrbiter, spec.isBlackHole || spec.impact.stability >= 0.05 ? 99 : 1, p.pos);
        this.removeProjectile(i);
        continue;
      }
      if (hit) {
        // Close to the target: detonate exactly on it (sub-steps can stop a few voxels short).
        const g = remaining < 0.25 ? p.target.clone() : planet.worldToGrid(p.pos, new THREE.Vector3());
        if (spec.isBlackHole) this.spawnSingularity(p.pos.clone(), g);
        else if (spec.sleeper && this.charges?.plant(g)) this.chargePlanted(p.pos);
        else this.impact(g, p.impact, spec);
        this.removeProjectile(i);
      } else if (p.age > 12) {
        this.removeProjectile(i);
      }
    }
  }

  /** A Sleeper Charge stuck in the ground: a puff of dust and a click. */
  private chargePlanted(at: THREE.Vector3): void {
    this.flashes.spawn(at, 0.25, 0xff6080, 0.15);
    const n = at.clone().normalize();
    for (let k = 0; k < 8; k++) {
      const v = this.randomHemisphere(n, 0.7).multiplyScalar(0.2 + Math.random() * 0.3);
      this.particles.spawn({ x: at.x, y: at.y, z: at.z, vx: v.x, vy: v.y, vz: v.z, r: 0.7, g: 0.6, b: 0.5, size: 0.03 + Math.random() * 0.03, life: 0.4, drag: 2 });
    }
    sfx.click();
  }

  /** A civilian ship blew up at `at`: a small fireball and some sparks. */
  private shipDown(at: THREE.Vector3): void {
    this.flashes.spawn(at, 0.5, 0xffc080, 0.3);
    for (let k = 0; k < 16; k++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(0.3 + Math.random() * 0.7);
      this.particles.spawn({ x: at.x, y: at.y, z: at.z, vx: v.x, vy: v.y, vz: v.z, r: 1, g: 0.55 + Math.random() * 0.35, b: 0.25, size: 0.03 + Math.random() * 0.04, life: 0.3 + Math.random() * 0.4, drag: 1.6 });
    }
    sfx.explosion(0.08);
    this.events.onShipDown?.();
  }

  /** Detonate button: set off every planted Sleeper Charge in a chain. */
  detonateCharges(): void {
    if (this.paused || this.destroyed) return;
    this.charges?.detonateAll();
  }

  /** Damage an orbiting target; a kill throws metal (or rock) debris and reports it. */
  private orbiterHit(o: Orbiter, damage: number, at: THREE.Vector3): void {
    if (!this.orbiters) return;
    this.orbiterFx(o, this.orbiters.hit(o, damage), at);
  }

  private orbiterFx(o: Orbiter, killed: boolean, at: THREE.Vector3): void {
    this.flashes.spawn(at, killed ? 1.0 : 0.45, 0xffd6a0, killed ? 0.45 : 0.2);
    const n = killed ? 40 : 12;
    for (let k = 0; k < n; k++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(0.4 + Math.random() * (killed ? 1.4 : 0.6));
      this.particles.spawn({
        x: at.x, y: at.y, z: at.z, vx: v.x, vy: v.y, vz: v.z,
        r: 1, g: 0.6 + Math.random() * 0.3, b: 0.3, size: 0.03 + Math.random() * 0.05, life: 0.3 + Math.random() * 0.5, drag: 1.5,
      });
    }
    if (!killed) { sfx.explosion(0.05); return; }
    const col = this.tmpColor.set(o.kind === 'moon' ? 0x8a8076 : 0xb8bcc6);
    for (let k = 0; k < (o.kind === 'moon' ? 14 : 8); k++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(0.3 + Math.random() * 0.8);
      this.debris.spawn(o.pos.clone(), v, VOXEL * (0.3 + Math.random() * 0.6), col, o.kind === 'moon' ? 0.8 : 0.3, 4);
    }
    sfx.explosion(o.kind === 'moon' ? 0.3 : 0.15);
    sfx.crack();
    this.rig.shake(0.08);
    this.events.onOrbiterDown?.(o.kind);
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
        this.charges?.trigger(s.gridPos, s.carveRadius + 1.5);
        if (this.ships) for (const at of this.ships.blast(s.pos, 0.45)) this.shipDown(at);
        planet.addHeat(s.gridPos.x, s.gridPos.y, s.gridPos.z, s.carveRadius * 1.3, 0.3);
        this.population?.blast(s.gridPos.x, s.gridPos.y, s.gridPos.z, s.carveRadius * 1.4);
        this.damageStability(0.004);
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
          this.charges?.trigger(s.gridPos, 17);
          planet.addHeat(s.gridPos.x, s.gridPos.y, s.gridPos.z, 22, 1.8);
          this.damageStability(0.12);
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
    // Ice worlds are always frozen: every hit shatters.
    const frozen = this.planetDef.kind === 'ice' || planet.coldAt(g.x, g.y, g.z, Math.max(2, s.crater * 0.6)) < -0.4;
    const crater = frozen ? s.crater * 1.7 : s.crater;
    const res = planet.carve(g.x, g.y, g.z, crater);
    this.charges?.trigger(g, crater + 2.5);
    this.damageStability(frozen ? s.stability * 1.7 : s.stability);
    planet.addHeat(g.x, g.y, g.z, crater * s.heatRadius, s.heat);
    this.population?.blast(g.x, g.y, g.z, crater * 1.2);

    const world = planet.gridToWorld(g, new THREE.Vector3());
    const normal = world.clone().normalize();
    if (this.ships) for (const at of this.ships.blast(world, crater * VOXEL * 1.5 + 0.12)) this.shipDown(at);
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

    // Gas giants billow gas and stars throw flares instead of rock.
    const kind = this.planetDef.kind ?? 'rocky';
    if (kind === 'gas') this.gasPuff(g, world, normal, 0.6 + crater / 6);
    else if (kind === 'star') { this.solarFlare(world, normal, 0.7 + s.boom * 0.8); if (s.boom > 0.5) this.solarFlare(world, normal, 0.6); }
    // Rock debris scaled by how much was actually removed.
    const n = kind === 'rocky' || kind === 'ice' ? Math.min(s.debris, Math.round(res.removed / 4) + 3) : 0;
    for (let k = 0; k < n; k++) {
      const v = this.randomHemisphere(normal, 0.6);
      const sp = s.debrisSpeed * (0.3 + Math.random() * 0.8);
      const off = this.tmpA.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(crater * 0.8);
      planet.debrisColor(g.x + off.x, g.y + off.y, g.z + off.z, this.tmpColor);
      const pos = world.clone().addScaledVector(normal, 0.03);
      this.debris.spawn(pos, v.multiplyScalar(sp), VOXEL * (0.2 + Math.random() * Math.random() * 1.2) * (0.55 + s.boom * 0.6), this.tmpColor, 0.4 + Math.random() * 0.8);
    }

    if (frozen) this.shatterFx(world, normal, crater);
    // Signature impacts: each weapon family gets its own look and sound on top of the blast.
    if (s.shockKill) this.nukeFx(world, normal);
    else if (proj?.isKinetic) this.kineticFx(world, normal);
    else if (proj?.lava) this.splashFx(world, normal);
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

  /** Nuke: a rising fireball column, a dust skirt racing outward, a second flash and a long rumble. */
  private nukeFx(world: THREE.Vector3, normal: THREE.Vector3): void {
    const [t1, t2] = this.worldTangents(normal);
    for (let k = 0; k < 70; k++) {
      // Column: slow, rising embers that cool to deep red. Kept small and dim so the
      // additive glow doesn't wash out the planet (see GLOW / Flashes.strength).
      const up = 0.5 + Math.random() * 1.1;
      const wob = 0.12;
      const hot = Math.random();
      this.particles.spawn({
        x: world.x, y: world.y, z: world.z,
        vx: normal.x * up + (t1.x * (Math.random() - 0.5) + t2.x * (Math.random() - 0.5)) * wob,
        vy: normal.y * up + (t1.y * (Math.random() - 0.5) + t2.y * (Math.random() - 0.5)) * wob,
        vz: normal.z * up + (t1.z * (Math.random() - 0.5) + t2.z * (Math.random() - 0.5)) * wob,
        r: 0.85, g: 0.3 + hot * 0.35, b: 0.06 + hot * 0.12, size: 0.05 + Math.random() * 0.08,
        life: 1.1 + Math.random() * 1.0, drag: 1.4, grow: 2,
      });
    }
    for (let k = 0; k < 60; k++) {
      // Skirt: a flat ring of dust sweeping along the ground.
      const a = (k / 60) * Math.PI * 2;
      const sp = 0.9 + Math.random() * 0.5;
      const dx = t1.x * Math.cos(a) + t2.x * Math.sin(a), dy = t1.y * Math.cos(a) + t2.y * Math.sin(a), dz = t1.z * Math.cos(a) + t2.z * Math.sin(a);
      this.particles.spawn({
        x: world.x, y: world.y, z: world.z, vx: dx * sp + normal.x * 0.05, vy: dy * sp + normal.y * 0.05, vz: dz * sp + normal.z * 0.05,
        r: 0.55, g: 0.38, b: 0.22, size: 0.06 + Math.random() * 0.05, life: 0.9 + Math.random() * 0.4, drag: 1.8, grow: 1.8,
      });
    }
    const gen = this.planetGen;
    setTimeout(() => {
      if (gen !== this.planetGen || this.paused) return;
      this.flashes.spawn(world.clone().addScaledVector(normal, 0.3), 2.2, 0xffd9a0, 0.5);
      this.rig.shake(0.25);
    }, 220);
    sfx.rumble();
  }

  /** Core Lance: a ring of blue sparks and a sharp metallic crack. */
  private kineticFx(world: THREE.Vector3, normal: THREE.Vector3): void {
    const [t1, t2] = this.worldTangents(normal);
    for (let k = 0; k < 70; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.2 + Math.random() * 1.6;
      const dx = t1.x * Math.cos(a) + t2.x * Math.sin(a), dy = t1.y * Math.cos(a) + t2.y * Math.sin(a), dz = t1.z * Math.cos(a) + t2.z * Math.sin(a);
      this.particles.spawn({
        x: world.x, y: world.y, z: world.z, vx: (dx + normal.x * 0.5) * sp, vy: (dy + normal.y * 0.5) * sp, vz: (dz + normal.z * 0.5) * sp,
        r: 0.55, g: 0.9, b: 1, size: 0.03 + Math.random() * 0.04, life: 0.35 + Math.random() * 0.3, drag: 2.2, gravity: 0.5,
      });
    }
    sfx.crack();
  }

  /** Plasma Mortar: molten droplets arcing out of the pool, with a hiss. */
  private splashFx(world: THREE.Vector3, normal: THREE.Vector3): void {
    for (let k = 0; k < 45; k++) {
      const v = this.randomHemisphere(normal, 0.9).multiplyScalar(0.6 + Math.random() * 0.9);
      this.particles.spawn({
        x: world.x, y: world.y, z: world.z, vx: v.x, vy: v.y, vz: v.z,
        r: 1, g: 0.55 + Math.random() * 0.3, b: 0.12, size: 0.05 + Math.random() * 0.06, life: 0.7 + Math.random() * 0.5, drag: 0.6, gravity: 1.6,
      });
    }
    sfx.sizzle();
  }

  /** Two unit vectors perpendicular to a world-space normal. */
  private worldTangents(n: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
    const ref = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const t1 = new THREE.Vector3().crossVectors(n, ref).normalize();
    return [t1, new THREE.Vector3().crossVectors(n, t1)];
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
      this.events.onShatter?.();
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
        this.charges?.trigger(L.g, r * 0.6 + 1);
        this.population?.blast(L.g.x, L.g.y, L.g.z, r * 0.9);
        this.damageStability(0.0008);
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

  /** Core Lance: drill a shaft toward the centre, then blow a cavity at the bottom. */
  private updateLances(dt: number): void {
    const planet = this.planet;
    for (let i = this.lances.length - 1; i >= 0; i--) {
      const L = this.lances[i];
      if (!planet || this.destroyed) { this.lances.splice(i, 1); continue; }
      L.progress = Math.min(L.depth, L.progress + dt * 55);
      while (L.carved + 1.2 <= L.progress) {
        L.carved += 1.2;
        const p = L.g.clone().addScaledVector(L.dir, L.carved);
        planet.carve(p.x, p.y, p.z, L.radius, 0.25);
        this.charges?.trigger(p, L.radius + 1.5);
        planet.addHeat(p.x, p.y, p.z, L.radius * 2.2, 1.4);
      }
      const mouth = planet.gridToWorld(L.g, this.tmpA);
      const n = this.tmpB.copy(mouth).normalize();
      for (let k = 0; k < 3; k++) {
        const v = this.randomHemisphere(n, 0.25).multiplyScalar(0.8 + Math.random());
        this.particles.spawn({ x: mouth.x, y: mouth.y, z: mouth.z, vx: v.x, vy: v.y, vz: v.z, r: 0.5, g: 0.9, b: 1, size: 0.05 + Math.random() * 0.06, life: 0.35, drag: 1.5 });
      }
      if (L.progress >= L.depth) {
        const end = L.g.clone().addScaledVector(L.dir, L.depth);
        planet.carve(end.x, end.y, end.z, L.cavity, 0.5);
        this.charges?.trigger(end, L.cavity + 2);
        planet.addHeat(end.x, end.y, end.z, L.cavity * 1.8, 2.2);
        this.damageStability(0.06);
        // The blast escapes up the shaft.
        this.flashes.spawn(mouth, 3.2, 0x80f0ff, 0.6);
        this.flashes.spawn(mouth, 1.6, 0xffffff, 0.3);
        for (let k = 0; k < 160; k++) {
          const v = this.randomHemisphere(n, 0.35);
          const sp = 0.6 + Math.random() * 2.2;
          const hot = Math.random();
          this.particles.spawn({
            x: mouth.x, y: mouth.y, z: mouth.z, vx: v.x * sp, vy: v.y * sp, vz: v.z * sp,
            r: 1, g: 0.5 + hot * 0.4, b: 0.2 + hot * 0.5, size: 0.06 + Math.random() * 0.14,
            life: 0.6 + Math.random() * 0.8, drag: 1.6, grow: 1.8,
          });
        }
        this.rig.shake(0.6);
        sfx.explosion(0.8);
        this.lances.splice(i, 1);
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
    // Released beams shrink away over a few frames instead of vanishing.
    if (!spec || !this.firing || !planet || this.destroyed) { this.beam.idle(dt); return; }
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
    // Every beam snaps open over ~0.12 s rather than popping in at full width.
    const open = Math.min(1, this.beamHold / 0.12);
    width *= 0.2 + 0.8 * open * open * (3 - 2 * open);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const ray = this.raycaster.ray;
    // Emitter sits just off the bottom-right edge of the view, the same spot every time.
    const right = this.tmpA.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const up = this.tmpB.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const fwd = this.tmpC.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const from = this.camera.position.clone().addScaledVector(right, BEAM_EMITTER.right)
      .addScaledVector(up, BEAM_EMITTER.up).addScaledVector(fwd, BEAM_EMITTER.fwd);
    let hitG = planet.raycast(ray.origin, ray.direction, new THREE.Vector3());
    // A satellite or moon in front of the beam burns (about 6 hit points a second).
    const oh = this.orbiters?.raycast(ray.origin, ray.direction);
    if (oh && (!hitG || oh.dist < planet.gridToWorld(hitG, this.tmpC).distanceTo(ray.origin))) {
      if (this.orbiters!.hit(oh.orbiter, dt * 6)) this.orbiterFx(oh.orbiter, true, oh.orbiter.pos);
      else if (Math.random() < 0.3) this.particles.spawn({ x: oh.orbiter.pos.x, y: oh.orbiter.pos.y, z: oh.orbiter.pos.z, vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6, vz: (Math.random() - 0.5) * 0.6, r: 1, g: 0.7, b: 0.4, size: 0.05, life: 0.25 });
    }
    if (this.ships) {
      const reach = hitG ? planet.gridToWorld(hitG, this.tmpC).distanceTo(ray.origin) : 30;
      for (const at of this.ships.rayBlast(ray.origin, ray.direction, reach, 0.06)) this.shipDown(at);
    }
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
      if (!spec.isCryo && (this.planetDef.kind === 'ice' || planet.coldAt(hitG.x, hitG.y, hitG.z, r) < -0.4)) { r *= 1.8; frozenHit = true; }
      if (spec.drillRate > 0) {
        const adv = spec.drillRate * STEP;
        const c = hitG.clone().addScaledVector(dirG, adv - r * 0.7);
        planet.carve(c.x, c.y, c.z, r, 0.15);
      }
      this.charges?.trigger(hitG, r + 1.5);
      if (spec.isCryo) {
        planet.freeze(hitG.x, hitG.y, hitG.z, r * 2.8, 3.2 * STEP * 6);
      } else {
        planet.addHeat(hitG.x, hitG.y, hitG.z, r * 2.2, spec.heat * STEP * 6);
      }
      this.population?.blast(hitG.x, hitG.y, hitG.z, r * 1.2);
      this.damageStability(spec.stability * STEP * (1 + charge * 5) * (frozenHit ? 1.7 : 1));
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
      const kind = this.planetDef.kind ?? 'rocky';
      if (spec.drillRate > 0 && kind === 'gas') {
        if (Math.random() < 0.35) this.gasPuff(hitG, hitW, normal, 0.35 * scale);
      } else if (spec.drillRate > 0 && kind === 'star') {
        if (Math.random() < 0.08 * scale) this.solarFlare(hitW, normal, 0.5);
      } else if (spec.drillRate > 0) {
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
    this.ships?.flee();

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
    // Gas giants burst into a slow, glowing cloud; stars blow out a fast shell of plasma.
    const kind = this.planetDef.kind ?? 'rocky';
    if (kind === 'gas') {
      const cols = [this.planetDef.colors.low, this.planetDef.colors.mid, this.planetDef.colors.high].map(h => new THREE.Color(h));
      for (let k = 0; k < 900; k++) {
        const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        const r = WORLD_RADIUS * (0.4 + Math.random() * 0.6);
        const sp = 0.25 + Math.random() * 0.9;
        const col = cols[k % 3];
        this.particles.spawn({
          x: v.x * r, y: v.y * r, z: v.z * r, vx: v.x * sp, vy: v.y * sp, vz: v.z * sp,
          r: col.r * 0.45, g: col.g * 0.45, b: col.b * 0.45, size: 0.2 + Math.random() * 0.3,
          life: 2 + Math.random() * 2, drag: 0.4, grow: 2.2,
        });
      }
    } else if (kind === 'star') {
      for (let k = 0; k < 1200; k++) {
        const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        const sp = 2.4 + Math.random() * 1.8;
        const hot = Math.random();
        this.particles.spawn({
          x: v.x * WORLD_RADIUS, y: v.y * WORLD_RADIUS, z: v.z * WORLD_RADIUS, vx: v.x * sp, vy: v.y * sp, vz: v.z * sp,
          r: 1, g: 0.65 + hot * 0.3, b: 0.25 + hot * 0.4, size: 0.06 + Math.random() * 0.12,
          life: 1.2 + Math.random() * 1.2, drag: 0.5, grow: 1.6,
        });
      }
      this.rings.spawn(this.scene, new THREE.Vector3(), this.camera.position.clone().normalize(), WORLD_RADIUS * 7, 0xfff0b0, 2.4);
    }
    const toCam = this.camera.position.clone().normalize();
    this.rings.spawn(this.scene, new THREE.Vector3(), toCam, WORLD_RADIUS * 5, 0xffb070, 3.2);
    this.rig.shake(1.2);
    this.rig.zoom(1.6);
    sfx.explosion(1);
    setTimeout(() => sfx.explosion(0.7), 180);

    const bonus = 150;
    this.awardXp(bonus);
    const killed = this.population?.total ?? killedBefore;
    this.events.onPlanetBroken?.({ planet: this.planetDef, seconds: this.planetTime });
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
      // Slow weapons (0.5 s+ reload) show a sweep on their button.
      const proj = this.weapon.projectile;
      const cd = proj && proj.cooldown >= 0.5 ? Math.max(0, Math.min(1, this.cooldown / proj.cooldown)) : 0;
      if (cd !== this.lastCooldown) { this.lastCooldown = cd; this.events.onCooldown?.(cd); }
      if (this.firing && this.holdTime >= 0) {
        this.holdTime += rawDt;
        if (this.holdTime > 0.8) { this.holdTime = -1; this.events.onFireHeld?.(this.weapon.id); }
      }
      this.updateBeam(dt);
      this.updateProjectiles(dt);
      this.updateSingularities(dt);
      this.updateLava(dt);
      this.updateLances(dt);
      if (planet && !this.destroyed) {
        const sleeper = weaponById('sleeper').projectile!;
        this.charges?.update(dt, g => this.impact(g, sleeper.impact, sleeper));
      }
      if (this.ships) {
        const dangers = this.projectiles.map(p => p.pos);
        for (const s of this.singularities) dangers.push(s.pos);
        this.ships.update(dt, dangers);
      }
      if (this.defences) {
        this.defences.update(dt, this.projectiles);
        const lvl = this.defences.shieldLevel;
        const q = lvl === null ? null : Math.round(lvl * 50) / 50;
        if (q !== this.lastShield) { this.lastShield = q; this.events.onShield?.(q); }
      } else if (this.lastShield !== null) { this.lastShield = null; this.events.onShield?.(null); }
      this.orbiters?.update(dt);
      this.updatePersonality(dt);
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
          this.charges?.triggerRing(this.tmpC.set(s.cx, s.cy, s.cz), r, 2.5);
          if (s.kill && !this.destroyed) this.population?.blast(s.cx, s.cy, s.cz, r);
        }
        if (s.t >= s.dur) this.shockwaves.splice(i, 1);
      }

      if (planet && !this.destroyed) {
        if (this.inputEnabled) this.planetTime += rawDt;
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
        const b = this.breakAt;
        const h = this.health;
        this.clouds?.setHealth(h);
        if (this.atmosphere) (this.atmosphere.material as THREE.ShaderMaterial).uniforms.uStrength.value = this.atmoStrength * (0.3 + 0.7 * h);
        if (this.stability <= 0 || planet.coreIntegrity < b.core || integ < b.mass) this.destroyPlanet();
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
   * 1 = intact, 0 = about to break apart. The planet breaks at `breakAt` mass OR core,
   * so the bar follows whichever is closer to its limit.
   */
  get health(): number {
    const p = this.planet;
    if (!p) return 1;
    const b = this.breakAt;
    const mass = (p.integrity - b.mass) / (1 - b.mass);
    const core = (p.coreIntegrity - b.core) / (1 - b.core);
    return Math.max(0, Math.min(1, mass, core, this.stability));
  }

  /**
   * Planets break below these fractions of their starting mass or core.
   * `easy` (a brand-new player's first planet) halves the damage needed.
   */
  breakAt = { mass: 0.6, core: 0.8 };
  setEasyBreak(easy: boolean): void {
    this.breakAt = easy ? { mass: 0.8, core: 0.9 } : { mass: 0.6, core: 0.8 };
    this.easyBreak = easy;
    this.updateStabilityScale();
  }
  private easyBreak = false;
  /** Tough planets (gas giants, the Sun) lose stability slower; small ones faster. */
  private updateStabilityScale(): void {
    this.stabilityScale = (this.easyBreak ? 2 : 1) / (this.planetDef.toughness ?? 1);
  }

  // ----------------------------------------------------------
  // Planet personalities
  // ----------------------------------------------------------
  private flareTimer = 2;

  /** Stars flare on their own every few seconds. */
  private updatePersonality(dt: number): void {
    if (this.planetDef.kind !== 'star' || !this.planet || this.destroyed) return;
    this.flareTimer -= dt;
    if (this.flareTimer > 0) return;
    this.flareTimer = 1.5 + Math.random() * 2.5;
    const n = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    this.solarFlare(n.clone().multiplyScalar(WORLD_RADIUS * 0.98), n, 0.6 + Math.random() * 0.5);
  }

  /** A looping arc of plasma that lifts off the surface and falls back. */
  private solarFlare(world: THREE.Vector3, normal: THREE.Vector3, power: number): void {
    const [t1, t2] = this.worldTangents(normal);
    const a = Math.random() * Math.PI * 2;
    const tan = t1.multiplyScalar(Math.cos(a)).addScaledVector(t2, Math.sin(a));
    const n = Math.round(45 * power);
    for (let k = 0; k < n; k++) {
      const up = (0.8 + Math.random() * 0.5) * power;
      const side = (0.35 + Math.random() * 0.35) * power;
      const hot = Math.random();
      this.particles.spawn({
        x: world.x, y: world.y, z: world.z,
        vx: normal.x * up + tan.x * side, vy: normal.y * up + tan.y * side, vz: normal.z * up + tan.z * side,
        r: 1, g: 0.5 + hot * 0.4, b: 0.1 + hot * 0.2, size: 0.04 + Math.random() * 0.06,
        life: 1.1 + Math.random() * 0.8, drag: 0.25, gravity: 3.2, grow: 1.4,
      });
    }
  }

  /** Soft glowing clouds in the colour of the gas bands at the hit. */
  private gasPuff(g: THREE.Vector3, world: THREE.Vector3, normal: THREE.Vector3, size: number): void {
    const planet = this.planet;
    if (!planet) return;
    planet.debrisColor(g.x, g.y, g.z, this.tmpColor);
    const c = this.tmpColor;
    const n = Math.round(16 * size);
    for (let k = 0; k < n; k++) {
      const v = this.randomHemisphere(normal, 0.8).multiplyScalar(0.12 + Math.random() * 0.35);
      this.particles.spawn({
        x: world.x, y: world.y, z: world.z, vx: v.x, vy: v.y, vz: v.z,
        r: c.r * 0.55 + 0.1, g: c.g * 0.55 + 0.06, b: c.b * 0.55 + 0.04, size: (0.1 + Math.random() * 0.15) * size,
        life: 1.4 + Math.random() * 1.2, drag: 1, gravity: 0.08, grow: 2.6,
      });
    }
  }

  private damageStability(amount: number): void {
    if (this.destroyed || !this.planet) return;
    this.stability = Math.max(0, this.stability - amount * this.stabilityScale);
  }

  private resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    // A hidden or collapsed iframe reports 0x0: the maths below would turn the camera
    // distance into NaN and leave the screen black for good. Wait for a real size.
    if (w <= 0 || h <= 0) return;
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
