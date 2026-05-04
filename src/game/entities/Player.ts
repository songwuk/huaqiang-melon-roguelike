import { Entity } from './Entity';
import { drawPixelCast } from './pixelCast';
import type { PlayerContract } from '../types';

export class Player extends Entity implements PlayerContract {
  moveSpeed: number;
  invulnTime = 0;

  constructor(maxHealth: number, moveSpeed: number) {
    super();
    this.moveSpeed = moveSpeed;
    this.radius = 24;
    this.maxHp = maxHealth;
    this.hp = this.maxHp;
    this.draw();
  }

  draw() {
    drawPixelCast(this.sprite, 'huaqiang', 2);
  }

  tickInvulnerability(dt: number) {
    this.invulnTime = Math.max(0, this.invulnTime - dt);
    this.sprite.alpha = this.invulnTime > 0 ? 0.55 : 1;
  }
}
