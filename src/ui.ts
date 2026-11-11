// Общие элементы интерфейса: текст, кнопки, шапка, фон, подписи предметов.
import * as Phaser from 'phaser';
import { CLIENT_PENALTY_MULT, CLIENT_REWARD_MULT, ENEMY_ITEM_STATS, GHOST_FIRST_HIT_MULT, ITEM_STATS, NIGHTS, START_LIVES, type ItemStats } from './config/balance';
import {
  BG_HORSE_KEY,
  categoryKey,
  HEADER_LAYOUT,
  HORSE_ART,
  itemKey,
  statIconKey,
  tagKey,
  UI_ART,
  UI_HEADER_KEY,
  uiButtonKey,
  uiIconKey,
  type ButtonState,
  type StatIconId,
} from './config/assets';
import { CLIENTS, type ClientId } from './data/clients';
import { FEEL } from './config/feel';
import { getVolume, isMuted, setVolume, sfx, toggleMute } from './components/Sound';
import { ENEMIES, type EnemyId } from './data/enemies';
import { ENEMY_CATEGORY_NAMES, ENEMY_ITEMS, type EnemyItemId } from './data/enemyItems';
import { CATEGORY_NAMES, ITEMS, type ItemId, type ItemTier } from './data/items';
import { enemyName, MODIFIERS, type ModifierId } from './data/modifiers';
import type { TagId } from './data/tags';
import type { OwnedItem } from './systems/backpack';
import { enemyDamageMult, enemyPower } from './systems/battle';
import { auraInfo, auraText, starOf, starStats, type ItemPower } from './systems/synergy';
import { heroLevel, run } from './state';
import type { EnemyTooltip } from './components/EnemyTooltip';

export const W = 1920;
export const H = 1080;
/** Основной текст — PT Serif (хорошо читается мелко); заголовки, имена и кнопки — Kurale. Файлы — FONT_FILES в assets.ts. */
export const FONT = "'PT Serif', Georgia, serif";
export const FONT_TITLE = "Kurale, 'PT Serif', Georgia, serif";
/** Стиль заголовка для addText: Kurale без жирного (у шрифта нет жирного начертания). */
export const TITLE = { fontFamily: FONT_TITLE, fontStyle: 'normal' } as const;

export const C = {
  panel: 0x231f2b,
  border: 0x4a4357,
  btn: 0x3a3346,
  btnHover: 0x52486a,
  btnOff: 0x26222d,
  text: '#ece6d6',
  dim: '#8f889c',
  accent: '#e0b65a',
  good: '#7fd47f',
  bad: '#e06060',
  block: '#7fb6e0',
  /** Тёмные «чернила» для текста на светлом пергаменте. */
  ink: '#2b1d12',
  inkAccent: '#6b2a10',
  inkDim: '#5c4a38',
  inkGood: '#2f6418',
  inkBad: '#8e1c14',
};

/** Цвет рамки редкости (карточка в магазине, клетки в инвентаре). У редкости 1 рамки нет. */
export const TIER_COLORS: Record<ItemTier, number> = { 1: 0x6b6f78, 2: 0x4f8fd0, 3: 0x4f8fd0 };

/** Рамка редкости предмета: редкие и особые — цветная рамка, обычные — без рамки (null). */
export function itemRarityFrame(id: ItemId): number | null {
  const tier = ITEMS[id].tier;
  return tier > 1 ? TIER_COLORS[tier] : null;
}

export function addText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  str: string,
  size = 28,
  color = C.text,
  style: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color, ...style });
}

/**
 * Кнопка. Если художница нарисовала плашку (UI_ART), фон — её картинка с неподвижными углами (три состояния:
 * обычная, наведена, неактивна); иначе — прямоугольник, нарисованный кодом.
 */
