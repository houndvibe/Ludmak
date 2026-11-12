// Главное меню по макету художницы: лес, по центру логотип, под ним «НАЧАТЬ ОХОТУ» и «ПРОПУСТИТЬ ОБУЧЕНИЕ»,
// справа внизу — громкость. Раскладка — MENU_LAYOUT, картинки — MENU_ART.
import * as Phaser from 'phaser';
import { BG_MENU_KEY, MENU_ART, menuArtKey, menuEyesKey, menuShardKey, MENU_LAYOUT } from '../config/assets';
import { FEEL } from '../config/feel';
import { playMusic, sfx } from '../components/Sound';
import { TUTORIAL_ALWAYS } from '../data/tutorial';
import { isTutorialDone, newRun } from '../state';
import { addBackground, addText, addVolumeSlider, Button, C, fadeIn, goto, H, TITLE, W } from '../ui';

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
    this.addAmbience();

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
    // Логотип; без картинки — название текстом. От печати на нём — свечение и угольки.
    if (this.textures.exists(menuArtKey('logo'))) {
      const logo = this.add.image(L.logo.x, L.logo.y, menuArtKey('logo'));
      logo.setScale(L.logo.w / logo.width);
      const sx = L.logo.x + (MENU_ART.seal.x - 0.5) * logo.displayWidth;
      const sy = L.logo.y + (MENU_ART.seal.y - 0.5) * logo.displayHeight;
      this.addSealLife(sx, sy, logo);
    } else {
      addText(this, L.logo.x, L.logo.y, 'ЛЮДЬМАК', 120, MENU_ART.textColor, TITLE).setOrigin(0.5);
    }
    this.menuButton(L.start, 'НАЧАТЬ ОХОТУ', MENU_ART.startFont, () => start(tutorial));
    if (tutorial) this.menuButton(L.skipTutorial, 'ПРОПУСТИТЬ ОБУЧЕНИЕ', 26, () => start(false));
    addVolumeSlider(this, L.volume);
    this.addDebugCheckbox();
  }

  /**
   * Кнопка меню — рамка художницы (MENU_ART.button), растянутая до w×h с неподвижными углами; при наведении — чуть
   * больше и светлее. Без картинки — обычная кнопка.
   */
  private menuButton(r: { x: number; y: number; w: number; h: number }, text: string, size: number, onClick: () => void): void {
    if (!this.textures.exists(menuArtKey('button'))) {
      new Button(this, r.x, r.y, r.w, r.h, text, onClick, size);
      return;
    }
    const src = this.textures.get(menuArtKey('button')).getSourceImage();
    const k = r.h / src.height;
    const s = MENU_ART.button.slice;
    const cont = this.add.container(r.x, r.y);
    const plate = this.add.nineslice(0, 0, menuArtKey('button'), undefined, r.w / k, src.height, s, s, s, s).setScale(k);
    const label = addText(this, 0, 0, text, size, MENU_ART.textColor, TITLE).setOrigin(0.5);
    const hit = this.add.rectangle(0, 0, r.w, r.h, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    cont.add([plate, label, hit]);
    hit.on('pointerover', () => {
      sfx(this, 'ui_hover');
      label.setColor('#ff6a7e');
      this.tweens.add({ targets: cont, scale: 1.04, duration: 100 });
    });
    hit.on('pointerout', () => {
      label.setColor(MENU_ART.textColor);
      this.tweens.add({ targets: cont, scale: 1, duration: 100 });
    });
    hit.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.button !== 0) return;
      sfx(this, 'ui_click');
      onClick();
    });
  }

  /** Мягкое пятно света (радиальный градиент) — общая текстура для свечения, лучей, угольков и тумана. */
  private glowTexture(): string {
    const key = 'menu_soft_glow';
    if (this.textures.exists(key)) return key;
    const size = 128;
    const tex = this.textures.createCanvas(key, size, size)!;
    const ctx = tex.getContext();
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
    return key;
  }

  /** Атмосфера леса: лучи света сверху, свет над тропой, моргающие глаза среди деревьев. */
  private addAmbience(): void {
    const F = FEEL.menuLife;
    const soft = this.glowTexture();
    const bg = this.textures.get(BG_MENU_KEY).getSourceImage();
    const k = Math.max(W / bg.width, H / bg.height);
    const ox = (W - bg.width * k) / 2;
    const oy = (H - bg.height * k) / 2;

    // Лучи: вытянутые пятна света сверху, медленно покачиваются.
    const R = F.rays;
    for (let i = 0; i < R.count; i++) {
      const x = W * (0.3 + (0.4 * i) / Math.max(1, R.count - 1));
      const ray = this.add
        .image(x, -40, soft)
        .setOrigin(0.5, 0)
        .setDisplaySize(R.width, R.length)
        .setTint(R.color)
        .setAlpha(R.alpha)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAngle((i - (R.count - 1) / 2) * 6);
      this.tweens.add({
        targets: ray,
        angle: ray.angle + R.swayDeg,
        alpha: R.alpha * 0.5,
        duration: R.periodMs / 2 + i * 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // Свет над тропой: широкое мягкое пятно у земли, дышит.
    const M = F.mist;
    const mist = this.add.image(W / 2, H * M.y, soft).setDisplaySize(M.w, M.h).setTint(M.color).setAlpha(M.alpha[0]).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: mist, alpha: M.alpha[1], duration: M.periodMs / 2, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // Глаза в лесу: картинки из варианта фона; моргают (сжимаются по вертикали) и иногда пропадают на время.
    const E = F.eyes;
    MENU_ART.eyes.forEach((e, n) => {
      if (!this.textures.exists(menuEyesKey(n))) return;
      const eye = this.add
        .image(ox + e.x * k, oy + e.y * k, menuEyesKey(n))
        .setScale(k)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(E.alpha[1]);
      this.tweens.add({ targets: eye, alpha: E.alpha[0], duration: 900 + n * 230, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      const next = () => {
        this.time.delayedCall(Phaser.Math.Between(E.gapMs[0], E.gapMs[1]), () => {
          if (!eye.active) return;
          if (Math.random() < E.hideChance) {
            // Закрыл глаза надолго — потом снова открыл.
            this.tweens.add({ targets: eye, scaleY: 0, duration: E.blinkMs, ease: 'Quad.easeIn' });
            this.time.delayedCall(Phaser.Math.Between(E.hideMs[0], E.hideMs[1]), () => {
              if (!eye.active) return;
              this.tweens.add({ targets: eye, scaleY: k, duration: E.blinkMs * 1.5, ease: 'Quad.easeOut', onComplete: next });
            });
            return;
          }
          this.tweens.add({ targets: eye, scaleY: k * 0.08, duration: E.blinkMs / 2, yoyo: true, ease: 'Quad.easeInOut', onComplete: next });
        });
      };
      next();
    });
  }

  /** Печать на логотипе: красное свечение за ней (пульсирует) и осколки печати, которые парят вокруг своих мест. */
  private addSealLife(x: number, y: number, logo: Phaser.GameObjects.Image): void {
    const F = FEEL.menuLife;
    const soft = this.glowTexture();
    const G = F.glow;
    const glow = this.add.image(x, y, soft).setDisplaySize(G.radius * 2, G.radius * 2).setTint(G.color).setAlpha(G.alpha[0]).setBlendMode(Phaser.BlendModes.ADD);
    this.children.moveBelow(glow as Phaser.GameObjects.GameObject, logo as Phaser.GameObjects.GameObject);
    this.tweens.add({ targets: glow, alpha: G.alpha[1], duration: G.periodMs / 2, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // Осколки печати: каждый парит вокруг своего места на логотипе — качается вверх-вниз и вбок, чуть поворачивается,
    // под ним мерцает красное свечение. Свой период и фаза у каждого — движутся вразнобой, «магически».
    const S = F.shards;
    const k = logo.scaleX;
    const left = logo.x - logo.displayWidth / 2;
    const top = logo.y - logo.displayHeight / 2;
    MENU_ART.shards.forEach((p, n) => {
      if (!this.textures.exists(menuShardKey(n))) return;
      const bx = left + p.x * k;
      const by = top + p.y * k;
      const shard = this.add.image(bx, by, menuShardKey(n)).setScale(k);
      const halo = this.add
        .image(bx, by, soft)
        .setDisplaySize(shard.displayWidth * S.glowSize, shard.displayHeight * S.glowSize)
        .setTint(S.glowColor)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(S.glowAlpha[0]);
      this.children.moveBelow(halo as Phaser.GameObjects.GameObject, shard as Phaser.GameObjects.GameObject);
      const bob = Phaser.Math.FloatBetween(S.bobPx[0], S.bobPx[1]);
      const drift = Phaser.Math.FloatBetween(S.driftPx[0], S.driftPx[1]);
      const period = Phaser.Math.FloatBetween(S.periodMs[0], S.periodMs[1]);
      const phase = Math.random() * Math.PI * 2;
      this.tweens.addCounter({
        from: 0,
        to: Math.PI * 2,
        duration: period,
        repeat: -1,
        onUpdate: (tw) => {
          const t = (tw.getValue() ?? 0) + phase;
          const dx = Math.sin(t * 0.5) * drift;
          const dy = Math.sin(t) * bob;
          shard.setPosition(bx + dx, by + dy).setAngle(Math.sin(t * 0.75) * S.spinDeg);
          halo.setPosition(bx + dx, by + dy).setAlpha(S.glowAlpha[0] + (S.glowAlpha[1] - S.glowAlpha[0]) * (0.5 + 0.5 * Math.sin(t * 1.3)));
        },
      });
    });
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

}
