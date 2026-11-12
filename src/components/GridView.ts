// Отображение сетки с предметами — один компонент для трёх мест:
//  • 'edit'   — экран рюкзака: перетаскивание ЛКМ, поворот ПКМ, зона «вне сумок», метки соседства, слияние;
//  • 'battle' — рюкзак героя в бою: перезарядка, заряды, подсветка готовых, клик применяет предмет;
//  • 'view'   — сумка врага в бою: то же отображение, но нажимать нельзя, только наводить.
import * as Phaser from 'phaser';
import { fits, rotatedSize, type Mask, type Placement } from '../systems/backpack';
import { FEEL } from '../config/feel';
import { ICON_LINK_KEY, statIconKey } from '../config/assets';
import { C, FONT } from '../ui';
import { sfx } from './Sound';

export type GridMode = 'edit' | 'battle' | 'view';

/** Метка над предметом: «+40% к эффекту», «Сгорит». */
export interface GridLabel {
  text: string;
  good: boolean;
}

export interface GridLabels {
  /** Метки над соседями: что им даст перетаскиваемый предмет. */
  neighbors: Map<number, GridLabel[]>;
  /** Сводка над самим перетаскиваемым: что он получит от соседей. */
  self: GridLabel[];
}

/** Связь соседства двух предметов на сетке (польза, вред или и то и другое). */
export interface GridLink {
  a: number;
  b: number;
  kind: 'good' | 'bad' | 'mixed';
}

/** Где предмет стоит на сетке, в клетках. */
type CellRect = { col: number; row: number; w: number; h: number };

export interface GridViewConfig<T extends Placement> {
  /** Левый верхний угол сетки на экране. */
  x: number;
  y: number;
  /** Размер клетки, px. */
  cell: number;
  mask: Mask;
  mode: GridMode;
  /** Прозрачность заливки и линий клеток (по умолчанию тёмные плотные клетки; поверх подложки — полупрозрачные). */
  cellFillColor?: number;
  cellFillAlpha?: number;
  cellLineColor?: number;
  cellLineAlpha?: number;
  /** Предметы (функция — список может меняться: слияние, продажа). В 'edit' компонент меняет их положение напрямую. */
  items: () => T[];
  /** Форма без поворота, ключ текстуры и уровень ★. */
  /** frame — рамка редкости вокруг клеток (null — нет). */
  shape: (it: T) => { w: number; h: number; key: string; star?: number; frame?: number | null };
  /** Текст подсказки при наведении. */
  describe: (it: T) => string;
  /** Наведение на предмет: текст describe и сам предмет; null — мышь ушла. */
  onHover?: (text: string | null, item?: T | null) => void;
  /** 'battle': нажатие на предмет. */
  onClick?: (it: T) => void;
  /** 'edit': зона «вне сумок» (экранные координаты) и размер клетки в ней. */
  stash?: { x: number; y: number; w: number; h: number; cell: number };
  /** 'edit': можно ли положить предмет сюда (с учётом остальных предметов). */
  canPlace?: (it: T, rotated: boolean, col: number, row: number) => boolean;
  /** 'edit': метки соседства, если положить предмет сюда. */
  preview?: (it: T, col: number, row: number, rotated: boolean) => GridLabels;
  /** 'edit': можно ли слить перетаскиваемый предмет с этим. */
  canMerge?: (dragged: T, target: T) => boolean;
  /** 'edit': двойной клик по предмету (выбор основного оружия). */
  onDoubleClick?: (it: T) => void;
  /** 'edit': слить (перетаскиваемый исчезает, цель повышает уровень). */
  onMerge?: (dragged: T, target: T) => void;
  /** 'edit': перетаскиваемый предмет над целью слияния (target) или ушёл с неё (оба null) — превью результата. */
  onMergeHover?: (dragged: T | null, target: T | null) => void;
  /** 'edit': метки над соседями цели, если слить (что у них изменится). Метка «Слияние → ★N» на цели — всегда. */
  mergeLabels?: (dragged: T, target: T) => Map<number, GridLabel[]>;
  /** 'edit': после того как предмет переложили, повернули или слили. */
  onChange?: () => void;
  /** 'edit': предмет взяли мышью. */
  onPickUp?: (it: T) => void;
  /** 'edit': при перетаскивании появились метки соседства (над соседями или над самим предметом). */
  onLabels?: () => void;
  /** 'edit': страница зоны «вне сумок» или число страниц изменились (page с 0). */
  onStashPages?: (page: number, count: number) => void;
  /** 'edit': связи перетаскиваемого предмета, если положить его сюда (превью полосок). */
  previewLinks?: (it: T, col: number, row: number, rotated: boolean) => GridLink[];
  /** Яркая подсветка связей предмета под курсором и затемнение остальных (рюкзак — да, бой — нет). */
  linkHover?: boolean;
}

