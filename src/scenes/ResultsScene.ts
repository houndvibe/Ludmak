// Итоги ночи: награды и неустойки по каждому заказу, возврат авансов, смерть — минус жизнь и потеря предмета.
import * as Phaser from 'phaser';
import { BG_NIGHT_KEY } from '../config/assets';
import { START_LIVES } from '../config/balance';
import { CLIENTS } from '../data/clients';
import { ITEMS } from '../data/items';
import type { SoundKey } from '../config/audio';
import { FEEL } from '../config/feel';
import { tutorialAttach } from '../components/Hints';
import { playMusic, sfx } from '../components/Sound';
import { advanceNight, heroLevel, markTutorialDone, nextLevel, run } from '../state';
import { addBackground, addText, Button, C, TITLE, fadeIn, goto, livesText, W } from '../ui';

export class ResultsScene extends Phaser.Scene {
  constructor() {
    super('Results');
  }

  create(): void {
    fadeIn(this);
    playMusic(this, 'music_night');
    const s = run.summary!;
    addBackground(this, BG_NIGHT_KEY);
    this.add.rectangle(W / 2, 520, 1200, 820, 0x000000, 0.7).setStrokeStyle(2, C.border);
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
        const what = r.advance ? `аванс ${r.contract.reward} остаётся у тебя` : `награда +${r.reward}`;
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
    const level = nextLevel();
    const levelUp = !s.gameOver && level !== null && level > heroLevel();
    if (levelUp) lines.push([`Новый уровень: теперь до ${level} заказов за ночь`, C.accent]);

    lines.forEach(([t, color], i) => addText(this, W / 2 - 540, 240 + i * 58, t, 32, color));

    // Звуки по очереди: монеты (если что-то заработал), новый уровень.
    const queue: SoundKey[] = [];
    if (s.reward > 0) queue.push('coins');
    if (levelUp) queue.push('level_up');
    queue.forEach((key, i) => this.time.delayedCall(FEEL.resultsSoundStepMs * (i + 1), () => sfx(this, key)));

    // Обучение заканчивается на итогах первой ночи: последняя подсказка — про жизни, флаг «пройдено».
    if (run.tutorial) {
      tutorialAttach(this, (id) => (id === 'lives' ? { x: W / 2 - 560, y: 240 + livesLine * 58 - 8, w: 1120, h: 52 } : null));
      markTutorialDone();
    }

    const label = s.gameOver ? 'Дальше' : 'Следующая ночь →';
    new Button(this, W / 2, 1000, 480, 80, label, () => {
      if (s.gameOver) {
        goto(this, 'GameOver');
      } else {
        advanceNight();
        goto(this, 'Home');
      }
    }, 32);
  }
}
