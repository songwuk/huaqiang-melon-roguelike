import * as PIXI from 'pixi.js';
import { CAST_PIXEL_RECTS } from '../pixelPortraits';
import type { CastId } from '../types';

export function drawPixelCast(graphics: PIXI.Graphics, castId: CastId, scale: number) {
  graphics.clear();
  for (const rect of CAST_PIXEL_RECTS[castId]) {
    graphics.beginFill(rect.color);
    graphics.drawRect((rect.x - 16) * scale, (rect.y - 16) * scale, rect.w * scale, rect.h * scale);
    graphics.endFill();
  }
}