/** Один предмет на сетке: картинка, затемнение перезарядки, рамка готовности, заряды, уровень, метки. */
class Piece {
  readonly cont: Phaser.GameObjects.Container;
  readonly img: Phaser.GameObjects.Image;
  private shade: Phaser.GameObjects.Rectangle;
  private frame: Phaser.GameObjects.Rectangle;
  /** Рамка редкости вокруг клеток. */
  private rarityFrame: Phaser.GameObjects.Rectangle;
  private badge: Phaser.GameObjects.Text;
  private starText: Phaser.GameObjects.Text;
  private labels: Phaser.GameObjects.Container;
  /** Метка основного оружия: золотые клинки в правом верхнем углу. */
  private mainMark: Phaser.GameObjects.Image;
  private fw = 0;
  private fh = 0;
  private progress = 1;
  private disabled = false;
  removing = false;

  constructor(private scene: Phaser.Scene, key: string, frame: number | null = null) {
    this.rarityFrame = scene.add.rectangle(0, 0, 1, 1).setOrigin(0).setStrokeStyle(FEEL.itemDeco.frameWidth, frame ?? 0).setVisible(frame !== null);
    this.img = scene.add.image(0, 0, key);
    this.shade = scene.add.rectangle(0, 0, 1, 1, 0x000000, 0.6).setOrigin(0);
    this.frame = scene.add.rectangle(0, 0, 1, 1).setStrokeStyle(4, 0xe0b65a).setVisible(false);
    const bold = { fontFamily: FONT, color: '#ffffff', fontStyle: 'bold', stroke: '#000', strokeThickness: 5 };
    this.badge = scene.add.text(0, 0, '', { ...bold, fontSize: '24px' }).setOrigin(1, 1);
    this.starText = scene.add.text(0, 0, '', { ...bold, fontSize: '24px', color: '#ffd45a' }).setOrigin(0, 0);
    this.labels = scene.add.container(0, 0);
    this.mainMark = scene.add.image(0, 0, statIconKey('parry')).setVisible(false);
    this.cont = scene.add.container(0, 0, [this.img, this.shade, this.rarityFrame, this.frame, this.badge, this.starText, this.mainMark, this.labels]);
  }

  /** Картинка рисуется в исходной форме w×h и поворачивается на 90°; остальное — по занимаемому месту. */
  layout(cell: number, cx: number, cy: number, w: number, h: number, rotated: boolean, star: number): void {
    this.cont.setPosition(cx, cy);
    this.img.setAngle(rotated ? 90 : 0).setDisplaySize(w * cell, h * cell);
    const f = rotatedSize(w, h, rotated);
    this.fw = f.w * cell;
    this.fh = f.h * cell;
    this.frame.setSize(this.fw - 4, this.fh - 4);
    // Рамка редкости — по занимаемым клеткам, с небольшим отступом, чтобы были видны линии сетки.
    const inset = FEEL.itemDeco.inset;
    this.rarityFrame.setPosition(-this.fw / 2 + inset, -this.fh / 2 + inset).setSize(this.fw - 2 * inset, this.fh - 2 * inset);
    const fs = Math.max(16, Math.round(cell * 0.3));
    this.badge.setPosition(this.fw / 2 - 6, this.fh / 2 - 2).setFontSize(fs);
    this.starText.setPosition(-this.fw / 2 + 4, -this.fh / 2 + 2).setFontSize(fs).setText(star > 1 ? `★${star}` : '');
    const ms = Math.max(22, Math.round(cell * 0.32));
    this.mainMark.setDisplaySize(ms, ms).setPosition(this.fw / 2 - ms / 2 - 3, -this.fh / 2 + ms / 2 + 3);
    this.drawShade();
  }

  /** 0 — только начал перезаряжаться (затемнён целиком), 1 — готов (без затемнения). Светлеет снизу вверх. */
  setProgress(p: number): void {
    const v = Phaser.Math.Clamp(p, 0, 1);
    if (Math.abs(v - this.progress) < 0.005) return;
    this.progress = v;
    this.drawShade();
  }