export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Rectangle;
  private plates: Partial<Record<ButtonState, Phaser.GameObjects.NineSlice>> = {};
  private label: Phaser.GameObjects.Text;
  private enabled = true;
  private hovered = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    w: number,
    h: number,
    text: string,
    onClick: () => void,
    size = 28,
  ) {
    super(scene, x, y);
    const art = scene.textures.exists(uiButtonKey('normal'));
    // Без картинки — видимый прямоугольник; с картинкой — невидимая зона нажатия под плашками.
    this.bg = art ? scene.add.rectangle(0, 0, w, h, 0xffffff, 0.001) : scene.add.rectangle(0, 0, w, h, C.btn).setStrokeStyle(2, C.border);
    this.add(this.bg);
    if (art) {
      // Плашка растягивается до w×h с неподвижными углами: тянем её в масштабе высоты buttonHeight, затем уменьшаем.
      const H = UI_ART.buttonHeight;
      const k = h / H;
      for (const s of ['normal', 'hover', 'disabled'] as ButtonState[]) {
        const key = scene.textures.exists(uiButtonKey(s)) ? uiButtonKey(s) : uiButtonKey('normal');
        const sx = Math.round(H * UI_ART.slice.x);
        const sy = Math.round(H * UI_ART.slice.y);
        const plate = scene.add.nineslice(0, 0, key, undefined, Math.max(w / k, sx * 2 + 2), H, sx, sx, sy, sy).setScale(k);
        this.plates[s] = plate;
        this.add(plate);
      }
    }
    this.label = addText(scene, 0, 0, text, size, C.text, { ...TITLE, stroke: '#000000', strokeThickness: art ? 4 : 0 }).setOrigin(0.5);
    this.add(this.label);
    this.showState();
    this.bg.setInteractive({ useHandCursor: true });
    this.bg.on('pointerover', () => {
      this.hovered = true;
      this.showState();
      if (this.enabled) sfx(scene, 'ui_hover');
    });
    this.bg.on('pointerout', () => {
      this.hovered = false;
      this.showState();
    });
    this.bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.enabled || p.button !== 0) return;
      sfx(scene, 'ui_click');
      onClick();
    });
    scene.add.existing(this);
  }

  setEnabled(v: boolean): this {
    this.enabled = v;
    this.label.setColor(v ? C.text : C.dim);
    this.showState();
    return this;
  }

  /** Фон по состоянию: неактивна, наведена или обычная. */
  private showState(): void {
    const state: ButtonState = !this.enabled ? 'disabled' : this.hovered ? 'hover' : 'normal';
    if (this.plates.normal) {
      for (const [s, p] of Object.entries(this.plates)) p!.setVisible(s === state);
    } else {
      this.bg.setFillStyle(state === 'disabled' ? C.btnOff : state === 'hover' ? C.btnHover : C.btn);
    }
  }

  setLabel(text: string): this {
    this.label.setText(text);
    return this;
  }
}

/** Масштабирует картинку, чтобы она вписалась в maxW×maxH с сохранением пропорций. */
export function fit<T extends Phaser.GameObjects.Image>(img: T, maxW: number, maxH: number): T {
  img.setScale(Math.min(maxW / img.width, maxH / img.height));
  return img;
}

/** Фон на весь экран (обрезается по краям, если пропорции другие). */
export function addBackground(scene: Phaser.Scene, key: string): void {
  const img = scene.add.image(W / 2, H / 2, key);
  img.setScale(Math.max(W / img.width, H / img.height));
}

/** Кнопка «Без звука» / «Включить звук»: переключает музыку и звуки вместе. Подпись — что случится по нажатию. */
export function addMuteButton(scene: Phaser.Scene, r: { x: number; y: number; w: number; h: number }, size = 22): Button {
  const label = () => (isMuted(scene) ? 'Включить звук' : 'Без звука');
  const btn = new Button(scene, r.x, r.y, r.w, r.h, label(), () => {
    toggleMute(scene);
    btn.setLabel(label());
  }, size);
  return btn;
}

/**
 * Ползунок громкости: тащи мышью или кликни по дорожке. Меняет громкость всей игры (звуки и музыка),
 * значение запоминается в браузере. r — левый край дорожки, длина и центр по вертикали.
 */
export function addVolumeSlider(scene: Phaser.Scene, r: { x: number; y: number; w: number }): void {
  const label = addText(scene, r.x, r.y - 44, '', 24, C.text);
  scene.add.rectangle(r.x, r.y, r.w, 10, 0x000000, 0.6).setOrigin(0, 0.5).setStrokeStyle(2, C.border);
  const fill = scene.add.rectangle(r.x, r.y, 0, 10, 0xe0b65a).setOrigin(0, 0.5);
  const knob = scene.add.circle(r.x, r.y, 16, 0xece6d6).setStrokeStyle(3, 0x000000);
  const show = (v: number) => {
    fill.width = r.w * v;
    knob.x = r.x + r.w * v;
    label.setText(`Громкость: ${Math.round(v * 100)}%`);
  };
  show(getVolume());

  // Зона нажатия шире самой дорожки, чтобы попадать было легко.
  const hit = scene.add.rectangle(r.x - 16, r.y, r.w + 32, 44, 0xffffff, 0.001).setOrigin(0, 0.5);
  hit.setInteractive({ useHandCursor: true });
  let dragging = false;
  const apply = (p: Phaser.Input.Pointer) => {
    const v = Phaser.Math.Clamp((p.x - r.x) / r.w, 0, 1);
    setVolume(scene, v);
    show(v);
  };
  hit.on('pointerdown', (p: Phaser.Input.Pointer) => {
    if (p.button !== 0) return;
    dragging = true;
    apply(p);
  });
  const onMove = (p: Phaser.Input.Pointer) => dragging && apply(p);
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    sfx(scene, 'ui_click'); // проба: как звучит выбранная громкость
  };
  scene.input.on('pointermove', onMove);
  scene.input.on('pointerup', onUp);
  scene.input.on('pointerupoutside', onUp);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.input.off('pointermove', onMove);
    scene.input.off('pointerup', onUp);
    scene.input.off('pointerupoutside', onUp);
  });
}

