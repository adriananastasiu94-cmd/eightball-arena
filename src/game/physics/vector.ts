import { Vec2 } from "../types";

export const vec = {
  add: (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y }),
  sub: (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y }),
  scale: (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s }),
  dot: (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y,
  len: (a: Vec2): number => Math.hypot(a.x, a.y),
  norm: (a: Vec2): Vec2 => {
    const l = Math.hypot(a.x, a.y);
    return l < 1e-8 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
  }
};