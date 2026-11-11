// Главное меню: логотип на фоне, под ним «НАЧАТЬ ОХОТУ» и «ВЫХОД», справа внизу — громкость.
import * as Phaser from 'phaser';
import { BG_MENU_KEY, MENU_LAYOUT } from '../config/assets';
import { playMusic, sfx } from '../components/Sound';
import { TUTORIAL_ALWAYS } from '../data/tutorial';
import { isTutorialDone, newRun } from '../state';
import { addBackground, addText, addVolumeSlider, Button, C, fadeIn, goto } from '../ui';

/** Дебаг-режим запоминается в браузере; хранилище может быть недоступно — тогда галочка не запомнится. */
const DEBUG_KEY = 'ludmak.debug';

function loadDebug(): boolean {
  try {
    return window.localStorage.getItem(DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

function saveDebug(v: boolean): void {
  try {
    window.localStorage.setItem(DEBUG_KEY, v ? '1' : '0');
  } catch {
    // нет хранилища — запомнится до перезагрузки
  }
}

export class MenuScene extends Phaser.Scene {
  private debug = false;

  constructor() {
    super('Menu');
  }

  create(): void {
    fadeIn(this);
    playMusic(this, 'music_night');
    addBackground(this, BG_MENU_KEY);

    // Пока обучение не пройдено (или на время разработки, TUTORIAL_ALWAYS), «Начать охоту» начинается с обучающей ночи;
    // её можно пропустить.
    const tutorial = TUTORIAL_ALWAYS || !isTutorialDone();
    const L = MENU_LAYOUT;
    // Дебаг (галочка): обучение пропускается, 999 монет, в магазине все предметы.
    this.debug = loadDebug();
    const start = (withTutorial: boolean) => {
      newRun(withTutorial, this.debug);
      goto(this, 'Home');
    };
    new Button(this, L.start.x, L.start.y, L.start.w, L.start.h, 'НАЧАТЬ ОХОТУ', () => start(tutorial), 38);
    const note = addText(this, L.exit.x, L.exit.y + L.exit.h / 2 + 30, '', 22, C.dim).setOrigin(0.5);
    new Button(this, L.exit.x, L.exit.y, L.exit.w, L.exit.h, 'ВЫХОД', () => this.exit(note), 38);
    if (tutorial) {
      const s = L.skipTutorial;
      new Button(this, s.x, s.y, s.w, s.h, 'Пропустить обучение', () => start(false), 22);
    }
    addVolumeSlider(this, L.volume);
    this.addDebugCheckbox();
  }

  /** Галочка «Debug»: нажимается и квадратик, и подпись. */
  private addDebugCheckbox(): void {
    const r = MENU_LAYOUT.debug;
    this.add.rectangle(r.x, r.y, r.size, r.size, 0x000000, 0.6).setStrokeStyle(2, C.border);
    const mark = addText(this, r.x, r.y, '✔', Math.round(r.size * 0.8), C.accent, { fontStyle: 'bold' }).setOrigin(0.5);
    const label = addText(this, r.x + r.size / 2 + 12, r.y, 'Debug-режим', 22, C.text).setOrigin(0, 0.5);
    mark.setVisible(this.debug);
    const hit = this.add
      .rectangle(r.x - r.size / 2 - 6, r.y, r.size + 12 + 12 + label.width + 6, r.size + 12, 0xffffff, 0.001)
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => label.setColor(C.accent));
    hit.on('pointerout', () => label.setColor(C.text));
    hit.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.button !== 0) return;
      this.debug = !this.debug;
      saveDebug(this.debug);
      sfx(this, 'ui_click');
      mark.setVisible(this.debug);
    });
  }

  /** Браузер обычно не даёт странице закрыться самой (кроме вкладок, открытых скриптом): тогда просим закрыть вручную. */
  private exit(note: Phaser.GameObjects.Text): void {
    try {
      window.close();
    } catch {
      // закрыть не получилось — подсказка ниже
    }
    this.time.delayedCall(300, () => note.setText('Закрой вкладку браузера'));
  }
}
