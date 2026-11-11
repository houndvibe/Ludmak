// Простые значки, нарисованные кодом на canvas — заглушки иконок, пока художница не нарисовала свои:
// характеристики предмета (урон, лечение, перезарядка…), категории предметов и теги.
// Boot рисует их под ключами из src/config/assets.ts; когда появится PNG, он заменит заглушку под тем же ключом.
import type { StatIconId } from '../config/assets';
import type { ItemCategory } from '../data/items';
import type { TagId } from '../data/tags';

export type GlyphId =
  | 'sword'
  | 'shield'
  | 'heart'
  | 'stun'
  | 'clock'
  | 'bolt'
  | 'swordUp'
  | 'hourglass'
  | 'drop'
  | 'aura'
  | 'flame'
  | 'moon'
  | 'flask'
  | 'bread'
  | 'skull'
  | 'waves'
  | 'amulet'
  | 'bomb'
  | 'potion'
  | 'chain'
  | 'swords'
  | 'door'
  | 'scroll'
  | 'noRetreat'
  | 'coinFast';

/** Значок характеристики и его цвет (рисуется на тёмном круге). */
export const STAT_GLYPHS: Record<StatIconId, { glyph: GlyphId; color: string }> = {
  damage: { glyph: 'sword', color: '#ff7a6a' },
  heal: { glyph: 'heart', color: '#7fd47f' },
  block: { glyph: 'shield', color: '#7fb6e0' },
  stun: { glyph: 'stun', color: '#f0d060' },
  cooldown: { glyph: 'clock', color: '#ece6d6' },
  charges: { glyph: 'bolt', color: '#e0b65a' },
  buff: { glyph: 'swordUp', color: '#f0a050' },
  duration: { glyph: 'hourglass', color: '#ece6d6' },
  self: { glyph: 'drop', color: '#e04848' },
  aura: { glyph: 'aura', color: '#c9a0ff' },
  enemies: { glyph: 'swords', color: '#ff7a6a' },
  queue: { glyph: 'door', color: '#e0b65a' },
  contracts: { glyph: 'scroll', color: '#ece6d6' },
  noRetreat: { glyph: 'noRetreat', color: '#ff7a6a' },
  advance: { glyph: 'coinFast', color: '#e0b65a' },
  monster: { glyph: 'skull', color: '#c9a0ff' },
};

/** Значок категории (светлый на цветном круге; цвет круга — CATEGORY_COLORS). */
export const CATEGORY_GLYPHS: Record<ItemCategory, GlyphId> = {
  weapon: 'sword',
  armor: 'shield',
  amulet: 'amulet',
  alchemy: 'flask',
  food: 'bread',
};

/** Значок тега (светлый на круге цвета тега). */
export const TAG_GLYPHS: Record<TagId, GlyphId> = {
  fire: 'flame',
  silver: 'moon',
  curse: 'skull',
  noisy: 'waves',
  heal: 'heart',
  bomb: 'bomb',
  elixir: 'potion',
  oil: 'drop',
  stun: 'stun',
};

type Ctx = CanvasRenderingContext2D;

function sword(c: Ctx): void {
  c.beginPath();
  c.moveTo(0, -0.95);
  c.lineTo(0.13, -0.75);
  c.lineTo(0.13, 0.35);
  c.lineTo(-0.13, 0.35);
  c.lineTo(-0.13, -0.75);
  c.closePath();
  c.fill();
  c.fillRect(-0.42, 0.35, 0.84, 0.13);
  c.fillRect(-0.07, 0.48, 0.14, 0.3);
  c.beginPath();
  c.arc(0, 0.86, 0.11, 0, Math.PI * 2);
  c.fill();
}

