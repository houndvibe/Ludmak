// Магазин: 5 случайных предметов. Покупка — перетащить товар в «Твои вещи» (на такой же предмет — слияние), продажа — перетащить свою вещь к товарам. Обновление ассортимента.
import * as Phaser from 'phaser';
import { BG_NIGHT_KEY, itemKey, statIconKey, tagKey } from '../config/assets';
import { ITEM_STATS } from '../config/balance';
import { FEEL } from '../config/feel';
import { CLIENTS } from '../data/clients';
import { ITEMS } from '../data/items';
import { TAGS } from '../data/tags';
import type { OwnedItem } from '../systems/backpack';
import { starOf } from '../systems/synergy';
import { tutorialAttach, tutorialDone, tutorialStepIs } from '../components/Hints';
import { playMusic, sfx } from '../components/Sound';
import { buy, buyAndMerge, canReroll, rerollCost, reroll, run, sell, sellPrice } from '../state';
import {
  addBackground,
  addHeader,
  addText,
  Button,
  C,
  fadeIn,
  fit,
  goto,
  itemRarityFrame,
  itemStatChips,
  itemTypeIcon,
  W,
  type StatChip,
} from '../ui';

/** Плашка на карточке: надпись, цвет обводки и значок. */
interface Pill {
  label: string;
  color: number;
  icon: string;
}

/**
 * Раскладка экрана сверху вниз с одинаковым промежутком GAP: шапка, строка заказов, ряд карточек,
 * ряд кнопок (обновить — подсказка — домой), подпись «Твои вещи», зона вещей, низ экрана.
 * Слева и справа у всех рядов одинаковое поле MARGIN (ряд из 5 карточек — по центру экрана).
 */
const GAP = 27;
const MARGIN = 100;
const HEADER_H = 80;
/** Высота строки текста 24 px (заказы, подпись «Твои вещи»). */
const LINE_H = 28;
const ORDERS_Y = HEADER_H + GAP;
const CARD_W = 320;
const CARD_H = 422;
const CARD_GAP = 30;
const CARDS_X = MARGIN;
const CARDS_Y = ORDERS_Y + LINE_H + GAP;
/** Ряд кнопок: «Обновить ассортимент» у левого края, «← Домой» у правого, подсказка по центру. */
const BTN_H = 70;
const BTN_W = 520;
const BTNS_Y = CARDS_Y + CARD_H + GAP + BTN_H / 2;
const ROW_W = 5 * CARD_W + 4 * CARD_GAP;
/**
 * Внутренняя раскладка карточки (смещения от её левого верхнего угла):
 * значок типа слева вверху, форма в клетках справа вверху, картинка, имя, плашки категории и тегов, характеристики значками.
 */
const CARD = {
  pad: 16,
  badge: 58,
  shapeCell: 14,
  iconY: 100,
  iconSize: 150,
  nameY: 192,
  pillsY: 222,
  pillH: 30,
  pillPadX: 10,
  pillIcon: 20,
  pillGap: 6,
  chipsGap: 14,
  chipH: 44,
  chipIcon: 36,
  chipGap: 8,
  /** Цена (монета и число): центр по вертикали — столько px выше нижнего края карточки. */
  priceDY: 31,
};
/** Кнопка «← Домой»: центр и размер. */
const HOME_BTN = { x: MARGIN + ROW_W - BTN_W / 2, y: BTNS_Y, w: BTN_W, h: BTN_H };

const OWNED_LABEL_Y = BTNS_Y + BTN_H / 2 + GAP;
const TILE_W = 177;
const TILE_H = 120;
const TILE_GAP = 10;
const TILES_PER_ROW = 9;
const TILES_PER_PAGE = TILES_PER_ROW * 2;
/** Зона «Твои вещи» — сюда отпускают товар, чтобы купить. Плитки по центру зоны, поле сверху и снизу — OWNED_PAD. */
const OWNED_PAD = 20;
const OWNED = { x: MARGIN, y: OWNED_LABEL_Y + LINE_H + GAP, w: ROW_W, h: 2 * TILE_H + TILE_GAP + 2 * OWNED_PAD };
const TILES_X = OWNED.x + (OWNED.w - (TILES_PER_ROW * TILE_W + (TILES_PER_ROW - 1) * TILE_GAP)) / 2;
const TILES_Y = OWNED.y + OWNED_PAD;

