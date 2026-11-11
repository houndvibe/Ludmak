// Магазин: 5 случайных предметов, покупка (или покупка со слиянием), обновление ассортимента, продажа своих вещей.
import * as Phaser from 'phaser';
import { BG_NIGHT_KEY, itemKey } from '../config/assets';
import { ITEM_STATS } from '../config/balance';
import { FEEL } from '../config/feel';
import { CLIENTS } from '../data/clients';
import { ITEMS, TIER_NAMES, type ItemId } from '../data/items';
import type { OwnedItem } from '../systems/backpack';
import { starOf } from '../systems/synergy';
import { tutorialAttach, tutorialDone } from '../components/Hints';
import { playMusic, sfx } from '../components/Sound';
import { buy, buyAndMerge, canReroll, rerollCost, reroll, run, sell, sellPrice } from '../state';
import { addBackground, addHeader, addTagIcons, addText, Button, C, describeItem, fadeIn, fit, goto, itemRarityFrame, itemTagColor } from '../ui';

const CARD_W = 320;
const CARD_H = 470;
const CARD_GAP = 30;
const CARDS_X = 100;
const CARDS_Y = 170;
/** Кнопка «← Домой»: центр и размер. */
const HOME_BTN = { x: 1520, y: 710, w: 520, h: 70 };

