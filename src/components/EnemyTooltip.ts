// Всплывающее окно врага в заказе (дом: карточка у окошка и доска «Заказы на сегодня»).
// Сверху по центру — имя (и модификатор); ниже слева — портрет и полоска здоровья, справа — сумка сеткой, как в бою.
// При наведении на предмет в сумке сбоку от окна появляется карточка предмета (как в магазине). Окно не пропадает,
// пока мышь на строке врага или на самом окне, — так до предметов можно дотянуться. Размеры — ENEMY_TOOLTIP_LAYOUT.
import * as Phaser from 'phaser';
import { ENEMY_TOOLTIP_LAYOUT, enemyItemKey, enemyKey, UI_ART, uiShopCardKey } from '../config/assets';
import { ENEMY_ITEM_STATS, ENEMY_STATS } from '../config/balance';
import { ENEMIES, type EnemyId } from '../data/enemies';
import { ENEMY_CATEGORY_NAMES, ENEMY_ITEMS, type EnemyItemDef } from '../data/enemyItems';
import { enemyName, modifierEffect, MODIFIERS, type ModifierId } from '../data/modifiers';
import { rectMask, type Placement } from '../systems/backpack';
import { enemyPower } from '../systems/battle';
import { run } from '../state';
import { FEEL } from '../config/feel';
import { addChips, addModifierBadge, addText, C, enemyItemChips, fit, H, TIP_DEPTH, TITLE, W, withHoverTip } from '../ui';
import { GridView } from './GridView';

type Rect = { x: number; y: number; w: number; h: number };
type BagPiece = Placement & { def: EnemyItemDef };

