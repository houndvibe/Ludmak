// Общие элементы интерфейса: текст, кнопки, шапка, фон, подписи предметов.
import * as Phaser from 'phaser';
import { DEBT_PAYMENTS, ENEMY_ITEM_STATS, ITEM_STATS, NIGHTS, type ItemStats } from './config/balance';
import { BG_HORSE_KEY, HEADER_LAYOUT, HORSE_ART, tagKey } from './config/assets';
import { FEEL } from './config/feel';
import { getVolume, isMuted, setVolume, sfx, toggleMute } from './components/Sound';
import { ENEMIES, type EnemyId } from './data/enemies';
import { ENEMY_CATEGORY_NAMES, ENEMY_ITEMS, type EnemyItemId } from './data/enemyItems';
import { CATEGORY_NAMES, ITEMS, type ItemId, type ItemTier } from './data/items';
import { enemyName, MODIFIERS, type ModifierId } from './data/modifiers';
import { TAGS, type TagId } from './data/tags';
import type { OwnedItem } from './systems/backpack';
import { enemyDamageMult, enemyPower } from './systems/battle';
import { auraText, starOf, starStats, type ItemPower } from './systems/synergy';
import { heroLevel, run } from './state';
import type { EnemyTooltip } from './components/EnemyTooltip';

export const W = 1920;
export const H = 1080;
export const FONT = 'Arial, Helvetica, sans-serif';

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
};

/** Цвет рамки редкости (карточка в магазине, клетки в инвентаре). У редкости 1 рамки нет. */
export const TIER_COLORS: Record<ItemTier, number> = { 1: 0x6b6f78, 2: 0x4f8fd0, 3: 0x4f8fd0 };

/** Цвет основного тега предмета (без свойства «Шумное»); null — тегов нет (меч, щит). */
export function itemTagColor(id: ItemId): number | null {
  const tag = ITEMS[id].tags.find((t) => TAGS[t].kind === 'tag');
  return tag ? TAGS[tag].color : null;
}

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

export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Rectangle;
  private label: Phaser.GameObjects.Text;
  private enabled = true;

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
    this.bg = scene.add.rectangle(0, 0, w, h, C.btn).setStrokeStyle(2, C.border);
    this.label = addText(scene, 0, 0, text, size).setOrigin(0.5);
    this.add([this.bg, this.label]);
    this.bg.setInteractive({ useHandCursor: true });
    this.bg.on('pointerover', () => {
      if (!this.enabled) return;
      this.bg.setFillStyle(C.btnHover);
      sfx(scene, 'ui_hover');
    });
    this.bg.on('pointerout', () => this.bg.setFillStyle(this.enabled ? C.btn : C.btnOff));
    this.bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.enabled || p.button !== 0) return;
      sfx(scene, 'ui_click');
      onClick();
    });
    scene.add.existing(this);
  }

  setEnabled(v: boolean): this {
    this.enabled = v;
    this.bg.setFillStyle(v ? C.btn : C.btnOff);
    this.label.setColor(v ? C.text : C.dim);
    return this;
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

/** Верхняя полоса: ночь, заголовок, монеты и платёж, кнопка «Без звука». */
export function addHeader(scene: Phaser.Scene, title: string): void {
  scene.add.rectangle(0, 0, W, 80, 0x000000, 0.6).setOrigin(0);
  addMuteButton(scene, HEADER_LAYOUT.mute);
  addText(scene, 30, 40, `Ночь ${run.night} / ${NIGHTS}    Уровень ${heroLevel()}`, 30).setOrigin(0, 0.5);
  addText(scene, W / 2, 40, title, 36).setOrigin(0.5);
  addText(scene, W - 30, 40, `Монеты: ${run.coins}    Платёж этой ночью: ${DEBT_PAYMENTS[run.night - 1]}`, 28, C.accent).setOrigin(
    1,
    0.5,
  );
}

/** Ряд значков тегов слева направо. */
export function addTagIcons(scene: Phaser.Scene, x: number, y: number, tags: TagId[], size = 36): void {
  tags.forEach((t, i) => fit(scene.add.image(x + i * (size + 6) + size / 2, y, tagKey(t)), size, size));
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
  return parts.join(' · ');
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
    const t = addText(scene, x, y + i * lh, `• ${enemyName(e, mod)}${n > 1 ? ` ×${n}` : ''}`, size, mod ? C.accent : C.text);
    t.setInteractive({ useHandCursor: true });
    t.on('pointerover', () => {
      t.setColor(C.accent);
      const b = t.getBounds();
      tooltip.show(e, mod, { x: b.x, y: b.y, w: b.width, h: b.height });
    });
    // Окно само прячется, когда мышь уйдёт и со строки, и с окна (чтобы можно было навести на предметы в сумке).
    t.on('pointerout', () => t.setColor(mod ? C.accent : C.text));
    container?.add(t);
  });
  return groups.size * lh;
}
