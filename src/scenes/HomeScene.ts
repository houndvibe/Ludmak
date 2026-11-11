// Дом Людьмака — центральный экран ночи. Монстры по одному подходят к окошку в двери с заказами.
// Пока очередь не закончилась, магазин, сумки и дверь закрыты.
import * as Phaser from 'phaser';
import { BG_HOME_CLOSED_KEY, BG_HOME_KEY, clientKey, HOME_LAYOUT, statIconKey, UI_ART, UI_PARCHMENT_KEY } from '../config/assets';
import { CLIENTS } from '../data/clients';
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
import { addPortrait } from '../components/PortraitLife';
import { EnemyTooltip } from '../components/EnemyTooltip';
import { playMusic, sfx } from '../components/Sound';
import {
  addBackground,
  addChips,
  addEnemyLines,
  addHeader,
  addText,
  Button,
  C,
  coinIconKey,
  conditionChips,
  fadeIn,
  fit,
  goto,
  H,
  TITLE,
  W,
  withHoverTip,
  type UiChip,
} from '../ui';

type Rect = { x: number; y: number; w: number; h: number };


interface Hotspot {
  setEnabled(v: boolean): void;
}

export class HomeScene extends Phaser.Scene {
  /** Обновить монеты и жизни в шапке. */
  private refreshHeader: () => void = () => {};
  private tooltip!: EnemyTooltip;
  private windowMask!: Phaser.Display.Masks.GeometryMask;
  /** Задвижка окошка: кусок фона с закрытым окном (или прямоугольник кодом). Закрыта — shutterY, открыта — выше на высоту окна. */
  private shutter!: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  private shutterY = 0;
  /** Тень в окошке поверх портрета: заказчик выходит из неё и уходит в неё. */
  private windowShade!: Phaser.GameObjects.Rectangle;
  private portrait: Phaser.GameObjects.Image | Phaser.GameObjects.Rope | null = null;
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
    this.refreshHeader = addHeader(this, 'Дом Людьмака');