export class EnemyTooltip extends Phaser.GameObjects.Container {
  /** Строка врага, с которой открыли окно. */
  private anchor: Rect | null = null;
  /** Где окно на экране. */
  private box = new Phaser.Geom.Rectangle();
  /** Карточка предмета сбоку от окна: где на экране (пустой — не показана). Мышь на ней — окно и карточка не пропадают. */
  private cardBox = new Phaser.Geom.Rectangle();

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    this.setDepth(TIP_DEPTH).setVisible(false); // выше затемнения обучения
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
    return onAnchor || this.box.contains(x, y) || this.cardBox.contains(x, y);
  }

  /** Показать окно врага рядом со строкой anchor (экранные координаты). */
  show(enemy: EnemyId, mod: ModifierId | null, anchor: Rect): void {
    this.removeAll(true);
    this.anchor = anchor;
    const s = this.scene;
    const L = ENEMY_TOOLTIP_LAYOUT;
    const def = ENEMIES[enemy];
    const gridW = def.bagCols * L.cell;
    const gridH = def.bagRows * L.cell;
    // Ширина окна — по содержимому: портрет, промежуток, сумка (не уже minBagW).
    const w = L.pad * 2 + L.portraitW + L.colGap + Math.max(gridW, L.minBagW);
    let y = L.pad;

    // Имя по центру, под ним модификатор.
    const name = addText(s, w / 2, y, enemyName(enemy, mod), 28, C.bad, { ...TITLE, align: 'center', wordWrap: { width: w - 2 * L.pad } });
    this.add(name.setOrigin(0.5, 0));
    y += name.height + 6;
    if (mod) {
      // Модификатор — плашка-тег (кружок с буквой и название), что он делает — в подсказке при наведении.
      const M = MODIFIERS[mod];
      const ph = 34;
      const label = addText(s, 0, 0, M.name, 18, C.text, { fontStyle: 'bold' }).setOrigin(0, 0.5);
      const pw = 8 + ph - 8 + 6 + label.width + 12;
      const px = (w - pw) / 2;
      const g = s.add.graphics();
      g.fillStyle(0x14121a, 0.9).fillRoundedRect(px, y, pw, ph, ph / 2);
      g.lineStyle(2, M.color, 1).strokeRoundedRect(px, y, pw, ph, ph / 2);
      const hit = s.add.rectangle(px, y, pw, ph, 0xffffff, 0.001).setOrigin(0);
      this.add([g, hit, addModifierBadge(s, px + 4 + (ph - 8) / 2, y + ph / 2, (ph - 8) / 2, mod), label.setPosition(px + ph + 2, y + ph / 2)]);
      withHoverTip(hit, `${M.name}: ${modifierEffect(mod)}.`);
      y += ph + 6;
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

    // Справа — сумка. Наведение на предмет — карточка предмета сбоку от окна.
    const colX = L.pad + pw + L.colGap;
    const colW = w - L.pad - colX;
    this.add(addText(s, colX + colW / 2, bodyY, 'Сумка', 20, C.dim).setOrigin(0.5, 0));
    const card = s.add.container(0, 0).setVisible(false);
    // Карточка: наведение на предмет — показать; ушла мышь — подождать FEEL.enemyCardKeepMs (успеть дойти до карточки);
    // пока мышь на карточке или снова на предмете — не прятать.
    let hovered: BagPiece | null = null;
    let shown: BagPiece | null = null;
    const hideCard = () => {
      card.removeAll(true).setVisible(false);
      shown = null;
      this.cardBox.setTo(0, 0, 0, 0);
    };
    const showItem = (p: BagPiece | null) => {
      hovered = p;
      if (p) {
        if (shown === p) return;
        card.removeAll(true).setVisible(true);
        this.drawCard(card, p.def, mod);
        shown = p;
        const m = card.getWorldTransformMatrix();
        // С запасом в зазор между окном и карточкой — мышь переходит на карточку, не выходя за «своё».
        const g = L.card.gap + 2;
        this.cardBox.setTo(m.tx - g, m.ty - g, UI_ART.shopCard.w * L.card.scale + 2 * g, UI_ART.shopCard.h * L.card.scale + 2 * g);
        return;
      }
      s.time.delayedCall(FEEL.enemyCardKeepMs, () => {
        const ptr = s.input.activePointer;
        if (!hovered && shown && !this.cardBox.contains(ptr.x, ptr.y)) hideCard();
      });
    };
    // Мышь ушла с карточки (и не на предмет) — спрятать карточку.
    const onCardMove = (ptr: Phaser.Input.Pointer) => {
      if (shown && !hovered && !this.cardBox.contains(ptr.x, ptr.y)) {
        s.time.delayedCall(FEEL.enemyCardKeepMs, () => {
          const q = s.input.activePointer;
          if (!hovered && shown && !this.cardBox.contains(q.x, q.y)) hideCard();
        });
      }
    };
    s.input.on('pointermove', onCardMove);
    this.offCardMove?.();
    this.offCardMove = () => s.input.off('pointermove', onCardMove);
    const pieces: BagPiece[] = def.bag.map((b, i) => ({
      uid: i,
      inGrid: true,
      col: b.col,
      row: b.row,
      rotated: b.rotated ?? false,
      def: ENEMY_ITEMS[b.item],
    }));
    const grid = new GridView<BagPiece>(s, {
      x: colX + (colW - gridW) / 2,
      y: bodyY + 32,
      cell: L.cell,
      mask: rectMask(def.bagCols, def.bagRows),
      mode: 'view',
      items: () => pieces,
      shape: (p) => ({ w: p.def.w, h: p.def.h, key: enemyItemKey(p.def.id) }),
      describe: (p) => p.def.name,
      onHover: (_t, p) => showItem(p ?? null),
    });
    for (const p of pieces) grid.setCharges(p.uid, ENEMY_ITEM_STATS[p.def.id].charges ?? null);
    this.add(grid);
    const rightH = 32 + gridH;

    const height = bodyY + Math.max(leftH, rightH) + L.pad;

    // Фон — позади всего; окно сразу под строкой врага (не влезает — над ней).
    // Фон интерактивный: ловит мышь, поэтому строки врагов под окном не срабатывают, пока курсор над окном.
    const bg = s.add.rectangle(0, 0, w, height, 0x0c0a10, 0.97).setOrigin(0).setStrokeStyle(2, C.border).setInteractive();
    this.add(bg);
    this.sendToBack(bg);
    const x = Phaser.Math.Clamp(anchor.x, 10, W - w - 10);
    let top = anchor.y + anchor.h;
    if (top + height > H - 10) top = Math.max(10, anchor.y - height);
    this.setPosition(x, top);
    this.box.setTo(x, top, w, height);
    // Карточка предмета — справа от окна, не влезает — слева; по верху окна, но не ниже экрана.
    const cw = UI_ART.shopCard.w * L.card.scale;
    const chh = UI_ART.shopCard.h * L.card.scale;
    const cx = x + w + L.card.gap + cw <= W - 10 ? w + L.card.gap : -cw - L.card.gap;
    card.setPosition(cx, Math.min(0, H - 10 - chh - top)).setScale(L.card.scale);
    this.add(card);
    this.setVisible(true);
  }

  /**
   * Карточка предмета врага на картинке обычной карточки магазина: категория, картинка, имя, характеристики значками.
   * Рисуется в полный размер карточки (раскладка — UI_ART.shopCard.plain), контейнер уменьшается до card.scale.
   */
  private drawCard(card: Phaser.GameObjects.Container, d: EnemyItemDef, mod: ModifierId | null): void {
    const s = this.scene;
    const A = UI_ART.shopCard;
    const tex = s.textures.exists(uiShopCardKey('plain'));
    const Lc = tex ? A.plain : A.fallback;
    // Фон карточки тоже ловит мышь (строки под ней не срабатывают).
    card.add(
      tex
        ? s.add.image(0, 0, uiShopCardKey('plain')).setOrigin(0).setInteractive()
        : s.add.rectangle(0, 0, A.w, A.h, C.panel, 0.95).setOrigin(0).setStrokeStyle(2, C.border).setInteractive(),
    );
    card.add(fit(s.add.image(A.w / 2, Lc.iconY, enemyItemKey(d.id)), Lc.iconSize, Lc.iconSize));
    card.add(addText(s, A.w / 2, Lc.nameY, d.name, 28, C.text, { ...TITLE, align: 'center', wordWrap: { width: A.w - 2 * Lc.pad } }).setOrigin(0.5));
    card.add(addText(s, A.w / 2, Lc.pillsY + 4, ENEMY_CATEGORY_NAMES[d.category], 20, C.dim).setOrigin(0.5, 0));
    addChips(s, 16, Lc.chipsY, enemyItemChips(s, d.id, mod), { h: Lc.chipH, maxW: A.w - 32, container: card });
  }

  /** Снять слежение за мышью у карточки прошлого показа окна. */
  private offCardMove: (() => void) | null = null;

  hide(): void {
    this.setVisible(false);
    this.anchor = null;
    this.box.setTo(0, 0, 0, 0);
    this.cardBox.setTo(0, 0, 0, 0);
    this.offCardMove?.();
    this.offCardMove = null;
  }
}
