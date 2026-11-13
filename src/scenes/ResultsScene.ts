// Итоги ночи: награды и неустойки по каждому заказу, возврат авансов, смерть — минус жизнь и потеря предмета.
import * as Phaser from 'phaser';
import { BG_RESULTS_KEY } from '../config/assets';
import { PARRY_REWARD_MULT, START_LIVES } from '../config/balance';
import { CLIENTS } from '../data/clients';
import { ITEMS } from '../data/items';
import type { SoundKey } from '../config/audio';
import { FEEL } from '../config/feel';
import { tutorialAttach } from '../components/Hints';
import { playMusic, sfx } from '../components/Sound';
import { advanceNight, dayChain, finalAhead, heroLevel, markTutorialDone, nextLevel, run } from '../state';
import { enemyName } from '../data/modifiers';
import { RESULTS_LAYOUT } from '../config/assets';
import { ENEMIES } from '../data/enemies';
import { FINAL_BOSS } from '../config/balance';
import { addBackground, addText, Button, C, TITLE, fadeIn, goto, livesText, W } from '../ui';

export class ResultsScene extends Phaser.Scene {
  constructor() {
    super('Results');
  }

  create(): void {
    fadeIn(this);
    playMusic(this, 'music_night');
    const s = run.summary!;
    addBackground(this, BG_RESULTS_KEY);
    const R = RESULTS_LAYOUT;
    this.add.rectangle(W / 2, 520, R.panelW, 820, 0x000000, 0.7).setStrokeStyle(2, C.border);
    addText(this, W / 2, 160, `Итоги ночи ${s.night}`, 60, C.accent, TITLE).setOrigin(0.5);

    const total = s.results.reduce((n, r) => n + r.contract.enemies.length, 0);
    const outcome = {
      win: 'Все заказы выполнены',
      retreat: `Людьмак отступил: побеждено ${s.outcome.defeated} из ${total}`,
      death: `Людьмак пал в бою: побеждено ${s.outcome.defeated} из ${total}`,
      skip: 'Людьмак переждал день дома',
    }[s.outcome.kind];

    const lines: [string, string][] = [[outcome, s.outcome.kind === 'win' || s.outcome.kind === 'skip' ? C.good : C.bad]];
    for (const r of s.results) {
      const name = CLIENTS[r.contract.client].name;
      const n = r.contract.enemies.length;
      if (r.done) {
        const stolen = r.stolen > 0 ? ` (украдено ${Math.min(r.stolen, r.contract.reward)})` : '';
        const what = r.advance ? `аванс ${r.contract.reward} остаётся у тебя` : `награда +${r.reward}${r.parryBonus ? ` (×${PARRY_REWARD_MULT} за отбитые атаки)` : ''}`;
        lines.push([`${name}: выполнен — ${what}${stolen}`, C.good]);
      } else {
        const refund = r.refund > 0 ? `, вернуть аванс −${r.refund}` : '';
        lines.push([`${name}: ${r.defeated} из ${n} — неустойка −${r.penalty}${refund}`, C.bad]);
      }
    }
    if (s.lostItem) lines.push([`Потерян предмет: ${ITEMS[s.lostItem].name}`, C.bad]);
    lines.push([`Монеты: ${s.coinsBefore} → ${s.coinsAfter}`, C.text]);
    const lifeLost = s.livesAfter < s.livesBefore;
    const livesLine = lines.length;
    lines.push([
      lifeLost ? `Потеряна жизнь: ${livesText(s.livesAfter)}  (${s.livesAfter} из ${START_LIVES})` : `Жизни: ${livesText(s.livesAfter)}`,
      lifeLost ? C.bad : C.text,
    ]);
    if (s.gameOver === 'lose') lines.push(['Жизни кончились — охота окончена', C.bad]);
    const final = finalAhead();
    if (final) {
      const hp = run.finalHp === null ? 'с полным здоровьем' : `со здоровьем ${run.finalHp}`;
      lines.push([`${ENEMIES[FINAL_BOSS].name} прибыл. Бой начнётся ${hp}.`, C.accent]);
    }
    const level = nextLevel();
    const levelUp = !s.gameOver && level !== null && level > heroLevel();
    if (levelUp) lines.push([`Новый уровень: теперь до ${level} заказов за ночь`, C.accent]);

    lines.forEach(([t, color], i) => addText(this, R.leftX, 240 + i * 58, t, 32, color, { wordWrap: { width: R.leftW } }));
    this.drawFight(s.outcome.defeated);

    // Звуки по очереди: монеты (если что-то заработал), новый уровень.
    const queue: SoundKey[] = [];
    if (s.reward > 0) queue.push('coins');
    if (levelUp) queue.push('level_up');
    queue.forEach((key, i) => this.time.delayedCall(FEEL.resultsSoundStepMs * (i + 1), () => sfx(this, key)));

    // Обучение заканчивается на итогах первой ночи: последняя подсказка — про жизни, флаг «пройдено».
    if (run.tutorial) {
      // Сначала — про врагов дальше (строка итога боя), потом — про жизни.
      tutorialAttach(this, (id) =>
        id === 'adapt'
          ? this.foesRect
          : id === 'lives'
            ? { x: R.leftX - 20, y: 240 + livesLine * 58 - 8, w: R.leftW + 40, h: 52 }
            : null,
      );
      markTutorialDone();
    }

    const label = s.gameOver ? 'Дальше' : final ? `${ENEMIES[FINAL_BOSS].name} →` : 'Следующая ночь →';
    new Button(this, W / 2, 1000, 480, 80, label, () => {
      if (s.gameOver) {
        goto(this, 'GameOver');
      } else if (final) {
        goto(this, 'Battle', { final: true });
      } else {
        advanceNight();
        goto(this, 'Home');
      }
    }, 32);
  }

