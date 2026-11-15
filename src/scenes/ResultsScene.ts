// Итоги ночи: узкий лист — исход, заказы строками, монеты «было → стало», журнал боя по ссылке (отдельным окном).
import * as Phaser from 'phaser';
import {
  BG_RESULTS_KEY,
  HOME_LAYOUT,
  MENU_ART,
  RESULTS_LAYOUT,
  SEAL_IMPRINT_KEY,
  SEAL_STAMP_KEY,
  menuShardKey,
} from '../config/assets';
import { PARRY_REWARD_MULT } from '../config/balance';

/** Цвета текста на тёмной панели итогов: основной — светлый бежевый, акцент — бежевый Kurale, второстепенный — приглушённый. */
const INK = { text: '#e6dccb', accent: MENU_ART.buttonTextColor, dim: '#a89a84' };
import { CLIENTS } from '../data/clients';
import type { SoundKey } from '../config/audio';
import { FEEL } from '../config/feel';
import { tutorialAttach } from '../components/Hints';
import { playMusic, sfx } from '../components/Sound';
import { advanceNight, finalAhead, heroLevel, markTutorialDone, nextLevel, run } from '../state';
import type { ContractResult, NightSummary } from '../state';
import { ENEMIES } from '../data/enemies';
import { FINAL_BOSS } from '../config/balance';
import { addBackground, addPanel, addPanelTitle, addText, Button, C, coinIconKey, TITLE, fadeIn, goto, H, W } from '../ui';

interface ResultLinePart {
  text: string;
  gold?: boolean;
}

export class ResultsScene extends Phaser.Scene {
  /** Где на экране список поверженных (для подсказки обучения). */
  private foesRect = { x: 0, y: 0, w: 0, h: 0 };
  /** Правый и нижний край листа (для печати и кнопки). */
  private sheet = { right: 0, bottom: 0 };

  constructor() {
    super('Results');
  }

  create(): void {
    fadeIn(this);
    playMusic(this, 'music_night');
    const summary = run.summary!;
    addBackground(this, BG_RESULTS_KEY);
    this.drawSheet(summary);
    this.playStamp();

    const final = finalAhead();
    const level = nextLevel();
    const levelUp = !summary.gameOver && level !== null && level > heroLevel();

    const sounds: SoundKey[] = [];
    if (summary.reward > 0) sounds.push('coins');
    if (levelUp) sounds.push('level_up');
    sounds.forEach((key, i) => this.time.delayedCall(FEEL.resultsSoundStepMs * (i + 1), () => sfx(this, key)));

    if (run.tutorial) {
      tutorialAttach(this, (id) => (id === 'adapt' ? this.foesRect : null));
      markTutorialDone();
    }

    const label = summary.gameOver
      ? 'ДАЛЬШЕ'
      : final
        ? `${ENEMIES[FINAL_BOSS].name.toUpperCase()} →`
        : 'СЛЕДУЮЩАЯ НОЧЬ →';
    new Button(this, W / 2, this.sheet.bottom + RESULTS_LAYOUT.buttonGap, 480, 80, label, () => {
      if (summary.gameOver) {
        goto(this, 'GameOver');
      } else if (final) {
        goto(this, 'Battle', { final: true });
      } else {
        advanceNight();
        goto(this, 'Home');
      }
    }, 32);
  }