// ─── Переходы между сценами ──────────────────────────────────────────────────

/** Сцены, которые уже уходят (затемняются), — повторный переход игнорируется. */
const leaving = new WeakSet<Phaser.Scene>();
let fadePending = false;

/** Перейти в сцену с затемнением. Новая сцена проявляется сама, если в create() вызывает fadeIn(). */
export function goto(scene: Phaser.Scene, key: string, data?: object): void {
  if (leaving.has(scene)) return;
  leaving.add(scene);
  const cam = scene.cameras.main;
  cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
    fadePending = true;
    scene.scene.start(key, data);
  });
  cam.fadeOut(FEEL.fadeMs, 0, 0, 0);
}

/** Вызывать первой строкой create(): проявление после goto() (перезапуск сцены без goto — без затемнения). */
export function fadeIn(scene: Phaser.Scene): void {
  leaving.delete(scene);
  if (!fadePending) return;
  fadePending = false;
  scene.cameras.main.fadeIn(FEEL.fadeMs, 0, 0, 0);
}

/**
 * Подложка рюкзака (лошадь с сумками) точно под сеткой героя: сетка с левым верхним углом (gridX, gridY) и клеткой cell.
 * Привязка картинки к клеткам — HORSE_ART.
 */
export function addHorse(scene: Phaser.Scene, gridX: number, gridY: number, cell: number): Phaser.GameObjects.Image {
  const k = cell / HORSE_ART.cellPx;
  return scene.add.image(gridX - HORSE_ART.gridX * k, gridY - HORSE_ART.gridY * k, BG_HORSE_KEY).setOrigin(0).setScale(k);
}

/** Жизни сердечками: ♥ — есть, ♡ — потеряна. */
export function livesText(lives = run.lives): string {
  return '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, START_LIVES - lives));
}

/** Размеры значков в шапке (px). */
const HEART_PX = 46;
const COIN_PX = 38;

/**
 * Жизни у правого края (x — правый край, y — центр): картинки целого и разбитого сердца художницы,
 * без картинок — текстом ♥♡. Возвращает ширину и обновление.
 */
export function addLives(scene: Phaser.Scene, x: number, y: number): { width: () => number; refresh: () => void } {
  if (!scene.textures.exists(uiIconKey('heart_full'))) {
    const t = addText(scene, x, y, livesText(), 34, C.bad, { fontStyle: 'bold' }).setOrigin(1, 0.5);
    return { width: () => t.width, refresh: () => t.setText(livesText()) };
  }
  const gap = 6;
  const hearts: Phaser.GameObjects.Image[] = [];
  for (let i = 0; i < START_LIVES; i++) {
    // Слева направо: сначала целые, потом разбитые (как ♥♥♡).
    const cx = x - (START_LIVES - 1 - i) * (HEART_PX + gap) - HEART_PX / 2;
    hearts.push(scene.add.image(cx, y, uiIconKey('heart_full')));
  }
  const refresh = () =>
    hearts.forEach((h, i) => {
      const broken = i >= run.lives && scene.textures.exists(uiIconKey('heart_broken'));
      h.setTexture(uiIconKey(broken ? 'heart_broken' : 'heart_full'));
      h.setScale(HEART_PX / h.height);
      h.setAlpha(i >= run.lives && !broken ? 0.3 : 1);
    });
  refresh();
  return { width: () => START_LIVES * HEART_PX + (START_LIVES - 1) * gap, refresh };
}

/**
 * Жизни у правого края полосы (x — правый край, y — центр) и монеты левее: значок монеты и число
 * (без картинки — «Монеты: N»). Возвращает функцию обновления (монеты меняются, например, от аванса Кикиморы).
 */
