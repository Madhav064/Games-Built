import * as THREE from 'three';

/** Smooth orbit camera around the origin with zoom limits and screen shake. */
export class CameraRig {
  yaw = 0.6;
  pitch = 0.25;
  dist = 7.2;
  private tYaw = 0.6;
  private tPitch = 0.25;
  private tDist = 7.2;
  private shakeAmt = 0;
  minDist = 3.4;
  maxDist = 20;
  /** Default framing distance; set from the viewport so the planet fits on narrow screens. */
  baseDist = 7.2;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  rotate(dxPx: number, dyPx: number): void {
    this.tYaw -= dxPx * 0.006;
    this.tPitch = THREE.MathUtils.clamp(this.tPitch + dyPx * 0.005, -1.35, 1.35);
  }

  zoom(factor: number): void {
    this.tDist = THREE.MathUtils.clamp(this.tDist * factor, this.minDist, this.maxDist);
  }

  /** Player setting. */
  shakeEnabled = true;

  shake(amount: number): void {
    if (!this.shakeEnabled) return;
    this.shakeAmt = Math.min(1.2, this.shakeAmt + amount);
  }

  resetZoom(): void { this.tDist = this.baseDist; }

  reset(): void {
    this.tYaw = 0.6; this.tPitch = 0.25; this.tDist = this.baseDist;
  }

  update(dt: number): void {
    const k = 1 - Math.exp(-dt * 8);
    this.yaw += (this.tYaw - this.yaw) * k;
    this.pitch += (this.tPitch - this.pitch) * k;
    this.dist += (this.tDist - this.dist) * k;
    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      Math.sin(this.yaw) * cp * this.dist,
      Math.sin(this.pitch) * this.dist,
      Math.cos(this.yaw) * cp * this.dist,
    );
    this.camera.lookAt(0, 0, 0);
    if (this.shakeAmt > 0.001) {
      const s = this.shakeAmt * 0.06;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
      this.shakeAmt *= Math.exp(-dt * 4.5);
    }
  }
}
