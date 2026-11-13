// Дом Людьмака — центральный экран ночи. Монстры по одному подходят к окошку в двери с заказами.
// Пока очередь не закончилась, магазин, сумки и дверь закрыты.
import * as Phaser from 'phaser';
import { BG_HOME_CLOSED_KEY, BG_HOME_KEY, clientKey, HOME_LAYOUT, HOME_WINDOW_MASK_KEY, menuShardKey, MENU_ART, SEAL_IMPRINT_KEY, SEAL_STAMP_KEY, statIconKey, UI_ART, UI_PARCHMENT_KEY } from '../config/assets';
import { CLIENTS } from '../data/clients';
import { ENEMIES } from '../data/enemies';
import { THANKS_NOTE, WITCHER_LETTER } from '../data/story';
import {
  currentVisitor,
  decideVisitor,
  heroLevel,
  markLetterRead,
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
  private windowMask!: Phaser.Display.Masks.GeometryMask | Phaser.Display.Masks.BitmapMask;
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
    this.stamping = false;
    this.leaving = false;

    addBackground(this, BG_HOME_KEY);
    this.refreshHeader = addHeader(this, 'Дом Людьмака');

    // Окошко: всё, что в нём показывается, обрезается по форме проёма — маска с картинки фона (неровные края);
    // нет маски — скруглённый прямоугольник.
    const wnd = L.window;
    const wm = L.windowMask;
    if (wm && this.textures.exists(HOME_WINDOW_MASK_KEY)) {
      const bg = this.textures.get(BG_HOME_KEY).getSourceImage();
      const k = Math.max(W / bg.width, H / bg.height);
      const mi = this.make.image({ x: (W - bg.width * k) / 2 + wm.x * k, y: (H - bg.height * k) / 2 + wm.y * k, key: HOME_WINDOW_MASK_KEY }, false);
      mi.setOrigin(0).setScale(k);
      this.windowMask = mi.createBitmapMask();
    } else {
      const maskShape = this.make.graphics({}, false);
      maskShape.fillStyle(0xffffff).fillRoundedRect(wnd.x, wnd.y, wnd.w, wnd.h, wnd.radius);
      this.windowMask = maskShape.createGeometryMask();
    }
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

    // Обучение подключается после письма без подписи: пока оно не прочитано, первый шаг не показывается.
    const attachTutorial = () => tutorialAttach(this, (id) => this.tutorialTarget(id));
    if (run.night === 1 && !run.letterRead) this.showLetter(attachTutorial);
    else attachTutorial();
    if (run.finished) {
      this.showEpilogue();
    } else if (queueDone()) {
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
  /** Части листа заказа на экране — для шагов обучения (заполняет renderCard). */
  private cardAreas: { head: Rect; cond: Rect; foes: Rect; money: Rect } | null = null;

  private tutorialTarget(id: StepId): StepTarget {
    const L = HOME_LAYOUT;
    const parts = { cardHead: 'head', cardCondition: 'cond', cardEnemies: 'foes', cardMoney: 'money' } as const;
    if (id in parts) {
      if (queueDone() || !this.cardReady || !this.cardAreas) return null;
      return this.cardAreas[parts[id as keyof typeof parts]];
    }
    if (id === 'accept') {
      if (queueDone() || !this.cardReady) return null;
      // Вся карточка вместе с кнопкой «Принять» — чтобы можно было прочитать условие.
      return { x: L.card.x, y: L.card.y, w: L.card.w, h: L.card.h + 98 };
    }
    if (!this.queueShown) return null;
    if (id === 'board') return L.board;
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

  /**
   * Эпилог после победы над ведьмаком: окошко закрыто, дверь заперта, заказов нет; на месте карточки — записка
   * с благодарностью и кнопкой «В меню». Магазин и сумки работают.
   */
  private showEpilogue(): void {
    this.shutter.setY(this.shutterY);
    this.setHotspotsEnabled(true);
    this.hotspots[2].setEnabled(false);
    this.card.removeAll(true);
    const r = HOME_LAYOUT.card;
    const p = this.cardPaper();
    const width = r.w - 2 * p.px;
    const title = addText(this, r.x + r.w / 2, r.y + p.top, THANKS_NOTE.title, 32, p.ink.accent, TITLE).setOrigin(0.5, 0);
    const body = addText(this, r.x + p.px, title.y + title.height + 14, THANKS_NOTE.body, 24, p.ink.text, {
      fontStyle: 'italic',
      wordWrap: { width },
      lineSpacing: 5,
    });
    const sign = addText(this, r.x + r.w - p.px, body.y + body.height + 12, THANKS_NOTE.signature, 24, p.ink.text, { fontStyle: 'italic' }).setOrigin(1, 0);
    const btn = new Button(this, r.x + r.w / 2, r.y + r.h - p.bottom - 40, 260, 64, THANKS_NOTE.button, () => goto(this, 'Menu'), 28);
    this.card.add([title, body, sign, btn]);
  }

  // ─── Карточка заказа ─────────────────────────────────────────────────────

  /**
   * Письмо о ведьмаке в начале ночи 1: поверх всего (и обучения), остальное затемнено и не нажимается.
   * «Прочитано» — письмо уходит, дальше ночь как обычно.
   */
  private showLetter(onRead: () => void): void {
    const Lt = HOME_LAYOUT.letter;
    const cont = this.add.container(0, 0).setDepth(3000);
    // Затемнение ловит клики — до прочтения ничего другого не нажать.
    cont.add(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.72).setInteractive());
    const left = Lt.x - Lt.w / 2;
    const top = Lt.y - Lt.h / 2;
    const paper = this.textures.exists(UI_PARCHMENT_KEY);
    cont.add(
      paper
        ? this.add.image(Lt.x, Lt.y, UI_PARCHMENT_KEY).setDisplaySize(Lt.w, Lt.h)
        : this.add.rectangle(Lt.x, Lt.y, Lt.w, Lt.h, C.panel, 0.95).setStrokeStyle(2, C.border),
    );
    const ink = paper ? C.ink : C.text;
    const width = Lt.w - 2 * Lt.padX;
    const title = addText(this, Lt.x, top + Lt.top, WITCHER_LETTER.title, Lt.size + 8, paper ? C.inkAccent : C.accent, TITLE).setOrigin(0.5, 0);
    const body = addText(this, left + Lt.padX, title.y + title.height + 18, WITCHER_LETTER.body, Lt.size, ink, {
      fontStyle: 'italic',
      wordWrap: { width },
      lineSpacing: 4,
    });
    const sign = addText(this, left + Lt.w - Lt.padX, body.y + body.height + 14, WITCHER_LETTER.signature, Lt.size, ink, { fontStyle: 'italic' }).setOrigin(1, 0);
    const btn = new Button(this, Lt.x, top + Lt.buttonY, 320, 70, WITCHER_LETTER.button, () => {
      markLetterRead();
      this.tweens.add({
        targets: cont,
        alpha: 0,
        duration: FEEL.fadeMs,
        onComplete: () => {
          cont.destroy();
          onRead();
        },
      });
    }, 30);
    cont.add([title, body, sign, btn]);
    cont.setAlpha(0);
    this.tweens.add({ targets: cont, alpha: 1, duration: FEEL.fadeMs });
  }

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
    // Части листа для обучения: шапка и текст, условие, враги, деньги (прямоугольники на экране).
    const area = (y0: number, y1: number): Rect => ({ x: r.x + p.px - 8, y: y0 - 6, w: r.w - 2 * p.px + 16, h: y1 - y0 + 12 });

    const wrap = { wordWrap: { width: r.w - 2 * p.px } };
    const line = add(addText(this, tx, name.y + name.height + 2, `«${client.quests[c.quest]?.line ?? client.quests[0].line}»`, 22, k.text, { fontStyle: 'italic', ...wrap }));
    // Условие заказчика — под репликой: название словами, что оно делает — плашками с подсказками.
    let y = line.y + line.height + 12;
    const head = area(r.y + p.top - 20, line.y + line.height);
    const condY = y;
    const cond = add(addText(this, tx, y, `«${client.condition.title}»`, 22, k.accent, { fontStyle: 'bold', ...wrap }));
    y += cond.height + 6;
    const chips = conditionChips(this, c.client);
    if (chips.length) y += addChips(this, tx, y, chips, { h: 34, maxW: r.w - 2 * p.px, container: this.card }).h + 14;
    else y += 4;
    const condArea = area(condY, y - 10);
    // Враги: значок вместо «Цель (N):», имена словами — наведение открывает сумку врага.
    const foes = addChips(
      this,
      tx,
      y,
      [{ icon: statIconKey('enemies'), value: `${c.enemies.length}`, hint: `Враги этого заказа: ${c.enemies.length}. Наведи на имя — увидишь его сумку.` }],
      { h: 34, container: this.card },
    );
    const linesX = tx + foes.w + 10;
    const linesH = addEnemyLines(this, linesX, y + 3, c.enemies, c.mods, this.tooltip, 24, this.card, { text: k.text, accent: k.accent }, r.x + r.w - p.px - linesX);
    const foesArea = area(y, y + Math.max(foes.h, linesH + 3));
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
    this.cardAreas = { head, cond: condArea, foes: foesArea, money: area(r.y + r.h - p.bottom - 80, r.y + r.h - p.bottom - 6) };

    const by = r.y + r.h + 55;
    // Принять: на лист заказа падает печать, лист держится FEEL.stamp.holdMs — потом монстр уходит.
    const accept = () => {
      if (this.stamping) return;
      this.stamping = true;
      tutorialDone(this, 'accept');
      this.stampCard(() => {
        this.stamping = false;
        this.visitorLeaves(() => {
          decideVisitor(true);
          this.refreshHeader(); // аванс Кикиморы — монеты сразу
        });
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
        if (this.stamping) return;
        sfx(this, 'contract_decline');
        this.visitorLeaves(() => decideVisitor(false));
      }, 30),
    );
  }

  /** Уходим на охоту (идёт наезд на дверь) — повторное нажатие не срабатывает. */
  private leaving = false;

  /** Идёт печать на заказе: кнопки «Принять / Отказать» не нажимаются. */
  private stamping = false;

  /**
   * Печать на карточке заказа: сначала капля воска падает с увеличения и растекается, потом на неё опускается оттиск
   * с «Ъ» (звук, карточка вздрагивает, воск сминается, разлетаются осколки), держится FEEL.stamp.holdMs — потом done().
   */
  private stampCard(done: () => void): void {
    const F = FEEL.stamp;
    const r = HOME_LAYOUT.card;
    const S = HOME_LAYOUT.stamp;
    if (!this.textures.exists(SEAL_STAMP_KEY)) {
      sfx(this, 'contract_accept');
      this.time.delayedCall(F.holdMs, done);
      return;
    }
    const x = r.x + r.w * S.x;
    const y = r.y + r.h * S.y;
    const stamp = this.add.image(x, y, SEAL_STAMP_KEY);
    const base = (r.w * S.size) / stamp.width;
    const tilt = Phaser.Math.FloatBetween(-F.tiltDeg, F.tiltDeg);
    stamp.setScale(base * F.fromScale).setAngle(tilt * 2).setAlpha(0);
    this.card.add(stamp);
    // Оттиск — на внутреннем круге капли, с тем же наклоном.
    const I = S.imprint;
    const offX = (I.x - 0.5) * stamp.width * base;
    const offY = (I.y - 0.5) * stamp.height * base;
    const rad = Phaser.Math.DegToRad(tilt);
    const ix = x + offX * Math.cos(rad) - offY * Math.sin(rad);
    const iy = y + offX * Math.sin(rad) + offY * Math.cos(rad);
    const press = () => {
      if (!this.textures.exists(SEAL_IMPRINT_KEY)) return impact();
      const imprint = this.add.image(ix, iy, SEAL_IMPRINT_KEY);
      const ib = (stamp.width * base * I.size) / imprint.width;
      imprint.setScale(ib * F.imprintFrom).setAngle(tilt).setAlpha(0);
      this.card.add(imprint);
      this.tweens.add({ targets: imprint, scale: ib, alpha: 1, duration: F.imprintMs, ease: 'Quad.easeIn', onComplete: impact });
    };
    // Капля воска падает и на миг растекается.
    this.tweens.add({
      targets: stamp,
      scale: base,
      angle: tilt,
      alpha: 1,
      duration: F.dropMs,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.tweens.add({ targets: stamp, scaleX: base * F.waxSquash, scaleY: base / F.waxSquash, duration: 35, yoyo: true, ease: 'Quad.easeOut' });
        this.time.delayedCall(F.imprintDelayMs, press);
      },
    });
    // Оттиск вдавился: звук, лист вздрагивает, воск сминается, осколки разлетаются.
    const impact = () => {
        sfx(this, this.cache.audio.exists('seal_stamp') ? 'seal_stamp' : 'contract_accept');
        this.tweens.add({ targets: stamp, scaleX: base / F.imprintSquash, scaleY: base * F.imprintSquash, duration: 30, yoyo: true, ease: 'Quad.easeOut' });
        this.tweens.add({ targets: this.card, y: F.shakePx, duration: 25, yoyo: true, ease: 'Quad.easeOut' });
        for (let i = 0; i < F.shards; i++) {
          const n = i % MENU_ART.shards.length;
          if (!this.textures.exists(menuShardKey(n))) continue;
          const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
          const shard = this.add.image(x, y, menuShardKey(n)).setScale(base * 1.6).setDepth(10);
          this.card.add(shard);
          const dist = F.shardDist * Phaser.Math.FloatBetween(0.6, 1);
          this.tweens.add({
            targets: shard,
            x: x + Math.cos(a) * dist,
            y: y + Math.sin(a) * dist,
            angle: Phaser.Math.Between(-180, 180),
            alpha: 0,
            duration: F.shardMs,
            ease: 'Cubic.easeOut',
            onComplete: () => shard.destroy(),
          });
        }
        this.time.delayedCall(F.holdMs, done);
    };
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
    if (this.leaving) return;
    sfx(this, 'door_open');
    tutorialDone(this, 'door');
    if (run.accepted.length > 0) {
      // На охоту: камера наезжает на дверь, в конце — затемнение и бой.
      this.leaving = true;
      const B = FEEL.battleIntro;
      const d = HOME_LAYOUT.door;
      const cam = this.cameras.main;
      cam.pan(d.x + d.w / 2, d.y + d.h / 2, B.doorMs, 'Cubic.easeIn');
      cam.zoomTo(B.doorZoom, B.doorMs, 'Cubic.easeIn');
      this.time.delayedCall(Math.max(0, B.doorMs - FEEL.fadeMs), () => goto(this, 'Battle'));
    } else {
      resolveNight({ kind: 'skip', defeated: 0, stolen: [] });
      goto(this, 'Results');
    }
  }
}
