import * as PIXI from 'pixi.js';
import { Entity } from './Entity';
import { enemyScaleForLevel } from './enemyScaling';
import { drawPixelCast } from './pixelCast';
import { clamp, randomFloat } from '../utils/math';
import type { EnemyContract, EnemyKind, Vector2 } from '../types';

export class Enemy extends Entity implements EnemyContract {
  readonly healthBar = new PIXI.Graphics();
  kind: EnemyKind = 'thug';
  metal = false;
  elite = false;
  finalBoss = false;
  moveSpeed = 105;
  touchDamage = 10;
  expReward = 18;
  slowTime = 0;
  slowMultiplier = 1;
  freezeTime = 0;
  burnTime = 0;
  burnDamagePerSecond = 0;
  burnPulse = 0;
  magnetDamagePulse = 0;
  steamCooldown = 0;
  abilityCooldown = 0;
  dashWindup = 0;
  dashTime = 0;
  dashDirection: Vector2 = { x: 0, y: 0 };
  detonateTime = 0;

  constructor() {
    super();
    this.healthBar.visible = false;
  }

  override setActive(active: boolean) {
    super.setActive(active);
    this.healthBar.visible = active;
  }

  override setPosition(x: number, y: number) {
    super.setPosition(x, y);
    this.syncHealthBarPosition();
  }

  override syncSprite() {
    super.syncSprite();
    this.syncHealthBarPosition();
  }

  spawn(x: number, y: number, level: number, kind: EnemyKind, elite = false, finalBoss = false) {
    this.kind = kind;
    this.elite = elite;
    this.finalBoss = finalBoss;
    this.metal = kind === 'scaleWeight' || kind === 'boss';
    this.vx = 0;
    this.vy = 0;
    this.slowTime = 0;
    this.slowMultiplier = 1;
    this.freezeTime = 0;
    this.burnTime = 0;
    this.burnDamagePerSecond = 0;
    this.burnPulse = 0;
    this.magnetDamagePulse = 0;
    this.steamCooldown = 0;
    this.abilityCooldown = randomFloat(0.7, 2.2);
    this.dashWindup = 0;
    this.dashTime = 0;
    this.dashDirection = { x: 0, y: 0 };
    this.detonateTime = 0;
    this.sprite.tint = 0xffffff;
    this.sprite.scale.set(finalBoss ? 1.28 : elite ? 1.16 : 1);
    this.healthBar.scale.set(1);

    const scaling = enemyScaleForLevel(level);

    if (finalBoss) {
      this.radius = 68;
      this.maxHp = Math.round(1150 * scaling.hp);
      this.moveSpeed = 48 * scaling.speed;
      this.touchDamage = Math.round(34 * scaling.damage);
      this.expReward = 920;
      this.healthBar.scale.set(1.15);
      this.drawBoss();
    } else if (kind === 'boss') {
      this.radius = 48;
      this.maxHp = Math.round(280 * scaling.hp);
      this.moveSpeed = 58 * scaling.speed;
      this.touchDamage = Math.round(22 * scaling.damage);
      this.expReward = Math.round(150 * (1 + level * 0.04));
      this.drawBoss();
    } else if (kind === 'scaleWeight') {
      this.radius = 22;
      this.maxHp = Math.round(44 * scaling.hp);
      this.moveSpeed = 88 * scaling.speed;
      this.touchDamage = Math.round(12 * scaling.damage);
      this.expReward = Math.round(24 * (1 + level * 0.035));
      this.drawScaleWeight();
    } else if (kind === 'vendor') {
      this.radius = 23;
      this.maxHp = Math.round(38 * scaling.hp);
      this.moveSpeed = 102 * scaling.speed;
      this.touchDamage = Math.round(10 * scaling.damage);
      this.expReward = Math.round(20 * (1 + level * 0.035));
      this.drawVendor();
    } else {
      this.radius = 21;
      this.maxHp = Math.round(31 * scaling.hp);
      this.moveSpeed = 122 * scaling.speed;
      this.touchDamage = Math.round(9 * scaling.damage);
      this.expReward = Math.round(17 * (1 + level * 0.035));
      this.drawThug();
    }

    if (elite && !finalBoss && kind !== 'boss') {
      this.maxHp = Math.round(this.maxHp * 1.78);
      this.moveSpeed *= 1.08;
      this.touchDamage = Math.round(this.touchDamage * 1.25);
      this.expReward = Math.round(this.expReward * 1.75);
      this.radius += 3;
    }

    this.hp = this.maxHp;
    this.setPosition(x, y);
    this.setActive(true);
    this.updateHealthBar();
  }

  syncHealthBarPosition() {
    this.healthBar.position.set(this.x, this.y - this.radius - 14);
  }

  updateHealthBar() {
    const pct = clamp(this.hp / this.maxHp, 0, 1);
    const width = this.finalBoss ? 116 : this.kind === 'boss' ? 82 : this.elite ? 54 : 46;
    const height = this.finalBoss ? 9 : this.kind === 'boss' ? 7 : 5;
    const fill = pct > 0.55 ? 0x75d64b : pct > 0.25 ? 0xffe45c : 0xef3340;
    this.healthBar.clear();
    this.healthBar.beginFill(0x050505, 0.82);
    this.healthBar.drawRect(-width / 2 - 2, -2, width + 4, height + 4);
    this.healthBar.endFill();
    this.healthBar.beginFill(0x2f2f34, 0.95);
    this.healthBar.drawRect(-width / 2, 0, width, height);
    this.healthBar.endFill();
    this.healthBar.beginFill(fill, 0.96);
    this.healthBar.drawRect(-width / 2, 0, width * pct, height);
    this.healthBar.endFill();
    if (this.elite || this.finalBoss) {
      this.healthBar.lineStyle(1, this.finalBoss ? 0xef3340 : 0xfacc15, 0.92);
      this.healthBar.drawRect(-width / 2 - 2, -2, width + 4, height + 4);
    }
  }

  private drawThug() {
    drawPixelCast(this.sprite, 'thug', 2);
  }

  private drawVendor() {
    drawPixelCast(this.sprite, 'vendor', 2);
  }

  private drawScaleWeight() {
    drawPixelCast(this.sprite, 'scaleWeight', 2);
  }

  private drawBoss() {
    drawPixelCast(this.sprite, 'scaleBoss', 3);
  }
}