export function addCoinsAndLives(scene: Phaser.Scene, x: number, y: number): () => void {
  const lives = addLives(scene, x, y);
  const art = scene.textures.exists(uiIconKey('coin'));
  const coins = addText(scene, 0, y, '', art ? 32 : 28, C.accent, art ? { fontStyle: 'bold', stroke: '#000000', strokeThickness: 4 } : {}).setOrigin(1, 0.5);
  const icon = art ? scene.add.image(0, y, uiIconKey('coin')) : null;
  icon?.setScale(COIN_PX / icon.height);
  const refresh = () => {
    lives.refresh();
    coins.setText(art ? `${run.coins}` : `Монеты: ${run.coins}`).setX(x - lives.width() - 30);
    icon?.setX(coins.x - coins.width - 8 - COIN_PX / 2);
  };
  refresh();
  return refresh;
}

/** Фон верхней полосы 80 px: балка художницы (повторяется по ширине), без картинки — тёмная полоса. */
export function addTopBar(scene: Phaser.Scene): void {
  if (scene.textures.exists(UI_HEADER_KEY)) {
    const k = 80 / UI_ART.header.band.h;
    scene.add.tileSprite(0, 0, W, 80, UI_HEADER_KEY).setOrigin(0).setTileScale(k, k);
  } else {
    scene.add.rectangle(0, 0, W, 80, 0x000000, 0.6).setOrigin(0);
  }
}

/** Верхняя полоса: ночь, заголовок, монеты и жизни, кнопка «Без звука». Возвращает обновление монет и жизней. */
export function addHeader(scene: Phaser.Scene, title: string): () => void {
  addTopBar(scene);
  addMuteButton(scene, HEADER_LAYOUT.mute);
  addText(scene, 30, 40, `Ночь ${run.night} / ${NIGHTS}    Уровень ${heroLevel()}`, 30).setOrigin(0, 0.5);
  addText(scene, W / 2, 40, title, 38, C.text, TITLE).setOrigin(0.5);
  return addCoinsAndLives(scene, W - 30, 40);
}

const num = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

/** Характеристики строкой: «урон 6 · раз в 1.5 с». */
function statsLine(id: ItemId, s: ItemStats, charges?: number): string {
  const d = ITEMS[id];
  const parts: string[] = [];
  if (s.damage) parts.push(`урон ${num(s.damage)}`);
  if (s.heal) parts.push(`лечение ${num(s.heal)}`);
  if (s.block) parts.push(`блок ${num(s.block)}`);
  if (s.stun) parts.push(`оглушение ${num(s.stun)} с`);
  if (s.weaponMult) parts.push(`урон оружия ×${s.weaponMult} на ${num(s.buffDuration ?? 0)} с`);
  if (s.selfDamage) {
    const ch = s.selfDamageChance ?? 1;
    parts.push(`ранит героя на ${s.selfDamage}${ch < 1 ? ` (шанс ${Math.round(ch * 100)}%)` : ''}`);
  }
  const aura = auraText(id);
  if (aura) parts.push(aura);
  if (d.mode === 'passive' && s.cooldown) parts.push(`раз в ${s.cooldown} с`);
  if (d.mode === 'active') parts.push(`зарядов: ${charges ?? s.charges} (кончатся — предмет исчезнет)`);
  else if (s.charges) parts.push(`срабатываний: ${charges ?? s.charges} (кончатся — предмет исчезнет)`);
  return parts.join(' · ');
}

/** Одна характеристика на карточке: значок + число; hint — полная фраза при наведении; tag — значок тега рядом (аура). */
export interface StatChip {
  icon: StatIconId;
  value: string;
  hint: string;
  tag?: TagId;
  /** Во всю ширину карточки (аура — длинная). */
  wide?: boolean;
}

