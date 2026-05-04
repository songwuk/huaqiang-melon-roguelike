import * as PIXI from 'pixi.js';
import { allocateGameId } from '../utils/ids';
import type { EntityContract } from '../types';

export abstract class Entity implements EntityContract {
  id = allocateGameId();
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  radius = 10;
  hp = 1;
  maxHp = 1;
  active = false;
  readonly sprite = new PIXI.Graphics();

  constructor() {
    this.sprite.visible = false;
  }

  setActive(active: boolean) {
    this.active = active;
    this.sprite.visible = active;
  }

  setPosition(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.sprite.position.set(x, y);
  }

  syncSprite() {
    this.sprite.position.set(this.x, this.y);
  }

  update(dt: number) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.syncSprite();
  }
}
