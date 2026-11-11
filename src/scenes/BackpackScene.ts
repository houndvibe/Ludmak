// Укладка рюкзака: перетаскивание ЛКМ, поворот ПКМ, вне сетки — «вне сумок» (в бою не участвуют).
// Соседство: метки при перетаскивании, серые отключённые предметы, панель «Сила снаряжения».
// Слияние: предмет, отпущенный на такой же предмет того же уровня, становится ★2 / ★3.
import * as Phaser from 'phaser';
import { BACKPACK_LAYOUT, BG_BACKPACK_KEY, categoryKey, HORSE_ART, itemKey, statIconKey, tagKey, type StatIconId } from '../config/assets';
import { FEEL } from '../config/feel';
import { GridView, type GridLabel, type GridLabels } from '../components/GridView';
import { CATEGORY_NAMES, ITEMS } from '../data/items';
import { canPlace, MASK, type OwnedItem } from '../systems/backpack';
import { computePower, gearSummary, pairLinks, starOf, starStats, type PowerResult } from '../systems/synergy';
import { tutorialAttach, tutorialDone } from '../components/Hints';
import { playMusic, sfx } from '../components/Sound';
import { canMerge, mergeItems, run } from '../state';
import {
  addBackground,
  addHeader,
  addHorse,
  addText,
  Button,
  C,
  describeOwnedItem,
  fadeIn,
  fit,
  goto,
  itemRarityFrame,
  itemStatChips,
  TITLE,
  W,
} from '../ui';

/** Плашка на пергаменте: значок (и значок тега) + короткое значение; hint — полная фраза при наведении. */
interface PanelChip {
  icon: string;
  tag?: string;
  value: string;
  hint: string;
  color?: string;
}