/** Характеристики предмета значками: сначала эффект, потом побочка и аура, в конце — перезарядка или заряды. */
export function itemStatChips(id: ItemId, s: ItemStats = ITEM_STATS[id], charges?: number): StatChip[] {
  const d = ITEMS[id];
  const out: StatChip[] = [];
  if (s.damage) out.push({ icon: 'damage', value: num(s.damage), hint: `Урон врагу: ${num(s.damage)}` });
  if (s.heal) out.push({ icon: 'heal', value: num(s.heal), hint: `Лечит героя на ${num(s.heal)}` });
  if (s.block) out.push({ icon: 'block', value: num(s.block), hint: `Блок: ${num(s.block)} (поглощает удары врага)` });
  if (s.stun) out.push({ icon: 'stun', value: `${num(s.stun)} с`, hint: `Оглушает врага на ${num(s.stun)} с` });
  if (s.weaponMult) {
    const dur = num(s.buffDuration ?? 0);
    out.push({ icon: 'buff', value: `×${num(s.weaponMult)}`, hint: `Урон оружия ×${num(s.weaponMult)}` });
    out.push({ icon: 'duration', value: `${dur} с`, hint: `Действует ${dur} с` });
  }
  if (s.selfDamage) {
    const ch = s.selfDamageChance ?? 1;
    const pct = Math.round(ch * 100);
    out.push({
      icon: 'self',
      value: `−${num(s.selfDamage)}${ch < 1 ? ` · ${pct}%` : ''}`,
      hint: `Ранит героя на ${num(s.selfDamage)}${ch < 1 ? ` с шансом ${pct}%` : ''}`,
    });
  }
  const aura = auraInfo(id);
  if (aura) {
    const pct = `${aura.amount > 0 ? '+' : ''}${Math.round(aura.amount * 100)}%`;
    out.push({
      icon: 'aura',
      value: aura.tag ? pct : `${aura.target} ${pct}`,
      tag: aura.tag ?? undefined,
      hint: `Аура: соседнее ${aura.target} ${pct} к ${aura.damage ? 'урону' : 'эффекту'}`,
      wide: true,
    });
  }
  if (d.mode === 'passive' && s.cooldown) {
    out.push({ icon: 'cooldown', value: `${num(s.cooldown)} с`, hint: `Срабатывает сам раз в ${num(s.cooldown)} с` });
  }
  if (d.mode === 'active') {
    const n = charges ?? s.charges ?? 0;
    out.push({ icon: 'charges', value: `${n}`, hint: `Активный: нажми на него в бою. Зарядов: ${n} — кончатся, предмет исчезнет` });
  } else if (s.charges) {
    const n = charges ?? s.charges;
    out.push({ icon: 'charges', value: `${n}`, hint: `Сработает ${n} раз — потом предмет исчезнет` });
  }
  return out;
}

// ─── Плашки-значки с подсказкой (карточка заказа, доска, окно врага) ─────────

/** Плашка: значок (ключ текстуры), второй значок, короткое значение и его цвет; hint — полная фраза при наведении. */
export interface UiChip {
  icon: string;
  icon2?: string;
  value?: string;
  color?: string;
  hint: string;
  /** Перечеркнуть значок красным (запрет). */
  cross?: boolean;
}

const tips = new WeakMap<Phaser.Scene, Phaser.GameObjects.Text>();

/** Одна подсказка на сцену: тёмная плашка с текстом над объектом. */
function hoverTip(scene: Phaser.Scene): Phaser.GameObjects.Text {
  let t = tips.get(scene);
  if (!t || !t.scene) {
    t = addText(scene, 0, 0, '', 20, C.text, {
      backgroundColor: 'rgba(20,18,26,0.95)',
      padding: { x: 12, y: 8 },
      wordWrap: { width: 440 },
      lineSpacing: 3,
    })
      .setOrigin(0.5, 1)
      .setDepth(1000)
      .setVisible(false);
    tips.set(scene, t);
  }
  return t;
}

/** При наведении на объект — подсказка над ним (полная фраза). */
export function withHoverTip<T extends Phaser.GameObjects.GameObject & { getBounds: () => Phaser.Geom.Rectangle }>(obj: T, hint: string): T {
  obj.setInteractive();
  obj.on('pointerover', () => {
    const tip = hoverTip(obj.scene);
    const b = obj.getBounds();
    tip.setText(hint);
    const half = tip.width / 2 + 10;
    tip.setPosition(Phaser.Math.Clamp(b.centerX, half, W - half), b.top - 6).setVisible(true);
    if (tip.y - tip.height < 4) tip.setOrigin(0.5, 0).setY(b.bottom + 6);
    else tip.setOrigin(0.5, 1);
  });
  obj.on('pointerout', () => hoverTip(obj.scene).setVisible(false));
  obj.once(Phaser.GameObjects.Events.DESTROY, () => tips.get(obj.scene)?.setVisible(false));
  return obj;
}

/** Ключ значка монеты: монета художницы, без неё — значок зарядов. */
export function coinIconKey(scene: Phaser.Scene): string {
  return scene.textures.exists(uiIconKey('coin')) ? uiIconKey('coin') : statIconKey('charges');
}

/**
 * Плашки слева направо с переносом по ширине maxW. Возвращает размер занятого места.
 * h — высота плашки; bg — цвет подложки (по умолчанию тёмная, для пергамента и для тёмной доски).
 */
