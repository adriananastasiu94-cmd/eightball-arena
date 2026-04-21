import { PHYSICS } from "../constants";
import { BallState, TableConfig, Vec2 } from "../types";
import { vec } from "./vector";

export type SimulationEvent =
  | { type: "pocket"; ballId: number }
  | { type: "first_contact"; targetBallId: number }
  | { type: "cushion"; ballId: number };

export type SimulationResult = {
  frames: BallState[][];
  events: SimulationEvent[];
  finalBalls: BallState[];
};

const cloneBalls = (balls: BallState[]): BallState[] =>
  balls.map((b) => ({ ...b, pos: { ...b.pos }, vel: { ...b.vel } }));

const pockets = (table: TableConfig): Vec2[] => [
  { x: table.rail, y: table.rail },
  { x: table.width / 2, y: table.rail },
  { x: table.width - table.rail, y: table.rail },
  { x: table.rail, y: table.height - table.rail },
  { x: table.width / 2, y: table.height - table.rail },
  { x: table.width - table.rail, y: table.height - table.rail }
];

function resolveBallCollision(a: BallState, b: BallState): boolean {
  if (a.pocketed || b.pocketed) return false;
  const delta = vec.sub(b.pos, a.pos);
  const dist = vec.len(delta);
  const minDist = a.radius + b.radius;
  if (dist >= minDist) return false;

  let n: Vec2;
  if (dist < 1e-6) {
    n = vec.norm(vec.sub(b.vel, a.vel));
    if (vec.len(n) < 1e-6) n = { x: 1, y: 0 };
  } else {
    n = vec.scale(delta, 1 / dist);
  }

  const overlap = minDist - Math.max(dist, 1e-6);
  a.pos = vec.add(a.pos, vec.scale(n, -overlap * 0.5));
  b.pos = vec.add(b.pos, vec.scale(n, overlap * 0.5));

  const relVel = vec.sub(b.vel, a.vel);
  const sep = vec.dot(relVel, n);
  if (sep >= 0) return true;

  const impulse = (-(1 + PHYSICS.restitutionBall) * sep) / 2;
  const impulseVec = vec.scale(n, impulse);
  a.vel = vec.sub(a.vel, impulseVec);
  b.vel = vec.add(b.vel, impulseVec);

  const tangent = { x: -n.y, y: n.x };
  const relTan = vec.dot(vec.sub(b.vel, a.vel), tangent);
  const tanImpulse = relTan * PHYSICS.collisionTangentialFriction * 0.5;
  a.vel = vec.add(a.vel, vec.scale(tangent, tanImpulse));
  b.vel = vec.sub(b.vel, vec.scale(tangent, tanImpulse));

  a.vel = vec.scale(a.vel, PHYSICS.collisionEnergyRetain);
  b.vel = vec.scale(b.vel, PHYSICS.collisionEnergyRetain);
  return true;
}

export function predictCueObjectCollisionVectors(
  cueDir: Vec2,
  contactNormal: Vec2
): { cueOut: Vec2; objectOut: Vec2 } | null {
  const nLen = vec.len(contactNormal);
  if (nLen < 1e-6) return null;
  const n = vec.scale(contactNormal, 1 / nLen);
  const cueIn = vec.norm(cueDir);
  if (vec.len(cueIn) < 1e-6) return null;

  const relVel = vec.sub({ x: 0, y: 0 }, cueIn);
  const sep = vec.dot(relVel, n);
  if (sep >= 0) return null;

  const impulse = (-(1 + PHYSICS.restitutionBall) * sep) / 2;
  const impulseVec = vec.scale(n, impulse);
  let cueOut = vec.sub(cueIn, impulseVec);
  let objectOut = vec.add({ x: 0, y: 0 }, impulseVec);

  const tangent = { x: -n.y, y: n.x };
  const relTan = vec.dot(vec.sub(objectOut, cueOut), tangent);
  const tanImpulse = relTan * PHYSICS.collisionTangentialFriction * 0.5;
  cueOut = vec.add(cueOut, vec.scale(tangent, tanImpulse));
  objectOut = vec.sub(objectOut, vec.scale(tangent, tanImpulse));

  cueOut = vec.scale(cueOut, PHYSICS.collisionEnergyRetain);
  objectOut = vec.scale(objectOut, PHYSICS.collisionEnergyRetain);

  return { cueOut, objectOut };
}

function inPocketWindow(pos: number, centers: number[], halfOpen: number): boolean {
  return centers.some((c) => Math.abs(pos - c) <= halfOpen);
}

function hasLeftRightRailOpening(y: number, table: TableConfig): boolean {
  const halfOpen = table.pocketRadius * 0.72;
  return inPocketWindow(y, [table.rail, table.height - table.rail], halfOpen);
}

function hasTopBottomRailOpening(x: number, table: TableConfig): boolean {
  const halfOpen = table.pocketRadius * 0.78;
  return inPocketWindow(x, [table.rail, table.width / 2, table.width - table.rail], halfOpen);
}