  /** Где на экране список поверженных (для подсказки обучения). */
  private foesRect = { x: 0, y: 0, w: 0, h: 0 };

  /**
   * Правая колонка итогов: поверженные враги дня и журнал боя (прокрутка колесом мыши; сначала — конец боя).
   */
  private drawFight(defeated: number): void {
    const R = RESULTS_LAYOUT;
    const x = R.rightX;
    let y = 225;
    const foes = dayChain().slice(0, defeated);
    const top = y;
    addText(this, x, y, `Повержены (${foes.length})`, 30, C.accent, TITLE);
    y += 44;
    const names = foes.length ? foes.map((f) => enemyName(f.enemy, f.mod)).join(', ') : 'никого';
    const list = addText(this, x, y, names, 22, foes.length ? C.text : C.dim, { wordWrap: { width: R.rightW } });
    y += list.height + 22;
    // Обучение: подсказка про врагов указывает сюда.
    this.foesRect = { x: x - 12, y: top - 8, w: R.rightW + 24, h: y - top - 6 };

    addText(this, x, y, 'Журнал боя', 30, C.accent, TITLE);
    y += 44;
    const box = { x, y, w: R.rightW, h: R.logBottom - y };
    this.add.rectangle(box.x - 8, box.y - 6, box.w + 16, box.h + 12, 0x000000, 0.45).setOrigin(0).setStrokeStyle(1, C.border);
    const log = run.battleLog;
    if (!log.length) {
      addText(this, x, y, 'Боя не было', 20, C.dim);
      return;
    }
    // Все строки — в контейнер, видна только часть под маской; колесо мыши прокручивает.
    const cont = this.add.container(box.x, box.y);
    let ly = 0;
    for (const l of log) {
      const t = addText(this, 0, ly, l.text, R.logSize, l.color, { wordWrap: { width: box.w } });
      cont.add(t);
      ly += t.height + 2;
    }
    const maskG = this.make.graphics({}, false).fillStyle(0xffffff).fillRect(box.x, box.y, box.w, box.h);
    cont.setMask(maskG.createGeometryMask());
    const min = Math.min(0, box.h - ly);
    let off = min; // сначала — конец боя
    cont.setY(box.y + off);
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (p.x < box.x - 8 || p.x > box.x + box.w + 8 || p.y < box.y - 6 || p.y > box.y + box.h + 6) return;
      off = Phaser.Math.Clamp(off - dy * 0.5, min, 0);
      cont.setY(box.y + off);
    });
  }
}