export function addChips(
  scene: Phaser.Scene,
  x: number,
  y: number,
  chips: UiChip[],
  o: { h?: number; font?: number; maxW?: number; gap?: number; bg?: number; bgAlpha?: number; container?: Phaser.GameObjects.Container } = {},
): { w: number; h: number } {
  const h = o.h ?? 34;
  const font = o.font ?? Math.round(h * 0.6);
  const gap = o.gap ?? 6;
  const icon = Math.round(h * 0.78);
  const maxW = o.maxW ?? W;
  const add = <T extends Phaser.GameObjects.GameObject>(g: T) => {
    o.container?.add(g);
    return g;
  };
  let cx = x;
  let top = y;
  let widest = 0;
  for (const ch of chips) {
    const t = ch.value ? addText(scene, 0, 0, ch.value, font, ch.color ?? C.text, { fontStyle: 'bold' }).setOrigin(0, 0.5) : null;
    const w = 6 + icon + (ch.icon2 ? icon + 3 : 0) + (t ? 5 + t.width : 0) + 7;
    if (cx > x && cx + w > x + maxW) {
      cx = x;
      top += h + gap;
    }
    const mid = top + h / 2;
    const bg = add(scene.add.rectangle(cx, top, w, h, o.bg ?? 0x1a1410, o.bgAlpha ?? 0.85).setOrigin(0));
    let ix = cx + 6;
    for (const key of [ch.icon, ch.icon2]) {
      if (!key) continue;
      add(fit(scene.add.image(ix + icon / 2, mid, key), icon, icon));
      if (ch.cross) {
        // Запрет: красная черта по диагонали значка.
        const g = add(scene.add.graphics());
        g.lineStyle(Math.max(3, h * 0.1), 0xe04040, 1).lineBetween(ix + 2, top + 4, ix + icon - 2, top + h - 4);
      }
      ix += icon + 3;
    }
    if (t) add(t.setPosition(ix + 2, mid));
    withHoverTip(bg, ch.hint);
    cx += w + gap;
    widest = Math.max(widest, cx - gap - x);
  }
  return { w: widest, h: chips.length ? top + h - y : 0 };
}

const fmtMult = (x: number) => `×${String(x).replace('.', ',')}`;

/**
 * Условие заказчика плашками: запрет (перечёркнутый значок), первый удар, нельзя отступать, аванс,
 * множители награды и неустойки. battleOnly — только то, что важно для сборки и боя (доска).
 */
export function conditionChips(scene: Phaser.Scene, id: ClientId, battleOnly = false): UiChip[] {
  const c = CLIENTS[id].condition;
  const out: UiChip[] = [];
  for (const s of c.ban ?? []) {
    const icon = s.tag ? tagKey(s.tag) : s.item ? itemKey(s.item) : s.category ? categoryKey(s.category) : statIconKey('damage');
    const text = c.banText ? c.banText[0].toUpperCase() + c.banText.slice(1) : 'Запрет';
    out.push({ icon, cross: true, hint: `${text} — в бою с врагами этого заказа (как отключённые соседством).` });
  }
  if (c.firstHitBonus) {
    out.push({
      icon: statIconKey('damage'),
      value: fmtMult(GHOST_FIRST_HIT_MULT),
      color: C.good,
      hint: `Первый удар по каждому врагу этого заказа ${fmtMult(GHOST_FIRST_HIT_MULT)}.`,
    });
  }
  if (c.noRetreat) out.push({ icon: statIconKey('noRetreat'), hint: 'Нельзя отступить на привале, пока этот заказ не выполнен.' });
  if (battleOnly) return out;
  const penalty = CLIENT_PENALTY_MULT[id];
  if (c.advance) {
    out.push({
      icon: statIconKey('advance'),
      hint: `Аванс: награда сразу, как только примешь заказ. Провал — вернуть аванс${penalty ? ` и неустойка ${fmtMult(penalty)}` : ''}.`,
    });
  }
  const reward = CLIENT_REWARD_MULT[id];
  if (reward) out.push({ icon: coinIconKey(scene), value: fmtMult(reward), color: reward >= 1 ? C.good : C.bad, hint: `Награда ${fmtMult(reward)} (уже в числе награды).` });
  if (penalty && !c.advance) out.push({ icon: coinIconKey(scene), value: fmtMult(penalty), color: C.bad, hint: `Неустойка ${fmtMult(penalty)} (уже в числе неустойки).` });
  return out;
}

