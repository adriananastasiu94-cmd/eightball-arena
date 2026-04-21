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
type PocketKind = "corner" | "side";
type PocketDescriptor = {
  x: number;
  y: number;
  kind: PocketKind;
  edgeX: -1 | 0 | 1;
  edgeY: -1 | 1;
};
type PocketProfile = {
  cornerCenterHalfOpen: number;
  sideCenterHalfOpen: number;
  cornerShelf: number;
  sideShelf: number;
  cornerJawRadius: number;
  sideJawRadius: number;
  cornerCaptureRadius: number;
  sideCaptureRadius: number;
  cornerFunnelRadius: number;
  sideFunnelRadius: number;
};

const cloneBalls = (balls: BallState[]): BallState[] =>
  balls.map((b) => ({ ...b, pos: { ...b.pos }, vel: { ...b.vel } }));

const pockets = (table: TableConfig): PocketDescriptor[] => [
  { x: table.rail, y: table.rail, kind: "corner", edgeX: -1, edgeY: -1 },
  { x: table.width / 2, y: table.rail, kind: "side", edgeX: 0, edgeY: -1 },
  { x: table.width - table.rail, y: table.rail, kind: "corner", edgeX: 1, edgeY: -1 },
  { x: table.rail, y: table.height - table.rail, kind: "corner", edgeX: -1, edgeY: 1 },
  { x: table.width / 2, y: table.height - table.rail, kind: "side", edgeX: 0, edgeY: 1 },
  { x: table.width - table.rail, y: table.height - table.rail, kind: "corner", edgeX: 1, edgeY: 1 }
];

function unitsPerInch(table: TableConfig): number {
  return (table.ballRadius * 2) / 2.25;
}

function getPocketProfile(table: TableConfig, ballRadius: number): PocketProfile {
  const upi = unitsPerInch(table);
  const cornerMouth = PHYSICS.cornerPocketMouthInches * upi;
  const sideMouth = PHYSICS.sidePocketMouthInches * upi;
  const cornerCenterHalfOpen = Math.max(
    ballRadius * 0.8,
    cornerMouth * 0.5 - ballRadius * PHYSICS.pocketNoseCenterClearance
  );
  const sideCenterHalfOpen = Math.max(
    ballRadius * 0.95,
    sideMouth * 0.5 - ballRadius * PHYSICS.pocketNoseCenterClearance
  );
  const cornerShelf = PHYSICS.cornerShelfInches * upi;
  const sideShelf = PHYSICS.sideShelfInches * upi;
  const cornerJawRadius = PHYSICS.cornerJawRadiusInches * upi;
  const sideJawRadius = PHYSICS.sideJawRadiusInches * upi;
  const cornerCaptureRadius = ballRadius * PHYSICS.cornerPocketCaptureRadiusInBalls;
  const sideCaptureRadius = ballRadius * PHYSICS.sidePocketCaptureRadiusInBalls;
  return {
    cornerCenterHalfOpen,
    sideCenterHalfOpen,
    cornerShelf,
    sideShelf,
    cornerJawRadius,
    sideJawRadius,
    cornerCaptureRadius,
    sideCaptureRadius,
    cornerFunnelRadius: Math.max(cornerCaptureRadius + ballRadius * 0.95, table.pocketRadius * 0.92),
    sideFunnelRadius: Math.max(sideCaptureRadius + ballRadius * 0.95, table.pocketRadius * 0.96)
  };
}

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

function hasLeftRightRailOpening(y: number, table: TableConfig, ballRadius: number): boolean {
  const profile = getPocketProfile(table, ballRadius);
  return inPocketWindow(y, [table.rail, table.height - table.rail], profile.cornerCenterHalfOpen);
}

function hasTopBottomRailOpening(x: number, table: TableConfig, ballRadius: number): boolean {
  const profile = getPocketProfile(table, ballRadius);
  return (
    inPocketWindow(x, [table.rail, table.width - table.rail], profile.cornerCenterHalfOpen) ||
    inPocketWindow(x, [table.width / 2], profile.sideCenterHalfOpen)
  );
}

function resolveJawCircle(ball: BallState, jaw: Vec2, jawRadius: number): boolean {
  const delta = vec.sub(ball.pos, jaw);
  const dist = vec.len(delta);
  const minDist = ball.radius + jawRadius;
  if (dist >= minDist) return false;
  const n = dist > 1e-6 ? vec.scale(delta, 1 / dist) : { x: 1, y: 0 };
  ball.pos = vec.add(jaw, vec.scale(n, minDist));

  const vn = vec.dot(ball.vel, n);
  if (vn < 0) {
    const vt = vec.sub(ball.vel, vec.scale(n, vn));
    ball.vel = vec.add(
      vec.scale(vt, PHYSICS.railFrictionOnImpact),
      vec.scale(n, -vn * PHYSICS.restitutionCushion * 0.92)
    );
  }
  return true;
}