    // Окошко: всё, что в нём показывается, обрезается по его форме.
    const wnd = L.window;
    const maskShape = this.make.graphics({}, false);
    maskShape.fillStyle(0xffffff).fillRoundedRect(wnd.x, wnd.y, wnd.w, wnd.h, wnd.radius);
    this.windowMask = maskShape.createGeometryMask();
    this.shutter = this.makeShutter();
    // Тень окошка: между портретом (глубина 4) и задвижкой (5); без портрета окошко тёмное.
    this.windowShade = this.add
      .rectangle(wnd.x, wnd.y, wnd.w, wnd.h, 0x000000, 1)
      .setOrigin(0)
      .setAlpha(FEEL.portraitShadow.shadowAlpha)
      .setMask(this.windowMask)
      .setDepth(4.5);

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
      // Пока идёт очередь, закрыта только дверь: в магазин и к сумкам можно сходить между посетителями
      // (по возвращении у окошка тот же монстр).
      this.hotspots[2].setEnabled(false);
      this.tweens.add({
        targets: this.shutter,
        y: this.shutterY - wnd.h,
        duration: FEEL.shutter.openMs,
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
    // Портрет может быть «живым» (PORTRAIT_LIFE) — тогда он дышит и светится, иначе обычная картинка.
    const img = addPortrait(this, L.window.x + L.window.w / 2, 0, clientKey(c.client), L.portraitWidth, this.windowMask).setDepth(4);
    // Выходит из тени: из глубины (меньше) к окошку, тень рассеивается.
    const S = FEEL.portraitShadow;
    const k = img.scale;
    img.setY(L.window.y + L.portraitOffsetY + img.displayHeight / 2).setScale(k * S.backScale);
    this.tweens.add({ targets: img, scale: k, duration: S.inMs, ease: 'Cubic.easeOut' });
    this.tweens.killTweensOf(this.windowShade);
    this.tweens.add({ targets: this.windowShade, alpha: 0, duration: S.inMs, ease: 'Sine.easeOut' });
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
    // Уходит назад в тень: уменьшается, окошко темнеет; потом следующий выходит из тени (или задвижка закрывается).
    const S = FEEL.portraitShadow;
    this.tweens.add({ targets: img, scale: img.scale * S.backScale, duration: S.outMs, ease: 'Cubic.easeIn' });
    this.tweens.killTweensOf(this.windowShade);
    this.tweens.add({
      targets: this.windowShade,
      alpha: S.shadowAlpha,
      duration: S.outMs,
      ease: 'Sine.easeIn',
      onComplete: () => {
        img.destroy();
        this.showVisitor();
      },
    });
  }

  /**
   * Задвижка окошка — кусок фона с закрытым окном (home_closed.webp) ровно по окошку: фон растянут так же, как в
   * addBackground, обрезан по HOME_LAYOUT.window и спрятан за маской окна. Нет картинки — прямоугольник кодом.
   */
  private makeShutter(): Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle {
    const wnd = HOME_LAYOUT.window;
    if (!this.textures.exists(BG_HOME_CLOSED_KEY)) {
      this.shutterY = wnd.y;
      return this.add.rectangle(wnd.x, wnd.y, wnd.w, wnd.h, 0x5e4229).setOrigin(0).setStrokeStyle(6, 0x2a1c10).setMask(this.windowMask).setDepth(5);
    }
    const img = this.add.image(W / 2, H / 2, BG_HOME_CLOSED_KEY);
    const s = Math.max(W / img.width, H / img.height);
    img.setScale(s);
    // Окошко в пикселях картинки (с запасом 4 px, чтобы края не просвечивали).
    const left = W / 2 - (img.width * s) / 2;
    const top = H / 2 - (img.height * s) / 2;
    img.setCrop((wnd.x - left) / s - 4, (wnd.y - top) / s - 4, wnd.w / s + 8, wnd.h / s + 8);
    this.shutterY = H / 2;
    return img.setMask(this.windowMask).setDepth(5);
  }

  /** Задвижка падает вниз с отскоком, на ударе — облачко пыли по низу окошка. */
  private closeWindow(): void {
    sfx(this, 'window_close');
    this.tweens.add({
      targets: this.shutter,
      y: this.shutterY,
      duration: FEEL.shutter.closeMs,
      ease: 'Bounce.easeOut',
      onComplete: () => this.showQueueOver(),
    });
    this.time.delayedCall(FEEL.shutter.closeMs * 0.36, () => this.shutterDust());
  }

  /** Пыль из-под задвижки: несколько мягких облачков разлетаются по низу окошка и тают. */
  private shutterDust(): void {
    const S = FEEL.shutter;
    const wnd = HOME_LAYOUT.window;
    const y = wnd.y + wnd.h - 6;
    for (let i = 0; i < S.dust; i++) {
      const x = wnd.x + (wnd.w * (i + 0.5)) / S.dust;
      const puff = this.add.circle(x, y, Phaser.Math.Between(8, 14), S.dustColor, 0.5).setDepth(6);
      this.tweens.add({
        targets: puff,
        x: x + Phaser.Math.Between(-S.dustSpread, S.dustSpread) * 0.5,
        y: y + Phaser.Math.Between(4, 18),
        scale: 2.4,
        alpha: 0,
        duration: S.dustMs,
        ease: 'Cubic.easeOut',
        onComplete: () => puff.destroy(),
      });
    }
  }

  private showQueueOver(): void {
    this.shutter.setY(this.shutterY);
    this.setHotspotsEnabled(true);
    const n = run.accepted.length;
    const text =
      n > 0
        ? `Очередь разошлась.\n\nЗаказов на день: ${n}.\nЗагляни в сундук, уложи сумки — и за дверь, на охоту.`
        : 'Очередь разошлась, а заказов нет.\n\nМожно заглянуть в сундук и переждать день за дверью.';
    this.card.removeAll(true);
    const r = HOME_LAYOUT.card;
    const p = this.cardPaper();
    this.card.add(addText(this, r.x + p.px, r.y + p.top, text, 26, p.ink.text, { wordWrap: { width: r.w - 2 * p.px }, lineSpacing: 6 }));
    this.queueShown = true;
    tutorialRefresh(this);
  }

  // ─── Карточка заказа ─────────────────────────────────────────────────────

  /**
   * Подложка карточки: пергамент художницы с тёмными чернилами, без картинки — тёмная панель со светлым текстом.
   * Возвращает поля текста и цвета.
   */
  private cardPaper() {
    const r = HOME_LAYOUT.card;
    if (this.textures.exists(UI_PARCHMENT_KEY)) {
      this.card.add(this.add.image(r.x, r.y, UI_PARCHMENT_KEY).setOrigin(0));
      const pad = UI_ART.parchment.pad;
      return {
        px: pad.x,
        top: pad.top,
        bottom: pad.bottom,
        ink: { text: C.ink, dim: C.inkDim, accent: C.inkAccent, good: C.inkGood, bad: C.inkBad },
      };
    }
    this.card.add(this.add.rectangle(r.x, r.y, r.w, r.h, C.panel, 0.92).setOrigin(0).setStrokeStyle(2, C.border));
    return { px: 24, top: 16, bottom: 10, ink: { text: C.text, dim: C.dim, accent: C.accent, good: C.good, bad: C.bad } };
  }

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
    const p = this.cardPaper();
    const k = p.ink;
    const tx = r.x + p.px;
    // Сверху — значки: очередь у двери и взятые заказы (полные фразы — в подсказках).
    addChips(
      this,
      tx,
      r.y + p.top - 6,
      [
        {
          icon: statIconKey('queue'),
          value: `${run.queuePos + 1}/${run.queue.length}`,
          hint: `Монстр ${run.queuePos + 1} из ${run.queue.length} в очереди у двери.`,
        },
        {
          icon: statIconKey('contracts'),
          value: `${run.accepted.length}/${heroLevel()}`,
          hint: `Взято заказов: ${run.accepted.length} из ${heroLevel()} — лимит на ночь по уровню Людьмака.`,
        },
      ],
      { h: 28, container: this.card },
    );
    const name = add(addText(this, tx, r.y + p.top + 28, client.name, 40, k.accent, TITLE));

    const wrap = { wordWrap: { width: r.w - 2 * p.px } };
    const line = add(addText(this, tx, name.y + name.height + 2, `«${client.line}»`, 22, k.text, { fontStyle: 'italic', ...wrap }));
    // Условие заказчика — под репликой: название словами, что оно делает — плашками с подсказками.
    let y = line.y + line.height + 12;
    const cond = add(addText(this, tx, y, `«${client.condition.title}»`, 22, k.accent, { fontStyle: 'bold', ...wrap }));
    y += cond.height + 6;
    const chips = conditionChips(this, c.client);
    if (chips.length) y += addChips(this, tx, y, chips, { h: 34, maxW: r.w - 2 * p.px, container: this.card }).h + 14;
    else y += 4;
    // Враги: значок вместо «Цель (N):», имена словами — наведение открывает сумку врага.
    const foes = addChips(
      this,
      tx,
      y,
      [{ icon: statIconKey('enemies'), value: `${c.enemies.length}`, hint: `Враги этого заказа: ${c.enemies.length}. Наведи на имя — увидишь его сумку.` }],
      { h: 34, container: this.card },
    );
    const linesX = tx + foes.w + 10;
    addEnemyLines(this, linesX, y + 3, c.enemies, c.mods, this.tooltip, 24, this.card, { text: k.text, accent: k.accent }, r.x + r.w - p.px - linesX);
    // Деньги: слова обычным цветом, монета и число — зелёное (награда) или красное (неустойка).
    const money = (label: string, value: string, color: string, yy: number, hint: string, suffix = '') => {
      const l = add(addText(this, tx, yy, label, 26, k.text));
      const ic = add(fit(this.add.image(l.x + l.width + 8 + 15, l.y + l.height / 2, coinIconKey(this)), 30, 30));
      const n = add(addText(this, ic.x + 15 + 6, yy - 1, value, 28, color, { fontStyle: 'bold' }));
      if (suffix) add(addText(this, n.x + n.width + 8, yy + 4, suffix, 20, k.dim));
      withHoverTip(ic, hint);
      withHoverTip(n, hint);
    };
    const adv = client.condition.advance;
    money(
      'Награда:',
      `${c.reward}`,
      k.good,
      r.y + r.h - p.bottom - 80,
      adv ? `Награда ${c.reward} монет — сразу, как только примешь заказ (аванс).` : `Награда ${c.reward} монет за выполненный заказ.`,
      adv ? 'сразу, авансом' : '',
    );
    money(
      'Неустойка:',
      `${c.penalty}`,
      k.bad,
      r.y + r.h - p.bottom - 40,
      `Неустойка ${c.penalty} монет — если погибнешь, не выполнив заказ; при отступлении — часть.${adv ? ' И аванс придётся вернуть.' : ''}`,
    );

    const by = r.y + r.h + 55;
    const accept = () => {
      sfx(this, 'contract_accept');
      tutorialDone(this, 'accept');
      this.visitorLeaves(() => {
        decideVisitor(true);
        this.refreshHeader(); // аванс Кикиморы — монеты сразу
      });
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
    this.board.add(this.add.rectangle(r.x, r.y, r.w, r.h, 0x000000, 0.25).setOrigin(0)); // доска нарисована на фоне — без рамки
    this.board.add(addText(this, r.x + 20, r.y + 14, 'Заказы на сегодня', 30, C.accent, TITLE));
    // Справа — счётчик взятых заказов тем же значком, что на карточке.
    this.board.add(
      this.rightChips(r.x + r.w - 16, r.y + 14, [
        {
          icon: statIconKey('contracts'),
          value: `${run.accepted.length}/${heroLevel()}`,
          hint: `Взято заказов: ${run.accepted.length} из ${heroLevel()} — лимит на ночь по уровню Людьмака.`,
        },
      ], 30),
    );
    if (run.accepted.length === 0) {
      this.board.add(addText(this, r.x + 20, r.y + 64, 'пока пусто', 22, C.dim));
      return;
    }
    // При четырёх заказах шрифт мельче, чтобы всё влезло на доску.
    const size = run.accepted.length >= 4 ? 19 : 21;
    const rowH = size + 10;
    let y = r.y + 60;
    run.accepted.forEach((c, i) => {
      const client = CLIENTS[c.client];
      const head = addText(this, r.x + 20, y + rowH / 2, `${i + 1}. ${client.name}`, size + 1, C.text, { fontStyle: 'bold' }).setOrigin(0, 0.5);
      this.board.add(head);
      // Плашки боя (запрет, первый удар, нельзя отступать) — сразу за именем.
      addChips(this, head.x + head.width + 10, y, conditionChips(this, c.client, true), { h: rowH, container: this.board });
      // Справа — деньги: +награда зелёным (аванс получен — серая с ✓), −неустойка красным.
      const adv = client.condition.advance;
      this.board.add(
        this.rightChips(r.x + r.w - 16, y, [
          {
            icon: coinIconKey(this),
            value: adv ? `+${c.reward} ✓` : `+${c.reward}`,
            color: adv ? C.dim : C.good,
            hint: adv ? `Награда ${c.reward} монет — уже получена авансом.` : `Награда ${c.reward} монет за выполненный заказ.`,
          },
          {
            icon: coinIconKey(this),
            value: `−${c.penalty}`,
            color: C.bad,
            hint: `Неустойка ${c.penalty} монет — если погибнешь, не выполнив заказ; при отступлении — часть.${adv ? ' И аванс придётся вернуть.' : ''}`,
          },
        ], rowH),
      );
      y += rowH + 4;
      y += addEnemyLines(this, r.x + 40, y, c.enemies, c.mods, this.tooltip, size, this.board, undefined, r.w - 60) + 10;
    });
  }

  /** Плашки, прижатые правым краем к x (верх — y). */
  private rightChips(x: number, y: number, chips: UiChip[], h: number): Phaser.GameObjects.Container {
    const box = this.add.container(0, 0);
    const { w } = addChips(this, 0, 0, chips, { h, container: box });
    return box.setPosition(x - w, y);
  }

  // ─── Сундук, сумки, дверь ────────────────────────────────────────────────

  /**
   * Зона поверх рисунка фона. alwaysLabel=false — подпись видна только при наведении (дверь).
   * Неактивная (дверь, пока не разобрались с очередью) — затемнена; при наведении: «Сначала разберись с заказами».
   */
  private makeHotspot(r: Rect, label: () => string, onClick: () => void, alwaysLabel: boolean): Hotspot {
    let enabled = true;
    const shade = this.add.rectangle(r.x, r.y, r.w, r.h, 0x000000, FEEL.homeDisabledShade).setOrigin(0).setDepth(6).setVisible(false);
    const frame = this.add.rectangle(r.x, r.y, r.w, r.h, 0xffffff, 0.001).setOrigin(0).setDepth(6);
    frame.setStrokeStyle(4, 0xe0b65a, 0);
    const plate = this.add.rectangle(r.x + r.w / 2, r.y + r.h - 40, Math.min(r.w - 20, 300), 52, 0x000000, 0.7).setDepth(7);
    const text = addText(this, plate.x, plate.y, label(), 30, C.text, TITLE).setOrigin(0.5).setDepth(8);
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
