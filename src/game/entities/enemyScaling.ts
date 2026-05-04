import { clamp } from '../utils/math';
import type { EnemyKind } from '../types';

export function enemyScaleForLevel(level: number) {
  return {
    hp: 1 + level * 0.12,
    damage: 1 + level * 0.08,
    speed: 1 + level * 0.015,
  };
}

export function eliteChanceForLevel(level: number) {
  return level >= 10 ? Math.min(0.18, level * 0.011) : 0;
}

export function chooseEnemyKindForLevel(level: number): EnemyKind {
  const roll = Math.random();
  const scaleWeightChance = clamp(0.12 + level * 0.008, 0.12, 0.26);
  const vendorChance = clamp(0.34 + level * 0.004, 0.34, 0.42);
  if (roll < scaleWeightChance) {
    return 'scaleWeight';
  }
  if (roll < scaleWeightChance + vendorChance) {
    return 'vendor';
  }
  return 'thug';
}