  private drawShade(): void {
    const h = this.fh * (1 - this.progress);
    this.shade.setPosition(-this.fw / 2, -this.fh / 2).setSize(this.fw, h).setVisible(h > 0.5 && !this.disabled);
  }

  setCharges(n: number | null): void {
    this.badge.setText(n === null ? '' : `×${n}`);
  }

  setReady(ready: boolean): void {
    this.frame.setVisible(ready && !this.disabled);
  }

  /** Основное оружие — метка в углу. */
  setMain(on: boolean): void {
    this.mainMark.setVisible(on);
  }

  /** Отключённый предмет (сгорел) — серый. */
  setDisabled(on: boolean): void {
    if (on === this.disabled) return;
    this.disabled = on;
    if (on) this.img.setTint(0x555555);
    else this.img.clearTint();
    this.img.setAlpha(on ? 0.6 : 1);
    if (on) this.frame.setVisible(false);
    this.drawShade();
  }

  /** Метки соседства столбиком по центру предмета. */
  setLabels(list: GridLabel[]): void {
    this.labels.removeAll(true);
    const lh = 30;
    list.forEach((l, i) => {
      const y = (i - (list.length - 1) / 2) * lh;
      const t = this.scene.add
        .text(0, y, l.text, { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#ffffff', backgroundColor: l.good ? '#2e7d32' : '#b23a3a', padding: { x: 6, y: 2 } })
        .setOrigin(0.5);
      this.labels.add(t);
    });
  }
}

export class GridView<T extends Placement> extends Phaser.GameObjects.Container {
  private cfg: GridViewConfig<T>;
  private pieces = new Map<number, Piece>();
  private dragging: { uid: number; saved: Placement } | null = null;
  /** Нажали на предмет, но ещё не двигали: где нажали (перетаскивание начнётся после сдвига). */
  private pressed: { uid: number; x: number; y: number } | null = null;
  /** Последнее нажатие на предмет — для двойного клика. */
  private lastDown: { uid: number; t: number } | null = null;
  /** Основное оружие (метка в углу). */
  private mainUid: number | null = null;
  /** Постоянные метки соседства (экран рюкзака); null — выключены. */
  private staticLabels: Map<number, GridLabel[]> | null = null;
  private hovered: number | null = null;
  private preview: Phaser.GameObjects.Graphics | null = null;
  private cleanup: (() => void)[] = [];
  /** Зона «вне сумок» листается страницами: текущая страница, их число и страница каждого предмета. */
  private stashPage = 0;
  private stashPages = 1;
  private pageOf = new Map<number, number>();
  /** Связи соседства (от сцены), слой полосок и значки цепей. */
  private links: GridLink[] = [];
  private linkLayer: Phaser.GameObjects.Graphics;
  private linkIcons: Phaser.GameObjects.Image[] = [];
  /** Превью связей перетаскиваемого предмета и где он встанет. */
  private previewLinks: GridLink[] = [];
  private previewRect: CellRect | null = null;

  constructor(scene: Phaser.Scene, cfg: GridViewConfig<T>) {
    super(scene, cfg.x, cfg.y);
    this.cfg = cfg;
    scene.add.existing(this);

    const { cell, mask } = cfg;
    const g = scene.add.graphics();
    for (let r = 0; r < mask.rows; r++) {
      for (let c = 0; c < mask.cols; c++) {
        if (!mask.open[r][c]) continue;
        g.fillStyle(cfg.cellFillColor ?? 0x0e0c12, cfg.cellFillAlpha ?? 0.85).fillRect(c * cell, r * cell, cell, cell);
        g.lineStyle(2, cfg.cellLineColor ?? C.border, cfg.cellLineAlpha ?? 1).strokeRect(c * cell, r * cell, cell, cell);
      }
    }
    this.add(g);
    this.linkLayer = scene.add.graphics();
    this.add(this.linkLayer);

    for (const it of cfg.items()) {
      if (cfg.mode === 'edit' || it.inGrid) this.createPiece(it);
    }
    if (cfg.mode === 'edit') this.setupEdit();
    this.layout();

    this.once(Phaser.GameObjects.Events.DESTROY, () => this.cleanup.forEach((f) => f()));
  }

  get gridWidth(): number {
    return this.cfg.mask.cols * this.cfg.cell;
  }

  get gridHeight(): number {
    return this.cfg.mask.rows * this.cfg.cell;
  }

  private item(uid: number): T | undefined {
    return this.cfg.items().find((i) => i.uid === uid);
  }

  private createPiece(it: T): void {
    const sh = this.cfg.shape(it);
    const p = new Piece(this.scene, sh.key, sh.frame ?? null);
    const interactive = this.cfg.mode !== 'view';
    p.img.setInteractive({ useHandCursor: interactive });
    p.img.on('pointerover', () => {
      this.hovered = it.uid;
      const cur = this.item(it.uid);
      if (cur) this.cfg.onHover?.(this.cfg.describe(cur), cur);
      if (this.cfg.linkHover) this.drawLinks();
    });
    p.img.on('pointerout', () => {
      if (this.hovered === it.uid) this.hovered = null;
      if (!this.dragging) this.cfg.onHover?.(null);
      if (this.cfg.linkHover) this.drawLinks();
    });
    p.img.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      const cur = this.item(it.uid);
      if (ptr.button !== 0 || p.removing || !cur) return;
      if (this.cfg.mode === 'battle') this.cfg.onClick?.(cur);
      if (this.cfg.mode === 'edit') {
        // Двойной клик — выбор основного оружия (предмет при этом берётся и кладётся на место).
        const now = this.scene.time.now;
        if (this.lastDown && this.lastDown.uid === it.uid && now - this.lastDown.t < FEEL.doubleClickMs) {
          this.lastDown = null;
          this.cfg.onDoubleClick?.(cur);
        } else this.lastDown = { uid: it.uid, t: now };
        // Клик сам по себе ничего не поднимает: перетаскивание — только когда мышь сдвинулась (FEEL.dragThreshold).
        this.pressed = { uid: it.uid, x: ptr.x, y: ptr.y };
        this.cfg.onPickUp?.(cur);
      }
    });
    if (this.mainUid === it.uid) p.setMain(true);
    this.add(p.cont);
    this.pieces.set(it.uid, p);
  }