/** Предмет врага плашками: урон (и по монстру), блок, лечение (порог), перезарядка или замах, заряды, кража. */
export function enemyItemChips(scene: Phaser.Scene, id: EnemyItemId, mod: ModifierId | null = null): UiChip[] {
  const d = ENEMY_ITEMS[id];
  const s = ENEMY_ITEM_STATS[id];
  const m = enemyPower(run.night, mod);
  const out: UiChip[] = [];
  if (s.damage) {
    const dmg = Math.round(s.damage * m * enemyDamageMult(mod));
    out.push({ icon: statIconKey('damage'), value: `${dmg}`, hint: `Урон по герою: ${dmg}` });
    if (s.monsterMult) {
      out.push({ icon: statIconKey('monster'), value: fmtMult(s.monsterMult), color: C.bad, hint: `По монстру урон ${fmtMult(s.monsterMult)} — Людьмак ведь монстр.` });
    }
  }
  if (s.block) out.push({ icon: statIconKey('block'), value: `${Math.round(s.block * m)}`, hint: `Блок: ${Math.round(s.block * m)} (поглощает удары героя)` });
  if (s.heal) {
    const pct = s.healBelow ? Math.round(s.healBelow * 100) : 0;
    out.push({
      icon: statIconKey('heal'),
      value: `${Math.round(s.heal * m)}${pct ? ` · <${pct}%` : ''}`,
      hint: `Лечит себя на ${Math.round(s.heal * m)}${pct ? `, когда здоровье ниже ${pct}%` : ''}.`,
    });
  }
  if (s.stealCoins) {
    out.push({ icon: coinIconKey(scene), value: `−${s.stealCoins}`, color: C.bad, hint: `Крадёт ${s.stealCoins} мон. из награды при каждом ударе.` });
  }
  if (s.cooldown) {
    out.push({
      icon: statIconKey('cooldown'),
      value: `${s.cooldown} с`,
      hint:
        d.mode === 'passive'
          ? `Срабатывает сам раз в ${s.cooldown} с.`
          : `Замах ${s.cooldown} с перед ударом. Удар с уроном можно парировать, пока сжимается кольцо.`,
    });
  }
  if (s.charges) out.push({ icon: statIconKey('charges'), value: `${s.charges}`, hint: `Зарядов: ${s.charges} — кончатся, предмет больше не используется.` });
  return out;
}

/** Значок типа предмета (верх карточки) — его категория: Оружие, Броня, Амулет, Алхимия, Еда. */
export function itemTypeIcon(id: ItemId): { key: string; name: string } {
  const c = ITEMS[id].category;
  return { key: categoryKey(c), name: CATEGORY_NAMES[c] };
}

/** Описание предмета из магазина: «Оружие · урон 6 · раз в 1.5 с». */
export function describeItem(id: ItemId): string {
  return `${CATEGORY_NAMES[ITEMS[id].category]} · ${statsLine(id, ITEM_STATS[id])}`;
}

/**
 * Подсказка для предмета героя: имя и уровень, база, итог с соседями и построчно — от кого что пришло.
 * powers/items — текущий расчёт соседства (без них — только база).
 */
export function describeOwnedItem(it: OwnedItem, powers?: Map<number, ItemPower>, items: OwnedItem[] = []): string {
  const d = ITEMS[it.id];
  const star = starOf(it);
  const head = `${d.name}${star > 1 ? ` ★${star}` : ''} — ${CATEGORY_NAMES[d.category]}`;
  const p = it.inGrid ? powers?.get(it.uid) : undefined;
  const base = p?.base ?? starStats(it.id, star);
  const lines = [head, `База: ${statsLine(it.id, base, it.charges)}`];
  if (!p) {
    if (!it.inGrid) lines.push('Вне сумок — в бою не участвует.');
    return lines.join('\n');
  }
  if (p.received.some((e) => e.rule.effect.kind === 'boost')) lines.push(`Итог: ${statsLine(it.id, p.final, it.charges)}`);
  for (const e of p.received) {
    const src = items.find((i) => i.uid === e.source);
    lines.push(`   ${src ? ITEMS[src.id].name : '?'} (${e.rule.title}): ${e.label}`);
  }
  if (p.blockedBy) lines.push(`ОТКЛЮЧЁН: ${p.blockedBy} — в бою не срабатывает.`);
  else if (p.disabled) lines.push('ОТКЛЮЧЁН: в бою не срабатывает.');
  if (p.poisoned) lines.push('ОТРАВЛЕН: лечение ранит героя.');
  return lines.join('\n');
}

/** Состав сумки врага в порядке использования (по priority): предмет и сколько таких штук. */
export function bagSummary(enemy: EnemyId): { id: EnemyItemId; count: number }[] {
  const counts = new Map<EnemyItemId, number>();
  for (const s of ENEMIES[enemy].bag) counts.set(s.item, (counts.get(s.item) ?? 0) + 1);
  return [...counts]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => ENEMY_ITEMS[a.id].priority - ENEMY_ITEMS[b.id].priority);
}

