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
  frictionPerSecond: 0.9,
  minVelocity: 4.2,
  restitutionBall: 0.93,
  restitutionCushion: 0.82,
  railFrictionOnImpact: 0.965,
  collisionTangentialFriction: 0.045,
  collisionEnergyRetain: 0.992,
  // WPA-inspired pocket geometry, using 2.25" ball scaling.
  cornerPocketMouthInches: 4.56,
  sidePocketMouthInches: 5.06,
  cornerShelfInches: 1.5,
  sideShelfInches: 0.2,
  cornerJawRadiusInches: 0.82,
  sideJawRadiusInches: 0.31,
  pocketNoseCenterClearance: 0.88,
  cornerPocketCaptureRadiusInBalls: 1.46,
  sidePocketCaptureRadiusInBalls: 1.62,
  pocketPullStrength: 9.5,
  maxShotSpeed: 1700,
  maxPower: 1,
  settleFrames: 18
};

export const NETWORK = {
  snapshotRate: 30,
  reconnectGraceMs: 15000,
  queueTickMs: 400
};