  /** Расставляет предметы: в сетке — по клеткам, в режиме 'edit' остальные — рядами в зоне «вне сумок». */
  layout(): void {
    const { cell, stash } = this.cfg;
    const items = this.cfg.items();
    // Предметы, которых больше нет (слиты, проданы), убираем.
    for (const [uid, p] of this.pieces) {
      if (!p.removing && !items.some((i) => i.uid === uid)) {
        p.cont.destroy();
        this.pieces.delete(uid);
      }
    }
    // Зона «вне сумок»: рядами слева направо; не влезло по высоте — следующая страница.
    const left = stash ? stash.x - this.x + 20 : 0;
    const top = stash ? stash.y - this.y + 20 : 0;
    let sx = left;
    let sy = top;
    let rowH = 0;
    let page = 0;
    this.pageOf.clear();
    for (const it of items) {
      const p = this.pieces.get(it.uid);
      if (!p || p.removing || (this.dragging && this.dragging.uid === it.uid)) continue;
      const s = this.cfg.shape(it);
      const f = rotatedSize(s.w, s.h, it.rotated);
      if (it.inGrid) {
        p.cont.setVisible(true);
        p.layout(cell, (it.col + f.w / 2) * cell, (it.row + f.h / 2) * cell, s.w, s.h, it.rotated, s.star ?? 1);
      } else if (stash) {
        const w = f.w * stash.cell;
        const h = f.h * stash.cell;
        if (sx + w > left + stash.w - 40) {
          sx = left;
          sy += rowH + 12;
          rowH = 0;
        }
        if (sy + h > top + stash.h - 40 && sy > top) {
          page++;
          sx = left;
          sy = top;
          rowH = 0;
        }
        this.pageOf.set(it.uid, page);
        p.layout(stash.cell, sx + w / 2, sy + h / 2, s.w, s.h, it.rotated, s.star ?? 1);
        sx += w + 12;
        rowH = Math.max(rowH, h);
      }
    }
    this.stashPages = page + 1;
    this.stashPage = Phaser.Math.Clamp(this.stashPage, 0, this.stashPages - 1);
    for (const [uid, pg] of this.pageOf) this.pieces.get(uid)?.cont.setVisible(pg === this.stashPage);
    this.cfg.onStashPages?.(this.stashPage, this.stashPages);
    this.drawLinks();
  }

  // ─── Связи соседства ─────────────────────────────────────────────────────

