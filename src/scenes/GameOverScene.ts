// Конец забега: победа (пережил все ночи) или поражение (не хватило на платёж).
import * as Phaser from 'phaser';
import { BG_NIGHT_KEY, HERO_KEY } from '../config/assets';
import { NIGHTS } from '../config/balance';
import { run } from '../state';
import { playMusic, sfx } from '../components/Sound';
import { addBackground, addText, Button, C, fadeIn, fit, goto } from '../ui';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  create(): void {
    fadeIn(this);
    playMusic(this, 'music_night');
    const s = run.summary!;
    const win = s.gameOver === 'win';
    sfx(this, win ? 'victory' : 'game_over');
    addBackground(this, BG_NIGHT_KEY);
    const hero = fit(this.add.image(1400, 540, HERO_KEY), 600, 750);
    if (!win) hero.setTint(0x777777);

    addText(this, 160, 280, win ? 'Победа' : 'Конец игры', 110, win ? C.good : C.bad, { fontStyle: 'bold' });
    const text = win
      ? `Людьмак пережил ${NIGHTS} ночей и выплатил долг.\nОсталось монет: ${s.coinsAfter}.`
      : `Ночь ${s.night}: на платёж нужно ${s.payment}, а в кошельке было ${s.coinsAfterContracts}.\nКикимора забирает своё.`;
    addText(this, 160, 440, text, 34, C.text, { lineSpacing: 12, wordWrap: { width: 900 } });
    new Button(this, 360, 680, 400, 90, 'В меню', () => goto(this, 'Menu'), 36);
  }
}