/** Размеры плашек и подсказки на пергаменте. */
const PANEL = { pad: 16, chipH: 38, chipIcon: 28, chipGap: 8, chipFont: 22, tipW: 440 };

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
  private view!: GridView<OwnedItem>;
  /** Содержимое пергамента (пересобирается) и подсказка к его плашкам. */
  private panelObjs: Phaser.GameObjects.GameObject[] = [];
  private tip!: Phaser.GameObjects.Text;
  /** Что на пергаменте: сила снаряжения или предмет (uid), на который навели. */
  private shownItem: number | null = null;
  private hoveredItem: number | null = null;
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

    addBackground(this, BG_BACKPACK_KEY);
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

    // «Вне сумок» — внутренность сундука на фоне; подпись и страницы — на крышке.
    const s = L.stash;
    addText(this, L.stashTitle.x, L.stashTitle.y, 'Вне сумок — в бою не участвуют', 24, C.text, {
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    // Страницы «вне сумок»: стрелки видны, только когда вещей больше, чем влезает.
    const nav = L.stashNav;
    const pageText = addText(this, nav.pageX, nav.y, '', 22, C.text, { stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5);
    const prev = new Button(this, nav.prevX, nav.y, nav.w, nav.h, '◀', () => this.view.turnStashPage(-1), 24);
    const next = new Button(this, nav.nextX, nav.y, nav.w, nav.h, '▶', () => this.view.turnStashPage(1), 24);
    const showPages = (page: number, count: number) => {
      const many = count > 1;
      pageText.setText(many ? `стр. ${page + 1} из ${count}` : '');
      prev.setVisible(many).setEnabled(page > 0);
      next.setVisible(many).setEnabled(page < count - 1);
    };

    // Пергамент: «Сила снаряжения»; при наведении на предмет вместо неё — предмет. Числа — значками,
    // полные фразы — в подсказке при наведении на значок. Пока мышь на пергаменте, предмет не пропадает.
    this.panelObjs = [];
    this.shownItem = null;
    this.hoveredItem = null;
    this.tip = addText(this, 0, 0, '', 20, C.text, {
      backgroundColor: 'rgba(20,18,26,0.95)',
      padding: { x: 12, y: 8 },
      wordWrap: { width: PANEL.tipW },
      lineSpacing: 3,
    })
      .setOrigin(0.5, 1)
      .setDepth(100)
      .setVisible(false);
    const onPanel = (p: Phaser.Input.Pointer) => {
      const r = L.power;
      return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
    };
    // Мышь ушла с предмета: описание ждёт FEEL.backpackInfoKeepMs, чтобы успеть довести мышь до пергамента
    // (между сеткой и пергаментом — пустое место). Дошла — держится, пока мышь на пергаменте.
    let leftAt = 0;
    let entered = false;
    const stillItem = () => this.shownItem !== null && this.hoveredItem === null;
    const check = (p: Phaser.Input.Pointer) => {
      if (!stillItem()) return;
      if (onPanel(p)) entered = true;
      else if (entered || this.time.now - leftAt > FEEL.backpackInfoKeepMs) this.showPanel(null);
    };
    this.input.on('pointermove', check);
    const itemLeft = () => {
      leftAt = this.time.now;
      entered = false;
      this.time.delayedCall(FEEL.backpackInfoKeepMs + 20, () => check(this.input.activePointer));
    };
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
        frame: itemRarityFrame(it.id),
      }),
      describe: (it) => describeOwnedItem(it, this.power.powers, run.items),
      onHover: (_t, it) => {
        this.hoveredItem = it?.uid ?? null;
        if (it) this.showPanel(it.uid);
        else itemLeft();
      },
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
      linkHover: true,
      // Превью связей: связи перетаскиваемого предмета там, куда его кладут.
      previewLinks: (it, col, row, rotated) => {
        const moved = { ...it, inGrid: true, col, row, rotated };
        const { effects } = computePower(run.items.map((i) => (i.uid === it.uid ? moved : i)));
        return pairLinks(effects).filter((l) => l.a === it.uid || l.b === it.uid);
      },
    }).setDepth(10);
    this.refresh();

    const home = L.home;
    new Button(this, home.x, home.y, home.w, home.h, 'Вернуться', () => {
      tutorialDone(this, 'bagsHome');
      goto(this, 'Home');
    }, 24);

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
    this.view.setLinks(pairLinks(this.power.effects));

    const inGrid = run.items.filter((i) => i.inGrid).length;
    this.countText.setText(`В сумках: ${inGrid}   Вне сумок: ${run.items.length - inGrid}`);

    // Предмет мог исчезнуть (слияние) — тогда снова сила снаряжения.
    if (this.shownItem !== null && !run.items.some((i) => i.uid === this.shownItem)) this.shownItem = null;
    this.showPanel(this.shownItem);
  }

  // ─── Пергамент ───────────────────────────────────────────────────────────

  /** Пересобрать пергамент: uid — описание предмета, null — сила снаряжения. */
  private showPanel(uid: number | null): void {
    this.shownItem = uid;
    this.tip.setVisible(false);
    for (const o of this.panelObjs) o.destroy();
    this.panelObjs = [];
    const it = uid === null ? undefined : run.items.find((i) => i.uid === uid);
    if (it) this.drawItemInfo(it);
    else this.drawPower();
  }

  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.panelObjs.push(o);
    return o;
  }

  /** При наведении — подсказка над объектом. */
  private withTip<T extends Phaser.GameObjects.Text | Phaser.GameObjects.Rectangle | Phaser.GameObjects.Image>(o: T, hint: string): T {
    o.setInteractive();
    o.on('pointerover', () => {
      const b = o.getBounds();
      this.tip
        .setText(hint)
        .setPosition(Phaser.Math.Clamp(b.centerX, PANEL.tipW / 2 + 20, W - PANEL.tipW / 2 - 20), b.top - 6)
        .setVisible(true);
    });
    o.on('pointerout', () => this.tip.setVisible(false));
    return o;
  }

  /** Плашки слева направо с переносом в пределах пергамента. Возвращает нижний край. */
  private chipRow(y: number, chips: PanelChip[]): number {
    const r = BACKPACK_LAYOUT.power;
    const left = r.x + PANEL.pad;
    const right = r.x + r.w - PANEL.pad;
    let x = left;
    let top = y;
    for (const ch of chips) {
      const t = this.keep(addText(this, 0, 0, ch.value, PANEL.chipFont, ch.color ?? C.text, { fontStyle: 'bold' }).setOrigin(0, 0.5));
      const w = 8 + PANEL.chipIcon + (ch.tag ? PANEL.chipIcon + 4 : 0) + 6 + t.width + 10;
      if (x > left && x + w > right) {
        x = left;
        top += PANEL.chipH + PANEL.chipGap;
      }
      const mid = top + PANEL.chipH / 2;
      const bg = this.keep(this.add.rectangle(x, top, w, PANEL.chipH, 0x2b1d12, 0.85).setOrigin(0));
      let ix = x + 8;
      this.keep(fit(this.add.image(ix + PANEL.chipIcon / 2, mid, ch.icon), PANEL.chipIcon, PANEL.chipIcon));
      ix += PANEL.chipIcon + 4;
      if (ch.tag) {
        this.keep(fit(this.add.image(ix + PANEL.chipIcon / 2, mid, ch.tag), PANEL.chipIcon, PANEL.chipIcon));
        ix += PANEL.chipIcon + 4;
      }
      t.setPosition(ix + 2, mid);
      this.children.bringToTop(t);
      this.withTip(bg, ch.hint);
      x += w + PANEL.chipGap;
    }
    return chips.length ? top + PANEL.chipH : y;
  }

  /** Сила снаряжения: в секунду — урон, блок, лечение, урон себе; отключённые и взрывоопасные предметы. */
  private drawPower(): void {
    const r = BACKPACK_LAYOUT.power;
    const x = r.x + PANEL.pad;
    this.keep(addText(this, x, r.y + 10, 'Сила снаряжения', 30, C.inkAccent, TITLE));
    if (!run.items.some((i) => i.inGrid)) {
      this.keep(addText(this, x, r.y + 60, 'Сумки пусты — положи сюда предметы.', 21, C.inkDim));
      return;
    }
    const g = gearSummary(run.items, this.power);
    const f = (n: number) => n.toFixed(1);
    const passive = 'Считаются пассивные предметы в сумках с учётом соседей; активные (бомбы, эликсиры) сюда не входят.';
    const stat = (icon: StatIconId) => statIconKey(icon);
    const chips: PanelChip[] = [
      { icon: stat('damage'), value: `${f(g.dps)}/с`, hint: `Урон в секунду: ${f(g.dps)}.\n${passive}` },
      { icon: stat('block'), value: `${f(g.blockPerSec)}/с`, hint: `Блок в секунду: ${f(g.blockPerSec)}. Блок поглощает удары врага.\n${passive}` },
      { icon: stat('heal'), value: `${f(g.healPerSec)}/с`, hint: `Лечение в секунду: ${f(g.healPerSec)}.\n${passive}` },
    ];
    if (g.selfPerSec > 0) {
      chips.push({
        icon: stat('self'),
        value: `−${f(g.selfPerSec)}/с`,
        color: C.bad,
        hint: `Урон себе в секунду: ${f(g.selfPerSec)} — столько в среднем ранят героя его же предметы.`,
      });
    }
    let y = this.chipRow(r.y + 58, chips) + 12;
    if (g.disabled.length) {
      const t = this.keep(
        addText(this, x, y, `Отключены: ${g.disabled.map((id) => ITEMS[id].name).join(', ')}`, 21, C.inkBad, {
          fontStyle: 'bold',
          wordWrap: { width: r.w - 2 * PANEL.pad },
        }),
      );
      this.withTip(t, 'Эти предметы в бою не сработают: их отключают соседи или условие заказа. Наведи на предмет, чтобы узнать, кто мешает.');
      y += t.height + 8;
    }
    if (g.explosive.length) {
      this.chipRow(
        y,
        g.explosive.map((e) => {
          const pct = Math.round(e.chance * 100);
          return {
            icon: tagKey('noisy'),
            tag: tagKey('fire'),
            value: `${ITEMS[e.id].name} ${pct}%`,
            color: C.bad,
            hint: `${ITEMS[e.id].name} — шумный предмет рядом с огнём: в бою может взорваться (шанс ${pct}%) и ранить героя. Убери огонь от него.`,
          };
        }),
      );
    }
  }

  /** Предмет: имя и категория, характеристики значками (с соседями), от кого что пришло, отключён ли. */
  private drawItemInfo(it: OwnedItem): void {
    const r = BACKPACK_LAYOUT.power;
    const x = r.x + PANEL.pad;
    const d = ITEMS[it.id];
    const star = starOf(it);
    const name = this.keep(addText(this, x + 40, r.y + 10, `${d.name}${star > 1 ? ` ★${star}` : ''}`, 28, C.inkAccent, TITLE));
    const cat = this.keep(fit(this.add.image(x + 16, name.y + name.height / 2, categoryKey(d.category)), 32, 32));
    this.withTip(cat, `Категория: ${CATEGORY_NAMES[d.category]}`);

    const p = it.inGrid ? this.power.powers.get(it.uid) : undefined;
    const base = p?.base ?? starStats(it.id, star);
    const final = p?.final ?? base;
    // Итог с соседями; где число изменилось — зелёным или красным, а в подсказке — сколько было без соседей.
    const baseChips = itemStatChips(it.id, base, it.charges);
    const chips: PanelChip[] = itemStatChips(it.id, final, it.charges).map((ch) => {
      const was = baseChips.find((b) => b.icon === ch.icon);
      const changed = was && was.value !== ch.value;
      const better = changed && parseFloat(ch.value.replace(/[^\d.]/g, '')) > parseFloat(was.value.replace(/[^\d.]/g, ''));
      return {
        icon: statIconKey(ch.icon),
        tag: ch.tag ? tagKey(ch.tag) : undefined,
        value: ch.value,
        color: ch.icon === 'self' ? C.bad : changed ? (better === (ch.icon !== 'cooldown') ? C.good : C.bad) : C.text,
        hint: changed ? `${ch.hint}\nБез соседей: ${was.value}` : ch.hint,
      };
    });
    let y = this.chipRow(r.y + 58, chips) + 10;

    const line = (text: string, color: string, hint?: string, bold = false) => {
      const t = this.keep(addText(this, x, y, text, 20, color, { fontStyle: bold ? 'bold' : 'normal', wordWrap: { width: r.w - 2 * PANEL.pad } }));
      if (hint) this.withTip(t, hint);
      y += t.height + 4;
    };
    if (!it.inGrid) return line('Вне сумок — в бою не участвует.', C.inkDim);
    if (!p) return;
    for (const e of p.received) {
      const src = run.items.find((i) => i.uid === e.source);
      const srcName = src ? ITEMS[src.id].name : '?';
      line(`• ${srcName}: ${e.label}`, e.good ? C.inkGood : C.inkBad, `Соседство «${e.rule.title}» от предмета «${srcName}».`);
    }
    if (p.blockedBy) line(`Отключён: ${p.blockedBy}`, C.inkBad, 'В бою этот предмет не сработает и не влияет на соседей.', true);
    else if (p.disabled) line('Отключён соседом', C.inkBad, 'В бою этот предмет не сработает и не влияет на соседей. Кто мешает — в строках выше.', true);
    if (p.poisoned) line('Отравлен: лечение ранит', C.inkBad, 'Лечение этого предмета не лечит, а ранит героя.', true);
  }
}