  /** Связи соседства при текущей раскладке (сцена пересчитывает их после каждого изменения). */
  setLinks(links: GridLink[]): void {
    this.links = links;
    this.drawLinks();
  }

  /** Клетки предмета на сетке (null — не в сетке или его уже нет). */
  private cellRect(uid: number): CellRect | null {
    if (this.dragging?.uid === uid && this.previewRect) return this.previewRect;
    const it = this.item(uid);
    if (!it || !it.inGrid || this.dragging?.uid === uid) return null;
    const s = this.cfg.shape(it);
    const f = rotatedSize(s.w, s.h, it.rotated);
    return { col: it.col, row: it.row, w: f.w, h: f.h };
  }

  /** Общие стороны двух предметов: отрезки [x1, y1, x2, y2] по границам касающихся клеток. */
  private sharedEdges(a: CellRect, b: CellRect): [number, number, number, number][] {
    const cell = this.cfg.cell;
    const inB = (c: number, r: number) => c >= b.col && c < b.col + b.w && r >= b.row && r < b.row + b.h;
    const out: [number, number, number, number][] = [];
    for (let r = a.row; r < a.row + a.h; r++) {
      for (let c = a.col; c < a.col + a.w; c++) {
        const x = c * cell;
        const y = r * cell;
        if (inB(c + 1, r)) out.push([x + cell, y, x + cell, y + cell]);
        if (inB(c - 1, r)) out.push([x, y, x, y + cell]);
        if (inB(c, r + 1)) out.push([x, y + cell, x + cell, y + cell]);
        if (inB(c, r - 1)) out.push([x, y, x + cell, y]);
      }
    }
    return out;
  }

  /**
   * Полоски связей: тонкие — все; у предмета под курсором (рюкзак) — яркие со значком цепи, остальные предметы тускнеют.
   * Пока предмет тащат — вместо его связей превью ярких полосок там, где он встанет.
   */
  private drawLinks(): void {
    const L = FEEL.links;
    const g = this.linkLayer;
    g.clear();
    this.linkIcons.forEach((i) => i.destroy());
    this.linkIcons = [];
    const drag = this.dragging?.uid ?? null;
    const focus = drag === null && this.cfg.linkHover ? this.hovered : null;
    const focusLinks = focus === null ? [] : this.links.filter((l) => l.a === focus || l.b === focus);
    // Тусклые — предметы в сетке, не связанные с тем, что под курсором.
    const linked = new Set<number>(focusLinks.flatMap((l) => [l.a, l.b]));
    for (const [uid, p] of this.pieces) {
      if (p.removing || uid === drag) continue;
      const dim = focusLinks.length > 0 && !linked.has(uid) && !!this.item(uid)?.inGrid;
      p.cont.setAlpha(dim ? L.dimAlpha : 1);
    }
    const color = (k: GridLink['kind']) => (k === 'good' ? L.good : k === 'bad' ? L.bad : L.mixed);
    const draw = (l: GridLink, bright: boolean) => {
      const ra = this.cellRect(l.a);
      const rb = this.cellRect(l.b);
      if (!ra || !rb) return;
      const segs = this.sharedEdges(ra, rb);
      if (!segs.length) return;
      g.lineStyle(bright ? L.thick : L.thin, color(l.kind), bright ? 1 : L.thinAlpha);
      for (const [x1, y1, x2, y2] of segs) g.lineBetween(x1, y1, x2, y2);
      if (!bright) return;
      // Значок цепи — посередине общей границы.
      const mx = segs.reduce((s, q) => s + (q[0] + q[2]) / 2, 0) / segs.length;
      const my = segs.reduce((s, q) => s + (q[1] + q[3]) / 2, 0) / segs.length;
      const icon = this.scene.add.image(mx, my, ICON_LINK_KEY).setDisplaySize(L.icon, L.icon).setTint(color(l.kind));
      this.add(icon);
      this.linkIcons.push(icon);
    };
    for (const l of this.links) {
      if (drag !== null && (l.a === drag || l.b === drag)) continue;
      draw(l, focus !== null && (l.a === focus || l.b === focus));
    }
    for (const l of this.previewLinks) draw(l, true);
    this.bringToTop(g);
    this.linkIcons.forEach((i) => this.bringToTop(i));
    if (drag !== null) {
      const p = this.pieces.get(drag);
      if (p) this.bringToTop(p.cont);
    }
  }

