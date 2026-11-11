// Укладка рюкзака: перетаскивание ЛКМ, поворот ПКМ, вне сетки — «вне сумок» (в бою не участвуют).
// Соседство: метки при перетаскивании, серые отключённые предметы, панель «Сила снаряжения».
// Слияние: предмет, отпущенный на такой же предмет того же уровня, становится ★2 / ★3.
import * as Phaser from 'phaser';
import { BACKPACK_LAYOUT, BG_NIGHT_KEY, HORSE_ART, itemKey } from '../config/assets';
import { GridView, type GridLabel, type GridLabels } from '../components/GridView';
import { ITEMS } from '../data/items';
import { canPlace, MASK, type OwnedItem } from '../systems/backpack';
import { computePower, gearSummary, starOf, type PowerResult } from '../systems/synergy';
import { tutorialAttach, tutorialDone } from '../components/Hints';
import { playMusic, sfx } from '../components/Sound';
import { canMerge, mergeItems, run } from '../state';
import { addBackground, addHeader, addHorse, addText, Button, C, describeOwnedItem, fadeIn, goto, itemRarityFrame, itemTagColor } from '../ui';

/** Галочка «Скрыть эффекты соседства» — запоминается в браузере. */
const HIDE_LABELS_KEY = 'ludmak.hideSynergyLabels';
let hideSynergyLabels = false;

function loadHideLabels(): boolean {
  try {
    return window.localStorage.getItem(HIDE_LABELS_KEY) === '1';
  } catch {
    return false;
  }
}

function saveHideLabels(v: boolean): void {
  try {
    window.localStorage.setItem(HIDE_LABELS_KEY, v ? '1' : '0');
  } catch {
    // нет хранилища — запомнится до перезагрузки
  }
}

export class BackpackScene extends Phaser.Scene {
  private countText!: Phaser.GameObjects.Text;
  private powerText!: Phaser.GameObjects.Text;
  private view!: GridView<OwnedItem>;
  private power!: PowerResult;

  constructor() {
    super('Backpack');
  }

  create(): void {
    fadeIn(this);
    playMusic(this, 'music_night');
    const L = BACKPACK_LAYOUT;
    const gridW = MASK.cols * L.cell;
    const gridH = MASK.rows * L.cell;

    addBackground(this, BG_NIGHT_KEY);
    addHorse(this, L.grid.x, L.grid.y, L.cell);
    addHeader(this, 'Укладка рюкзака');
    addText(
      this,
      L.grid.x,
      110,
      'Перетаскивай мышью, ПКМ — повернуть. Соседи усиливают или портят друг друга. Такой же предмет поверх — слияние ★.',
      24,
      C.dim,
    );
    this.countText = addText(this, L.grid.x, 200, '', 26, C.accent);
    this.addHideLabelsCheckbox();

    const s = L.stash;
    this.add.rectangle(s.x, s.y, s.w, s.h, C.panel, 0.85).setOrigin(0).setStrokeStyle(2, C.border);
    addText(this, s.x, s.y - 40, 'Вне сумок — в бою не участвуют', 26, C.dim);

    // Страницы «вне сумок»: стрелки видны, только когда вещей больше, чем влезает.
    const nav = L.stashNav;
    const pageText = addText(this, nav.pageX, nav.y, '', 22, C.dim).setOrigin(1, 0.5);
    const prev = new Button(this, nav.prevX, nav.y, nav.w, nav.h, '◀', () => this.view.turnStashPage(-1), 24);
    const next = new Button(this, nav.nextX, nav.y, nav.w, nav.h, '▶', () => this.view.turnStashPage(1), 24);
    const showPages = (page: number, count: number) => {
      const many = count > 1;
      pageText.setText(many ? `стр. ${page + 1} из ${count}` : '');
      prev.setVisible(many).setEnabled(page > 0);
      next.setVisible(many).setEnabled(page < count - 1);
    };

    const pw = L.power;
    this.add.rectangle(pw.x, pw.y, pw.w, pw.h, C.panel, 0.92).setOrigin(0).setStrokeStyle(2, C.border);
    addText(this, pw.x + 20, pw.y + 14, 'Сила снаряжения', 28, C.accent, { fontStyle: 'bold' });
    this.powerText = addText(this, pw.x + 20, pw.y + 56, '', 22, C.text, { lineSpacing: 6, wordWrap: { width: pw.w - 40 } });

    const info = addText(this, L.info.x, L.info.y, '', 22, C.text, { lineSpacing: 4, wordWrap: { width: L.info.w } });
    this.power = computePower(run.items);
    this.view = new GridView<OwnedItem>(this, {
      x: L.grid.x,
      y: L.grid.y,
      cell: L.cell,
      mask: MASK,
      mode: 'edit',
      cellFillColor: HORSE_ART.cellFillColor,
      cellFillAlpha: HORSE_ART.cellFillAlpha,
      cellLineColor: HORSE_ART.cellLineColor,
      cellLineAlpha: HORSE_ART.cellLineAlpha,
      items: () => run.items,
      shape: (it) => ({
        w: ITEMS[it.id].w,
        h: ITEMS[it.id].h,
        key: itemKey(it.id),
        star: starOf(it),
        tint: itemTagColor(it.id),
        frame: itemRarityFrame(it.id),
      }),
      describe: (it) => describeOwnedItem(it, this.power.powers, run.items),
      onHover: (t) => info.setText(t ?? ''),
      stash: s,
      canPlace: (it, rotated, col, row) => canPlace(run.items, it.id, rotated, col, row, it.uid),
      preview: (it, col, row, rotated) => this.previewLabels(it, col, row, rotated),
      canMerge: (a, b) => canMerge(a, b),
      onMerge: (a, b) => mergeItems(a.uid, b.uid),
      onChange: () => {
        this.refresh();
        tutorialDone(this, 'drag'); // обучение: предмет переложили
      },
      onStashPages: showPages,
    }).setDepth(10);
    this.refresh();

    const home = { x: 1520, y: 1010, w: 420, h: 70 };
    new Button(this, home.x, home.y, home.w, home.h, '← Домой', () => {
      tutorialDone(this, 'bagsHome');
      goto(this, 'Home');
    }, 32);

    // Обучение: сетка (перетащить, метки), панель «Сила снаряжения», кнопка «Домой».
    const grid = { x: L.grid.x, y: L.grid.y, w: gridW, h: gridH };
    tutorialAttach(this, (id) => {
      if (id === 'drag' || id === 'labels') return grid;
      if (id === 'power') return L.power;
      if (id === 'bagsHome') return { x: home.x - home.w / 2, y: home.y - home.h / 2, w: home.w, h: home.h };
      return null;
    });
  }

