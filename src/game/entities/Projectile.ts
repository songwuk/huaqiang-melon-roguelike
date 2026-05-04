import { Entity } from './Entity';
import type { ProjectileContract, Vector2 } from '../types';

export interface ProjectileSpawnTuning {
  projectileDamage: number;
  unripeKnockback: number;
  projectileLifetime: number;
  projectileSpeed: number;
}

export class Projectile extends Entity implements ProjectileContract {
  isRipe = false;
  damage = 1;
  lifetime = 0;
  knockbackForce = 0;
  direction: Vector2 = { x: 1, y: 0 };
  splitDepth = 0;

  spawn(x: number, y: number, direction: Vector2, isRipe: boolean, damageScale: number, tuning: ProjectileSpawnTuning, splitDepth = 0) {
    this.isRipe = isRipe;
    this.splitDepth = splitDepth;
    this.radius = 9;
    this.direction.x = direction.x;
    this.direction.y = direction.y;
    this.damage = tuning.projectileDamage * damageScale;
    this.knockbackForce = tuning.unripeKnockback;
    this.lifetime = tuning.projectileLifetime;
    this.vx = direction.x * tuning.projectileSpeed;
    this.vy = direction.y * tuning.projectileSpeed;
    this.draw();
    if (splitDepth > 0) {
      this.radius = 7;
      this.damage *= 0.45;
      this.lifetime *= 0.58;
      this.sprite.scale.set(0.76);
    } else {
      this.sprite.scale.set(1);
    }
    this.setPosition(x, y);
    this.setActive(true);
  }

  private draw() {
    const color = this.isRipe ? 0xef3340 : 0x67b84d;
    this.sprite.clear();
    this.sprite.beginFill(color);
    this.sprite.drawCircle(0, 0, 9);
    this.sprite.endFill();
    this.sprite.lineStyle(2, 0x101010, 0.72);
    this.sprite.moveTo(-14, 0);
    this.sprite.lineTo(14, 0);
    this.sprite.moveTo(0, -14);
    this.sprite.lineTo(0, 14);
  }
}