  /** Перелистнуть зону «вне сумок» на delta страниц. */
  turnStashPage(delta: number): void {
    this.stashPage = Phaser.Math.Clamp(this.stashPage + delta, 0, this.stashPages - 1);
    this.layout();
  }

  // ─── Состояние предметов (бой и рюкзак) ──────────────────────────────────

  setProgress(uid: number, p: number): void {
    this.pieces.get(uid)?.setProgress(p);
  }

  setCharges(uid: number, n: number | null): void {
    this.pieces.get(uid)?.setCharges(n);
  }

  setReady(uid: number, ready: boolean): void {
    this.pieces.get(uid)?.setReady(ready);
  }

  setDisabled(uid: number, on: boolean): void {
    this.pieces.get(uid)?.setDisabled(on);
  }

  /** Вспышка и покачивание при срабатывании. */
  /** Отметить основное оружие (null — снять метку). */
  setMain(uid: number | null): void {
    this.mainUid = uid;
    for (const [id, p] of this.pieces) p.setMain(id === uid);
  }

  flash(uid: number): void {
    const p = this.pieces.get(uid);
    if (!p || p.removing) return;
    this.scene.tweens.killTweensOf(p.cont);
    p.cont.setAngle(0).setScale(1);
    p.img.setTintFill(0xffffff);
    this.scene.time.delayedCall(90, () => p.img.clearTint());
    this.scene.tweens.add({ targets: p.cont, angle: 6, scale: 1.06, duration: 70, yoyo: true, repeat: 1, onComplete: () => p.cont.setAngle(0).setScale(1) });
  }

