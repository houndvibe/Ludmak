// Итоги ночи: краткая сводка, карточки заказов, поверженные враги и сворачиваемый журнал боя.
import * as Phaser from 'phaser';
import { BG_RESULTS_KEY, RESULTS_LAYOUT, RESULTS_PARCHMENT_KEY } from '../config/assets';
import { PARRY_REWARD_MULT } from '../config/balance';
import { CLIENTS } from '../data/clients';
import { ITEMS } from '../data/items';
import type { SoundKey } from '../config/audio';
import { FEEL } from '../config/feel';
import { tutorialAttach } from '../components/Hints';
import { playMusic, sfx } from '../components/Sound';
import { advanceNight, dayChain, finalAhead, heroLevel, markTutorialDone, nextLevel, run } from '../state';
import type { ContractResult, NightSummary } from '../state';
import { enemyName } from '../data/modifiers';
import { ENEMIES } from '../data/enemies';
import { FINAL_BOSS } from '../config/balance';
import { addBackground, addText, Button, C, coinIconKey, TITLE, fadeIn, goto, livesText, W } from '../ui';

interface ResultLinePart {
  text: string;
  gold?: boolean;
}

export class ResultsScene extends Phaser.Scene {
  /** Область строки жизней для последней подсказки обучения. */
  private livesRect = { x: 0, y: 0, w: 0, h: 0 };
  /** Где на экране список поверженных (для подсказки обучения). */
  private foesRect = { x: 0, y: 0, w: 0, h: 0 };

  constructor() {
    super('Results');
  }

