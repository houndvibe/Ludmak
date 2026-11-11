// Итоги ночи: награды и неустойки по каждому заказу, потеря предмета, платёж по долгу.
import * as Phaser from 'phaser';
import { BG_NIGHT_KEY } from '../config/assets';
import { CLIENTS } from '../data/clients';
import { ITEMS } from '../data/items';
import type { SoundKey } from '../config/audio';
import { FEEL } from '../config/feel';
import { tutorialAttach } from '../components/Hints';
import { playMusic, sfx } from '../components/Sound';
import { advanceNight, heroLevel, markTutorialDone, nextLevel, run } from '../state';
import { addBackground, addText, Button, C, fadeIn, goto, W } from '../ui';

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
    addText(this, W / 2, 160, `Итоги ночи ${s.night}`, 56, C.accent, { fontStyle: 'bold' }).setOrigin(0.5);

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
        const what = CLIENTS[r.contract.client].condition.payDebt ? `в счёт долга ${r.reward}` : `награда +${r.reward}`;
        lines.push([`${name}: выполнен — ${what}${stolen}`, C.good]);
      } else {
        lines.push([`${name}: ${r.defeated} из ${n} — неустойка −${r.penalty}`, C.bad]);
      }
    }
    if (s.lostItem) lines.push([`Потерян предмет: ${ITEMS[s.lostItem].name}`, C.bad]);
    if (s.creditToCoins > 0) lines.push([`Кикимора: сверх платежа ${s.creditToCoins} — в монеты`, C.good]);
    lines.push([`Монеты: ${s.coinsBefore} → ${s.coinsAfterContracts}`, C.text]);
    if (s.debtCredit > 0) {
      const off = Math.min(s.debtCredit, s.paymentBase);
      lines.push([`Платёж по долгу: ${s.paymentBase} − ${off} (кикимора) = −${s.payment}`, C.accent]);
    } else {
      lines.push([`Платёж по долгу: −${s.payment}`, C.accent]);
    }
    if (s.paid) lines.push([`Осталось монет: ${s.coinsAfter}`, C.text]);
    else lines.push([`Монеты: 0, долг не оплачен (не хватило ${s.payment - s.coinsAfterContracts})`, C.bad]);
    const level = nextLevel();
    const levelUp = !s.gameOver && level !== null && level > heroLevel();
    if (levelUp) lines.push([`Новый уровень: теперь до ${level} заказов за ночь`, C.accent]);

    lines.forEach(([t, color], i) => addText(this, W / 2 - 540, 240 + i * 58, t, 32, color));

    // Звуки по очереди: монеты (если что-то заработал), платёж по долгу, новый уровень.
    const queue: SoundKey[] = [];
    if (s.reward > 0 || s.creditToCoins > 0) queue.push('coins');
    if (s.paid) queue.push('debt_paid');
    if (levelUp) queue.push('level_up');
    queue.forEach((key, i) => this.time.delayedCall(FEEL.resultsSoundStepMs * (i + 1), () => sfx(this, key)));

    // Обучение заканчивается на итогах первой ночи: последняя подсказка, флаг «пройдено».
    if (run.tutorial) {
      // Пояснение про долг — у строки с платежом.
      const i = lines.findIndex(([t]) => t.startsWith('Платёж по долгу'));
      tutorialAttach(this, (id) => (id === 'debt' && i >= 0 ? { x: W / 2 - 560, y: 240 + i * 58 - 8, w: 1120, h: 52 } : null));
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
