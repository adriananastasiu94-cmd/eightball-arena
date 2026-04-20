import { PHYSICS } from "../constants";
import { BallState, TableConfig, Vec2 } from "../types";
import { vec } from "./vector";

export type SimulationEvent =
  | { type: "pocket"; ballId: number }
  | { type: "first_contact"; targetBallId: number };

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
  if (dist <= 0 || dist >= minDist) return false;

  const n = vec.scale(delta, 1 / dist);
  const overlap = minDist - dist;
  a.pos = vec.add(a.pos, vec.scale(n, -overlap * 0.5));
  b.pos = vec.add(b.pos, vec.scale(n, overlap * 0.5));

  const relVel = vec.sub(b.vel, a.vel);
  const sep = vec.dot(relVel, n);
  if (sep >= 0) return true;

  const impulse = (-(1 + PHYSICS.restitutionBall) * sep) / 2;
  const impulseVec = vec.scale(n, impulse);
  a.vel = vec.sub(a.vel, impulseVec);
  b.vel = vec.add(b.vel, impulseVec);
  return true;
}

function resolveCushion(ball: BallState, table: TableConfig): boolean {
  if (ball.pocketed) return false;
  const left = table.rail + ball.radius;
  const right = table.width - table.rail - ball.radius;
  const top = table.rail + ball.radius;
  const bottom = table.height - table.rail - ball.radius;
  let hit = false;

  if (ball.pos.x < left) {
    ball.pos.x = left;
    ball.vel.x = Math.abs(ball.vel.x) * PHYSICS.restitutionCushion;
    hit = true;
  } else if (ball.pos.x > right) {
    ball.pos.x = right;
    ball.vel.x = -Math.abs(ball.vel.x) * PHYSICS.restitutionCushion;
    hit = true;
  }

  if (ball.pos.y < top) {
    ball.pos.y = top;
    ball.vel.y = Math.abs(ball.vel.y) * PHYSICS.restitutionCushion;
    hit = true;
  } else if (ball.pos.y > bottom) {
    ball.pos.y = bottom;
    ball.vel.y = -Math.abs(ball.vel.y) * PHYSICS.restitutionCushion;
    hit = true;
  }

  return hit;
}

function applyFriction(ball: BallState, dt: number): void {
  if (ball.pocketed) return;
  const factor = Math.pow(PHYSICS.frictionPerSecond, dt);
  ball.vel.x *= factor;
  ball.vel.y *= factor;
  if (Math.hypot(ball.vel.x, ball.vel.y) < PHYSICS.minVelocity) {
    ball.vel = { x: 0, y: 0 };
  }
}

function resolvePocket(ball: BallState, table: TableConfig): boolean {
  if (ball.pocketed) return false;
  for (const p of pockets(table)) {
    if (Math.hypot(ball.pos.x - p.x, ball.pos.y - p.y) <= table.pocketRadius) {
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
      resolveCushion(ball, table);
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