  /** Предмет растворяется и исчезает (кончились заряды, взрыв). */
  removePiece(uid: number): void {
    const p = this.pieces.get(uid);
    if (!p || p.removing) return;
    p.removing = true;
    p.img.disableInteractive();
    if (this.hovered === uid) this.cfg.onHover?.(null);
    this.scene.tweens.killTweensOf(p.cont);
    this.scene.tweens.add({
      targets: p.cont,
      scale: 0.2,
      alpha: 0,
      angle: 20,
      duration: 380,
      delay: 120,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        p.cont.destroy();
        this.pieces.delete(uid);
      },
    });
  }

  /**
   * Постоянные метки 'edit': что каждый предмет получает от соседей при текущей раскладке.
   * null — не показывать. Пока предмет тащат, вместо них показывается превью (preview).
   */
  setStaticLabels(labels: Map<number, GridLabel[]> | null): void {
    this.staticLabels = labels;
    if (!this.dragging) this.showLabels(null);
    if (labels && [...labels.values()].some((l) => l.length > 0)) this.cfg.onLabels?.();
  }

  /** Метки соседства над предметами: превью при перетаскивании или (null) постоянные метки, если они включены. */
  private showLabels(labels: GridLabels | null): void {
    for (const [uid, p] of this.pieces) {
      if (this.dragging && uid === this.dragging.uid) p.setLabels(labels?.self ?? []);
      else if (labels) p.setLabels(labels.neighbors.get(uid) ?? []);
      else p.setLabels(this.staticLabels?.get(uid) ?? []);
    }
    if (labels && (labels.self.length > 0 || [...labels.neighbors.values()].some((l) => l.length > 0))) this.cfg.onLabels?.();
  }

  // ─── Редактирование ──────────────────────────────────────────────────────

  private setupEdit(): void {
    this.preview = this.scene.add.graphics();
    this.add(this.preview);
    const input = this.scene.input;
    const onMove = (p: Phaser.Input.Pointer) => this.onMove(p);
    const onUp = (p: Phaser.Input.Pointer) => this.onUp(p);
    input.on('pointermove', onMove);
    input.on('pointerup', onUp);
    input.on('pointerupoutside', onUp);
    // ПКМ ловим на DOM-уровне: так он срабатывает и во время перетаскивания с зажатой ЛКМ.
    const canvas = this.scene.game.canvas;
    const onRightDown = (e: MouseEvent) => e.button === 2 && this.onRightClick();
    canvas.addEventListener('mousedown', onRightDown);
    this.cleanup.push(() => {
      input.off('pointermove', onMove);
      input.off('pointerup', onUp);
      input.off('pointerupoutside', onUp);
      canvas.removeEventListener('mousedown', onRightDown);
    });
  }

  private pickUp(uid: number, ptr: Phaser.Input.Pointer): void {
    if (this.dragging) return;
    const it = this.item(uid)!;
    this.dragging = { uid, saved: { uid, inGrid: it.inGrid, col: it.col, row: it.row, rotated: it.rotated } };
    const p = this.pieces.get(uid)!;
    this.bringToTop(this.preview!);
    this.bringToTop(p.cont);
    this.layoutDragged(ptr.x - this.x, ptr.y - this.y);
    sfx(this.scene, 'item_pickup');
  }

  private layoutDragged(lx: number, ly: number): void {
    if (!this.dragging) return;
    const it = this.item(this.dragging.uid)!;
    const s = this.cfg.shape(it);
    this.pieces.get(it.uid)!.layout(this.cfg.cell, lx, ly, s.w, s.h, it.rotated, s.star ?? 1);
    this.drawPreview();
  }

  /** Клетка, куда встанет левый верхний угол перетаскиваемого предмета. */
  private targetCell(it: T): { col: number; row: number } {
    const p = this.pieces.get(it.uid)!;
    const s = this.cfg.shape(it);
    const f = rotatedSize(s.w, s.h, it.rotated);
    return {
      col: Math.round(p.cont.x / this.cfg.cell - f.w / 2),
      row: Math.round(p.cont.y / this.cfg.cell - f.h / 2),
    };
  }

  private overGrid(it: T): boolean {
    const p = this.pieces.get(it.uid)!;
    const half = this.cfg.cell / 2;
    return p.cont.x >= -half && p.cont.x <= this.gridWidth + half && p.cont.y >= -half && p.cont.y <= this.gridHeight + half;
  }

  /** Предмет в сетке под центром перетаскиваемого, с которым можно слиться. */
  private mergeTarget(it: T): T | null {
    if (!this.cfg.canMerge) return null;
    const p = this.pieces.get(it.uid)!;
    const c = Math.floor(p.cont.x / this.cfg.cell);
    const r = Math.floor(p.cont.y / this.cfg.cell);
    const under = this.cfg.items().find((o) => {
      if (o.uid === it.uid || !o.inGrid) return false;
      const s = this.cfg.shape(o);
      const f = rotatedSize(s.w, s.h, o.rotated);
      return c >= o.col && c < o.col + f.w && r >= o.row && r < o.row + f.h;
    });
    return under && this.cfg.canMerge(it, under) ? under : null;
  }

  private canPlaceHere(it: T, col: number, row: number): boolean {
    if (this.cfg.canPlace) return this.cfg.canPlace(it, it.rotated, col, row);
    const s = this.cfg.shape(it);
    const f = rotatedSize(s.w, s.h, it.rotated);
    const occupied = this.cfg
      .items()
      .filter((o) => o.inGrid && o.uid !== it.uid)
      .map((o) => {
        const os = this.cfg.shape(o);
        return { col: o.col, row: o.row, ...rotatedSize(os.w, os.h, o.rotated) };
      });
    return fits(this.cfg.mask, occupied, f.w, f.h, col, row);
  }

  private fillCells(g: Phaser.GameObjects.Graphics, col: number, row: number, w: number, h: number): void {
    const { cell, mask } = this.cfg;
    for (let r = row; r < row + h; r++) {
      for (let c = col; c < col + w; c++) {
        if (r < 0 || c < 0 || r >= mask.rows || c >= mask.cols) continue;
        g.fillRect(c * cell + 2, r * cell + 2, cell - 4, cell - 4);
      }
    }
  }

  /** Над какой целью слияния сейчас перетаскиваемый (ключ «uid>uid»); сцене сообщается только смена. */
  private mergeHoverKey = '';

  private notifyMergeHover(dragged: T | null, target: T | null): void {
    const key = dragged && target ? `${dragged.uid}>${target.uid}` : '';
    if (key === this.mergeHoverKey) return;
    this.mergeHoverKey = key;
    this.cfg.onMergeHover?.(dragged, target);
  }

  /** Подсветка места и метки соседства, пока предмет над сеткой. */
  private drawPreview(): void {
    const dragged = this.dragging ? this.item(this.dragging.uid) ?? null : null;
    this.notifyMergeHover(dragged, dragged && this.overGrid(dragged) ? this.mergeTarget(dragged) : null);
    const g = this.preview!;
    g.clear();
    this.previewLinks = [];
    this.previewRect = null;
    if (!this.dragging) {
      this.drawLinks();
      return this.showLabels(null);
    }
    const it = this.item(this.dragging.uid)!;
    if (!this.overGrid(it)) {
      this.drawLinks();
      return this.showLabels(null);
    }

    const merge = this.mergeTarget(it);
    if (merge) {
      const ms = this.cfg.shape(merge);
      const f = rotatedSize(ms.w, ms.h, merge.rotated);
      g.fillStyle(0xe0b65a, 0.5);
      this.fillCells(g, merge.col, merge.row, f.w, f.h);
      const neighbors = this.cfg.mergeLabels ? this.cfg.mergeLabels(it, merge) : new Map<number, GridLabel[]>();
      neighbors.set(merge.uid, [{ text: `Слияние → ★${(ms.star ?? 1) + 1}`, good: true }]);
      this.showLabels({ neighbors, self: [] });
      this.drawLinks();
      return;
    }
    const { col, row } = this.targetCell(it);
    const ok = this.canPlaceHere(it, col, row);
    const s = this.cfg.shape(it);
    const f = rotatedSize(s.w, s.h, it.rotated);
    g.fillStyle(ok ? 0x4caf50 : 0xe05050, 0.4);
    this.fillCells(g, col, row, f.w, f.h);
    this.showLabels(ok && this.cfg.preview ? this.cfg.preview(it, col, row, it.rotated) : null);
    // Превью связей: где встанет предмет — яркие полоски с цепью.
    if (ok && this.cfg.previewLinks) {
      this.previewRect = { col, row, w: f.w, h: f.h };
      this.previewLinks = this.cfg.previewLinks(it, col, row, it.rotated);
    }
    this.drawLinks();
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const pr = this.pressed;
    if (pr && !this.dragging && p.isDown && Math.hypot(p.x - pr.x, p.y - pr.y) >= FEEL.dragThreshold) {
      this.pressed = null;
      this.pickUp(pr.uid, p);
    }
    if (this.dragging) this.layoutDragged(p.x - this.x, p.y - this.y);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.button === 0) this.pressed = null; // клик без перетаскивания
    if (!this.dragging || p.button !== 0) return;
    const it = this.item(this.dragging.uid)!;
    const saved = this.dragging.saved;
    const merge = this.overGrid(it) ? this.mergeTarget(it) : null;
    this.dragging = null;
    this.notifyMergeHover(null, null);
    this.preview!.clear();
    this.previewLinks = [];
    this.previewRect = null;
    this.showLabels(null);
    if (merge) {
      Object.assign(it, { ...saved, uid: it.uid });
      this.cfg.onMerge!(it, merge); // перетаскиваемый исчезает из списка — layout() уберёт его спрайт
      this.flash(merge.uid);
      sfx(this.scene, 'item_merge');
    } else if (this.overGrid(it)) {
      const { col, row } = this.targetCell(it);
      if (this.canPlaceHere(it, col, row)) {
        Object.assign(it, { inGrid: true, col, row });
        sfx(this.scene, 'item_place');
      } else {
        Object.assign(it, { ...saved, uid: it.uid }); // не влезает — возвращаем, откуда взяли
        sfx(this.scene, 'item_invalid');
      }
    } else {
      it.inGrid = false;
      sfx(this.scene, 'item_place');
    }
    this.layout();
    // Выложенный «вне сумок» предмет может оказаться на другой странице — показываем её.
    const page = this.pageOf.get(it.uid);
    if (!it.inGrid && page !== undefined && page !== this.stashPage) this.turnStashPage(page - this.stashPage);
    this.cfg.onChange?.();
  }

  private onRightClick(): void {
    if (this.dragging) {
      const it = this.item(this.dragging.uid)!;
      it.rotated = !it.rotated;
      const p = this.pieces.get(it.uid)!;
      this.layoutDragged(p.cont.x, p.cont.y);
      sfx(this.scene, 'item_rotate');
      return;
    }
    if (this.hovered === null) return;
    const it = this.item(this.hovered);
    if (!it) return;
    if (it.inGrid) {
      it.rotated = !it.rotated;
      if (!this.canPlaceHere(it, it.col, it.row)) {
        it.rotated = !it.rotated; // не помещается повёрнутым — мигаем красным
        const img = this.pieces.get(it.uid)!.img;
        img.setTint(0xff6060);
        this.scene.time.delayedCall(200, () => img.clearTint());
        sfx(this.scene, 'item_invalid');
        return;
      }
    } else {
      it.rotated = !it.rotated;
    }
    sfx(this.scene, 'item_rotate');
    this.layout();
    this.cfg.onChange?.();
  }
}