  create(): void {
    fadeIn(this);
    playMusic(this, 'music_night');
    const summary = run.summary!;
    const R = RESULTS_LAYOUT;

    addBackground(this, BG_RESULTS_KEY);
    if (this.textures.exists(RESULTS_PARCHMENT_KEY)) {
      this.add.image(W / 2, R.panelY, RESULTS_PARCHMENT_KEY);
    } else {
      this.add.rectangle(W / 2, R.panelY, R.panelW, R.panelH, 0xc8ad76, 0.96).setStrokeStyle(2, 0x735337);
    }

    addText(this, W / 2, R.titleY, `Итоги ночи ${summary.night}`, 58, C.inkAccent, TITLE).setOrigin(0.5);
    const outcome = this.outcomeLine(summary);
    addText(this, W / 2, R.outcomeY, outcome.text, 30, outcome.color, TITLE).setOrigin(0.5);

    this.drawEconomy(summary);
    this.drawOrders(summary.results);
    const totalEnemies = summary.results.reduce((total, result) => total + result.contract.enemies.length, 0);
    this.drawFight(summary.outcome.defeated, totalEnemies);

    const final = finalAhead();
    const level = nextLevel();
    const levelUp = !summary.gameOver && level !== null && level > heroLevel();

    const sounds: SoundKey[] = [];
    if (summary.reward > 0) sounds.push('coins');
    if (levelUp) sounds.push('level_up');
    sounds.forEach((key, i) => this.time.delayedCall(FEEL.resultsSoundStepMs * (i + 1), () => sfx(this, key)));

    if (run.tutorial) {
      tutorialAttach(this, (id) =>
        id === 'adapt'
          ? this.foesRect
          : id === 'lives'
            ? { x: this.livesRect.x - 12, y: this.livesRect.y - 6, w: this.livesRect.w + 24, h: this.livesRect.h + 12 }
            : null,
      );
      markTutorialDone();
    }

    const label = summary.gameOver
      ? 'Дальше'
      : final
        ? `${ENEMIES[FINAL_BOSS].name} →`
        : 'Следующая ночь →';
    new Button(this, W / 2, 1000, 480, 80, label, () => {
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

  private outcomeLine(summary: NightSummary): { text: string; color: string } {
    const total = summary.results.reduce((n, result) => n + result.contract.enemies.length, 0);
    switch (summary.outcome.kind) {
      case 'win': return { text: '✓  Все заказы выполнены', color: C.inkGood };
      case 'retreat': return { text: `↩  Отступили после ${summary.outcome.defeated} из ${total} врагов`, color: C.inkAccent };
      case 'death': return { text: `✕  Людьмак пал: побеждено ${summary.outcome.defeated} из ${total}`, color: C.inkBad };
      case 'skip': return { text: '…  День переждали дома', color: C.inkDim };
    }
  }

  private drawEconomy(summary: NightSummary): void {
    const R = RESULTS_LAYOUT;
    const gap = 14;
    const tileW = (R.leftW - gap) / 2;
    const goldX = R.leftX;
    const lifeX = R.leftX + tileW + gap;
    this.addMetricTile(goldX, R.metricY, tileW, R.metricH);
    this.addMetricTile(lifeX, R.metricY, tileW, R.metricH);

    addText(this, goldX + 16, R.metricY + 10, 'ЗОЛОТО', 18, C.inkDim, TITLE);
    const delta = summary.coinsAfter - summary.coinsBefore;
    const deltaText = delta > 0 ? `+${delta}` : `${delta}`;
    this.drawRichText([{ text: deltaText, gold: true }], delta >= 0 ? C.inkGood : C.inkBad, goldX + 16, R.metricY + 31, tileW - 32, 36);
    this.drawRichText([
      { text: 'Баланс ' },
      { text: `${summary.coinsBefore}`, gold: true },
      { text: ' → ' },
      { text: `${summary.coinsAfter}`, gold: true },
    ], C.ink, goldX + 16, R.metricY + 82, tileW - 32, 18);

    addText(this, lifeX + 16, R.metricY + 10, 'ЖИЗНИ', 18, C.inkDim, TITLE);
    addText(this, lifeX + 16, R.metricY + 32, livesText(summary.livesAfter), 30, C.ink, TITLE);
    const lifeLost = summary.livesAfter < summary.livesBefore;
    addText(this, lifeX + 150, R.metricY + 42, lifeLost ? 'Потеряна жизнь' : 'Без потерь', 18, lifeLost ? C.inkBad : C.inkGood);
    if (summary.lostItem) {
      addText(this, lifeX + 16, R.metricY + 82, `Предмет потерян: ${ITEMS[summary.lostItem].name}`, 17, C.inkBad);
    } else if (summary.gameOver === 'lose') {
      addText(this, lifeX + 16, R.metricY + 82, 'Жизней больше не осталось', 17, C.inkBad);
    }
    this.livesRect = { x: lifeX, y: R.metricY, w: tileW, h: R.metricH };
  }

  private addMetricTile(x: number, y: number, w: number, h: number): void {
    this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x745a38, 0.12).setStrokeStyle(1, 0x947951, 0.42);
  }

  private drawOrders(results: ContractResult[]): void {
    const R = RESULTS_LAYOUT;
    addText(this, R.leftX, R.orderTitleY, `Заказы  ·  ${results.length}`, 28, C.inkAccent, TITLE);
    if (!results.length) {
      addText(this, R.leftX + 4, R.orderY + 18, 'Заказов не было — день переждали дома.', 22, C.inkDim);
      return;
    }
    results.forEach((result, i) => this.drawOrderCard(
      result,
      R.leftX,
      R.orderY + i * (R.orderH + R.orderGap),
      R.leftW,
      R.orderH,
    ));
  }

  private drawOrderCard(result: ContractResult, x: number, y: number, w: number, h: number): void {
    const done = result.done;
    const statusColor = done ? C.inkGood : C.inkBad;
    this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x765d3d, 0.09)
      .setStrokeStyle(1, done ? 0x6f8850 : 0x9b5f4a, 0.46);

    const client = CLIENTS[result.contract.client].name;
    addText(this, x + 16, y + 10, client, 24, C.ink, TITLE);
    const status = done ? '✓  ВЫПОЛНЕН' : '!  НЕ ВЫПОЛНЕН';
    addText(this, x + w - 16, y + 13, status, 17, statusColor, TITLE).setOrigin(1, 0);

    const count = result.contract.enemies.length;
    addText(this, x + 16, y + 45, `Враги: ${result.defeated}/${count}`, 19, C.inkDim);
    const moneyLabel = done ? (result.advance ? 'Аванс' : 'Награда') : 'Неустойка';
    const amount = done
      ? (result.advance ? result.contract.reward : result.reward)
      : result.penalty;
    addText(this, x + w - 112, y + 45, moneyLabel, 18, C.inkDim).setOrigin(1, 0);
    this.drawMoneyRight(x + w - 16, y + 42, `${done ? '+' : '−'}${amount}`, statusColor, 21);

    const notes: ResultLinePart[] = [];
    if (result.stolen > 0) {
      notes.push({ text: 'Украдено ' }, { text: `${Math.min(result.stolen, result.contract.reward)}`, gold: true });
    }
    if (result.refund > 0) {
      if (notes.length) notes.push({ text: '   ·   ' });
      notes.push({ text: 'Возврат аванса ' }, { text: `${result.refund}`, gold: true });
    }
    if (result.parryBonus) {
      if (notes.length) notes.push({ text: '   ·   ' });
      notes.push({ text: `Бонус за парирование ×${PARRY_REWARD_MULT}` });
    }
    if (notes.length) this.drawRichText(notes, C.inkDim, x + 16, y + 77, w - 32, 17);
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

  /** Поверженные враги остаются видимыми; журнал открывается в прокручиваемой области под переключателем. */
  private drawFight(defeated: number, total: number): void {
    const R = RESULTS_LAYOUT;
    const x = R.rightX;
    const foes = dayChain().slice(0, defeated);
    const top = R.outcomeY + 42;
    addText(this, x, top, `Повержены  ${foes.length} / ${total}`, 30, C.inkAccent, TITLE);
    const names = foes.length ? foes.map((f) => enemyName(f.enemy, f.mod)).join(', ') : 'Никого';
    const namesText = addText(this, x, top + 40, names, 21, foes.length ? C.ink : C.inkDim, { wordWrap: { width: R.rightW } });
    this.foesRect = { x: x - 10, y: top - 6, w: R.rightW + 20, h: 48 + namesText.height };

    const log = run.battleLog;
    const toggleY = R.journalToggleY;
    const toggleH = 42;
    const toggleBg = this.add.rectangle(x + R.rightW / 2, toggleY + toggleH / 2, R.rightW, toggleH, 0x765d3d, 0.11)
      .setStrokeStyle(1, 0x947951, 0.48);
    const toggleLabel = addText(
      this,
      x + 16,
      toggleY + 9,
      log.length ? `Журнал боя  ·  ${log.length} записей  ▸` : 'Журнал боя  ·  записей нет',
      21,
      C.inkAccent,
      TITLE,
    );
    const hit = this.add.rectangle(x + R.rightW / 2, toggleY + toggleH / 2, R.rightW, toggleH, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: log.length > 0 });
    let expanded = false;
    if (log.length) {
      hit.on('pointerover', () => toggleBg.setFillStyle(0x765d3d, 0.2));
      hit.on('pointerout', () => toggleBg.setFillStyle(0x765d3d, 0.11));
      hit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (pointer.button !== 0) return;
        expanded = !expanded;
        toggleLabel.setText(`Журнал боя  ·  ${log.length} записей  ${expanded ? '▾' : '▸'}`);
        journalBg.setVisible(expanded);
        journal.setVisible(expanded);
      });
    } else {
      toggleLabel.setColor(C.inkDim);
    }