const GLYPHS: Record<GlyphId, (c: Ctx) => void> = {
  sword: (c) => {
    c.rotate(Math.PI / 4);
    sword(c);
  },
  shield: (c) => {
    c.beginPath();
    c.moveTo(0, -0.85);
    c.quadraticCurveTo(0.45, -0.6, 0.75, -0.65);
    c.lineTo(0.72, 0.05);
    c.quadraticCurveTo(0.6, 0.6, 0, 0.92);
    c.quadraticCurveTo(-0.6, 0.6, -0.72, 0.05);
    c.lineTo(-0.75, -0.65);
    c.quadraticCurveTo(-0.45, -0.6, 0, -0.85);
    c.fill();
  },
  heart: (c) => {
    c.beginPath();
    c.moveTo(0, 0.82);
    c.bezierCurveTo(-1.05, 0.1, -0.75, -0.9, 0, -0.35);
    c.bezierCurveTo(0.75, -0.9, 1.05, 0.1, 0, 0.82);
    c.fill();
  },
  stun: (c) => {
    c.lineWidth = 0.15;
    c.beginPath();
    for (let i = 0; i <= 80; i++) {
      const a = (i / 80) * Math.PI * 4.2;
      const r = 0.06 + (i / 80) * 0.8;
      if (i === 0) c.moveTo(r * Math.cos(a), r * Math.sin(a));
      else c.lineTo(r * Math.cos(a), r * Math.sin(a));
    }
    c.stroke();
  },
  clock: (c) => {
    c.lineWidth = 0.15;
    c.beginPath();
    c.arc(0, 0, 0.78, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.moveTo(0, 0.05);
    c.lineTo(0, -0.5);
    c.moveTo(0, 0.05);
    c.lineTo(0.38, 0.2);
    c.stroke();
  },
  bolt: (c) => {
    c.beginPath();
    c.moveTo(0.22, -0.95);
    c.lineTo(-0.5, 0.12);
    c.lineTo(-0.04, 0.12);
    c.lineTo(-0.22, 0.95);
    c.lineTo(0.52, -0.16);
    c.lineTo(0.06, -0.16);
    c.closePath();
    c.fill();
  },
  swordUp: (c) => {
    c.save();
    c.translate(-0.38, 0.02);
    c.scale(0.9, 0.9);
    sword(c);
    c.restore();
    c.beginPath();
    c.moveTo(0.5, -0.9);
    c.lineTo(0.92, -0.32);
    c.lineTo(0.65, -0.32);
    c.lineTo(0.65, 0.62);
    c.lineTo(0.35, 0.62);
    c.lineTo(0.35, -0.32);
    c.lineTo(0.08, -0.32);
    c.closePath();
    c.fill();
  },
  hourglass: (c) => {
    c.fillRect(-0.62, -0.92, 1.24, 0.16);
    c.fillRect(-0.62, 0.76, 1.24, 0.16);
    c.lineWidth = 0.13;
    c.beginPath();
    c.moveTo(-0.48, -0.76);
    c.lineTo(0.48, -0.76);
    c.lineTo(0.08, 0);
    c.lineTo(0.48, 0.76);
    c.lineTo(-0.48, 0.76);
    c.lineTo(-0.08, 0);
    c.closePath();
    c.stroke();
    c.beginPath();
    c.moveTo(0, 0.22);
    c.lineTo(0.36, 0.7);
    c.lineTo(-0.36, 0.7);
    c.closePath();
    c.fill();
  },
  drop: (c) => {
    c.beginPath();
    c.moveTo(0, -0.92);
    c.bezierCurveTo(0.3, -0.4, 0.66, -0.05, 0.66, 0.3);
    c.arc(0, 0.3, 0.66, 0, Math.PI);
    c.bezierCurveTo(-0.66, -0.05, -0.3, -0.4, 0, -0.92);
    c.fill();
  },
  aura: (c) => {
    c.beginPath();
    c.arc(0, 0, 0.26, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 0.11;
    for (const r of [0.55, 0.85]) {
      c.beginPath();
      c.arc(0, 0, r, 0, Math.PI * 2);
      c.stroke();
    }
  },
  flame: (c) => {
    c.beginPath();
    c.moveTo(0, -0.95);
    c.bezierCurveTo(0.2, -0.5, 0.75, -0.2, 0.7, 0.3);
    c.bezierCurveTo(0.65, 0.75, 0.3, 0.92, 0, 0.92);
    c.bezierCurveTo(-0.3, 0.92, -0.65, 0.75, -0.7, 0.3);
    c.bezierCurveTo(-0.72, -0.05, -0.4, -0.2, -0.3, -0.5);
    c.bezierCurveTo(-0.1, -0.25, -0.05, -0.6, 0, -0.95);
    c.fill();
  },
  moon: (c) => {
    // Полумесяц: круг минус сдвинутый круг (внутри клипа первого круга).
    c.save();
    c.beginPath();
    c.arc(0, 0, 0.8, 0, Math.PI * 2);
    c.clip();
    c.beginPath();
    c.rect(-1, -1, 2, 2);
    c.moveTo(0.4 + 0.68, -0.25);
    c.arc(0.4, -0.25, 0.68, 0, Math.PI * 2);
    c.fill('evenodd');
    c.restore();
  },
  flask: (c) => {
    c.fillRect(-0.3, -0.95, 0.6, 0.14);
    c.fillRect(-0.18, -0.85, 0.36, 0.42);
    c.beginPath();
    c.moveTo(-0.18, -0.45);
    c.lineTo(-0.7, 0.55);
    c.quadraticCurveTo(-0.76, 0.86, -0.45, 0.86);
    c.lineTo(0.45, 0.86);
    c.quadraticCurveTo(0.76, 0.86, 0.7, 0.55);
    c.lineTo(0.18, -0.45);
    c.closePath();
    c.fill();
  },
  bread: (c) => {
    c.beginPath();
    c.moveTo(-0.88, 0.5);
    c.bezierCurveTo(-0.95, -0.65, 0.95, -0.65, 0.88, 0.5);
    c.closePath();
    c.fill();
  },
  skull: (c) => {
    c.beginPath();
    c.arc(0, -0.15, 0.7, 0, Math.PI * 2);
    c.fill();
    c.fillRect(-0.4, 0.3, 0.8, 0.48);
    // Глазницы и нос — прорези (сквозь них виден фон).
    const op = c.globalCompositeOperation;
    c.globalCompositeOperation = 'destination-out';
    for (const x of [-0.27, 0.27]) {
      c.beginPath();
      c.arc(x, -0.1, 0.18, 0, Math.PI * 2);
      c.fill();
    }
    c.fillRect(-0.06, 0.45, 0.12, 0.33);
    c.globalCompositeOperation = op;
  },
  waves: (c) => {
    c.fillRect(-0.85, -0.25, 0.3, 0.5);
    c.beginPath();
    c.moveTo(-0.56, -0.25);
    c.lineTo(-0.15, -0.62);
    c.lineTo(-0.15, 0.62);
    c.lineTo(-0.56, 0.25);
    c.closePath();
    c.fill();
    c.lineWidth = 0.13;
    for (const r of [0.42, 0.78]) {
      c.beginPath();
      c.arc(-0.12, 0, r, -0.8, 0.8);
      c.stroke();
    }
  },
  amulet: (c) => {
    c.lineWidth = 0.1;
    c.beginPath();
    c.moveTo(-0.6, -0.92);
    c.lineTo(0, -0.05);
    c.lineTo(0.6, -0.92);
    c.stroke();
    c.beginPath();
    c.arc(0, 0.4, 0.46, 0, Math.PI * 2);
    c.fill();
  },
  chain: (c) => {
    // Два вытянутых звена цепи под углом.
    c.rotate(-Math.PI / 4);
    c.lineWidth = 0.2;
    for (const x of [-0.33, 0.33]) {
      c.beginPath();
      c.ellipse(x, 0, 0.46, 0.24, 0, 0, Math.PI * 2);
      c.stroke();
    }
  },
  potion: (c) => {
    // Круглый пузырёк с горлышком и пробкой.
    c.fillRect(-0.22, -0.95, 0.44, 0.18);
    c.fillRect(-0.14, -0.8, 0.28, 0.35);
    c.beginPath();
    c.arc(0, 0.3, 0.62, 0, Math.PI * 2);
    c.fill();
  },
  swords: (c) => {
    // Два меча крест-накрест.
    for (const a of [-Math.PI / 4, Math.PI / 4]) {
      c.save();
      c.rotate(a);
      c.scale(0.85, 0.85);
      GLYPHS.sword(c);
      c.restore();
    }
  },
  door: (c) => {
    // Дверь с полукруглым верхом и ручкой.
    c.lineWidth = 0.14;
    c.beginPath();
    c.moveTo(-0.5, 0.9);
    c.lineTo(-0.5, -0.4);
    c.arc(0, -0.4, 0.5, Math.PI, 0);
    c.lineTo(0.5, 0.9);
    c.closePath();
    c.stroke();
    c.beginPath();
    c.arc(0.25, 0.2, 0.09, 0, Math.PI * 2);
    c.fill();
  },
  scroll: (c) => {
    // Свиток: лист с завитками сверху и снизу и строчками.
    c.fillRect(-0.5, -0.75, 1, 1.5);
    c.beginPath();
    c.arc(-0.5, -0.75, 0.16, 0, Math.PI * 2);
    c.arc(0.5, -0.75, 0.16, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(-0.5, 0.75, 0.16, 0, Math.PI * 2);
    c.arc(0.5, 0.75, 0.16, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    for (const y of [-0.35, 0, 0.35]) c.fillRect(-0.32, y - 0.05, 0.64, 0.1);
    c.globalCompositeOperation = 'source-over';
  },
  noRetreat: (c) => {
    // Стрелка назад, перечёркнутая.
    c.lineWidth = 0.18;
    c.beginPath();
    c.moveTo(0.6, 0);
    c.lineTo(-0.5, 0);
    c.moveTo(-0.15, -0.38);
    c.lineTo(-0.55, 0);
    c.lineTo(-0.15, 0.38);
    c.stroke();
    c.lineWidth = 0.14;
    c.beginPath();
    c.arc(0, 0, 0.85, 0, Math.PI * 2);
    c.moveTo(-0.6, -0.6);
    c.lineTo(0.6, 0.6);
    c.stroke();
  },
  coinFast: (c) => {
    // Монета, летящая вперёд: круг и линии движения слева.
    c.beginPath();
    c.arc(0.25, 0, 0.55, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 0.12;
    c.beginPath();
    for (const y of [-0.3, 0, 0.3]) {
      c.moveTo(-0.9, y);
      c.lineTo(-0.45, y);
    }
    c.stroke();
  },
  bomb: (c) => {
    c.beginPath();
    c.arc(-0.12, 0.22, 0.66, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 0.12;
    c.beginPath();
    c.moveTo(0.3, -0.3);
    c.quadraticCurveTo(0.45, -0.78, 0.82, -0.72);
    c.stroke();
    c.beginPath();
    c.arc(0.84, -0.74, 0.13, 0, Math.PI * 2);
    c.fill();
  },
};

/** Нарисовать значок в квадрате size×size с центром (cx, cy). */
export function drawGlyph(ctx: Ctx, id: GlyphId, cx: number, cy: number, size: number, color: string): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(size / 2, size / 2);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.14;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  GLYPHS[id](ctx);
  ctx.restore();
}
