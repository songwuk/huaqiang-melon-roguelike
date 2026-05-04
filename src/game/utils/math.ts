import type { Vector2 } from '../types';

interface CircleLike {
  x: number;
  y: number;
  radius: number;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function randomFloat(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export function distanceSq(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function intersects(a: CircleLike, b: CircleLike) {
  const radius = a.radius + b.radius;
  return distanceSq(a.x, a.y, b.x, b.y) <= radius * radius;
}

export function normalize(dx: number, dy: number): Vector2 {
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}
