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
  frictionPerSecond: 0.8,
  minVelocity: 3.2,
  restitutionBall: 0.955,
  restitutionCushion: 0.83,
  railFrictionOnImpact: 0.985,
  pocketCaptureScale: 0.82,
  pocketMouthScale: 1.22,
  pocketPullStrength: 22,
  maxShotSpeed: 1700,
  maxPower: 1,
  settleFrames: 16
};

export const NETWORK = {
  snapshotRate: 30,
  reconnectGraceMs: 15000,
  queueTickMs: 400
};
