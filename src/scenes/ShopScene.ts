// Магазин — лавка нечисти: товары на прилавке слева, торговец посередине, твои вещи в мешке справа (SHOP_LAYOUT). 5 случайных предметов. Покупка — перетащить товар в «Твои вещи» (на такой же предмет — слияние), продажа — перетащить свою вещь к товарам. Обновление ассортимента.
import * as Phaser from 'phaser';
import { BG_SHOP_KEY, HORSE_ART, itemKey, SHOP_LAYOUT, statIconKey, tagKey, UI_ART, uiShopCardKey } from '../config/assets';
import { ITEM_STATS, SHOP_SIZE } from '../config/balance';
import { FEEL } from '../config/feel';
import { CLIENTS } from '../data/clients';
import { ITEMS, type ItemId } from '../data/items';
import { TAGS } from '../data/tags';
import type { OwnedItem } from '../systems/backpack';
import { starOf, starStats } from '../systems/synergy';
import { tutorialAttach, tutorialDone, tutorialStepIs } from '../components/Hints';
import { playMusic, sfx } from '../components/Sound';
import { buy, buyAndMerge, buyMergeCharges, canMerge, canReroll, mergedPreview, mergeItems, rerollCost, reroll, run, sell, sellPrice } from '../state';
import {
  addBackground,
  addHeader,
  addText,
  Button,
  C,
  fadeIn,
  fit,
  goto,
  addChips,
  chipsDiff,
  coinIconKey,
  itemRarityFrame,
  itemStatChips,
  parryInfo,
  itemTypeIcon,
  type UiChip,
  TIP_DEPTH,
  W,
  type StatChip,
  TITLE,
} from '../ui';

/** Что изменится у вещи при слиянии ★star → ★star+1 (без соседей): значки «было → станет». */
function mergeDiffChips(id: ItemId, star: number, chargesBefore: number | undefined, chargesAfter: number | undefined): UiChip[] {
  const before = itemStatChips(id, starStats(id, star), chargesBefore, star);
  const after = itemStatChips(id, starStats(id, star + 1), chargesAfter, star + 1);
  return chipsDiff(before, after).map((d) => ({
    icon: statIconKey(d.icon),
    icon2: d.tag ? tagKey(d.tag) : undefined,
    value: `${d.was} → ${d.now}`,
    color: C.good,
    hint: `${d.name[0].toUpperCase()}${d.name.slice(1)}: ${d.was} → ${d.now}`,
  }));
}

/** Плашка на карточке: надпись, цвет обводки и значок. */
interface Pill {
  label: string;
  color: number;
  icon: string;
}

/** Раскладка внутри карточки товара (под картинку карточки или запасная). */
type CardLayout = (typeof UI_ART.shopCard)['fallback'];

/** Карточка или плитка, которая приподнимается при наведении: содержимое в контейнере с центром (cx, cy). */
interface Lift {
  cont: Phaser.GameObjects.Container;
  outline: Phaser.GameObjects.Graphics;
  bounds: Phaser.Geom.Rectangle;
  /** Обычный масштаб (карточки на прилавке уменьшены) и масштаб при наведении. */
  base: number;
  scale: number;
  cy: number;
  on: boolean;
}

/** Где что лежит на экране — SHOP_LAYOUT в assets.ts. */
const L = SHOP_LAYOUT;
const CARD_W = UI_ART.shopCard.w;
const CARD_H = UI_ART.shopCard.h;
/** Карточка на прилавке — в масштабе L.cards.scale: её размер на экране. */
const CARD_SW = CARD_W * L.cards.scale;
const CARD_SH = CARD_H * L.cards.scale;
/**
 * Постоянные размеры внутри карточки (где что лежит — CardLayout в UI_ART.shopCard):
 * значок типа, клетка формы, плашки тегов, характеристики значками, цена.
 */
const CARD = {
  badge: 58,
  /** Клетки под картинкой предмета: размер клетки, px (не больше — иначе по месту под картинку). */
  gridCell: 50,
  /** Ряды характеристик после нарисованных ячеек: высота и зазор, px. */
  extraChipH: 33,
  extraChipGap: 5,
  /** Цена справа вверху: центр монеты и числа — столько px левее внутреннего правого края. */
  priceRight: 30,
  pillH: 30,
  pillPadX: 10,
  pillIcon: 20,
  pillGap: 6,
  chipIcon: 34,
  chipGap: 8,
};
const TILES_PER_PAGE = L.tiles.perRow * L.tiles.rows;