const TILE_W = 172;
const TILE_H = 120;
const TILES_PER_ROW = 9;
const TILES_PER_PAGE = TILES_PER_ROW * 2;
const TILES_X = 150;
const TILES_Y = 790;

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
    addText(this, 100, 110, `Заказы на день: ${orders}`, 24, C.dim);

    run.shopOffers.forEach((id, i) => {
      const x = CARDS_X + i * (CARD_W + CARD_GAP);
      const cx = x + CARD_W / 2;
      const card = this.add.rectangle(x, CARDS_Y, CARD_W, CARD_H, C.panel, 0.92).setOrigin(0).setStrokeStyle(2, C.border);
      if (!id) {
        addText(this, cx, CARDS_Y + CARD_H / 2, 'Куплено', 30, C.dim).setOrigin(0.5);
        return;
      }
      const def = ITEMS[id];
      // Фон карточки — прозрачный цвет основного тега; синяя рамка — редкий или особый предмет.
      const tint = itemTagColor(id);
      if (tint !== null) this.add.rectangle(x, CARDS_Y, CARD_W, CARD_H, tint, FEEL.itemDeco.tintAlpha).setOrigin(0);
      const rarity = itemRarityFrame(id);
      if (rarity !== null) card.setStrokeStyle(FEEL.itemDeco.frameWidth, rarity);
      const price = ITEM_STATS[id].price;
      const icon = fit(this.add.image(cx, CARDS_Y + 110, itemKey(id)), 180, 180);
      if (run.coins >= price) this.makeMergeDraggable(icon, i, id);
      addText(this, cx, CARDS_Y + 225, def.name, 26, C.text, { fontStyle: 'bold' }).setOrigin(0.5);
      addText(this, cx, CARDS_Y + 255, `${def.w}×${def.h} · ${def.mode === 'active' ? 'активный' : 'пассивный'} · ${TIER_NAMES[def.tier]}`, 20, C.dim).setOrigin(0.5);
      addTagIcons(this, x + 20, CARDS_Y + 295, def.tags);
      addText(this, x + 20, CARDS_Y + 325, describeItem(id), 21, C.text, { wordWrap: { width: CARD_W - 40 } });
      new Button(this, cx, CARDS_Y + CARD_H - 45, CARD_W - 40, 60, `Купить — ${price}`, () => {
        if (!buy(i)) return;
        sfx(this, 'shop_buy');
        tutorialDone(this, 'buy');
        this.refresh();
      }).setEnabled(run.coins >= price);
    });

    // В обучающую ночь ассортимент фиксированный — кнопки обновления нет.
    if (canReroll()) {
      const cost = rerollCost();
      new Button(this, 400, 710, 520, 70, `Обновить ассортимент — ${cost}`, () => {
        if (!reroll()) return;
        sfx(this, 'shop_reroll');
        this.refresh();
      }).setEnabled(run.coins >= cost);
    }
    new Button(this, HOME_BTN.x, HOME_BTN.y, HOME_BTN.w, HOME_BTN.h, '← Домой', () => {
      tutorialDone(this, 'shopHome');
      goto(this, 'Home');
    }, 32);

    // Обучение: «купи» — ряд карточек, «домой» — кнопка «← Домой».
    const offers = run.shopOffers.length;
    tutorialAttach(this, (id) => {
      if (id === 'buy') return { x: CARDS_X, y: CARDS_Y, w: offers * (CARD_W + CARD_GAP) - CARD_GAP, h: CARD_H };
      if (id === 'shopHome') return { x: HOME_BTN.x - HOME_BTN.w / 2, y: HOME_BTN.y - HOME_BTN.h / 2, w: HOME_BTN.w, h: HOME_BTN.h };
      return null;
    });
    addText(this, 960, 700, 'Перетащи покупку на такой же предмет\nв «Твоих вещах» — слияние ★2', 20, C.dim, { align: 'center' }).setOrigin(0.5);

    this.drawOwnedItems();
  }

  /** Плитки «Твоих вещей» на текущей странице — куда можно отпустить покупку для слияния. */
  private tiles: { item: OwnedItem; bounds: Phaser.Geom.Rectangle }[] = [];

  /** Иконку товара можно перетащить на такой же предмет ★1 в «Твоих вещах»: покупка + слияние в ★2. */
  private makeMergeDraggable(icon: Phaser.GameObjects.Image, slot: number, id: ItemId): void {
    const home = { x: icon.x, y: icon.y };
    icon.setInteractive({ useHandCursor: true });
    this.input.setDraggable(icon);
    icon.on('dragstart', () => icon.setDepth(100));
    icon.on('drag', (_p: Phaser.Input.Pointer, x: number, y: number) => icon.setPosition(x, y));
    icon.on('dragend', (p: Phaser.Input.Pointer) => {
      const tile = this.tiles.find((t) => t.bounds.contains(p.x, p.y));
      if (tile && tile.item.id === id && starOf(tile.item) === 1 && buyAndMerge(slot, tile.item.uid)) {
        sfx(this, 'item_merge');
        tutorialDone(this, 'buy');
        this.refresh();
        return;
      }
      this.tweens.add({ targets: icon, x: home.x, y: home.y, duration: 200, onComplete: () => icon.setDepth(0) });
    });
  }

  /** «Твои вещи» постранично: 2 ряда, стрелки ◀ ▶ по бокам. */
  private drawOwnedItems(): void {
    const pages = Math.max(1, Math.ceil(run.items.length / TILES_PER_PAGE));
    this.page = Phaser.Math.Clamp(this.page, 0, pages - 1);
    const pageInfo = pages > 1 ? `   (стр. ${this.page + 1} из ${pages})` : '';
    addText(this, TILES_X, TILES_Y - 40, `Твои вещи — продажа за полцены${pageInfo}`, 26, C.dim);

    const first = this.page * TILES_PER_PAGE;
    this.tiles = [];
    run.items.slice(first, first + TILES_PER_PAGE).forEach((item, i) => {
      const x = TILES_X + (i % TILES_PER_ROW) * (TILE_W + 10);
      const y = TILES_Y + Math.floor(i / TILES_PER_ROW) * (TILE_H + 10);
      this.add.rectangle(x, y, TILE_W, TILE_H, C.panel, 0.92).setOrigin(0).setStrokeStyle(1, C.border);
      this.tiles.push({ item, bounds: new Phaser.Geom.Rectangle(x, y, TILE_W, TILE_H) });
      fit(this.add.image(x + 34, y + 36, itemKey(item.id)), 56, 56);
      const star = starOf(item);
      addText(this, x + 68, y + 8, `${ITEMS[item.id].name}${star > 1 ? ` ★${star}` : ''}`, 17, C.text, { wordWrap: { width: TILE_W - 74 } });
      const sub = [item.inGrid ? '' : 'вне сумок', item.charges !== undefined ? `зарядов ${item.charges}` : ''].filter(Boolean).join(', ');
      if (sub) addText(this, x + 68, y + 54, sub, 14, C.dim, { wordWrap: { width: TILE_W - 74 } });
      new Button(this, x + TILE_W / 2, y + TILE_H - 22, TILE_W - 16, 34, `Продать +${sellPrice(item)}`, () => {
        sell(item.uid);
        sfx(this, 'shop_sell');
        this.refresh();
      }, 20);
    });

    if (pages > 1) {
      const midY = TILES_Y + TILE_H + 5;
      const rightX = TILES_X + TILES_PER_ROW * (TILE_W + 10) + 40;
      new Button(this, TILES_X - 60, midY, 70, 240, '◀', () => {
        this.page--;
        this.refresh();
      }, 36).setEnabled(this.page > 0);
      new Button(this, rightX, midY, 70, 240, '▶', () => {
        this.page++;
        this.refresh();
      }, 36).setEnabled(this.page < pages - 1);
    }
  }
}
