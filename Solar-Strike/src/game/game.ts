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

}