  /** Та же печать, что на принятом заказе: капля воска, оттиск «Ъ», звук и осколки. */
  private playStamp(): void {
    if (!this.textures.exists(SEAL_STAMP_KEY)) return;
    const F = FEEL.stamp;
    // Печать — в правом нижнем углу листа (размер и отступ от угла — RESULTS_LAYOUT.stamp).
    const L = RESULTS_LAYOUT.stamp;
    const S = { x: this.sheet.right - L.dx, y: this.sheet.bottom - L.dy, size: L.size };
    const stamp = this.add.image(S.x, S.y, SEAL_STAMP_KEY).setDepth(20);
    const base = S.size / stamp.width;
    const tilt = Phaser.Math.FloatBetween(-F.tiltDeg, F.tiltDeg);
    stamp.setScale(base * F.fromScale).setAngle(tilt * 2).setAlpha(0);

    const I = HOME_LAYOUT.stamp.imprint;
    const offX = (I.x - 0.5) * stamp.width * base;
    const offY = (I.y - 0.5) * stamp.height * base;
    const rad = Phaser.Math.DegToRad(tilt);
    const ix = S.x + offX * Math.cos(rad) - offY * Math.sin(rad);
    const iy = S.y + offX * Math.sin(rad) + offY * Math.cos(rad);

    const impact = () => {
      sfx(this, this.cache.audio.exists('seal_stamp') ? 'seal_stamp' : 'contract_accept');
      this.tweens.add({
        targets: stamp,
        scaleX: base / F.imprintSquash,
        scaleY: base * F.imprintSquash,
        duration: 30,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
      for (let i = 0; i < F.shards; i++) {
        const n = i % MENU_ART.shards.length;
        if (!this.textures.exists(menuShardKey(n))) continue;
        const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
        const shard = this.add.image(S.x, S.y, menuShardKey(n)).setScale(base * 1.6).setDepth(20);
        const dist = F.shardDist * Phaser.Math.FloatBetween(0.6, 1);
        this.tweens.add({
          targets: shard,
          x: S.x + Math.cos(a) * dist,
          y: S.y + Math.sin(a) * dist,
          angle: Phaser.Math.Between(-180, 180),
          alpha: 0,
          duration: F.shardMs,
          ease: 'Cubic.easeOut',
          onComplete: () => shard.destroy(),
        });
      }
    };

    const press = () => {
      if (!this.textures.exists(SEAL_IMPRINT_KEY)) return impact();
      const imprint = this.add.image(ix, iy, SEAL_IMPRINT_KEY).setDepth(20);
      const ib = (stamp.width * base * I.size) / imprint.width;
      imprint.setScale(ib * F.imprintFrom).setAngle(tilt).setAlpha(0);
      this.tweens.add({
        targets: imprint,
        scale: ib,
        alpha: 1,
        duration: F.imprintMs,
        ease: 'Quad.easeIn',
        onComplete: impact,
      });
    };

    this.tweens.add({
      targets: stamp,
      scale: base,
      angle: tilt,
      alpha: 1,
      duration: F.dropMs,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.tweens.add({
          targets: stamp,
          scaleX: base * F.waxSquash,
          scaleY: base / F.waxSquash,
          duration: 35,
          yoyo: true,
          ease: 'Quad.easeOut',
        });
        this.time.delayedCall(F.imprintDelayMs, press);
      },
    });
  }

  private outcomeLine(summary: NightSummary): { text: string; color: string } {
    const total = summary.results.reduce((n, result) => n + result.contract.enemies.length, 0);
    switch (summary.outcome.kind) {
      case 'win': return { text: '✓  Все заказы выполнены', color: C.good };
      case 'retreat': return { text: `↩  Отступили после ${summary.outcome.defeated} из ${total} врагов`, color: INK.accent };
      case 'death': return { text: `✕  Людьмак пал: побеждено ${summary.outcome.defeated} из ${total}`, color: C.bad };
      case 'skip': return { text: '…  День переждали дома', color: INK.dim };
    }
  }

  /** Лист итогов: пергамент по центру, сверху вниз — заголовок, исход, заказы, монеты, ссылка на журнал. */
  private drawSheet(summary: NightSummary): void {
    const R = RESULTS_LAYOUT;
    // Высота листа — по содержимому: заказы, монеты и низ с журналом и печатью; лист с кнопкой — по центру экрана.
    const rows = summary.results.length
      ? summary.results.reduce((h, r) => h + R.rowH + (r.stolen > 0 || r.refund > 0 || r.parryBonus ? R.noteH : 0), 0)
      : 70;
    const sheetH = Phaser.Math.Clamp(R.listY + rows + R.moneyGap + R.moneySize * 1.35 + 30 + R.bottomH, R.minH, R.maxH);
    const left = W / 2 - R.sheetW / 2;
    const top = Math.round((H - sheetH - R.buttonGap - 40) / 2);
    const sheetY = top + sheetH / 2;
    this.sheet = { right: left + R.sheetW, bottom: top + sheetH };
    // Тёмная панель в общем стиле (ui/quick_panel.png), как у быстрого боя и привала.
    addPanel(this, W / 2, sheetY, R.sheetW, sheetH);
    const x0 = left + R.padX;
    const x1 = left + R.sheetW - R.padX;
    const width = x1 - x0;

    addPanelTitle(this, W / 2, top + R.titleY, `Итоги ночи ${summary.night}`, R.titleSize, Math.round(R.titleSize * 0.75));
    const outcome = this.outcomeLine(summary);
    addText(this, W / 2, top + R.outcomeY, outcome.text, R.outcomeSize, outcome.color, TITLE).setOrigin(0.5);

    // Заказы — строками, между ними тонкие линии.
    let y = top + R.listY;
    const line = (yy: number) => this.add.rectangle(x0, yy, width, 1, 0x947951, 0.55).setOrigin(0, 0.5);
    const listTop = y;
    if (!summary.results.length) {
      line(y);
      addText(this, W / 2, y + 22, 'Заказов не было — день переждали дома.', 22, INK.dim).setOrigin(0.5, 0);
      y += 70;
    } else {
      for (const result of summary.results) {
        line(y);
        y += this.drawOrderRow(result, x0, y, width);
      }
    }
    line(y);
    this.foesRect = { x: x0 - 10, y: listTop - 6, w: width + 20, h: y - listTop + 12 };

    // Монеты: было → стало, крупно.
    y += R.moneyGap;
    addText(this, x0, y + 6, 'Монеты', 24, INK.dim, TITLE);
    const delta = summary.coinsAfter - summary.coinsBefore;
    this.drawRichText(
      [{ text: `${summary.coinsBefore}`, gold: true }, { text: '→' }, { text: `${summary.coinsAfter}`, gold: true }],
      INK.text,
      x1 - this.richWidth([`${summary.coinsBefore}`, '→', `${summary.coinsAfter}`], 2, R.moneySize),
      y,
      width,
      R.moneySize,
    );
    if (delta !== 0) {
      addText(this, x1, y + R.moneySize * 1.35, delta > 0 ? `+${delta}` : `${delta}`, 20, delta > 0 ? C.good : C.bad)
        .setOrigin(1, 0);
    }

    // Журнал боя — ссылкой, открывается отдельным окном.
    const log = run.battleLog;
    const link = addText(
      this,
      x0,
      top + sheetH - R.journalFromBottom,
      log.length ? `Журнал боя  ·  ${log.length} записей  ▸` : 'Журнал боя  ·  записей нет',
      21,
      log.length ? INK.accent : INK.dim,
      TITLE,
    ).setOrigin(0, 0.5);
    if (log.length) {
      link.setInteractive({ useHandCursor: true });
      link.on('pointerover', () => link.setColor(C.bad));
      link.on('pointerout', () => link.setColor(INK.accent));
      link.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (p.button !== 0) return;
        sfx(this, 'ui_click');
        this.openJournal();
      });
    }
  }

  /** Ширина строки с монетами (для выравнивания по правому краю). */
  private richWidth(words: string[], golds: number, fontSize: number): number {
    const coinSize = Math.max(13, fontSize * 0.72);
    const wordGap = Math.max(3, fontSize * 0.17);
    let w = 0;
    for (const word of words) {
      const t = addText(this, 0, 0, word, fontSize, INK.text);
      w += t.width + wordGap;
      t.destroy();
    }
    return w + golds * (coinSize + 4);
  }

  /** Строка заказа: имя и «враги a/b» слева, справа статус и сумма; ниже — пометки (кража, возврат аванса…). */
  private drawOrderRow(result: ContractResult, x: number, y: number, w: number): number {
    const done = result.done;
    const color = done ? C.good : C.bad;
    addText(this, x, y + 10, CLIENTS[result.contract.client].name, 26, INK.text, TITLE);
    const count = result.contract.enemies.length;
    addText(this, x, y + 44, `враги ${result.defeated}/${count}`, 18, INK.dim);
    const status = addText(this, x + w, y + 14, done ? '✓ выполнен' : '✕ провален', 19, color, TITLE).setOrigin(1, 0);
    if (done || result.penalty > 0) {
      const amount = done ? (result.advance ? result.contract.reward : result.reward) : result.penalty;
      const label = done ? (result.advance ? 'аванс' : '') : '';
      this.drawMoneyRight(x + w, y + 42, `${label ? label + ' ' : ''}${done ? '+' : '−'}${amount}`, color, 22);
    } else {
      status.setY(y + 26);
    }
    const notes: ResultLinePart[] = [];
    if (result.stolen > 0) notes.push({ text: 'украдено ' }, { text: `${Math.min(result.stolen, result.contract.reward)}`, gold: true });
    if (result.refund > 0) {
      if (notes.length) notes.push({ text: ' · ' });
      notes.push({ text: 'возврат аванса ' }, { text: `${result.refund}`, gold: true });
    }
    if (result.parryBonus) {
      if (notes.length) notes.push({ text: ' · ' });
      notes.push({ text: `бонус за парирование ×${PARRY_REWARD_MULT}` });
    }
    const R = RESULTS_LAYOUT;
    if (!notes.length) return R.rowH;
    return R.rowH + this.drawRichText(notes, INK.dim, x, y + R.rowH - 6, w, 16);
  }

  /** Журнал боя отдельным окном на плашке художницы: прокрутка колесом, «Закрыть». */
  private openJournal(): void {
    const J = RESULTS_LAYOUT.journal;
    const box = this.add.container(0, 0).setDepth(200);
    box.add(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6).setInteractive());
    box.add(addPanel(this, W / 2, H / 2, J.w, J.h));
    const top = H / 2 - J.h / 2;
    box.add(addPanelTitle(this, W / 2, top + 62, 'Журнал боя', 40, 30));
    const content = { x: W / 2 - J.w / 2 + J.pad, y: top + 110, w: J.w - J.pad * 2, h: J.h - 110 - 120 };
    const list = this.add.container(content.x, content.y);
    let ly = 0;
    for (const row of run.battleLog) {
      const t = addText(this, 0, ly, row.text, 20, row.color, { wordWrap: { width: content.w }, stroke: '#000000', strokeThickness: 3 });
      list.add(t);
      ly += t.height + 4;
    }
    list.setMask(this.make.graphics({}, false).fillStyle(0xffffff).fillRect(content.x, content.y, content.w, content.h).createGeometryMask());
    box.add(list);
    const minOffset = Math.min(0, content.h - ly);
    let offset = minOffset;
    list.setY(content.y + offset);
    const onWheel = (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      offset = Phaser.Math.Clamp(offset - dy * 0.5, minOffset, 0);
      list.setY(content.y + offset);
    };
    this.input.on('wheel', onWheel);
    box.add(
      new Button(this, W / 2, top + J.h - 70, 260, 64, 'Закрыть', () => {
        this.input.off('wheel', onWheel);
        box.destroy();
      }, 26),
    );
  }

  private drawMoneyRight(right: number, y: number, value: string, color: string, size: number): void {
    const coinSize = size * 0.92;
    const gap = 7;
    const text = addText(this, right - coinSize - gap, y, value, size, color).setOrigin(1, 0);
    this.add.image(right - coinSize / 2, y + Math.max(0, (text.height - coinSize) / 2), coinIconKey(this))
      .setDisplaySize(coinSize, coinSize);
  }

  /** Рисует слова и значки монет по строке, перенося целые слова при нехватке места. */
  private drawRichText(parts: ResultLinePart[], color: string, x: number, y: number, width: number, fontSize: number): number {
    const lineHeight = Math.ceil(fontSize * 1.28);
    const wordGap = Math.max(3, fontSize * 0.17);
    const coinSize = Math.max(13, fontSize * 0.72);
    let cursorX = x;
    let cursorY = y;
    let rows = 1;

    for (const part of parts) {
      for (const word of part.text.match(/\S+/g) ?? []) {
        const text = addText(this, cursorX, cursorY, word, fontSize, color);
        const iconWidth = part.gold ? coinSize + 4 : 0;
        if (cursorX > x && cursorX + text.width + iconWidth > x + width) {
          cursorX = x;
          cursorY += lineHeight;
          rows++;
          text.setPosition(cursorX, cursorY);
        }
        cursorX += text.width;
        if (part.gold) {
          this.add.image(cursorX + coinSize / 2 + 2, cursorY + lineHeight / 2, coinIconKey(this))
            .setDisplaySize(coinSize, coinSize);
          cursorX += coinSize + 4;
        }
        cursorX += wordGap;
      }
    }
    return rows * lineHeight;
  }
}
