// Конец забега: победа (пережил все ночи) или поражение (кончились жизни).
import * as Phaser from 'phaser';
import { BG_NIGHT_KEY, HERO_KEY } from '../config/assets';
import { FINAL_BOSS, NIGHTS } from '../config/balance';
import { ENEMIES } from '../data/enemies';
import { run } from '../state';
import { playMusic, sfx } from '../components/Sound';
import { addBackground, addText, Button, C, TITLE, fadeIn, fit, goto } from '../ui';

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

    addText(this, 160, 280, win ? 'Победа' : 'Конец игры', 110, win ? C.good : C.bad, TITLE);
    const boss = ENEMIES[FINAL_BOSS].name.toLowerCase();
    const text = win
      ? `Людьмак пережил ${NIGHTS} ночей и одолел: ${boss}.\nОсталось монет: ${s.coinsAfter}, жизней: ${s.livesAfter}.`
      : s.final
        ? `Ночь ${s.night}: ${boss} оказался сильнее.\nЖизни кончились — охота окончена.`
        : `Ночь ${s.night}: Людьмак пал в бою во второй раз.\nЖизни кончились — охота окончена.`;
    addText(this, 160, 440, text, 34, C.text, { lineSpacing: 12, wordWrap: { width: 900 } });
    new Button(this, 360, 680, 400, 90, 'В меню', () => goto(this, 'Menu'), 36);
  }
}