  /** Что изменится, если положить предмет сюда: метки над соседями и сводка над самим предметом. */
  private previewLabels(it: OwnedItem, col: number, row: number, rotated: boolean): GridLabels {
    const moved = { ...it, inGrid: true, col, row, rotated };
    const items = run.items.map((i) => (i.uid === it.uid ? moved : i));
    const { effects } = computePower(items);
    const neighbors = new Map<number, GridLabel[]>();
    const self: GridLabel[] = [];
    for (const e of effects) {
      const label = { text: e.label, good: e.good };
      if (e.source === it.uid && e.target !== it.uid) neighbors.set(e.target, [...(neighbors.get(e.target) ?? []), label]);
      if (e.target === it.uid) self.push(label);
    }
    return { neighbors, self };
  }

  /**
   * Галочка «Скрыть эффекты соседства»: убирает постоянные метки на предметах (превью при перетаскивании остаётся).
   * Выбор запоминается в браузере; хранилище может быть недоступно — тогда метки показываются.
   */
  private addHideLabelsCheckbox(): void {
    const r = BACKPACK_LAYOUT.hideLabels;
    hideSynergyLabels = loadHideLabels();
    this.add.rectangle(r.x, r.y, r.size, r.size, 0x000000, 0.6).setStrokeStyle(2, C.border);
    const mark = addText(this, r.x, r.y, '✔', Math.round(r.size * 0.8), C.accent, { fontStyle: 'bold' }).setOrigin(0.5);
    const label = addText(this, r.x + r.size / 2 + 12, r.y, 'Скрыть эффекты соседства', 24, C.text).setOrigin(0, 0.5);
    const show = () => mark.setVisible(hideSynergyLabels);
    show();
    // Нажимается и квадратик, и подпись.
    const hit = this.add
      .rectangle(r.x - r.size / 2 - 6, r.y, r.size + 12 + 12 + label.width + 6, r.size + 12, 0xffffff, 0.001)
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => label.setColor(C.accent));
    hit.on('pointerout', () => label.setColor(C.text));
    hit.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.button !== 0) return;
      hideSynergyLabels = !hideSynergyLabels;
      saveHideLabels(hideSynergyLabels);
      sfx(this, 'ui_click');
      show();
      this.refresh();
    });
  }

  /** Постоянные метки: что каждый предмет в сумках получает от соседей; одинаковые склеиваются в «×N». */
  private staticLabels(): Map<number, GridLabel[]> | null {
    if (hideSynergyLabels) return null;
    const byTarget = new Map<number, Map<string, { label: GridLabel; n: number }>>();
    for (const e of this.power.effects) {
      const m = byTarget.get(e.target) ?? new Map();
      byTarget.set(e.target, m);
      const key = `${e.good}|${e.label}`;
      const cur = m.get(key);
      if (cur) cur.n++;
      else m.set(key, { label: { text: e.label, good: e.good }, n: 1 });
    }
    const out = new Map<number, GridLabel[]>();
    for (const [uid, m] of byTarget) {
      out.set(uid, [...m.values()].map(({ label, n }) => (n > 1 ? { ...label, text: `${label.text} ×${n}` } : label)));
    }
    return out;
  }

  /** Пересчитать соседство: серые отключённые, постоянные метки, счётчик, панель силы. */
  private refresh(): void {
    this.power = computePower(run.items);
    for (const it of run.items) this.view.setDisabled(it.uid, !!this.power.powers.get(it.uid)?.disabled);
    this.view.setStaticLabels(this.staticLabels());

    const inGrid = run.items.filter((i) => i.inGrid).length;
    this.countText.setText(`В сумках: ${inGrid}   Вне сумок: ${run.items.length - inGrid}`);

    const g = gearSummary(run.items, this.power);
    const f = (n: number) => n.toFixed(1);
    const lines = [
      `Урон в секунду: ${f(g.dps)}`,
      `Блок в секунду: ${f(g.blockPerSec)}`,
      `Лечение в секунду: ${f(g.healPerSec)}${g.selfPerSec > 0 ? `   Урон себе в секунду: ${f(g.selfPerSec)}` : ''}`,
      `Отключено: ${g.disabled.length ? g.disabled.map((id) => ITEMS[id].name).join(', ') : 'ничего'}`,
    ];
    if (g.explosive.length) {
      lines.push(`Может взорваться: ${g.explosive.map((e) => `${ITEMS[e.id].name} (${Math.round(e.chance * 100)}%)`).join(', ')}`);
    }
    lines.push('Активные предметы (бомбы, эликсиры) сюда не входят.');
    this.powerText.setText(lines.join('\n'));
  }
}