export class ShopScene extends Phaser.Scene {
  /** Страница списка «Твои вещи» — переживает перезапуск сцены после покупки/продажи. */
  private page = 0;

  constructor() {
    super('Shop');
  }

  init(data: { page?: number }): void {
    this.page = data.page ?? 0;
  }

  /** Перерисовать экран, оставшись на той же странице вещей. */
  private refresh(): void {
    this.scene.restart({ page: this.page });
  }

  create(): void {
    fadeIn(this);
    playMusic(this, 'music_night');
    addBackground(this, BG_NIGHT_KEY);
    addHeader(this, 'Магазин');
    const orders = run.accepted.length
      ? run.accepted.map((c) => `${CLIENTS[c.client].name} (врагов: ${c.enemies.length})`).join(', ')
      : 'нет';
    addText(this, MARGIN, ORDERS_Y, `Заказы на день: ${orders}`, 24, C.dim);
    // Подсказка при наведении на значок, форму или характеристику карточки.
    this.hint = addText(this, 0, 0, '', 20, C.text, {
      align: 'center',
      backgroundColor: 'rgba(0,0,0,0.9)',
      padding: { x: 10, y: 6 },
      wordWrap: { width: 360 },
    })
      .setOrigin(0.5, 1)
      .setDepth(200)
      .setVisible(false);

    run.shopOffers.forEach((id, i) => {
      const x = CARDS_X + i * (CARD_W + CARD_GAP);
      const cx = x + CARD_W / 2;
      const card = this.add.rectangle(x, CARDS_Y, CARD_W, CARD_H, C.panel, 0.92).setOrigin(0).setStrokeStyle(2, C.border);
      if (!id) {
        addText(this, cx, CARDS_Y + CARD_H / 2, 'Куплено', 30, C.dim).setOrigin(0.5);
        return;
      }
      const def = ITEMS[id];
      // Синяя рамка — редкий или особый предмет.
      const rarity = itemRarityFrame(id);
      if (rarity !== null) card.setStrokeStyle(FEEL.itemDeco.frameWidth, rarity);
      const price = ITEM_STATS[id].price;
      const y = CARDS_Y;

      // Значок категории и форма предмета в клетках.
      const type = itemTypeIcon(id);
      const badge = fit(this.add.image(x + CARD.pad + CARD.badge / 2, y + CARD.pad + CARD.badge / 2, type.key), CARD.badge, CARD.badge);
      this.hoverHint(badge, `Тип: ${type.name}`);
      this.addShape(x + CARD_W - CARD.pad, y + CARD.pad, def.w, def.h);

      const icon = fit(this.add.image(cx, y + CARD.iconY, itemKey(id)), CARD.iconSize, CARD.iconSize);
      addText(this, cx, y + CARD.nameY, def.name, 26, C.text, { fontStyle: 'bold' }).setOrigin(0.5);

      // Плашки — только теги (тип предмета — значок вверху). Место под них есть всегда, даже без тегов:
      // характеристики у всех карточек начинаются на одной высоте.
      const pills: Pill[] = def.tags.map((t) => ({ label: TAGS[t].name, color: TAGS[t].color, icon: tagKey(t) }));
      if (pills.length) this.addPills(x + CARD.pad, y + CARD.pillsY, CARD_W - CARD.pad * 2, pills);
      this.addChips(x + CARD.pad, y + CARD.pillsY + CARD.pillH + CARD.chipsGap, CARD_W - CARD.pad * 2, itemStatChips(id));

      // Цена внизу; не хватает монет — красная, товар не тащится.
      const afford = run.coins >= price;
      this.addPrice(cx, y + CARD_H - CARD.priceDY, `${price}`, afford ? C.accent : C.bad);
      if (!afford) {
        this.hoverHint(card, 'Не хватает монет');
        return;
      }
      // Купить — перетащить товар (за картинку или пустое место карточки) вниз, в «Твои вещи».
      this.makeDraggable(icon, [icon, card], 'buy', `Отпусти — купить за ${price}`, (px, py) => {
        const tile = this.tiles.find((t) => t.bounds.contains(px, py));
        if (tile && tile.item.id === id && starOf(tile.item) === 1 && buyAndMerge(i, tile.item.uid)) {
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
      new Button(this, MARGIN + BTN_W / 2, BTNS_Y, BTN_W, BTN_H, `Обновить ассортимент — ${cost}`, () => {
        if (!reroll()) return;
        sfx(this, 'shop_reroll');
        this.refresh();
      }).setEnabled(run.coins >= cost);
    }
    new Button(this, HOME_BTN.x, HOME_BTN.y, HOME_BTN.w, HOME_BTN.h, '← Домой', () => {
      tutorialDone(this, 'shopHome');
      goto(this, 'Home');
    }, 32);

    // Обучение: «купи» — ряд карточек и зона «Твои вещи», «домой» — кнопка «← Домой».
    const offers = run.shopOffers.length;
    tutorialAttach(this, (id) => {
      if (id === 'buy') {
        // Ряд товаров и второе окно — «Твои вещи», куда тащить покупку.
        return { x: CARDS_X, y: CARDS_Y, w: offers * (CARD_W + CARD_GAP) - CARD_GAP, h: CARD_H, drop: { x: OWNED.x, y: OWNED.y, w: OWNED.w, h: OWNED.h } };
      }
      if (id === 'shopHome') return { x: HOME_BTN.x - HOME_BTN.w / 2, y: HOME_BTN.y - HOME_BTN.h / 2, w: HOME_BTN.w, h: HOME_BTN.h };
      return null;
    });
    addText(this, MARGIN + ROW_W / 2, BTNS_Y, 'Купить — перетащи товар вниз, в «Твои вещи»\n(на такой же предмет — слияние ★2)', 20, C.dim, { align: 'center' }).setOrigin(0.5);

    this.drawOwnedItems();
  }

  private hint!: Phaser.GameObjects.Text;

  /** При наведении на объект — подсказка над ним. */
  private hoverHint(obj: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle, text: string): void {
    obj.setInteractive();
    obj.on('pointerover', () => {
      const b = obj.getBounds();
      this.hint
        .setText(text)
        .setPosition(Phaser.Math.Clamp(b.centerX, 200, W - 200), b.top - 6)
        .setVisible(true);
    });
    obj.on('pointerout', () => this.hint.setVisible(false));
  }

  /** Форма предмета мини-клетками, прижата к правому верхнему углу (right, top). */
  private addShape(right: number, top: number, w: number, h: number): void {
    const s = CARD.shapeCell;
    const g = this.add.graphics();
    g.fillStyle(0xece6d6, 0.6);
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) g.fillRect(right - (w - c) * s + 1, top + r * s + 1, s - 2, s - 2);
    const hit = this.add.rectangle(right - w * s, top, w * s, h * s, 0xffffff, 0.001).setOrigin(0);
    this.hoverHint(hit, `Размер: ${w}×${h} клет${w * h === 1 ? 'ка' : w * h < 5 ? 'ки' : 'ок'}`);
  }

  /** Плашки по центру полосы шириной maxW, с переносом на новый ряд. Возвращает нижний край. */
  private addPills(x: number, y: number, maxW: number, specs: Pill[]): number {
    const P = CARD;
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
    const g = this.add.graphics();
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
   * Характеристики значками в две колонки: значок + число. Не влезает в полколонки (аура, урон себе с шансом) —
   * во всю ширину, такие идут после остальных. Наведение — полная фраза.
   */
  private addChips(x: number, y: number, w: number, chips: StatChip[]): void {
    const P = CARD;
    const colW = (w - P.chipGap) / 2;
    const tagW = 28;
    const built = chips.map((ch) => {
      const t = addText(this, 0, 0, ch.value, 26, ch.icon === 'self' ? C.bad : C.text, { fontStyle: 'bold' }).setOrigin(0, 0.5);
      const need = 6 + P.chipIcon + 8 + (ch.tag ? tagW + 6 : 0) + t.width + 8;
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
      const top = y + row * (P.chipH + P.chipGap);
      const mid = top + P.chipH / 2;
      const bg = this.add.rectangle(left, top, b.wide ? w : colW, P.chipH, 0x000000, 0.4).setOrigin(0);
      let ix = left + 6;
      fit(this.add.image(ix + P.chipIcon / 2, mid, statIconKey(b.ch.icon)), P.chipIcon, P.chipIcon);
      ix += P.chipIcon + 8;
      if (b.ch.tag) {
        fit(this.add.image(ix + tagW / 2, mid, tagKey(b.ch.tag)), tagW, tagW);
        ix += tagW + 6;
      }
      b.t.setPosition(ix, mid).setDepth(1);
      this.hoverHint(bg, b.ch.hint);
      if (b.wide || ++col === 2) {
        col = 0;
        row++;
      }
    }
  }

  /** Плитки «Твоих вещей» на текущей странице — куда можно отпустить покупку для слияния. */
  private tiles: { item: OwnedItem; bounds: Phaser.Geom.Rectangle }[] = [];

  /** Зона, куда отпускают: 'buy' — «Твои вещи» (покупка), 'sell' — ряд товаров (продажа). */
  private zoneRect(zone: 'buy' | 'sell'): Phaser.Geom.Rectangle {
    if (zone === 'sell') return new Phaser.Geom.Rectangle(CARDS_X - 10, CARDS_Y - 10, 5 * (CARD_W + CARD_GAP) - CARD_GAP + 20, CARD_H + 20);
    return new Phaser.Geom.Rectangle(OWNED.x, OWNED.y, OWNED.w, OWNED.h);
  }

  /** Монета и число (цена товара, выручка за продажу) с центром (cx, cy). */
  private addPrice(cx: number, cy: number, text: string, color: string, size = 30): void {
    const t = addText(this, 0, cy, text, size, color, { fontStyle: 'bold' }).setOrigin(0, 0.5);
    const r = size * 0.42;
    const total = r * 2 + 8 + t.width;
    const left = cx - total / 2;
    this.add.circle(left + r, cy, r, 0xe0b65a).setStrokeStyle(3, 0x7a5a1a);
    t.setX(left + r * 2 + 8);
  }

  /**
   * Перетаскивание: ghost едет за курсором, за какой бы handle его ни взяли; пока тащат — подсвечена зона zone с надписью.
   * onDrop(x, y) — отпустили: true, если сделка прошла (сцена перерисуется), иначе ghost возвращается на место.
   */
  private makeDraggable(
    ghost: Phaser.GameObjects.Image,
    handles: (Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle)[],
    zone: 'buy' | 'sell',
    label: string,
    onDrop: (x: number, y: number) => boolean,
  ): void {
    const home = { x: ghost.x, y: ghost.y, sx: ghost.scaleX, sy: ghost.scaleY };
    const z = this.zoneRect(zone);
    const glow = this.add.graphics().setDepth(90).setVisible(false);
    glow.fillStyle(0xe0b65a, 0.12).fillRect(z.x, z.y, z.width, z.height);
    glow.lineStyle(4, 0xe0b65a, 0.9).strokeRect(z.x, z.y, z.width, z.height);
    const tip = addText(this, z.centerX, z.y + 8, label, 26, C.accent, {
      fontStyle: 'bold',
      backgroundColor: 'rgba(0,0,0,0.8)',
      padding: { x: 12, y: 6 },
    })
      .setOrigin(0.5, 0)
      .setDepth(91)
      .setVisible(false);
    for (const h of handles) {
      h.setInteractive({ useHandCursor: true });
      this.input.setDraggable(h);
      h.on('dragstart', () => {
        this.hint.setVisible(false);
        ghost.setDepth(100);
        if (zone === 'sell') ghost.setScale(home.sx * 1.4, home.sy * 1.4);
        glow.setVisible(true);
        tip.setVisible(true);
      });
      h.on('drag', (p: Phaser.Input.Pointer) => ghost.setPosition(home.x + p.x - p.downX, home.y + p.y - p.downY));
      h.on('dragend', (p: Phaser.Input.Pointer) => {
        glow.setVisible(false);
        tip.setVisible(false);
        if (onDrop(p.x, p.y)) return;
        this.tweens.add({
          targets: ghost,
          x: home.x,
          y: home.y,
          scaleX: home.sx,
          scaleY: home.sy,
          duration: 200,
          onComplete: () => ghost.setDepth(0),
        });
      });
    }
  }

  /** «Твои вещи» постранично: 2 ряда, стрелки ◀ ▶ по бокам. */
  private drawOwnedItems(): void {
    const pages = Math.max(1, Math.ceil(run.items.length / TILES_PER_PAGE));
    this.page = Phaser.Math.Clamp(this.page, 0, pages - 1);
    const pageInfo = pages > 1 ? `   (стр. ${this.page + 1} из ${pages})` : '';
    this.add.rectangle(OWNED.x, OWNED.y, OWNED.w, OWNED.h, 0x000000, 0.25).setOrigin(0).setStrokeStyle(2, C.border);
    addText(this, MARGIN, OWNED_LABEL_Y, `Твои вещи — перетащи наверх, к товарам, чтобы продать за полцены${pageInfo}`, 24, C.dim);

    const first = this.page * TILES_PER_PAGE;
    this.tiles = [];
    run.items.slice(first, first + TILES_PER_PAGE).forEach((item, i) => {
      const x = TILES_X + (i % TILES_PER_ROW) * (TILE_W + TILE_GAP);
      const y = TILES_Y + Math.floor(i / TILES_PER_ROW) * (TILE_H + TILE_GAP);
      const tile = this.add.rectangle(x, y, TILE_W, TILE_H, C.panel, 0.92).setOrigin(0).setStrokeStyle(1, C.border);
      this.tiles.push({ item, bounds: new Phaser.Geom.Rectangle(x, y, TILE_W, TILE_H) });
      const img = fit(this.add.image(x + 34, y + 40, itemKey(item.id)), 56, 56);
      const star = starOf(item);
      addText(this, x + 68, y + 8, `${ITEMS[item.id].name}${star > 1 ? ` ★${star}` : ''}`, 17, C.text, { wordWrap: { width: TILE_W - 74 } });
      const sub = [item.inGrid ? '' : 'вне сумок', item.charges !== undefined ? `зарядов ${item.charges}` : ''].filter(Boolean).join(', ');
      if (sub) addText(this, x + 68, y + 54, sub, 14, C.dim, { wordWrap: { width: TILE_W - 74 } });
      const price = sellPrice(item);
      this.addPrice(x + TILE_W - 40, y + TILE_H - 20, `+${price}`, C.accent, 20);
      // Продать — перетащить вещь наверх, на ряд товаров. На шаге обучения «купи» продавать нельзя (окно вещей открыто для покупки).
      if (tutorialStepIs('buy')) return;
      this.makeDraggable(img, [img, tile], 'sell', `Отпусти — продать за ${price}`, (px, py) => {
        if (!Phaser.Geom.Rectangle.Contains(this.zoneRect('sell'), px, py)) return false;
        sell(item.uid);
        sfx(this, 'shop_sell');
        this.refresh();
        return true;
      });
    });

    if (pages > 1) {
      // Стрелки страниц — в полях слева и справа от зоны, по её высоте.
      const midY = OWNED.y + OWNED.h / 2;
      const rightX = MARGIN + ROW_W + MARGIN / 2;
      new Button(this, MARGIN / 2, midY, 70, OWNED.h, '◀', () => {
        this.page--;
        this.refresh();
      }, 36).setEnabled(this.page > 0);
      new Button(this, rightX, midY, 70, OWNED.h, '▶', () => {
        this.page++;
        this.refresh();
      }, 36).setEnabled(this.page < pages - 1);
    }
  }
}
