// Дом Людьмака — центральный экран ночи. Монстры по одному подходят к окошку в двери с заказами.
// Пока очередь не закончилась, магазин, сумки и дверь закрыты.
import * as Phaser from 'phaser';
import { BG_HOME_KEY, clientKey, HOME_LAYOUT } from '../config/assets';
import { CLIENTS, conditionEffect } from '../data/clients';
import { ENEMIES } from '../data/enemies';
import {
  currentVisitor,
  decideVisitor,
  heroLevel,
  queueDone,
  resolveNight,
  run,
} from '../state';
import { FEEL } from '../config/feel';
import { tutorialAttach, tutorialDone, tutorialRefresh, type StepTarget } from '../components/Hints';
import type { StepId } from '../data/tutorial';
import { EnemyTooltip } from '../components/EnemyTooltip';
import { playMusic, sfx } from '../components/Sound';
import { addBackground, addEnemyLines, addHeader, addText, Button, C, fadeIn, goto } from '../ui';

type Rect = { x: number; y: number; w: number; h: number };

const APPEAR_MS = 450;
const LEAVE_MS = 350;
const SHUTTER_MS = 400;

interface Hotspot {
  setEnabled(v: boolean): void;
}

export class HomeScene extends Phaser.Scene {
  private tooltip!: EnemyTooltip;
  private windowMask!: Phaser.Display.Masks.GeometryMask;
  private shutter!: Phaser.GameObjects.Rectangle;
  private portrait: Phaser.GameObjects.Image | null = null;
  private card!: Phaser.GameObjects.Container;
  private board!: Phaser.GameObjects.Container;
  private hotspots: Hotspot[] = [];

  constructor() {
    super('Home');
  }

  /** Обучение: карточка монстра на экране / очередь закончилась и окошко закрыто. */
  private cardReady = false;
  private queueShown = false;

  create(): void {
    fadeIn(this);
    playMusic(this, 'music_night');
    const L = HOME_LAYOUT;
    this.portrait = null;
    this.hotspots = [];
    this.cardReady = false;
    this.queueShown = false;

    addBackground(this, BG_HOME_KEY);
    addHeader(this, 'Дом Людьмака');

    // Окошко: всё, что в нём показывается, обрезается по его форме.
    const wnd = L.window;
    const maskShape = this.make.graphics({}, false);
    maskShape.fillStyle(0xffffff).fillRoundedRect(wnd.x, wnd.y, wnd.w, wnd.h, wnd.radius);
    this.windowMask = maskShape.createGeometryMask();
    this.shutter = this.add
      .rectangle(wnd.x, wnd.y, wnd.w, wnd.h, 0x5e4229)
      .setOrigin(0)
      .setStrokeStyle(6, 0x2a1c10)
      .setMask(this.windowMask)
      .setDepth(5);

    this.board = this.add.container(0, 0);
    this.card = this.add.container(0, 0);
    this.refreshBoard();

    this.hotspots.push(
      this.makeHotspot(L.shop, () => 'Магазин', () => {
        tutorialDone(this, 'chest');
        goto(this, 'Shop');
      }, true),
      this.makeHotspot(L.bags, () => 'Сумки', () => {
        tutorialDone(this, 'bags');
        goto(this, 'Backpack');
      }, true),
      this.makeHotspot(L.door, () => (run.accepted.length > 0 ? 'На охоту' : 'Переждать день'), () => this.leaveHouse(), false),
    );
    this.tooltip = new EnemyTooltip(this);

    tutorialAttach(this, (id) => this.tutorialTarget(id));
    if (queueDone()) {
      this.showQueueOver();
    } else {
      this.setHotspotsEnabled(false);
      this.tweens.add({
        targets: this.shutter,
        y: wnd.y - wnd.h,
        duration: SHUTTER_MS,
        ease: 'Cubic.easeInOut',
        onComplete: () => this.showVisitor(),
      });
    }
  }

  // ─── Очередь ─────────────────────────────────────────────────────────────

  private showVisitor(): void {
    const c = currentVisitor();
    if (!c) {
      this.closeWindow();
      return;
    }
    const L = HOME_LAYOUT;
    const img = this.add.image(L.window.x + L.window.w / 2, 0, clientKey(c.client)).setMask(this.windowMask).setDepth(4);
    img.setScale(L.portraitWidth / img.width);
    const targetY = L.window.y + L.portraitOffsetY + img.displayHeight / 2;
    img.setY(targetY + 80).setAlpha(0);
    this.tweens.add({ targets: img, y: targetY, alpha: 1, duration: APPEAR_MS, ease: 'Cubic.easeOut' });
    this.portrait = img;
    sfx(this, 'monster_arrive');

    this.renderCard(c);
    this.cardReady = true;
    tutorialRefresh(this);
  }

  /** Обучение: где на экране элемент для шага (null — ещё не время). */
  private tutorialTarget(id: StepId): StepTarget {
    const L = HOME_LAYOUT;
    if (id === 'accept') {
      if (queueDone() || !this.cardReady) return null;
      // Вся карточка вместе с кнопкой «Принять» — чтобы можно было прочитать условие.
      return { x: L.card.x, y: L.card.y, w: L.card.w, h: L.card.h + 98 };
    }
    if (!this.queueShown) return null;
    if (id === 'chest') return L.shop;
    if (id === 'bags') return L.bags;
    if (id === 'door') return L.door;
    return null;
  }