/** Центр места n (0…) на прилавке: ряды по L.cards.perRow, неполный ряд — по центру прилавка. */
function cardCenter(n: number, total: number): { x: number; y: number } {
  const K = L.cards;
  const row = Math.floor(n / K.perRow);
  const inRow = Math.min(K.perRow, total - row * K.perRow);
  const fullW = K.perRow * CARD_SW + (K.perRow - 1) * K.gapX;
  const rowW = inRow * CARD_SW + (inRow - 1) * K.gapX;
  const left = K.x + (fullW - rowW) / 2;
  return {
    x: left + (n % K.perRow) * (CARD_SW + K.gapX) + CARD_SW / 2,
    y: K.y + row * (CARD_SH + K.gapY) + CARD_SH / 2,
  };
}

/** Прямоугольник {x, y, w, h} → Phaser.Geom.Rectangle. */
const geom = (r: { x: number; y: number; w: number; h: number }) => new Phaser.Geom.Rectangle(r.x, r.y, r.w, r.h);

export class ShopScene extends Phaser.Scene {
  /** Страница списка «Твои вещи» — переживает перезапуск сцены после покупки/продажи. */
  private page = 0;

  constructor() {
    super('Shop');
  }

  /** Страница товаров (больше одной бывает только в дебаге, где в магазине все предметы). */
  private offersPage = 0;

  init(data: { page?: number; offersPage?: number }): void {
    this.page = data.page ?? 0;
    this.offersPage = data.offersPage ?? 0;
  }

  /** Перерисовать экран, оставшись на тех же страницах. */
  private refresh(): void {
    this.scene.restart({ page: this.page, offersPage: this.offersPage });
  }

