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
  frictionPerSecond: 0.86,
  minVelocity: 2.8,
  restitutionBall: 0.97,
  restitutionCushion: 0.88,
  maxShotSpeed: 1700,
  maxPower: 1,
  settleFrames: 20
};

export const NETWORK = {
  snapshotRate: 30,
  reconnectGraceMs: 15000,
  queueTickMs: 400
};