/** «Снаряд · урон 2 · раз в 1.5 с · зарядов: 2» — с учётом силы врагов этой ночи и модификатора врага. */
export function describeEnemyItem(id: EnemyItemId, mod: ModifierId | null = null): string {
  const d = ENEMY_ITEMS[id];
  const s = ENEMY_ITEM_STATS[id];
  const m = enemyPower(run.night, mod);
  const parts: string[] = [ENEMY_CATEGORY_NAMES[d.category]];
  if (s.damage) {
    const dmg = Math.round(s.damage * m * enemyDamageMult(mod));
    parts.push(`урон ${dmg}${s.monsterMult ? ` (×${s.monsterMult} по монстру)` : ''}`);
  }
  if (s.block) parts.push(`блок ${Math.round(s.block * m)}`);
  if (s.heal) parts.push(`лечение ${Math.round(s.heal * m)}`);
  if (s.healBelow) parts.push(`когда здоровье ниже ${Math.round(s.healBelow * 100)}%`);
  if (s.stealCoins) parts.push(`крадёт ${s.stealCoins} мон. из награды при каждом ударе`);
  if (s.cooldown) parts.push(d.mode === 'passive' ? `раз в ${s.cooldown} с` : `${s.cooldown} с на замах`);
  if (s.charges) parts.push(`зарядов: ${s.charges}`);
  return parts.join(' · ');
}

/** Значок модификатора врага, нарисованный кодом: цветной круг с буквой. */
export function addModifierBadge(scene: Phaser.Scene, x: number, y: number, r: number, mod: ModifierId): Phaser.GameObjects.Container {
  const m = MODIFIERS[mod];
  const badge = scene.add.container(x, y);
  badge.add(scene.add.circle(0, 0, r, m.color).setStrokeStyle(3, 0x000000));
  badge.add(addText(scene, 0, 0, m.letter, Math.round(r * 1.1), '#000000', { fontStyle: 'bold' }).setOrigin(0.5));
  badge.setSize(r * 2, r * 2);
  return badge;
}

/**
 * Строки врагов («Пьяный стражник», «Крестьянин с вилами ×2»), при наведении — сумка врага.
 * mods — модификаторы в том же порядке, что enemies. Возвращает высоту блока.
 */
export function addEnemyLines(
  scene: Phaser.Scene,
  x: number,
  y: number,
  enemies: EnemyId[],
  mods: (ModifierId | null)[],
  tooltip: EnemyTooltip,
  size = 24,
  container?: Phaser.GameObjects.Container,
  colors: { text: string; accent: string } = { text: C.text, accent: C.accent },
  /** Ширина, в которую должна влезть строка (вместе с кружком модификатора): длинное имя — мельче шрифт. */
  maxW = Infinity,
): number {
  // Одинаковые враги с одинаковым модификатором — одной строкой «×N».
  const groups = new Map<string, { e: EnemyId; mod: ModifierId | null; n: number }>();
  enemies.forEach((e, i) => {
    const mod = mods[i] ?? null;
    const key = `${e}|${mod}`;
    const g = groups.get(key);
    if (g) g.n++;
    else groups.set(key, { e, mod, n: 1 });
  });
  const lh = size + 10;
  [...groups.values()].forEach(({ e, mod, n }, i) => {
    // С модификатором — перед именем кружок с буквой (как на портрете в бою), без него — точка.
    const r = Math.round(size * 0.42);
    const tx = mod ? x + 2 * r + 6 : x;
    const label = `${mod ? '' : '• '}${enemyName(e, mod)}${n > 1 ? ` ×${n}` : ''}`;
    const t = addText(scene, tx, y + i * lh, label, size, mod ? colors.accent : colors.text);
    for (let s = size - 1; tx - x + t.width > maxW && s >= 14; s--) t.setFontSize(s);
    if (mod) container?.add(addModifierBadge(scene, x + r, t.y + t.height / 2, r, mod));
    t.setInteractive({ useHandCursor: true });
    t.on('pointerover', () => {
      t.setColor(colors.accent);
      const b = t.getBounds();
      tooltip.show(e, mod, { x: b.x, y: b.y, w: b.width, h: b.height });
    });
    // Окно само прячется, когда мышь уйдёт и со строки, и с окна (чтобы можно было навести на предметы в сумке).
    t.on('pointerout', () => t.setColor(mod ? colors.accent : colors.text));
    container?.add(t);
  });
  return groups.size * lh;
}