  create(): void {
    fadeIn(this);
    playMusic(this, 'music_night');
    addBackground(this, BG_SHOP_KEY);
    addHeader(this, 'Магазин');
    this.lifts = [];
    this.cardCells = [];
    this.dragging = false;
    const orders = run.accepted.length
      ? run.accepted.map((c) => `${CLIENTS[c.client].name} (врагов: ${c.enemies.length})`).join(', ')
      : 'нет';
    addText(this, L.orders.x, L.orders.y, `Заказы на день: ${orders}`, 24, C.dim);
    // Подсказка при наведении на значок, форму или характеристику карточки.
    this.hint = addText(this, 0, 0, '', 20, C.text, {
      align: 'center',
      backgroundColor: 'rgba(0,0,0,0.9)',
      padding: { x: 10, y: 6 },
      wordWrap: { width: 360 },
    })
      .setOrigin(0.5, 1)
      .setDepth(TIP_DEPTH)
      .setVisible(false);
    // Подсветка зоны, куда отпускают, и надпись над ней — общие для всех перетаскиваний.
    this.zoneGlow = this.add.graphics().setDepth(90);
    this.zoneTip = addText(this, 0, 0, '', 26, C.accent, {
      fontStyle: 'bold',
      backgroundColor: 'rgba(0,0,0,0.85)',
      padding: { x: 12, y: 6 },
    })
      .setOrigin(0.5, 0)
      .setDepth(91)
      .setVisible(false);
    this.mergeTip = this.add.container(0, 0).setDepth(91).setVisible(false);

    const offerPages = Math.ceil(run.shopOffers.length / SHOP_SIZE);
    this.offersPage = Phaser.Math.Clamp(this.offersPage, 0, offerPages - 1);
    const firstOffer = this.offersPage * SHOP_SIZE;
    const shown = run.shopOffers.slice(firstOffer, firstOffer + SHOP_SIZE);
    shown.forEach((id, local) => {
      const i = firstOffer + local; // номер места в run.shopOffers (для buy / buyAndMerge)
      // Карточка рисуется в полный размер с центром на своём месте, потом уменьшается до L.cards.scale.
      const c = cardCenter(local, shown.length);
      const x = c.x - CARD_W / 2;
      const y = c.y - CARD_H / 2;
      const from = this.children.list.length;
      const offer = this.drawOffer(x, y, id);
      const lift = this.wrapLift(from, new Phaser.Geom.Rectangle(x, y, CARD_W, CARD_H), FEEL.shop.hoverScale, !!offer?.afford, L.cards.scale);
      if (offer) this.cardCells.push({ g: offer.cells, bounds: lift.bounds, on: false });
      if (!id || !offer || !offer.afford) return;
      const price = offer.price;
      // Купить — перетащить товар (за картинку или пустое место карточки) в мешок, в «Твои вещи».
      this.makeDraggable(id, offer.icon, [offer.icon, offer.card], lift, 'buy', price, (px, py) => {
        const tile = this.mergeTile(id, px, py);
        if (tile && buyAndMerge(i, tile.item.uid)) {
          sfx(this, 'item_merge');
        } else if (Phaser.Geom.Rectangle.Contains(this.zoneRect('buy'), px, py) && buy(i)) {
          sfx(this, 'shop_buy');
        } else return false;
        tutorialDone(this, 'buy');
        this.refresh();
        return true;
      });
    });

    // В обучающую ночь ассортимент фиксированный — кнопки обновления нет.
    if (canReroll()) {
      const cost = rerollCost();
      const R = L.reroll;
      new Button(this, R.x, R.y, R.w, R.h, `Обновить ассортимент — ${cost}`, () => {
        if (!reroll()) return;
        sfx(this, 'shop_reroll');
        this.refresh();
      }).setEnabled(run.coins >= cost);
    }
    // Дебаг: в магазине все предметы — листаются страницами (на месте кнопки обновления).
    if (offerPages > 1) {
      const turn = (d: number) => {
        this.offersPage += d;
        this.refresh();
      };
      const R = L.reroll;
      new Button(this, R.x - R.w / 2 + 50, R.y, 100, R.h, '◀', () => turn(-1), 36).setEnabled(this.offersPage > 0);
      new Button(this, R.x + R.w / 2 - 50, R.y, 100, R.h, '▶', () => turn(1), 36).setEnabled(this.offersPage < offerPages - 1);
      addText(this, R.x, R.y, `DEBUG · все предметы\nстр. ${this.offersPage + 1} из ${offerPages}`, 22, C.accent, { align: 'center' }).setOrigin(0.5);
    }
    new Button(this, L.home.x, L.home.y, L.home.w, L.home.h, 'Домой →', () => {
      tutorialDone(this, 'shopHome');
      goto(this, 'Home');
    }, 32);

    // Обучение: «купи» — карточки на прилавке и мешок «Твои вещи», «домой» — кнопка «Домой →».
    tutorialAttach(this, (id) => {
      if (id === 'buy') {
        // Товары и второе окно — мешок, куда тащить покупку.
        const centers = shown.map((_, n) => cardCenter(n, shown.length));
        const left = Math.min(...centers.map((p) => p.x)) - CARD_SW / 2;
        const right = Math.max(...centers.map((p) => p.x)) + CARD_SW / 2;
        const top = Math.min(...centers.map((p) => p.y)) - CARD_SH / 2;
        const bottom = Math.max(...centers.map((p) => p.y)) + CARD_SH / 2;
        return { x: left, y: top, w: right - left, h: bottom - top, drop: { ...L.bag } };
      }
      if (id === 'shopHome') return { x: L.home.x - L.home.w / 2, y: L.home.y - L.home.h / 2, w: L.home.w, h: L.home.h };
      return null;
    });
    addText(this, L.hint.x, L.hint.y, 'Купить — перетащи товар в мешок\n(на такой же предмет — слияние ★2)', 20, C.dim, { align: 'center' }).setOrigin(0.5);

    this.drawOwnedItems();

    // Наведение: карточка/плитка под курсором приподнимается (по прямоугольнику, а не по объекту — значки внутри не мешают).
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      for (const l of this.lifts) this.setLift(l, !this.dragging && l.bounds.contains(p.x, p.y));
      for (const c of this.cardCells) this.setCells(c, !this.dragging && c.bounds.contains(p.x, p.y));
    });
    this.input.on(Phaser.Input.Events.GAME_OUT, () => {
      for (const l of this.lifts) this.setLift(l, false);
      for (const c of this.cardCells) this.setCells(c, false);
    });
  }

  private hint!: Phaser.GameObjects.Text;
  private zoneGlow!: Phaser.GameObjects.Graphics;
  private zoneTip!: Phaser.GameObjects.Text;
  /** Подсказка слияния значками (вместо надписи): предмет ★N, цена, что изменится. */
  private mergeTip!: Phaser.GameObjects.Container;
  private lifts: Lift[] = [];
  private dragging = false;

  /**
   * Карточка товара x (левый край). Возвращает картинку предмета, фон карточки, цену и хватает ли монет
   * (null — место уже куплено).
   */
  private drawOffer(
    x: number,
    y: number,
    id: (typeof run.shopOffers)[number],
  ): {
    icon: Phaser.GameObjects.Image;
    card: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
    cells: Phaser.GameObjects.Graphics;
    price: number;
    afford: boolean;
  } | null {
    const cx = x + CARD_W / 2;
    const rarity = id ? itemRarityFrame(id) : null;
    const style = rarity !== null ? 'rare' : 'plain';
    const tex = this.textures.exists(uiShopCardKey(style));
    const L: CardLayout = tex ? UI_ART.shopCard[style] : UI_ART.shopCard.fallback;
    const card = tex
      ? this.add.image(x, y, uiShopCardKey(style)).setOrigin(0)
      : this.add.rectangle(x, y, CARD_W, CARD_H, C.panel, 0.92).setOrigin(0).setStrokeStyle(2, C.border);
    if (!id) {
      card.setAlpha(0.5);
      addText(this, cx, y + CARD_H / 2, 'Куплено', 30, C.dim, TITLE).setOrigin(0.5);
      return null;
    }
    const def = ITEMS[id];
    // Без картинки карточки: синяя рамка — редкий или особый предмет.
    if (!tex && rarity !== null) (card as Phaser.GameObjects.Rectangle).setStrokeStyle(FEEL.itemDeco.frameWidth, rarity);
    const price = ITEM_STATS[id].price;

    // Значок категории и форма предмета в клетках.
    const type = itemTypeIcon(id);
    const badge = fit(this.add.image(x + L.pad + CARD.badge / 2, y + L.pad + CARD.badge / 2, type.key), CARD.badge, CARD.badge);
    // У оружия и щита — ещё парирование: сколько урона гасит и эффект (на самой карточке этих значков нет).
    const parry = parryInfo(id);
    const typeHint = parry
      ? `Тип: ${type.name}
Эффективность парирования: ${parry.cut}%
Эффект парирования: ${parry.effect}`
      : `Тип: ${type.name}`;
    this.hoverHint(badge, typeHint, parry ? 'left' : 'center');
    // Цена — справа вверху (где раньше была форма в клетках); не хватает монет — красная, товар не тащится.
    const afford = run.coins >= price;
    this.addPrice(x + CARD_W - L.pad - CARD.priceRight, y + L.pad + CARD.badge / 2, `${price}`, afford ? C.accent : C.bad);

    // Предмет — поверх своих клеток, как в инвентаре: сразу видно, сколько места он займёт.
    const cell = Math.min(CARD.gridCell, L.iconSize / Math.max(def.w, def.h));
    const cells = this.addCells(cx, y + L.iconY, def.w, def.h, cell);
    const icon = fit(this.add.image(cx, y + L.iconY, itemKey(id)), def.w * cell, def.h * cell);
    addText(this, cx, y + L.nameY, def.name, 28, C.text, TITLE).setOrigin(0.5);

    // Плашки — только теги (тип предмета — значок вверху). Место под них есть всегда, даже без тегов:
    // характеристики у всех карточек начинаются на одной высоте.
    const pills: Pill[] = def.tags.map((t) => ({ label: TAGS[t].name, color: TAGS[t].color, icon: tagKey(t) }));
    const innerX = x + Math.max(L.pad, 16);
    const innerW = CARD_W - Math.max(L.pad, 16) * 2;
    if (pills.length) this.addPills(innerX, y + L.pillsY, innerW, pills);
    // Первый ряд характеристик — в нарисованных ячейках карточки (свой фон не нужен).
    this.addChips(x + 16, y + L.chipsY, CARD_W - 32, L.chipH, tex ? L.slotRows : 0, itemStatChips(id)
      .filter((c) => c.icon !== 'parry')
      .map((c) => ({ ...c, value: c.value.replace(/\s*с$/, '') })), // секунды без «с» — единица видна в подсказке
    );

    if (!afford) this.hoverHint(card, 'Не хватает монет');
    return { icon, card, cells, price, afford };
  }

  /**
   * Всё, что нарисовано после объекта номер from, — в контейнер с центром в середине bounds: его можно увеличить
   * при наведении. active = false — не приподнимается (товар не по карману, место куплено). base — обычный масштаб
   * (карточки на прилавке уменьшены); при наведении — base × scale.
   */
  private wrapLift(from: number, bounds: Phaser.Geom.Rectangle, scale: number, active: boolean, base = 1): Lift {
    const objs = this.children.list.slice(from);
    const cx = bounds.centerX;
    const cy = bounds.centerY;
    const cont = this.add.container(cx, cy).setScale(base);
    for (const o of objs) {
      const t = o as unknown as Phaser.GameObjects.Components.Transform;
      t.x -= cx;
      t.y -= cy;
    }
    cont.add(objs);
    const S = FEEL.shop;
    const outline = this.add.graphics().setAlpha(0);
    outline.lineStyle(4, S.hoverColor, 1).strokeRoundedRect(-bounds.width / 2 - 2, -bounds.height / 2 - 2, bounds.width + 4, bounds.height + 4, 12);
    cont.add(outline);
    // Наведение ловится по прямоугольнику на экране — уже уменьшенному.
    const sw = bounds.width * base;
    const sh = bounds.height * base;
    const lift: Lift = { cont, outline, bounds: new Phaser.Geom.Rectangle(cx - sw / 2, cy - sh / 2, sw, sh), base, scale, cy, on: false };
    if (active) this.lifts.push(lift);
    return lift;
  }

  private setLift(l: Lift, on: boolean): void {
    if (l.on === on) return;
    l.on = on;
    const S = FEEL.shop;
    this.tweens.killTweensOf([l.cont, l.outline]);
    this.tweens.add({
      targets: l.cont,
      scale: on ? l.base * l.scale : l.base,
      y: on ? l.cy - S.hoverLift : l.cy,
      duration: S.hoverMs,
      ease: 'Sine.easeOut',
    });
    this.tweens.add({ targets: l.outline, alpha: on ? 1 : 0, duration: S.hoverMs });
    if (on) l.cont.setDepth(10);
    else l.cont.setDepth(0);
  }

  /** При наведении на объект — подсказка над ним. */
  private hoverHint(obj: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle, text: string, align: 'center' | 'left' = 'center'): void {
    obj.setInteractive();
    obj.on('pointerover', () => {
      if (this.dragging) return;
      const b = obj.getBounds();
      this.hint
        .setAlign(align)
        .setText(text)
        .setPosition(Phaser.Math.Clamp(b.centerX, 200, W - 200), b.top - 6)
        .setVisible(true);
    });
    obj.on('pointerout', () => this.hint.setVisible(false));
  }

  /** Клетки за картинками товаров: появляются плавно, пока курсор над карточкой (FEEL.shop.cellsMs). */
  private cardCells: { g: Phaser.GameObjects.Graphics; bounds: Phaser.Geom.Rectangle; on: boolean }[] = [];

  private setCells(c: { g: Phaser.GameObjects.Graphics; on: boolean }, on: boolean): void {
    if (c.on === on) return;
    c.on = on;
    this.tweens.killTweensOf(c.g);
    this.tweens.add({ targets: c.g, alpha: on ? 1 : 0, duration: FEEL.shop.cellsMs });
  }

  /** Клетки предмета w×h с центром (cx, cy), как сетка инвентаря (скрыты до наведения на карточку); наведение — размер словами. */
  private addCells(cx: number, cy: number, w: number, h: number, cell: number): Phaser.GameObjects.Graphics {
    const H = HORSE_ART;
    const left = cx - (w * cell) / 2;
    const top = cy - (h * cell) / 2;
    const g = this.add.graphics();
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const gx = left + c * cell;
        const gy = top + r * cell;
        g.fillStyle(H.cellFillColor, H.cellFillAlpha).fillRect(gx + 1, gy + 1, cell - 2, cell - 2);
        g.lineStyle(1.5, H.cellLineColor, H.cellLineAlpha).strokeRect(gx + 1, gy + 1, cell - 2, cell - 2);
      }
    }
    g.setAlpha(0);
    const hit = this.add.rectangle(left, top, w * cell, h * cell, 0xffffff, 0.001).setOrigin(0);
    this.hoverHint(hit, `Размер: ${w}×${h} клет${w * h === 1 ? 'ка' : w * h < 5 ? 'ки' : 'ок'}`);
    return g;
  }

  /** Плашки по центру полосы шириной maxW, с переносом на новый ряд. Возвращает нижний край. */
  private addPills(x: number, y: number, maxW: number, specs: Pill[]): number {
    const P = CARD;
    // Подложка рисуется первой — плашки поверх неё (в контейнере порядок = порядок создания).
    const g = this.add.graphics();
    const items = specs.map((s) => {
      const t = addText(this, 0, 0, s.label.toUpperCase(), 16, C.text, { fontStyle: 'bold' }).setOrigin(0, 0.5).setDepth(1);
      return { s, t, w: P.pillPadX * 2 + P.pillIcon + 6 + t.width };
    });
    const rows: (typeof items)[] = [[]];
    let rowW = 0;
    for (const it of items) {
      const row = rows[rows.length - 1];
      const add = (row.length ? P.pillGap : 0) + it.w;
      if (row.length && rowW + add > maxW) {
        rows.push([it]);
        rowW = it.w;
      } else {
        row.push(it);
        rowW += add;
      }
    }
    rows.forEach((row, r) => {
      const total = row.reduce((a, it) => a + it.w, 0) + P.pillGap * (row.length - 1);
      let px = x + (maxW - total) / 2;
      const top = y + r * (P.pillH + P.pillGap);
      const mid = top + P.pillH / 2;
      for (const it of row) {
        g.fillStyle(0x14121a, 0.85).fillRoundedRect(px, top, it.w, P.pillH, P.pillH / 2);
        g.lineStyle(2, it.s.color, 1).strokeRoundedRect(px, top, it.w, P.pillH, P.pillH / 2);
        fit(this.add.image(px + P.pillPadX + P.pillIcon / 2, mid, it.s.icon), P.pillIcon, P.pillIcon).setDepth(1);
        it.t.setPosition(px + P.pillPadX + P.pillIcon + 6, mid);
        px += it.w + P.pillGap;
      }
    });
    return y + rows.length * (P.pillH + P.pillGap) - P.pillGap;
  }

  /**
   * Характеристики значками в две колонки высотой chipH: значок + число. Не влезает в полколонки (аура, урон себе
   * с шансом) — во всю ширину, такие идут после остальных. Первые slotRows рядов лежат в нарисованных ячейках карточки —
   * без своего фона. Наведение — полная фраза.
   */
  private addChips(x: number, y: number, w: number, chipH: number, slotRows: number, chips: StatChip[]): void {
    const P = CARD;
    const colW = (w - P.chipGap) / 2;
    const tagW = 26;
    // Сначала фоны (ниже в контейнере), потом значки и числа.
    const built = chips.map((ch) => {
      const t = addText(this, 0, 0, ch.value, 26, ch.icon === 'self' ? C.bad : C.text, { fontStyle: 'bold' }).setOrigin(0, 0.5);
      const need = 6 + P.chipIcon + 8 + (ch.tag || ch.icon2 ? tagW + 6 : 0) + t.width + 8;
      return { ch, t, wide: !!ch.wide || need > colW };
    });
    const ordered = [...built.filter((b) => !b.wide), ...built.filter((b) => b.wide)];
    let col = 0;
    let row = 0;
    for (const b of ordered) {
      if (b.wide && col === 1) {
        col = 0;
        row++;
      }
      const left = x + col * (colW + P.chipGap);
      // Ряды в нарисованных ячейках — высотой chipH, следующие — пониже (extraChipH), чтобы три ряда влезли в карточку.
      const extra = Math.max(0, row - slotRows);
      const top = y + Math.min(row, slotRows) * (chipH + P.chipGap) + extra * (P.extraChipH + P.extraChipGap);
      const h = row < slotRows ? chipH : P.extraChipH;
      const mid = top + h / 2;
      const bg = this.add.rectangle(left, top, b.wide ? w : colW, h, 0x000000, row < slotRows ? 0.001 : 0.4).setOrigin(0);
      let ix = left + 8;
      fit(this.add.image(ix + P.chipIcon / 2, mid, statIconKey(b.ch.icon)), P.chipIcon, P.chipIcon);
      ix += P.chipIcon + 8;
      if (b.ch.tag || b.ch.icon2) {
        fit(this.add.image(ix + tagW / 2, mid, b.ch.tag ? tagKey(b.ch.tag) : statIconKey(b.ch.icon2!)), tagW, tagW);
        ix += tagW + 6;
      }
      // Число — поверх фона: переносим его в конец списка отображения.
      this.children.bringToTop(b.t);
      b.t.setPosition(ix, mid).setDepth(1);
      this.hoverHint(bg, b.ch.hint);
      if (b.wide || ++col === 2) {
        col = 0;
        row++;
      }
    }
  }

  /** Плитка своей вещи под точкой, с которой можно слить вещь item (тот же предмет и уровень), иначе null. */
  private ownedMergeTile(item: OwnedItem, px: number, py: number): { item: OwnedItem; bounds: Phaser.Geom.Rectangle } | null {
    const tile = this.tiles.find((t) => t.bounds.contains(px, py));
    return tile && canMerge(item, tile.item) ? tile : null;
  }

  /** Плитки «Твоих вещей» на текущей странице — куда можно отпустить покупку для слияния. */
  private tiles: { item: OwnedItem; bounds: Phaser.Geom.Rectangle }[] = [];

  /** Плитка под точкой (px, py), на которую товар id сольётся в ★2, иначе null. */
  private mergeTile(id: OwnedItem['id'], px: number, py: number): { item: OwnedItem; bounds: Phaser.Geom.Rectangle } | null {
    const tile = this.tiles.find((t) => t.bounds.contains(px, py));
    return tile && tile.item.id === id && starOf(tile.item) === 1 ? tile : null;
  }

  /** Зона, куда отпускают: 'buy' — мешок «Твои вещи» (покупка), 'sell' — прилавок (продажа). */
  private zoneRect(zone: 'buy' | 'sell'): Phaser.Geom.Rectangle {
    return geom(zone === 'sell' ? L.counter : L.bag);
  }

  /** Монета и число (цена товара, выручка за продажу) с центром (cx, cy). */
  private addPrice(cx: number, cy: number, text: string, color: string, size = 30): void {
    const r = size * 0.42;
    const coin = this.add.circle(0, cy, r, 0xe0b65a).setStrokeStyle(3, 0x7a5a1a);
    const t = addText(this, 0, cy, text, size, color, { fontStyle: 'bold' }).setOrigin(0, 0.5);
    const total = r * 2 + 8 + t.width;
    const left = cx - total / 2;
    coin.setX(left + r);
    t.setX(left + r * 2 + 8);
  }

  /**
   * Подсветка зоны во время перетаскивания: hot — предмет над зоной (заливка, толстая рамка), иначе тонкая рамка.
   * merge — плитка, на которую выйдет слияние (зелёная рамка вместо подсветки всей зоны).
   */
  private drawZone(zone: 'buy' | 'sell', hot: boolean, merge: Phaser.Geom.Rectangle | null, label: string, mergeChips: UiChip[] = []): void {
    const S = FEEL.shop;
    const z = this.zoneRect(zone);
    const g = this.zoneGlow.clear();
    if (merge) {
      g.lineStyle(2, S.zoneColor, S.zoneIdleAlpha).strokeRect(z.x, z.y, z.width, z.height);
      g.fillStyle(S.mergeColor, S.zoneHotFill).fillRect(merge.x, merge.y, merge.width, merge.height);
      g.lineStyle(4, S.mergeColor, 1).strokeRect(merge.x - 2, merge.y - 2, merge.width + 4, merge.height + 4);
    } else if (hot) {
      g.fillStyle(S.zoneColor, S.zoneHotFill).fillRect(z.x, z.y, z.width, z.height);
      g.lineStyle(4, S.zoneColor, 1).strokeRect(z.x, z.y, z.width, z.height);
    } else {
      g.lineStyle(2, S.zoneColor, S.zoneIdleAlpha).strokeRect(z.x, z.y, z.width, z.height);
    }
    // Слияние — значками у нижнего края мешка вместо надписи.
    this.mergeTip.removeAll(true).setVisible(!!merge);
    if (merge) {
      this.zoneTip.setVisible(false);
      const bag = this.zoneRect('buy');
      const { w, h } = addChips(this, 0, 0, mergeChips, { h: 40, container: this.mergeTip, maxW: bag.width - 24 });
      this.mergeTip.setPosition(bag.centerX - w / 2, bag.bottom - 10 - h);
      return;
    }
    // Надпись — у верхнего края зоны продажи и у нижнего края зоны покупки (не закрывает плитки).
    this.zoneTip
      .setText(label)
      .setColor(merge ? '#8fe08f' : C.accent)
      .setAlpha(hot || merge ? 1 : 0.7)
      .setAlign('center')
      .setOrigin(0.5, zone === 'sell' ? 0 : 1)
      .setPosition(z.centerX, zone === 'sell' ? z.y + 8 : z.bottom - 8)
      .setVisible(true);
  }

  /**
   * Перетаскивание товара или своей вещи (id): за какой бы handle ни взяли, за курсором едет картинка предмета,
   * сама карточка/плитка тускнеет, зона zone подсвечивается сильнее, когда предмет над ней.
   * onDrop(x, y) — отпустили: true, если сделка прошла (сцена перерисуется), иначе картинка возвращается на место.
   */
  private makeDraggable(
    id: OwnedItem['id'],
    icon: Phaser.GameObjects.Image,
    handles: (Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle)[],
    lift: Lift,
    zone: 'buy' | 'sell',
    price: number,
    onDrop: (x: number, y: number) => boolean,
    /** Своя вещь (зона 'sell'): её можно слить с такой же в мешке. */
    owned?: OwnedItem,
  ): void {
    const S = FEEL.shop;
    let ghost: Phaser.GameObjects.Image | null = null;
    const update = (p: Phaser.Input.Pointer) => {
      const merge = owned ? this.ownedMergeTile(owned, p.x, p.y) : zone === 'buy' ? this.mergeTile(id, p.x, p.y) : null;
      const hot = Phaser.Geom.Rectangle.Contains(this.zoneRect(zone), p.x, p.y);
      const label = zone === 'buy' ? `${hot ? 'Отпусти' : 'Сюда'} — купить за ${price}` : `${hot ? 'Отпусти' : 'Сюда'} — продать за ${price}`;
      let chips: UiChip[] = [];
      if (merge) {
        // Покупка со слиянием: товар ★1 на вещь ★1; своя вещь — на такую же того же уровня.
        const star = starOf(merge.item);
        const after = owned ? mergedPreview(owned, merge.item).charges : buyMergeCharges(merge.item);
        chips = [
          { icon: itemKey(id), value: `★${star + 1}`, color: C.good, hint: `Слияние: ${ITEMS[id].name} станет ★${star + 1}.` },
          ...(owned ? [] : [{ icon: coinIconKey(this), value: `−${price}`, color: C.bad, hint: `Цена: ${price}.` }]),
          ...mergeDiffChips(id, star, merge.item.charges, after),
        ];
      }
      this.drawZone(zone, hot, merge?.bounds ?? null, label, chips);
      ghost?.setPosition(p.x, p.y);
    };
    for (const h of handles) {
      h.setInteractive({ useHandCursor: true });
      this.input.setDraggable(h);
      h.on('dragstart', (p: Phaser.Input.Pointer) => {
        this.hint.setVisible(false);
        this.dragging = true;
        for (const l of this.lifts) this.setLift(l, false);
        lift.cont.setAlpha(S.dragDimAlpha);
        const b = icon.getBounds();
        ghost?.destroy();
        ghost = fit(this.add.image(b.centerX, b.centerY, itemKey(id)), S.ghostSize, S.ghostSize).setDepth(100);
        this.tweens.add({ targets: ghost, x: p.x, y: p.y, angle: S.ghostAngle, duration: 80 });
        update(p);
      });
      h.on('drag', (p: Phaser.Input.Pointer) => update(p));
      h.on('dragend', (p: Phaser.Input.Pointer) => {
        this.dragging = false;
        this.zoneGlow.clear();
        this.zoneTip.setVisible(false);
        this.mergeTip.removeAll(true).setVisible(false);
        if (onDrop(p.x, p.y)) return;
        const g = ghost;
        ghost = null;
        if (!g) return;
        // Не получилось — картинка возвращается на карточку/плитку и исчезает в ней.
        const b = icon.getBounds();
        this.tweens.killTweensOf(g);
        this.tweens.add({
          targets: g,
          x: b.centerX,
          y: b.centerY,
          angle: 0,
          displayWidth: b.width,
          displayHeight: b.height,
          duration: S.returnMs,
          ease: 'Cubic.easeOut',
          onComplete: () => {
            g.destroy();
            lift.cont.setAlpha(1);
          },
        });
      });
    }
  }

  /** «Твои вещи» в мешке постранично: L.tiles.perRow в ряду, L.tiles.rows рядов, стрелки ◀ ▶ внизу мешка. */
  private drawOwnedItems(): void {
    const T = L.tiles;
    const pages = Math.max(1, Math.ceil(run.items.length / TILES_PER_PAGE));
    this.page = Phaser.Math.Clamp(this.page, 0, pages - 1);
    addText(this, L.bag.x + L.bag.w / 2, L.bagTitleY, 'Твои вещи — продать: перетащи на прилавок', 22, C.text, {
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: { x: 12, y: 4 },
    }).setOrigin(0.5, 0);

    const first = this.page * TILES_PER_PAGE;
    this.tiles = [];
    const canSell = !tutorialStepIs('buy');
    run.items.slice(first, first + TILES_PER_PAGE).forEach((item, i) => {
      const x = T.x + (i % T.perRow) * (T.w + T.gap);
      const y = T.y + Math.floor(i / T.perRow) * (T.h + T.gap);
      const from = this.children.list.length;
      const tile = this.add.rectangle(x, y, T.w, T.h, C.panel, 0.92).setOrigin(0).setStrokeStyle(1, C.border);
      const bounds = new Phaser.Geom.Rectangle(x, y, T.w, T.h);
      this.tiles.push({ item, bounds });
      const img = fit(this.add.image(x + 38, y + 42, itemKey(item.id)), 62, 62);
      const star = starOf(item);
      addText(this, x + 76, y + 8, `${ITEMS[item.id].name}${star > 1 ? ` ★${star}` : ''}`, 17, C.text, { wordWrap: { width: T.w - 82 } });
      const sub = [item.inGrid ? '' : 'вне сумок', item.charges !== undefined ? `зарядов ${item.charges}` : ''].filter(Boolean).join(', ');
      if (sub) addText(this, x + 76, y + 54, sub, 14, C.dim, { wordWrap: { width: T.w - 82 } });
      const price = sellPrice(item);
      this.addPrice(x + T.w - 40, y + T.h - 20, `+${price}`, C.accent, 20);
      const lift = this.wrapLift(from, bounds, FEEL.shop.tileHoverScale, canSell);
      // Продать — перетащить вещь на прилавок. На шаге обучения «купи» продавать нельзя (мешок открыт для покупки).
      if (!canSell) return;
      // Перетащить на такую же вещь того же уровня в мешке — слияние; на прилавок — продажа.
      this.makeDraggable(item.id, img, [img, tile], lift, 'sell', price, (px, py) => {
        const target = this.ownedMergeTile(item, px, py);
        if (target) {
          mergeItems(item.uid, target.item.uid);
          sfx(this, 'item_merge');
        } else if (Phaser.Geom.Rectangle.Contains(this.zoneRect('sell'), px, py) && item.uid === run.mainUid) {
          // Основное оружие не продаётся: лишиться его можно только в бою.
          sfx(this, 'item_invalid');
          this.hint.setText('Основное оружие не продаётся').setPosition(px, py - 20).setVisible(true);
          this.time.delayedCall(1500, () => this.hint.setVisible(false));
        } else if (Phaser.Geom.Rectangle.Contains(this.zoneRect('sell'), px, py)) {
          sell(item.uid);
          sfx(this, 'shop_sell');
        } else return false;
        this.refresh();
        return true;
      }, item);
    });

    if (pages > 1) {
      const N = L.bagNav;
      new Button(this, N.prevX, N.y, N.w, N.h, '◀', () => {
        this.page--;
        this.refresh();
      }, 30).setEnabled(this.page > 0);
      new Button(this, N.nextX, N.y, N.w, N.h, '▶', () => {
        this.page++;
        this.refresh();
      }, 30).setEnabled(this.page < pages - 1);
      addText(this, N.pageX, N.y, `стр. ${this.page + 1} из ${pages}`, 22, C.dim).setOrigin(0.5);
    }
  }
}