  private visitorLeaves(decide: () => void): void {
    decide();
    this.refreshBoard();
    this.renderCardEmpty();
    const img = this.portrait;
    this.portrait = null;
    if (!img) return this.showVisitor();
    this.tweens.add({
      targets: img,
      y: img.y + 80,
      alpha: 0,
      duration: LEAVE_MS,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        img.destroy();
        this.showVisitor();
      },
    });
  }

  private closeWindow(): void {
    sfx(this, 'window_close');
    this.tweens.add({
      targets: this.shutter,
      y: HOME_LAYOUT.window.y,
      duration: SHUTTER_MS,
      ease: 'Cubic.easeInOut',
      onComplete: () => this.showQueueOver(),
    });
  }

  private showQueueOver(): void {
    this.shutter.setY(HOME_LAYOUT.window.y);
    this.setHotspotsEnabled(true);
    const n = run.accepted.length;
    const text =
      n > 0
        ? `Очередь разошлась.\n\nЗаказов на день: ${n}.\nЗагляни в сундук, уложи сумки — и за дверь, на охоту.`
        : 'Очередь разошлась, а заказов нет.\n\nМожно заглянуть в сундук и переждать день за дверью. Платёж по долгу никто не отменял.';
    this.card.removeAll(true);
    const r = HOME_LAYOUT.card;
    this.card.add(this.add.rectangle(r.x, r.y, r.w, r.h, C.panel, 0.92).setOrigin(0).setStrokeStyle(2, C.border));
    this.card.add(addText(this, r.x + 24, r.y + 24, text, 26, C.text, { wordWrap: { width: r.w - 48 }, lineSpacing: 6 }));
    this.queueShown = true;
    tutorialRefresh(this);
  }

  // ─── Карточка заказа ─────────────────────────────────────────────────────

  private renderCardEmpty(): void {
    this.card.removeAll(true);
    this.cardReady = false;
    this.tooltip.hide();
  }

  private renderCard(c: (typeof run.queue)[number]): void {
    this.renderCardEmpty();
    const r = HOME_LAYOUT.card;
    const client = CLIENTS[c.client];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => {
      this.card.add(o);
      return o;
    };
    add(this.add.rectangle(r.x, r.y, r.w, r.h, C.panel, 0.92).setOrigin(0).setStrokeStyle(2, C.border));
    add(
      addText(
        this,
        r.x + 24,
        r.y + 16,
        `Монстр ${run.queuePos + 1} из ${run.queue.length} · заказы ${run.accepted.length}/${heroLevel()}`,
        18,
        C.dim,
      ),
    );
    add(addText(this, r.x + 24, r.y + 44, client.name, 36, C.accent, { fontStyle: 'bold' }));

    const wrap = { wordWrap: { width: r.w - 48 } };
    const line = add(addText(this, r.x + 24, r.y + 96, `«${client.line}»`, 22, C.text, { fontStyle: 'italic', ...wrap }));
    // Условие заказчика — под репликой: оно меняет сборку рюкзака, поэтому видно до решения.
    let y = line.y + line.height + 12;
    add(addText(this, r.x + 24, y, 'Условие:', 22, C.dim));
    y += 30;
    const cond = add(addText(this, r.x + 24, y, `«${client.condition.title}»: ${conditionEffect(c.client)}.`, 21, C.accent, wrap));
    y = cond.y + cond.height + 18;
    add(addText(this, r.x + 24, y, `Цель (${c.enemies.length}):`, 22, C.dim));
    addEnemyLines(this, r.x + 24, y + 32, c.enemies, c.mods, this.tooltip, 24, this.card);
    const debt = client.condition.payDebt ? ' — в счёт долга' : '';
    add(addText(this, r.x + 24, r.y + r.h - 90, `Награда: ${c.reward}${debt}`, 28, C.good));
    add(addText(this, r.x + 24, r.y + r.h - 50, `Неустойка: ${c.penalty}`, 28, C.bad));

    const by = r.y + r.h + 55;
    const accept = () => {
      sfx(this, 'contract_accept');
      tutorialDone(this, 'accept');
      this.visitorLeaves(() => decideVisitor(true));
    };
    if (c.enemies.some((e) => ENEMIES[e].boss)) {
      // Заказ на босса (ведьмак, ночь 5) отклонить нельзя.
      add(new Button(this, r.x + r.w / 2, by, r.w - 16, 70, 'Принять — от этого не отказываются', accept, 26));
      return;
    }
    if (run.tutorial) {
      // Обучение: единственный заказ лешего — без кнопки «Отказать».
      add(new Button(this, r.x + r.w / 2, by, r.w - 16, 70, 'Принять', accept, 30));
      return;
    }
    add(new Button(this, r.x + r.w / 4, by, r.w / 2 - 16, 70, 'Принять', accept, 30));
    add(
      new Button(this, r.x + (3 * r.w) / 4, by, r.w / 2 - 16, 70, 'Отказать', () => {
        sfx(this, 'contract_decline');
        this.visitorLeaves(() => decideVisitor(false));
      }, 30),
    );
  }

  // ─── Доска «Заказы на сегодня» ───────────────────────────────────────────

  private refreshBoard(): void {
    const r = HOME_LAYOUT.board;
    this.board.removeAll(true);
    this.board.add(this.add.rectangle(r.x, r.y, r.w, r.h, 0x000000, 0.45).setOrigin(0).setStrokeStyle(2, C.border));
    this.board.add(addText(this, r.x + 20, r.y + 14, 'Заказы на сегодня', 28, C.accent, { fontStyle: 'bold' }));
    this.board.add(
      addText(this, r.x + r.w - 20, r.y + 16, `Заказы: ${run.accepted.length}/${heroLevel()}`, 26, C.text, { fontStyle: 'bold' }).setOrigin(1, 0),
    );
    if (run.accepted.length === 0) {
      this.board.add(addText(this, r.x + 20, r.y + 64, 'пока пусто', 22, C.dim));
      return;
    }
    // При четырёх заказах шрифт мельче, чтобы всё влезло на доску.
    const size = run.accepted.length >= 4 ? 19 : 21;
    let y = r.y + 62;
    run.accepted.forEach((c, i) => {
      const client = CLIENTS[c.client];
      const debt = client.condition.payDebt ? ' (в счёт долга)' : '';
      const head = addText(this, r.x + 20, y, `${i + 1}. ${client.name} — награда ${c.reward}${debt}, неустойка ${c.penalty}`, size, C.text, {
        wordWrap: { width: r.w - 40 },
      });
      this.board.add(head);
      y += head.height + 2;
      const cond = addText(this, r.x + 40, y, `«${client.condition.title}»: ${conditionEffect(c.client)}`, size - 4, C.accent, {
        wordWrap: { width: r.w - 60 },
      });
      this.board.add(cond);
      y += cond.height + 4;
      y += addEnemyLines(this, r.x + 40, y, c.enemies, c.mods, this.tooltip, size, this.board) + 10;
    });
  }

  // ─── Сундук, сумки, дверь ────────────────────────────────────────────────

  /**
   * Зона поверх рисунка фона. alwaysLabel=false — подпись видна только при наведении (дверь).
   * Неактивная (пока не разобрались с очередью) — затемнена; при наведении: «Сначала разберись с заказами».
   */
  private makeHotspot(r: Rect, label: () => string, onClick: () => void, alwaysLabel: boolean): Hotspot {
    let enabled = true;
    const shade = this.add.rectangle(r.x, r.y, r.w, r.h, 0x000000, FEEL.homeDisabledShade).setOrigin(0).setDepth(6).setVisible(false);
    const frame = this.add.rectangle(r.x, r.y, r.w, r.h, 0xffffff, 0.001).setOrigin(0).setDepth(6);
    frame.setStrokeStyle(4, 0xe0b65a, 0);
    const plate = this.add.rectangle(r.x + r.w / 2, r.y + r.h - 40, Math.min(r.w - 20, 300), 52, 0x000000, 0.7).setDepth(7);
    const text = addText(this, plate.x, plate.y, label(), 28, C.text, { fontStyle: 'bold' }).setOrigin(0.5).setDepth(8);
    const setHover = (on: boolean) => {
      shade.setVisible(!enabled);
      frame.setStrokeStyle(4, 0xe0b65a, on && enabled ? 1 : 0);
      frame.setFillStyle(0xffffff, on && enabled ? 0.06 : 0.001);
      // Неактивная зона при наведении объясняет, почему она закрыта; подпись растягивается под текст.
      const busy = !enabled && on;
      text.setText(busy ? 'Сначала разберись с заказами' : label()).setFontSize(busy ? 22 : 28);
      plate.setSize(Math.max(Math.min(r.w - 20, 300), text.width + 30), 52);
      const visible = alwaysLabel || on;
      plate.setVisible(visible);
      text.setVisible(visible).setColor(enabled ? (on ? C.accent : C.text) : busy ? C.accent : C.dim);
    };
    frame.setInteractive({ useHandCursor: true });
    frame.on('pointerover', () => {
      setHover(true);
      if (enabled) sfx(this, 'ui_hover');
    });
    frame.on('pointerout', () => setHover(false));
    frame.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!enabled || p.button !== 0) return;
      sfx(this, 'ui_click');
      onClick();
    });
    setHover(false);
    return {
      setEnabled: (v: boolean) => {
        enabled = v;
        if (frame.input) frame.input.cursor = v ? 'pointer' : 'default';
        setHover(false);
      },
    };
  }

  private setHotspotsEnabled(v: boolean): void {
    for (const h of this.hotspots) h.setEnabled(v);
  }

  private leaveHouse(): void {
    sfx(this, 'door_open');
    tutorialDone(this, 'door');
    if (run.accepted.length > 0) {
      goto(this, 'Battle');
    } else {
      resolveNight({ kind: 'skip', defeated: 0, stolen: [] });
      goto(this, 'Results');
    }
  }
}
