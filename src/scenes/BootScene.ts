// Загружает все картинки из манифеста (для отсутствующих рисует заглушки под теми же ключами) и звуки (src/config/audio.ts).
import * as Phaser from 'phaser';
import { AUDIO_DIR, AUDIO_FORMATS, MUSIC_KEYS, SOUND_KEYS } from '../config/audio';
import { restoreMute } from '../components/Sound';
import {
  ASSET_MANIFEST,
  HOME_LAYOUT,
  ITEM_CELL_PX,
  PORTRAIT_H,
  PORTRAIT_W,
  TAG_ICON_PX,
  type AssetEntry,
} from '../config/assets';
import { ENEMIES } from '../data/enemies';
import { ENEMY_ITEMS } from '../data/enemyItems';
import { fits, rectMask, rotatedSize } from '../systems/backpack';
import { ITEMS } from '../data/items';
import { TAGS, UNTAGGED_COLOR } from '../data/tags';
import { addText, FONT, H, W } from '../ui';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

const AUDIO_KEYS: string[] = [...SOUND_KEYS, ...MUSIC_KEYS];

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    addText(this, W / 2, H / 2, 'Загрузка…', 40).setOrigin(0.5);
    this.load.setPath('assets/');
    // Отсутствующий файл — не ошибка: картинке Boot нарисует заглушку, звук просто не будет играть.
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, () => {});
    for (const a of ASSET_MANIFEST) this.load.image(a.key, a.path);
    for (const key of AUDIO_KEYS) this.load.audio(key, `${AUDIO_DIR}${key}.${AUDIO_FORMATS[0]}`);
  }

  create(): void {
    const stubbed: string[] = [];
    for (const a of ASSET_MANIFEST) {
      if (!this.textures.exists(a.key)) {
        this.makeStub(a);
        stubbed.push(a.path);
      }
    }
    if (stubbed.length > 0) console.info(`[assets] заглушки (${stubbed.length}):\n` + stubbed.join('\n'));
    checkEnemyBags();
    restoreMute(this.game);
    this.loadAudioFallback(1, () => this.scene.start('Menu'));
  }

  /**
   * Для звуков, которых нет в .ogg, — следующий формат из AUDIO_FORMATS (.mp3).
   * Phaser сам выбирает формат по поддержке браузера, а не по наличию файла, поэтому запасной — отдельным проходом.
   */
  private loadAudioFallback(format: number, done: () => void): void {
    const missing = AUDIO_KEYS.filter((k) => !this.cache.audio.exists(k));
    if (missing.length === 0) return done();
    if (format >= AUDIO_FORMATS.length) {
      console.info(
        `[audio] нет файлов (${missing.length}), эти звуки пропускаются:\n` +
          missing.map((k) => `${AUDIO_DIR}${k}.${AUDIO_FORMATS.join(' / .')}`).join('\n'),
      );
      return done();
    }
    for (const key of missing) this.load.audio(key, `${AUDIO_DIR}${key}.${AUDIO_FORMATS[format]}`);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => this.loadAudioFallback(format + 1, done));
    this.load.start();
  }

  private makeStub(a: AssetEntry): void {
    const s = a.stub;
    let w: number;
    let h: number;
    if (s.kind === 'portrait') [w, h] = [PORTRAIT_W, PORTRAIT_H];
    else if (s.kind === 'item') [w, h] = [ITEMS[s.itemId].w * ITEM_CELL_PX, ITEMS[s.itemId].h * ITEM_CELL_PX];
    else if (s.kind === 'enemyItem')
      [w, h] = [ENEMY_ITEMS[s.itemId].w * ITEM_CELL_PX, ENEMY_ITEMS[s.itemId].h * ITEM_CELL_PX];
    else if (s.kind === 'tag') [w, h] = [TAG_ICON_PX, TAG_ICON_PX];
    else if (s.kind === 'home') [w, h] = [1920, 1080];
    else [w, h] = [s.w, s.h];

    const tex = this.textures.createCanvas(a.key, w, h)!;
    const ctx = tex.getContext();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (s.kind === 'portrait') {
      ctx.fillStyle = '#2a2633';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#5a5268';
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, w - 8, h - 8);
      ctx.fillStyle = '#ece6d6';
      wrapText(ctx, s.label, w / 2, h / 2, w - 60, 52, 'bold');
      ctx.fillStyle = '#8f889c';
      ctx.font = `22px ${FONT}`;
      ctx.fillText(a.path, w / 2, h - 36);
    } else if (s.kind === 'item') {
      const def = ITEMS[s.itemId];
      const main = def.tags.find((t) => TAGS[t].kind === 'tag');
      const color = main ? TAGS[main].color : UNTAGGED_COLOR;
      ctx.fillStyle = hex(color);
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, w - 6, h - 6);
      ctx.fillStyle = '#111';
      wrapText(ctx, def.name, w / 2, h / 2, w - 16, 22, 'bold');
      if (def.mode === 'active') {
        ctx.font = `bold 18px ${FONT}`;
        ctx.fillText('актив', w / 2, h - 16);
      }
    } else if (s.kind === 'enemyItem') {
      // Предметы врагов — красноватые, с тёмной рамкой, чтобы не путать с предметами героя.
      const def = ENEMY_ITEMS[s.itemId];
      const main = def.tags.find((t) => TAGS[t].kind === 'tag');
      ctx.fillStyle = main ? hex(TAGS[main].color) : '#8a4b42';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#3a1410';
      ctx.lineWidth = 10;
      ctx.strokeRect(5, 5, w - 10, h - 10);
      ctx.fillStyle = '#111';
      wrapText(ctx, def.name, w / 2, h / 2, w - 20, 22, 'bold');
    } else if (s.kind === 'home') {
      drawHomeStub(ctx, a.path);
    } else if (s.kind === 'tag') {
      const t = TAGS[s.tagId];
      ctx.fillStyle = hex(t.color);
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.round(h * 0.55)}px ${FONT}`;
      ctx.fillText(t.letter, w / 2, h / 2 + 2);
    } else {
      ctx.fillStyle = s.color;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.font = `28px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(`${a.path} (заглушка)`, w - 24, h - 30);
    }
    tex.refresh();
  }
}