    const box = { x, y: R.logY, w: R.rightW, h: R.logBottom - R.logY };
    const journalBg = this.add.rectangle(box.x, box.y, box.w, box.h, 0x19141a, 0.86)
      .setOrigin(0)
      .setStrokeStyle(1, C.border);
    journalBg.setVisible(false);
    const content = {
      x: box.x + R.logPadX,
      y: box.y + R.logPadY,
      w: box.w - R.logPadX * 2,
      h: box.h - R.logPadY * 2,
    };
    const journal = this.add.container(content.x, content.y).setVisible(false);
    let logY = 0;
    for (const row of log) {
      const text = addText(this, 0, logY, row.text, R.logSize, row.color, { wordWrap: { width: content.w } });
      journal.add(text);
      logY += text.height + 4;
    }
    const maskGraphics = this.make.graphics({}, false).fillStyle(0xffffff).fillRect(content.x, content.y, content.w, content.h);
    journal.setMask(maskGraphics.createGeometryMask());
    const minOffset = Math.min(0, content.h - logY);
    let offset = minOffset;
    journal.setY(content.y + offset);
    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
      if (!expanded || pointer.x < content.x || pointer.x > content.x + content.w || pointer.y < content.y || pointer.y > content.y + content.h) return;
      offset = Phaser.Math.Clamp(offset - dy * 0.5, minOffset, 0);
      journal.setY(content.y + offset);
    });
  }
}
