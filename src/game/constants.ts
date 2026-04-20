import { TableConfig } from "./types";

export const TABLE: TableConfig = {
  width: 1024,
  height: 512,
  rail: 36,
  pocketRadius: 28,
  ballRadius: 11
};

export const PHYSICS = {
  stepHz: 120,
  frictionPerSecond: 0.54,
  minVelocity: 7.2,
  restitutionBall: 0.84,
  restitutionCushion: 0.62,
  railFrictionOnImpact: 0.92,
  collisionTangentialFriction: 0.08,
  collisionEnergyRetain: 0.985,
  pocketCaptureScale: 0.82,
  pocketMouthScale: 1.08,
  pocketPullStrength: 14,
  maxShotSpeed: 1700,
  maxPower: 1,
  settleFrames: 18
};

export const NETWORK = {
  snapshotRate: 30,
  reconnectGraceMs: 15000,
  queueTickMs: 400
};