/** Проверка раскладок сумок врагов из src/data/enemies.ts: предмет внутри сетки и не налезает на другие. */
function checkEnemyBags(): void {
  for (const e of Object.values(ENEMIES)) {
    const mask = rectMask(e.bagCols, e.bagRows);
    const occupied: { col: number; row: number; w: number; h: number }[] = [];
    for (const s of e.bag) {
      const size = rotatedSize(ENEMY_ITEMS[s.item].w, ENEMY_ITEMS[s.item].h, s.rotated ?? false);
      if (!fits(mask, occupied, size.w, size.h, s.col, s.row)) {
        console.warn(`[enemies] ${e.id}: ${s.item} в (${s.col},${s.row}) не помещается в сетку ${e.bagCols}×${e.bagRows} или налезает на другой предмет`);
      }
      occupied.push({ col: s.col, row: s.row, ...size });
    }
  }
}

/** Заглушка интерьера избы: стена, пол, дверь с окошком, доска, сундук, сумки — по HOME_LAYOUT. */
function drawHomeStub(ctx: CanvasRenderingContext2D, path: string): void {
  const L = HOME_LAYOUT;
  ctx.fillStyle = '#2b2119'; // бревенчатая стена
  ctx.fillRect(0, 0, 1920, 1080);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 4;
  for (let y = 60; y < 1080; y += 70) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1920, y);
    ctx.stroke();
  }
  ctx.fillStyle = '#1d1611'; // пол
  ctx.fillRect(0, 960, 1920, 120);

  const rect = (r: { x: number; y: number; w: number; h: number }, fill: string, stroke: string) => {
    ctx.fillStyle = fill;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 8;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  };
  rect(L.door, '#4a3424', '#22170f');
  ctx.fillStyle = '#0b0a0d'; // проём окошка
  const wnd = L.window;
  ctx.beginPath();
  ctx.roundRect(wnd.x, wnd.y, wnd.w, wnd.h, wnd.radius);
  ctx.fill();
  rect(L.board, '#3d2f22', '#1a120c');
  rect(L.shop, '#5a3d24', '#22170f');
  rect(L.bags, '#4d3a26', '#22170f');

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.font = `bold 34px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('дверь', L.door.x + L.door.w / 2, L.door.y + L.door.h - 60);
  ctx.fillText('сундук', L.shop.x + L.shop.w / 2, L.shop.y + L.shop.h - 40);
  ctx.fillText('сумки', L.bags.x + L.bags.w / 2, L.bags.y + L.bags.h - 40);
  ctx.font = `28px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(`${path} (заглушка)`, 1896, 1050);
}

/** Пишет текст по центру (cx, cy), перенося по словам в ширину maxW. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  maxW: number,
  size: number,
  weight = '',
): void {
  // Уменьшаем шрифт, пока самое длинное слово не влезет в ширину.
  const longest = text.split(' ').reduce((a, b) => (b.length > a.length ? b : a), '');
  do ctx.font = `${weight} ${size}px ${FONT}`;
  while (ctx.measureText(longest).width > maxW && --size > 10);
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  lines.push(line);
  const lh = size * 1.15;
  lines.forEach((l, i) => ctx.fillText(l, cx, cy + (i - (lines.length - 1) / 2) * lh));
}
