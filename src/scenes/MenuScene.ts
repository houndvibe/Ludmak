import * as Phaser from 'phaser';
import { BG_NIGHT_KEY, HERO_KEY, MENU_LAYOUT } from '../config/assets';
import { DEBT_PAYMENTS, NIGHTS } from '../config/balance';
import { playMusic } from '../components/Sound';
import { TUTORIAL_ALWAYS } from '../data/tutorial';
import { isTutorialDone, newRun } from '../state';
import { addBackground, addMuteButton, addText, addVolumeSlider, Button, C, fadeIn, fit, goto, W } from '../ui';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    fadeIn(this);
    playMusic(this, 'music_night');
    addBackground(this, BG_NIGHT_KEY);
    fit(this.add.image(1400, 540, HERO_KEY), 640, 800);
    addText(this, 160, 260, 'Людьмак', 120, C.accent, { fontStyle: 'bold' });
    addText(
      this,
      160,
      420,
      `Монстр-ведьмак берёт заказы от нечисти на людей.\n` +
        `Продержись ${NIGHTS} ночей и выплати долг: ${DEBT_PAYMENTS.join(', ')} монет.`,
      32,
      C.text,
      { lineSpacing: 12, wordWrap: { width: 900 } },
    );

    // Пока обучение не пройдено (или на время разработки, TUTORIAL_ALWAYS), «Новый забег» начинается с обучающей ночи;
    // её можно пропустить.
    const tutorial = TUTORIAL_ALWAYS || !isTutorialDone();
    const L = MENU_LAYOUT;
    const start = (withTutorial: boolean) => {
      newRun(withTutorial);
      goto(this, 'Home');
    };
    new Button(this, L.newRun.x, L.newRun.y, L.newRun.w, L.newRun.h, 'Новый забег', () => start(tutorial), 36);
    if (tutorial) {
      const s = L.skipTutorial;
      new Button(this, s.x, s.y, s.w, s.h, 'Пропустить обучение', () => start(false), 28);
    }
    addMuteButton(this, L.mute, 24);
    addVolumeSlider(this, L.volume);
    addText(this, W - 20, 1060, 'черновик на заглушках', 20, C.dim).setOrigin(1, 1);
  }
}
