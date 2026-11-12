// Загружает все картинки из манифеста (для отсутствующих рисует заглушки под теми же ключами) и звуки (src/config/audio.ts).
import * as Phaser from 'phaser';
import { AUDIO_DIR, AUDIO_FORMATS, MUSIC_KEYS, SOUND_KEYS } from '../config/audio';
import { restoreMute } from '../components/Sound';
import {
  ASSET_MANIFEST,
  HOME_LAYOUT,
  MENU_ART,
  menuArtKey,
  menuEyesKey,
  menuShardKey,
  SEAL_STAMP_KEY,
  SEAL_STAMP_PATH,
  SHOP_LAYOUT,
  ITEM_CELL_PX,
  PORTRAIT_H,
  PORTRAIT_W,
  ICON_PX,
  TAG_ICON_PX,
  UI_ART,
  BG_HOME_CLOSED_KEY,
  BG_HOME_CLOSED_PATH,
  UI_HEADER_KEY,
  UI_PARCHMENT_KEY,
  uiShopCardKey,
  uiButtonKey,
  uiIconKey,
  type UiIconId,
  uiSourceKey,
  type AssetEntry,
  type ButtonState,
} from '../config/assets';
import { ENEMIES } from '../data/enemies';
import { ENEMY_ITEMS } from '../data/enemyItems';
import { fits, rectMask, rotatedSize } from '../systems/backpack';
import { CATEGORY_COLORS, ITEMS } from '../data/items';
import { CATEGORY_GLYPHS, drawGlyph, STAT_GLYPHS, TAG_GLYPHS, type GlyphId } from '../components/glyphs';
import { TAGS } from '../data/tags';
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
    // Оформление интерфейса — необязательное: нет файла — без заглушки, кнопки и шапка рисуются кодом.
    for (const [s, b] of Object.entries(UI_ART.button)) this.load.image(uiSourceKey(`button_${s}`), b.path);
    this.load.image(uiSourceKey('header'), UI_ART.header.path);
    for (const [id, ic] of Object.entries(UI_ART.icons)) this.load.image(uiSourceKey(id), ic.path);
    this.load.image(uiSourceKey('parchment'), UI_ART.parchment.path);
    for (const id of ['button', 'logo', 'sliderTrack', 'sliderFill', 'sliderEnds'] as const) this.load.image(menuArtKey(id), MENU_ART[id].path);
    MENU_ART.eyes.forEach((e, n) => this.load.image(menuEyesKey(n), e.path));
    MENU_ART.shards.forEach((_, n) => this.load.image(menuShardKey(n), `ui/menu/shard_${n}.png`));
    this.load.image(SEAL_STAMP_KEY, SEAL_STAMP_PATH);
    for (const s of ['plain', 'rare'] as const) this.load.image(uiSourceKey(`shop_card_${s}`), UI_ART.shopCard[s].path);
    this.load.image(BG_HOME_CLOSED_KEY, BG_HOME_CLOSED_PATH);
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
    this.prepareUiArt();
    checkEnemyBags();
    restoreMute(this.game);
    this.loadAudioFallback(1, () => this.scene.start('Menu'));
  }

  /** Кнопки и шапка: обрезать прозрачные поля и уменьшить до рабочего размера (кнопки тянутся с неподвижными углами). */
  private prepareUiArt(): void {
    // Значки и пергамент: вырезать без полей и уменьшить до размера, в котором их рисуют.
    const cut = (src: string, crop: { x: number; y: number; w: number; h: number }, key: string, w: number, h: number) => {
      if (!this.textures.exists(src)) return;
      const img = this.textures.get(src).getSourceImage() as HTMLImageElement;
      const tex = this.textures.createCanvas(key, w, h)!;
      const ctx = tex.getContext();
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
      tex.refresh();
    };
    const IH = UI_ART.iconHeight;
    for (const [id, ic] of Object.entries(UI_ART.icons) as [UiIconId, (typeof UI_ART.icons)[UiIconId]][]) {
      cut(uiSourceKey(id), ic.crop, uiIconKey(id), Math.round((ic.crop.w * IH) / ic.crop.h), IH);
    }
    cut(uiSourceKey('parchment'), UI_ART.parchment.crop, UI_PARCHMENT_KEY, HOME_LAYOUT.card.w, HOME_LAYOUT.card.h);
    // Карточки магазина — картинка целиком, до размера карточки.
    for (const s of ['plain', 'rare'] as const) {
      const src = uiSourceKey(`shop_card_${s}`);
      if (!this.textures.exists(src)) continue;
      const img = this.textures.get(src).getSourceImage() as HTMLImageElement;
      cut(src, { x: 0, y: 0, w: img.width, h: img.height }, uiShopCardKey(s), UI_ART.shopCard.w, UI_ART.shopCard.h);
    }

    const H = UI_ART.buttonHeight;
    for (const [s, b] of Object.entries(UI_ART.button) as [ButtonState, (typeof UI_ART.button)[ButtonState]][]) {
      const src = uiSourceKey(`button_${s}`);
      if (!this.textures.exists(src)) continue;
      const img = this.textures.get(src).getSourceImage() as HTMLImageElement;
      const w = Math.round((b.crop.w * H) / b.crop.h);
      const tex = this.textures.createCanvas(uiButtonKey(s), w, H)!;
      const ctx = tex.getContext();
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, b.crop.x, b.crop.y, b.crop.w, b.crop.h, 0, 0, w, H);
      tex.refresh();
    }
    const hs = uiSourceKey('header');
    if (this.textures.exists(hs)) {
      const img = this.textures.get(hs).getSourceImage() as HTMLImageElement;
      const band = UI_ART.header.band;
      const tex = this.textures.createCanvas(UI_HEADER_KEY, img.width, band.h)!;
      tex.getContext().drawImage(img, 0, band.y, img.width, band.h, 0, 0, img.width, band.h);
      tex.refresh();
    }
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
    else if (s.kind === 'statIcon' || s.kind === 'category' || s.kind === 'link') [w, h] = [ICON_PX, ICON_PX];
    else if (s.kind === 'home' || s.kind === 'shop') [w, h] = [1920, 1080];
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
      const color = main ? TAGS[main].color : CATEGORY_COLORS[def.category];
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
    } else if (s.kind === 'shop') {
      drawShopStub(ctx, a.path);
    } else if (s.kind === 'tag') {
      drawBadge(ctx, w, TAGS[s.tagId].color, TAG_GLYPHS[s.tagId]);
    } else if (s.kind === 'category') {
      drawBadge(ctx, w, CATEGORY_COLORS[s.category], CATEGORY_GLYPHS[s.category]);
    } else if (s.kind === 'link') {
      // Цепь: белая на тёмном круге — в игре красится (tint) в цвет связи.
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2);
      ctx.fill();
      drawGlyph(ctx, 'chain', w / 2, h / 2, w * 0.74, '#ffffff');
    } else if (s.kind === 'statIcon') {
      // Значок характеристики: цветной рисунок на тёмном круге.
      const g = STAT_GLYPHS[s.iconId];
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2);
      ctx.fill();
      drawGlyph(ctx, g.glyph, w / 2, h / 2, w * 0.7, g.color);
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

