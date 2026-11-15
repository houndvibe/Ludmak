// Конец забега: победа над ведьмаком или смерть Людьмака.
import * as Phaser from 'phaser';
import { BG_RESULTS_KEY, GAME_OVER_LAYOUT, HERO_KEY, MENU_ART, MENU_LAYOUT, menuArtKey } from '../config/assets';
import { FINAL_BOSS, NIGHTS } from '../config/balance';
import { ENEMIES } from '../data/enemies';
import { run } from '../state';
import { playMusic, sfx } from '../components/Sound';
import { addBackground, addSmallCaps, addText, Button, fadeIn, fit, goto, H, W } from '../ui';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  create(): void {
    fadeIn(this);
    playMusic(this, 'music_night');
    const s = run.summary!;
    const win = s.gameOver === 'win';
    const L = GAME_OVER_LAYOUT;
    sfx(this, win ? 'victory' : 'game_over');
    // Фон итогов дня, притушенный.
    addBackground(this, BG_RESULTS_KEY);
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, L.dim);

    // Портрет Людьмака в рамке; при поражении — чёрно-белый, с траурной лентой на углу.
    const p = L.portrait;
    const img = fit(this.add.image(p.x, p.y, win ? HERO_KEY : this.grayTexture(HERO_KEY)), p.w, p.h);
    if (this.textures.exists(menuArtKey('portraitFrame'))) {
      const A = MENU_LAYOUT.quickArt;
      const fw = img.displayWidth * (A.frameW / MENU_LAYOUT.quickPanel.portrait);
      const fh = (fw * A.frameH) / A.frameW;
      this.add.image(p.x, p.y, menuArtKey('portraitFrame')).setDisplaySize(fw, fh);
      if (!win) this.addRibbon(p.x + fw / 2, p.y + fh / 2);
    } else if (!win) {
      this.addRibbon(p.x + img.displayWidth / 2, p.y + img.displayHeight / 2);
    }

    // Слева: заголовок капителью, текст и кнопка — по центру своей колонки.
    const t = L.text;
    addSmallCaps(this, t.x, t.titleY, win ? 'Победа' : 'Конец игры', t.titleBig, t.titleSmall, MENU_ART.buttonTextColor);
    const boss = ENEMIES[FINAL_BOSS].name.toLowerCase();
    const text = win
      ? `Людьмак пережил ${NIGHTS} ночей и одолел: ${boss}.\nОсталось монет: ${s.coinsAfter}.`
      : s.final
        ? `Ночь ${s.night}: ${boss} оказался сильнее.\nЛюдьмак пал — охота окончена.`
        : `Ночь ${s.night}: Людьмак пал в бою.\nОхота окончена.`;
    addText(this, t.x, t.bodyY, text, t.bodySize, MENU_ART.buttonTextColor, {
      align: 'center',
      lineSpacing: 12,
      wordWrap: { width: t.width },
      stroke: '#000000',
      strokeThickness: 4,
    })
      .setOrigin(0.5, 0)
      .setShadow(0, 3, '#000000', 0, true, true);
    new Button(this, t.x, t.buttonY, 400, 90, 'В МЕНЮ', () => goto(this, 'Menu'), 36);
  }

  /** Чёрно-белая копия картинки (один раз на ключ). */
  private grayTexture(src: string): string {
    const key = `${src}_gray`;
    if (this.textures.exists(key)) return key;
    const img = this.textures.get(src).getSourceImage() as HTMLImageElement;
    const tex = this.textures.createCanvas(key, img.width, img.height);
    if (!tex) return src;
    const ctx = tex.getContext();
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height);
    const d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.round(d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11);
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(data, 0, 0);
    tex.refresh();
    return key;
  }

  /**
   * Траурная лента наискосок через правый нижний угол рамки (right, bottom — угол). Есть картинка художницы
   * ui/mourning_ribbon.png — она, правым нижним углом в угол рамки; нет — рисуется кодом.
   */
  private addRibbon(right: number, bottom: number): void {
    const R = GAME_OVER_LAYOUT.ribbon;
    if (this.textures.exists(menuArtKey('mourningRibbon'))) {
      this.add.image(right + R.overhang, bottom + R.overhang, menuArtKey('mourningRibbon')).setOrigin(1, 1).setScale(R.scale);
      return;
    }
    const a = R.offset;
    const b = R.offset + R.width;
    const o = R.overhang;
    const g = this.add.graphics();
    // Лента чуть выходит за рамку (o), как повязанная поверх.
    g.fillStyle(0x0b0a0a, 0.96).fillPoints(
      [
        new Phaser.Math.Vector2(right - b - o, bottom + o),
        new Phaser.Math.Vector2(right - a + o, bottom + o),
        new Phaser.Math.Vector2(right + o, bottom - a + o),
        new Phaser.Math.Vector2(right + o, bottom - b - o),
      ],
      true,
    );
    // Блик по краям ленты.
    g.lineStyle(2, 0x5a5552, 0.8);
    g.lineBetween(right - b - o, bottom + o, right + o, bottom - b - o);
    g.lineBetween(right - a + o, bottom + o, right + o, bottom - a + o);
  }
}
