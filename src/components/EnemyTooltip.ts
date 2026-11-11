// Всплывающее окно врага в заказе (дом: карточка у окошка и доска «Заказы на сегодня»).
// Сверху по центру — имя (и модификатор); ниже слева — портрет и полоска здоровья, справа — сумка сеткой, как в бою.
// При наведении на предмет в сумке внизу появляется его описание. Окно не пропадает, пока мышь на строке врага
// или на самом окне, — так до предметов можно дотянуться. Размеры — ENEMY_TOOLTIP_LAYOUT.
import * as Phaser from 'phaser';
import { ENEMY_TOOLTIP_LAYOUT, enemyItemKey, enemyKey } from '../config/assets';
import { ENEMY_ITEM_STATS, ENEMY_STATS } from '../config/balance';
import { ENEMIES, type EnemyId } from '../data/enemies';
import { ENEMY_ITEMS, type EnemyItemDef } from '../data/enemyItems';
import { enemyName, modifierEffect, MODIFIERS, type ModifierId } from '../data/modifiers';
import { rectMask, type Placement } from '../systems/backpack';
import { enemyPower } from '../systems/battle';
import { run } from '../state';
import { addText, C, describeEnemyItem, fit, H, W } from '../ui';
import { GridView } from './GridView';

type Rect = { x: number; y: number; w: number; h: number };
type BagPiece = Placement & { def: EnemyItemDef };

export class EnemyTooltip extends Phaser.GameObjects.Container {
  /** Строка врага, с которой открыли окно. */
  private anchor: Rect | null = null;
  /** Где окно на экране. */
  private box = new Phaser.Geom.Rectangle();

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    this.setDepth(500).setVisible(false);
    scene.add.existing(this);
    // Окно прячется, когда мышь ушла и со строки врага, и с самого окна.
    const onMove = (p: Phaser.Input.Pointer) => {
      if (this.visible && !this.covers(p.x, p.y)) this.hide();
    };
    scene.input.on('pointermove', onMove);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.input.off('pointermove', onMove));
  }

  private covers(x: number, y: number): boolean {
    const a = this.anchor;
    const onAnchor = !!a && x >= a.x - 6 && x <= a.x + a.w + 6 && y >= a.y - 6 && y <= a.y + a.h + 6;
    return onAnchor || this.box.contains(x, y);
  }

  /** Показать окно врага рядом со строкой anchor (экранные координаты). */
  show(enemy: EnemyId, mod: ModifierId | null, anchor: Rect): void {
    this.removeAll(true);
    this.anchor = anchor;
    const s = this.scene;
    const L = ENEMY_TOOLTIP_LAYOUT;
    const def = ENEMIES[enemy];
    let y = L.pad;

    // Имя по центру, под ним модификатор.
    const name = addText(s, L.w / 2, y, enemyName(enemy, mod), 28, C.bad, { fontStyle: 'bold', align: 'center', wordWrap: { width: L.w - 2 * L.pad } });
    this.add(name.setOrigin(0.5, 0));
    y += name.height + 6;
    if (mod) {
      const m = addText(s, L.w / 2, y, `${MODIFIERS[mod].name}: ${modifierEffect(mod)}`, 18, C.accent, {
        align: 'center',
        wordWrap: { width: L.w - 2 * L.pad },
      });
      this.add(m.setOrigin(0.5, 0));
      y += m.height + 6;
    }
    y += 8;

    // Две колонки: слева портрет и под ним здоровье, справа — сумка сеткой (по центру своей колонки).
    const bodyY = y;
    const pw = L.portraitW;
    const ph = Math.round(pw * 1.25);
    this.add(s.add.rectangle(L.pad, bodyY, pw, ph, 0x000000, 0.5).setOrigin(0).setStrokeStyle(2, C.border));
    this.add(fit(s.add.image(L.pad + pw / 2, bodyY + ph / 2, enemyKey(enemy)), pw - 4, ph - 4));
    const hp = Math.round(ENEMY_STATS[enemy].hp * enemyPower(run.night, mod));
    const barY = bodyY + ph + 12 + L.hpH / 2;
    this.add(s.add.rectangle(L.pad, barY, pw, L.hpH, 0x000000, 0.7).setOrigin(0, 0.5).setStrokeStyle(2, C.border));
    this.add(s.add.rectangle(L.pad, barY, pw, L.hpH, 0xb03a3a).setOrigin(0, 0.5));
    this.add(addText(s, L.pad + pw / 2, barY, `${hp} / ${hp}`, 20).setOrigin(0.5));
    const leftH = ph + 12 + L.hpH;

    // Справа — сумка. Наведение на предмет — описание внизу.
    const colX = L.pad + pw + L.colGap;
    const colW = L.w - L.pad - colX;
    this.add(addText(s, colX + colW / 2, bodyY, 'Сумка', 20, C.dim).setOrigin(0.5, 0));
    const info = addText(s, L.pad, 0, '', 18, C.text, { wordWrap: { width: L.w - 2 * L.pad }, lineSpacing: 3 });
    const hint = 'Наведи на предмет в сумке';
    const pieces: BagPiece[] = def.bag.map((b, i) => ({
      uid: i,
      inGrid: true,
      col: b.col,
      row: b.row,
      rotated: b.rotated ?? false,
      def: ENEMY_ITEMS[b.item],
    }));
    const gridW = def.bagCols * L.cell;
    const gridH = def.bagRows * L.cell;
    const grid = new GridView<BagPiece>(s, {
      x: colX + (colW - gridW) / 2,
      y: bodyY + 32,
      cell: L.cell,
      mask: rectMask(def.bagCols, def.bagRows),
      mode: 'view',
      items: () => pieces,
      shape: (p) => ({ w: p.def.w, h: p.def.h, key: enemyItemKey(p.def.id) }),
      describe: (p) => `${p.def.name}: ${describeEnemyItem(p.def.id, mod)}`,
      onHover: (t) => info.setText(t ?? hint).setColor(t ? C.text : C.dim),
    });
    for (const p of pieces) grid.setCharges(p.uid, ENEMY_ITEM_STATS[p.def.id].charges ?? null);
    this.add(grid);
    const rightH = 32 + gridH;

    // Внизу во всю ширину, под линией, — описание предмета.
    y = bodyY + Math.max(leftH, rightH) + 16;
    this.add(s.add.rectangle(L.pad, y, L.w - 2 * L.pad, 1, 0x4a4357).setOrigin(0));
    y += 12;
    info.setY(y).setText(hint).setColor(C.dim);
    this.add(info);
    const height = y + L.infoH + L.pad;

    // Фон — позади всего; окно сразу под строкой врага (не влезает — над ней).
    const bg = s.add.rectangle(0, 0, L.w, height, 0x0c0a10, 0.97).setOrigin(0).setStrokeStyle(2, C.border);
    this.add(bg);
    this.sendToBack(bg);
    const x = Phaser.Math.Clamp(anchor.x, 10, W - L.w - 10);
    let top = anchor.y + anchor.h;
    if (top + height > H - 10) top = Math.max(10, anchor.y - height);
    this.setPosition(x, top);
    this.box.setTo(x, top, L.w, height);
    this.setVisible(true);
  }

  hide(): void {
    this.setVisible(false);
    this.anchor = null;
    this.box.setTo(0, 0, 0, 0);
  }
}