function resolveJawCollisions(ball: BallState, table: TableConfig): boolean {
  if (ball.pocketed) return false;
  const profile = getPocketProfile(table, ball.radius);
  let hit = false;

  for (const pocket of pockets(table)) {
    if (pocket.kind === "corner") {
      const jawX: Vec2 = {
        x: pocket.x + pocket.edgeX * (profile.cornerCenterHalfOpen + ball.radius * 0.18),
        y: pocket.y
      };
      const jawY: Vec2 = {
        x: pocket.x,
        y: pocket.y + pocket.edgeY * (profile.cornerCenterHalfOpen + ball.radius * 0.18)
      };
      if (resolveJawCircle(ball, jawX, profile.cornerJawRadius)) hit = true;
      if (resolveJawCircle(ball, jawY, profile.cornerJawRadius)) hit = true;
    } else {
      const leftJaw: Vec2 = {
        x: pocket.x - (profile.sideCenterHalfOpen + ball.radius * 0.14),
        y: pocket.y
      };
      const rightJaw: Vec2 = {
        x: pocket.x + (profile.sideCenterHalfOpen + ball.radius * 0.14),
        y: pocket.y
      };
      if (resolveJawCircle(ball, leftJaw, profile.sideJawRadius)) hit = true;
      if (resolveJawCircle(ball, rightJaw, profile.sideJawRadius)) hit = true;
    }
  }

  return hit;
}

function resolveCushion(ball: BallState, table: TableConfig): boolean {
  if (ball.pocketed) return false;
  let hit = resolveJawCollisions(ball, table);
  const left = table.rail + ball.radius;
  const right = table.width - table.rail - ball.radius;
  const top = table.rail + ball.radius;
  const bottom = table.height - table.rail - ball.radius;

  if (ball.pos.x < left && !hasLeftRightRailOpening(ball.pos.y, table, ball.radius)) {
    ball.pos.x = left;
    ball.vel.x = Math.abs(ball.vel.x) * PHYSICS.restitutionCushion;
    ball.vel.y *= PHYSICS.railFrictionOnImpact;
    hit = true;
  } else if (ball.pos.x > right && !hasLeftRightRailOpening(ball.pos.y, table, ball.radius)) {
    ball.pos.x = right;
    ball.vel.x = -Math.abs(ball.vel.x) * PHYSICS.restitutionCushion;
    ball.vel.y *= PHYSICS.railFrictionOnImpact;
    hit = true;
  }

  if (ball.pos.y < top && !hasTopBottomRailOpening(ball.pos.x, table, ball.radius)) {
    ball.pos.y = top;
    ball.vel.y = Math.abs(ball.vel.y) * PHYSICS.restitutionCushion;
    ball.vel.x *= PHYSICS.railFrictionOnImpact;
    hit = true;
  } else if (ball.pos.y > bottom && !hasTopBottomRailOpening(ball.pos.x, table, ball.radius)) {
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

function isInsidePocketThroat(
  ball: BallState,
  table: TableConfig,
  pocket: PocketDescriptor,
  profile: PocketProfile
): boolean {
  if (pocket.kind === "corner") {
    const cornerDepth = profile.cornerShelf + ball.radius * 0.45;
    const xInside =
      pocket.edgeX < 0 ? ball.pos.x <= table.rail + cornerDepth : ball.pos.x >= table.width - table.rail - cornerDepth;
    const yInside =
      pocket.edgeY < 0 ? ball.pos.y <= table.rail + cornerDepth : ball.pos.y >= table.height - table.rail - cornerDepth;
    return xInside && yInside;
  }

  const sideDepth = profile.sideShelf + ball.radius * 0.42;
  const yInside =
    pocket.edgeY < 0 ? ball.pos.y <= table.rail + sideDepth : ball.pos.y >= table.height - table.rail - sideDepth;
  const xInside = Math.abs(ball.pos.x - pocket.x) <= profile.sideCenterHalfOpen + ball.radius * 0.7;
  return xInside && yInside;
}

function resolvePocket(ball: BallState, table: TableConfig): boolean {
  if (ball.pocketed) return false;
  const profile = getPocketProfile(table, ball.radius);

  for (const p of pockets(table)) {
    const toPocket = vec.sub(p, ball.pos);
    const dist = vec.len(toPocket);
    const funnel = p.kind === "corner" ? profile.cornerFunnelRadius : profile.sideFunnelRadius;
    const capture = p.kind === "corner" ? profile.cornerCaptureRadius : profile.sideCaptureRadius;
    const inThroat = isInsidePocketThroat(ball, table, p, profile);

    if (inThroat && dist <= funnel && dist > 1e-6) {
      const pullFactor = ((funnel - dist) / funnel) * PHYSICS.pocketPullStrength;
      const pull = vec.scale(toPocket, pullFactor / dist);
      ball.vel = vec.add(ball.vel, pull);
      ball.vel = vec.scale(ball.vel, 0.992);
    }

    if (inThroat && dist <= capture) {
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
  maxSeconds = 9
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