function resolveCushion(ball: BallState, table: TableConfig): boolean {
  if (ball.pocketed) return false;
  const left = table.rail + ball.radius;
  const right = table.width - table.rail - ball.radius;
  const top = table.rail + ball.radius;
  const bottom = table.height - table.rail - ball.radius;
  let hit = false;

  if (ball.pos.x < left && !hasLeftRightRailOpening(ball.pos.y, table)) {
    ball.pos.x = left;
    ball.vel.x = Math.abs(ball.vel.x) * PHYSICS.restitutionCushion;
    ball.vel.y *= PHYSICS.railFrictionOnImpact;
    hit = true;
  } else if (ball.pos.x > right && !hasLeftRightRailOpening(ball.pos.y, table)) {
    ball.pos.x = right;
    ball.vel.x = -Math.abs(ball.vel.x) * PHYSICS.restitutionCushion;
    ball.vel.y *= PHYSICS.railFrictionOnImpact;
    hit = true;
  }

  if (ball.pos.y < top && !hasTopBottomRailOpening(ball.pos.x, table)) {
    ball.pos.y = top;
    ball.vel.y = Math.abs(ball.vel.y) * PHYSICS.restitutionCushion;
    ball.vel.x *= PHYSICS.railFrictionOnImpact;
    hit = true;
  } else if (ball.pos.y > bottom && !hasTopBottomRailOpening(ball.pos.x, table)) {
    ball.pos.y = bottom;
    ball.vel.y = -Math.abs(ball.vel.y) * PHYSICS.restitutionCushion;
    ball.vel.x *= PHYSICS.railFrictionOnImpact;
    hit = true;
  }

  return hit;
}

function applyFriction(ball: BallState, dt: number): void {
  if (ball.pocketed) return;
  const factor = Math.pow(PHYSICS.frictionPerSecond, dt);
  ball.vel.x *= factor;
  ball.vel.y *= factor;
  const speed = Math.hypot(ball.vel.x, ball.vel.y);
  if (speed < PHYSICS.minVelocity * 2) {
    ball.vel.x *= 0.96;
    ball.vel.y *= 0.96;
  }
  if (Math.hypot(ball.vel.x, ball.vel.y) < PHYSICS.minVelocity) {
    ball.vel = { x: 0, y: 0 };
  }
}

function resolvePocket(ball: BallState, table: TableConfig): boolean {
  if (ball.pocketed) return false;
  for (const p of pockets(table)) {
    const toPocket = vec.sub(p, ball.pos);
    const dist = vec.len(toPocket);
    const mouth = table.pocketRadius * PHYSICS.pocketMouthScale;
    if (dist <= mouth && dist > 1e-6) {
      const pullFactor = ((mouth - dist) / mouth) * PHYSICS.pocketPullStrength;
      const pull = vec.scale(toPocket, pullFactor / dist);
      ball.vel = vec.add(ball.vel, pull);
    }

    if (dist <= table.pocketRadius * PHYSICS.pocketCaptureScale) {
      ball.pocketed = true;
      ball.vel = { x: 0, y: 0 };
      return true;
    }
  }
  return false;
}

export function simulateShot(
  table: TableConfig,
  initialBalls: BallState[],
  maxSeconds = 12
): SimulationResult {
  const balls = cloneBalls(initialBalls);
  const frames: BallState[][] = [];
  const events: SimulationEvent[] = [];
  const dt = 1 / PHYSICS.stepHz;
  const maxSteps = Math.floor(maxSeconds * PHYSICS.stepHz);

  let firstContactRecorded = false;
  let settleCounter = 0;

  // Fixed-step deterministic simulation. Given the same input state + shot,
  // every client/server run yields the same final board layout.
  for (let step = 0; step < maxSteps; step += 1) {
    for (const ball of balls) {
      if (ball.pocketed) continue;
      ball.pos = vec.add(ball.pos, vec.scale(ball.vel, dt));
      if (resolveCushion(ball, table)) {
        events.push({ type: "cushion", ballId: ball.id });
      }
      if (resolvePocket(ball, table)) {
        events.push({ type: "pocket", ballId: ball.id });
      }
    }

    for (let i = 0; i < balls.length; i += 1) {
      for (let j = i + 1; j < balls.length; j += 1) {
        const a = balls[i];
        const b = balls[j];
        const hadCollision = resolveBallCollision(a, b);
        if (!firstContactRecorded && hadCollision) {
          if (a.kind === "cue" && !b.pocketed) {
            events.push({ type: "first_contact", targetBallId: b.id });
            firstContactRecorded = true;
          } else if (b.kind === "cue" && !a.pocketed) {
            events.push({ type: "first_contact", targetBallId: a.id });
            firstContactRecorded = true;
          }
        }
      }
    }

    for (const ball of balls) applyFriction(ball, dt);

    const allStopped = balls.every((b) => b.pocketed || (b.vel.x === 0 && b.vel.y === 0));
    frames.push(cloneBalls(balls));
    if (allStopped) {
      settleCounter += 1;
      if (settleCounter >= PHYSICS.settleFrames) break;
    } else {
      settleCounter = 0;
    }
  }

  return { frames, events, finalBalls: cloneBalls(balls) };
}

export function applyCueImpulse(
  balls: BallState[],
  angle: number,
  power: number,
  spin?: Vec2
): BallState[] {
  const next = cloneBalls(balls);
  const cue = next.find((b) => b.kind === "cue");
  if (!cue || cue.pocketed) return next;

  const clampedPower = Math.max(0.05, Math.min(PHYSICS.maxPower, power));
  const speed = clampedPower * PHYSICS.maxShotSpeed;
  cue.vel = {
    x: Math.cos(angle) * speed + (spin?.x ?? 0) * 40,
    y: Math.sin(angle) * speed + (spin?.y ?? 0) * 40
  };

  return next;
}