/** Значок тега или категории: круг цвета типа с тёмной обводкой и светлый рисунок. */
function drawBadge(ctx: CanvasRenderingContext2D, w: number, color: number, glyph: GlyphId): void {
  ctx.fillStyle = hex(color);
  ctx.beginPath();
  ctx.arc(w / 2, w / 2, w / 2 - 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 4;
  ctx.stroke();
  drawGlyph(ctx, glyph, w / 2, w / 2, w * 0.56, '#f6f0e2');
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
/** Заглушка лавки (нет backgrounds/shop.webp): погреб, прилавок, силуэт торговца, мешок — по SHOP_LAYOUT. */
function drawShopStub(ctx: CanvasRenderingContext2D, path: string): void {
  const L = SHOP_LAYOUT;
  ctx.fillStyle = '#1b1612'; // каменная стена погреба
  ctx.fillRect(0, 0, 1920, 1080);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 3;
  for (let y = 40; y < 1080; y += 64) {
    for (let x = (y / 64) % 2 ? 0 : 60; x < 1920; x += 120) ctx.strokeRect(x, y, 120, 64);
  }
  // Торговец: голова и плечи за краем прилавка.
  const m = L.merchant;
  const mx = m.x + m.w / 2;
  ctx.fillStyle = '#0e0b0a';
  ctx.beginPath();
  ctx.ellipse(mx, m.y + 300, 70, 84, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(m.x + 10, m.y + m.h);
  ctx.quadraticCurveTo(m.x + 20, m.y + 400, mx, m.y + 390);
  ctx.quadraticCurveTo(m.x + m.w - 20, m.y + 400, m.x + m.w - 10, m.y + m.h);
  ctx.fill();
  ctx.fillStyle = '#d0a040'; // глаза
  ctx.beginPath();
  ctx.arc(mx - 24, m.y + 290, 7, 0, Math.PI * 2);
  ctx.arc(mx + 24, m.y + 290, 7, 0, Math.PI * 2);
  ctx.fill();
  // Прилавок: столешница из досок.
  const c = L.counter;
  ctx.fillStyle = '#4a3322';
  ctx.fillRect(c.x, c.y, c.w, c.h);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  for (let y = c.y + 95; y < c.y + c.h; y += 95) {
    ctx.beginPath();
    ctx.moveTo(c.x, y);
    ctx.lineTo(c.x + c.w, y);
    ctx.stroke();
  }
  ctx.strokeStyle = '#22170f';
  ctx.lineWidth = 8;
  ctx.strokeRect(c.x, c.y, c.w, c.h);
  ctx.fillStyle = '#2e2016'; // передний край прилавка
  ctx.fillRect(c.x - 10, c.y + c.h, c.w + 20, 26);
  // Мешок: мешковина со скруглёнными краями.
  const b = L.bag;
  ctx.fillStyle = '#5a4a32';
  ctx.beginPath();
  ctx.roundRect(b.x, b.y, b.w, b.h, 60);
  ctx.fill();
  ctx.strokeStyle = '#2a2116';
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; // тёмное нутро мешка под плитками
  ctx.beginPath();
  ctx.roundRect(b.x + 12, b.y + 50, b.w - 24, b.h - 80, 30);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.font = `28px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(`${path} (заглушка)`, 1896, 1050);
}

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
