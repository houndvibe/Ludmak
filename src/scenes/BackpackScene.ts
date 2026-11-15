// Укладка рюкзака: перетаскивание ЛКМ, поворот ПКМ, вне сетки — «вне сумок» (в бою не участвуют).
// Соседство: метки при перетаскивании, серые отключённые предметы, панель «Сила снаряжения».
// Слияние: предмет, отпущенный на такой же предмет того же уровня, становится ★2 / ★3.
import * as Phaser from 'phaser';
import { BACKPACK_LAYOUT, BG_BACKPACK_KEY, categoryKey, HORSE_ART, itemKey, MENU_ART, statIconKey, tagKey, type StatIconId } from '../config/assets';
import { FEEL } from '../config/feel';
import { GridView, type GridLabel, type GridLabels } from '../components/GridView';
import { CATEGORY_NAMES, ITEMS } from '../data/items';
import { canPlace, MASK, type OwnedItem } from '../systems/backpack';
import { computePower, gearSummary, pairLinks, starOf, starStats, type AppliedEffect, type PowerResult } from '../systems/synergy';
import { tutorialAttach, tutorialDone } from '../components/Hints';
import { playMusic, sfx } from '../components/Sound';
import { canBeMain, canMerge, mainItem, mergedPreview, mergeItems, run, setMain } from '../state';
import {
  addBackground,
  addHeader,
  addHorse,
  addPanel,
  addText,
  Button,
  C,
  describeOwnedItem,
  fadeIn,
  fit,
  goto,
  chipsDiff,
  matchChips,
  itemRarityFrame,
  itemStatChips,
  TITLE,
  TIP_DEPTH,
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
/** Текст на тёмной панели «Сила снаряжения»: заголовок бежевым Kurale с обводкой и тенью, второстепенное — приглушённым. */
const INK = { title: MENU_ART.buttonTextColor, dim: '#a89a84' };
const PANEL_TITLE = { ...TITLE, stroke: '#000000', strokeThickness: 3, shadow: { offsetX: 0, offsetY: 2, color: '#000000', blur: 0, fill: true, stroke: true } };
const PANEL = { pad: 16, chipH: 38, chipIcon: 28, chipGap: 8, chipFont: 22, tipW: 440 };

export class BackpackScene extends Phaser.Scene {
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
    // Панель «Сила снаряжения» — наша плашка поверх пергамента на фоне.
    addPanel(this, L.panel.x + L.panel.w / 2, L.panel.y + L.panel.h / 2, L.panel.w, L.panel.h);
    addText(
      this,
      L.hint.x,
      L.hint.y,
      'Перетаскивай мышью, ПКМ — повернуть.\nСоседи усиливают или портят друг друга.\nТакой же предмет поверх — слияние ★.',
      24,
      MENU_ART.buttonTextColor,
      { stroke: '#000000', strokeThickness: 4, lineSpacing: 6 },
    ).setShadow(0, 2, '#000000', 0, true, true);
    this.mainSlot = this.add.container(0, 0).setDepth(11);
    this.mainGlow = null;

    // «Вне сумок» — внутренность сундука на фоне; страницы — на крышке.
    const s = L.stash;
    // Страницы «вне сумок»: стрелки видны, только когда вещей больше, чем влезает.
    const nav = L.stashNav;
    // Сетка сундука — по центру зоны stash (как в GridView): стрелки — по бокам от неё, номер страницы — под ней.
    const sgW = Math.max(1, Math.floor((s.w - 8) / s.cell)) * s.cell;
    const sgH = Math.max(1, Math.floor((s.h - 8) / s.cell)) * s.cell;
    const sgCx = s.x + s.w / 2;
    const sgCy = s.y + s.h / 2;
    const pageText = addText(this, sgCx, sgCy + sgH / 2 + nav.pageGap, '', 22, MENU_ART.buttonTextColor, { ...TITLE, stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5, 0);
    const prev = new Button(this, sgCx - sgW / 2 - nav.gap - nav.w / 2, sgCy, nav.w, nav.h, '◀', () => this.view.turnStashPage(-1), 24);
    const next = new Button(this, sgCx + sgW / 2 + nav.gap + nav.w / 2, sgCy, nav.w, nav.h, '▶', () => this.view.turnStashPage(1), 24);
    const showPages = (page: number, count: number) => {
      const many = count > 1;
      pageText.setText(many ? `${page + 1}/${count}` : '');
      prev.setVisible(many).setEnabled(page > 0);
      next.setVisible(many).setEnabled(page < count - 1);
    };

    // Пергамент: «Сила снаряжения»; при наведении на предмет вместо неё — предмет. Числа — значками,
    // полные фразы — в подсказке при наведении на значок. Пока мышь на пергаменте, предмет не пропадает.
    this.panelObjs = [];
    this.shownItem = null;
    this.hoveredItem = null;
    this.pinnedItem = null;
    this.mergePreview = null;
    this.tip = addText(this, 0, 0, '', 20, C.text, {
      backgroundColor: 'rgba(20,18,26,0.95)',
      padding: { x: 12, y: 8 },
      wordWrap: { width: PANEL.tipW },
      lineSpacing: 3,
    })
      .setOrigin(0.5, 1)
      .setDepth(TIP_DEPTH)
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
    // Мышь ушла с предмета — пергамент возвращается к закреплённому предмету (клик по предмету) или к силе снаряжения.
    const check = (p: Phaser.Input.Pointer) => {
      if (!stillItem() || this.shownItem === this.pinnedItem) return;
      if (onPanel(p)) entered = true;
      else if (entered || this.time.now - leftAt > FEEL.backpackInfoKeepMs) this.showPanel(this.pinnedItem);
    };
    // Клик мимо предметов и пергамента — открепить: снова сила снаряжения.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (p.button !== 0 || over.length > 0 || onPanel(p) || this.pinnedItem === null) return;
      this.pinnedItem = null;
      this.showPanel(null);
    });
    this.input.on('pointermove', check);
    const itemLeft = () => {
      leftAt = this.time.now;
      entered = false;
      this.time.delayedCall(FEEL.backpackInfoKeepMs + 20, () => check(this.input.activePointer));
    };
    this.power = computePower(run.items);
    // В обучении сюда приходят сразу после первой покупки: она последняя по uid и лежит в сундуке.
    const tutorialPurchase = run.items.filter((it) => !it.inGrid).sort((a, b) => b.uid - a.uid)[0] ?? null;
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
      // Клик по предмету — его описание закрепляется на пергаменте.
      onPickUp: (it) => {
        this.pinnedItem = it.uid;
        this.showPanel(it.uid);
      },
      canPlace: (it, rotated, col, row) => canPlace(run.items, it.id, rotated, col, row, it.uid),
      preview: (it, col, row, rotated) => this.previewLabels(it, col, row, rotated),
      // Двойной клик по оружию или щиту — сделать основным (курсор в бою).
      onDoubleClick: (it) => {
        if (!canBeMain(it) || run.mainUid === it.uid) return;
        setMain(it.uid); // снять основное нельзя — только сменить на другое
        sfx(this, 'ui_click');
        this.refresh();
      },
      // Оружие или щит, отпущенные над полем «Основное», — становятся основным (сам предмет остаётся в сумках).
      dropZone: {
        hit: (x, y) => {
          const m = L.mainSlot;
          return x >= m.x && x <= m.x + m.size && y >= m.y && y <= m.y + m.size;
        },
        accept: (it) => canBeMain(it),
        onDrop: (it) => {
          setMain(it.uid);
          sfx(this, 'ui_click');
          this.refresh();
        },
        onHover: (it) => this.mainSlotGlow(!!it),
      },
      canMerge: (a, b) => canMerge(a, b),
      onMerge: (a, b) => mergeItems(a.uid, b.uid),
      // Превью слияния: пергамент показывает цель после слияния, соседи — что у них изменится.
      onMergeHover: (a, b) => {
        this.dragPanelKey = ''; // после превью слияния превью места рисуется заново
        this.mergePreview = a && b ? { dragged: a, target: b } : null;
        if (this.mergePreview) this.drawMergePanel();
        else this.showPanel(this.shownItem);
      },
      mergeLabels: (a, b) => this.mergeNeighborLabels(a, b),
      onChange: () => {
        // Основное убрали из сумок (вне сумок) — оно больше не основное.
        const main = mainItem();
        if (main && !main.inGrid) setMain(null);
        this.refresh();
        tutorialDone(this, 'drag'); // обучение: предмет переложили
        // Отдельный первый шаг засчитывается только за перенос именно покупки из сундука в сумки.
        if (tutorialPurchase?.inGrid) tutorialDone(this, 'stashToBag');
      },
      onStashPages: showPages,
      // Превью перетаскивания закончилось — пергамент снова показывает обычное описание.
      onPreviewOff: () => {
        if (!this.dragPanelKey) return;
        this.dragPanelKey = '';
        this.showPanel(this.shownItem);
      },
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
    new Button(this, home.x, home.y, home.w, home.h, 'ВЕРНУТЬСЯ', () => {
      tutorialDone(this, 'bagsHome');
      goto(this, 'Home');
    }, 32);

    // Обучение: сетка (перетащить, метки), панель «Сила снаряжения», кнопка «Домой».
    const grid = { x: L.grid.x, y: L.grid.y, w: gridW, h: gridH };
    tutorialAttach(this, (id) => {
      if (id === 'stashToBag') {
        if (!tutorialPurchase || tutorialPurchase.inGrid) return 'skip';
        const r = this.view.itemRect(tutorialPurchase.uid);
        return r ? { ...r, drop: grid } : null;
      }
      if (id === 'drag' || id === 'labels') return grid;
      if (id === 'mainWeapon') {
        const m = L.mainSlot;
        return { x: m.x, y: m.labelY - 16, w: m.size, h: m.y + m.size - m.labelY + 16 };
      }
      if (id === 'power') return L.power;
      if (id === 'bagsHome') return { x: home.x - home.w / 2, y: home.y - home.h / 2, w: home.w, h: home.h };
      return null;
    });
  }

  /** Предмет, закреплённый на пергаменте одинарным кликом (null — нет): к нему пергамент возвращается после наведения. */
  private pinnedItem: number | null = null;

  /** Сейчас перетаскиваемый предмет над таким же — пергамент показывает результат слияния. */
  private mergePreview: { dragged: OwnedItem; target: OwnedItem } | null = null;

  /** Рюкзак, как будто слияние уже произошло: перетаскиваемого нет, цель на уровень выше. */
  private mergedItems(dragged: OwnedItem, target: OwnedItem): OwnedItem[] {
    const merged = mergedPreview(dragged, target);
    return run.items.filter((i) => i.uid !== dragged.uid).map((i) => (i.uid === target.uid ? merged : i));
  }

  /** Метки на соседях цели: какие их числа изменятся после слияния (аура амулета ★2 и т. п.). */
  private mergeNeighborLabels(dragged: OwnedItem, target: OwnedItem): Map<number, GridLabel[]> {
    const after = computePower(this.mergedItems(dragged, target));
    const out = new Map<number, GridLabel[]>();
    for (const it of run.items) {
      if (it.uid === dragged.uid || it.uid === target.uid || !it.inGrid) continue;
      const was = this.power.powers.get(it.uid);
      const now = after.powers.get(it.uid);
      if (!was || !now) continue;
      const star = starOf(it);
      const diff = chipsDiff(itemStatChips(it.id, was.final, it.charges, star), itemStatChips(it.id, now.final, it.charges, star));
      if (diff.length) out.set(it.uid, diff.map((d) => ({ text: `${d.name} ${d.was} → ${d.now}`, good: true })));
    }
    return out;
  }

  /** Пергамент во время превью слияния: цель после слияния, значки «было → станет» (итог с соседями). */
  private drawMergePanel(): void {
    const m = this.mergePreview;
    if (!m) return;
    this.tip.setVisible(false);
    for (const o of this.panelObjs) o.destroy();
    this.panelObjs = [];
    const r = BACKPACK_LAYOUT.power;
    const x = r.x + PANEL.pad;
    const t = m.target;
    const merged = mergedPreview(m.dragged, t);
    const d = ITEMS[t.id];
    const star = starOf(t);
    const name = this.keep(addText(this, x + 40, r.y + 10, `${d.name}: ★${star} → ★${star + 1}`, 28, INK.title, PANEL_TITLE));
    this.keep(fit(this.add.image(x + 16, name.y + name.height / 2, categoryKey(d.category)), 32, 32));
    const before = this.power.powers.get(t.uid)?.final ?? starStats(t.id, star);
    const after = computePower(this.mergedItems(m.dragged, t)).powers.get(t.uid)?.final ?? starStats(t.id, star + 1);
    const beforeChips = itemStatChips(t.id, before, t.charges, star);
    const afterChips = itemStatChips(t.id, after, merged.charges, star + 1);
    const pairs = matchChips(beforeChips, afterChips);
    const chips: PanelChip[] = afterChips.map((ch, i) => {
      const was = pairs[i];
      const changed = !was || was.value !== ch.value;
      return {
        icon: statIconKey(ch.icon),
        tag: ch.tag ? tagKey(ch.tag) : ch.icon2 ? statIconKey(ch.icon2) : undefined,
        value: changed && was ? `${was.value} → ${ch.value}` : ch.value,
        color: ch.icon === 'self' ? C.bad : changed ? C.good : C.text,
        hint: changed && was ? `${ch.hint}\nСейчас: ${was.value}` : ch.hint,
      };
    });
    const y = this.chipRow(r.y + 58, chips) + 10;
    this.keep(addText(this, x, y, 'Отпусти — предметы сольются. С учётом соседей.', 20, INK.dim, { wordWrap: { width: r.w - 2 * PANEL.pad } }));
  }

  /** Что изменится, если положить предмет сюда: метки над соседями и сводка над самим предметом. */
  private previewLabels(it: OwnedItem, col: number, row: number, rotated: boolean): GridLabels {
    const moved = { ...it, inGrid: true, col, row, rotated };
    const items = run.items.map((i) => (i.uid === it.uid ? moved : i));
    const power = computePower(items);
    const { effects } = power;
    // Пергамент: перетаскиваемый предмет «если положить сюда» и что он даст соседям (перерисовка — только при смене места).
    const key = `${it.uid}:${col}:${row}:${rotated}`;
    if (key !== this.dragPanelKey) {
      this.dragPanelKey = key;
      this.tip.setVisible(false);
      for (const o of this.panelObjs) o.destroy();
      this.panelObjs = [];
      this.drawItemInfo(moved, power);
    }
    const neighbors = new Map<number, GridLabel[]>();
    const self: GridLabel[] = [];
    for (const e of effects) {
      const label = { text: e.label, good: e.good };
      if (e.source === it.uid && e.target !== it.uid) neighbors.set(e.target, [...(neighbors.get(e.target) ?? []), label]);
      if (e.target === it.uid) self.push(label);
    }
    return { neighbors, self };
  }

  /** Постоянные метки: что каждый предмет в сумках получает от соседей; одинаковые склеиваются в «×N». */
  private staticLabels(): Map<number, GridLabel[]> | null {
    // Каждый эффект от каждого соседа — отдельно: кружки считают их все (два соседа-оружия — два замедления).
    const out = new Map<number, GridLabel[]>();
    for (const e of this.power.effects) out.set(e.target, [...(out.get(e.target) ?? []), { text: e.label, good: e.good }]);
    return out;
  }

  /** Поле «Основное оружие» слева от сетки: картинка выбранного; двойной клик по полю — снять выбор. */
  private mainSlot!: Phaser.GameObjects.Container;
  /** Подсветка поля «Основное», пока над ним держат оружие или щит. */
  private mainGlow: Phaser.GameObjects.Graphics | null = null;

  private mainSlotGlow(on: boolean): void {
    const m = BACKPACK_LAYOUT.mainSlot;
    if (!this.mainGlow) this.mainGlow = this.add.graphics().setDepth(12);
    this.mainGlow.clear();
    if (on) this.mainGlow.fillStyle(0x4caf50, 0.25).fillRect(m.x, m.y, m.size, m.size).lineStyle(4, 0x4caf50, 1).strokeRect(m.x, m.y, m.size, m.size);
  }

  private drawMainSlot(): void {
    const m = BACKPACK_LAYOUT.mainSlot;
    this.mainSlot.removeAll(true);
    const item = mainItem();
    if (!item) setMain(null);
    // Нет основного — красная рамка и предупреждение: парировать нечем.
    const frame = this.add.rectangle(m.x, m.y, m.size, m.size, 0x000000, 0.55).setOrigin(0).setStrokeStyle(3, item ? 0xe0b65a : 0xe05050);
    const label = addText(this, m.x + m.size / 2, m.labelY, 'Основное', 24, item ? MENU_ART.buttonTextColor : C.bad, { ...TITLE, stroke: '#000000', strokeThickness: 4 })
      .setOrigin(0.5)
      .setShadow(0, 2, '#000000', 0, true, true);
    this.mainSlot.add([frame, label]);
    const hint = item
      ? `Основное оружие: ${ITEMS[item.id].name}. Это курсор в бою: им отбиваешь атаки. Сменить — двойной клик по другому оружию или щиту в сумках или перетащи его сюда. Убрать основное из сумок — оно перестанет быть основным.`
      : 'Нечем парировать! Основное оружие не выбрано — в бою не отбить ни одной атаки, курсора на поле не будет. Двойной клик по оружию или щиту в сумках или перетащи его сюда — сделать основным.';
    if (item) {
      // Длинное оружие (меч, кинжал, факел) — по диагонали поля: так оно крупнее и лучше читается.
      const img = this.add.image(m.x + m.size / 2, m.y + m.size / 2, itemKey(item.id));
      const inner = m.size - 20;
      if (img.height / img.width > 1.6) {
        img.setScale((inner * 1.25) / img.height).setAngle(45);
      } else fit(img, inner, inner);
      this.mainSlot.add(img);
    } else {
      this.mainSlot.add(
        addText(this, m.x + m.size / 2, m.y + m.size / 2, 'Нечем\nпарировать', 20, C.bad, { fontStyle: 'bold', align: 'center', stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5),
      );
    }
    // Снять основное нельзя — поле только показывает его и подсказку.
    frame.setInteractive();
    frame.on('pointerover', () => {
      const b = frame.getBounds();
      this.tip.setText(hint).setPosition(Math.max(PANEL.tipW / 2 + 20, b.centerX), b.top - 6).setVisible(true);
    });
    frame.on('pointerout', () => this.tip.setVisible(false));
    this.view.setMain(run.mainUid);
  }

  /** Пересчитать соседство: серые отключённые, постоянные метки, счётчик, панель силы. */
  private refresh(): void {
    this.drawMainSlot();
    this.power = computePower(run.items);
    for (const it of run.items) this.view.setDisabled(it.uid, !!this.power.powers.get(it.uid)?.disabled);
    this.view.setStaticLabels(this.staticLabels());
    this.view.setLinks(pairLinks(this.power.effects));

    // Предмет мог исчезнуть (слияние) — тогда снова сила снаряжения.
    if (this.pinnedItem !== null && !run.items.some((i) => i.uid === this.pinnedItem)) this.pinnedItem = null;
    if (this.shownItem !== null && !run.items.some((i) => i.uid === this.shownItem)) this.shownItem = this.pinnedItem;
    this.showPanel(this.shownItem);
  }

  // ─── Пергамент ───────────────────────────────────────────────────────────

  /** Пересобрать пергамент: uid — описание предмета, null — сила снаряжения. */
  private showPanel(uid: number | null): void {
    if (this.dragPanelKey) return; // пока тащат над сеткой — пергамент занят превью «если положить сюда»
    this.shownItem = uid;
    if (this.mergePreview) return this.drawMergePanel();
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
      const bg = this.keep(this.add.rectangle(x, top, w, PANEL.chipH, 0x0e0c12, 0.55).setOrigin(0).setStrokeStyle(1.5, 0xb7a58a, 0.35));
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
    this.keep(addText(this, x, r.y + 10, 'Сила снаряжения', 30, INK.title, PANEL_TITLE));
    if (!run.items.some((i) => i.inGrid)) {
      this.keep(addText(this, x, r.y + 60, 'Сумки пусты — положи сюда предметы.', 21, INK.dim));
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
        addText(this, x, y, `Отключены: ${g.disabled.map((id) => ITEMS[id].name).join(', ')}`, 21, C.bad, {
          fontStyle: 'bold',
          wordWrap: { width: r.w - 2 * PANEL.pad },
        }),
      );
      this.withTip(t, 'Эти предметы в бою не сработают: их отключают соседи или условие заказа. Наведи на предмет, чтобы узнать, кто мешает.');
      y += t.height + 8;
    }
    if (g.explosive.length) {
      y = this.chipRow(
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
      ) + 8;
    }
    this.drawSynergyList(y);
  }

  /**
   * Соседство в «Силе снаряжения»: «кто получил ← от кого: эффекты»; соседи, давшие предмету одно и то же, — в одной
   * строке через запятую. Зелёная — всё хорошее, красная — всё плохое, жёлтая — смешано. Не влезло — «…и ещё N».
   */
  private drawSynergyList(y: number): void {
    const r = BACKPACK_LAYOUT.power;
    const x = r.x + PANEL.pad;
    const bottom = r.y + r.h - PANEL.pad;
    // Сначала пары «цель — источник», потом склеиваем источники с одинаковым набором эффектов у одной цели.
    // Хорошие и плохие эффекты — отдельными строками: сначала все зелёные, потом все красные.
    const byPair = new Map<string, { target: number; source: number; list: AppliedEffect[] }>();
    for (const e of this.power.effects) {
      if (e.source === e.target) continue;
      const key = `${e.target}:${e.source}:${e.good}`;
      const cur = byPair.get(key) ?? { target: e.target, source: e.source, list: [] };
      cur.list.push(e);
      byPair.set(key, cur);
    }
    const pairs = new Map<string, { target: number; sources: number[]; list: AppliedEffect[] }>();
    for (const p of byPair.values()) {
      const key = `${p.target}|${p.list.map((e) => `${e.good}:${e.label}`).join(';')}`;
      const cur = pairs.get(key);
      if (cur) cur.sources.push(p.source);
      else pairs.set(key, { target: p.target, sources: [p.source], list: p.list });
    }
    if (!pairs.size) return;
    const name = (uid: number) => {
      const it = run.items.find((i) => i.uid === uid);
      return it ? ITEMS[it.id].name : '?';
    };
    const title = this.keep(addText(this, x, y, 'Соседство', 22, INK.title, PANEL_TITLE));
    y += title.height + 2;
    const rows = [...pairs.values()].sort((a, b) => Number(b.list[0].good) - Number(a.list[0].good));
    for (let i = 0; i < rows.length; i++) {
      const p = rows[i];
      const good = p.list.every((e) => e.good);
      const bad = p.list.every((e) => !e.good);
      const t = this.keep(
        addText(this, x, y, `• ${name(p.target)} ← ${p.sources.map(name).join(', ')}: ${p.list.map((e) => e.label).join(', ')}${p.sources.length > 1 ? ` (×${p.sources.length})` : ''}`, 18, good ? C.good : bad ? C.bad : C.accent, {
          wordWrap: { width: r.w - 2 * PANEL.pad },
        }),
      );
      // Последняя строка, что ещё влезает: если дальше есть пары и места нет — вместо неё «…и ещё N».
      if (y + t.height > bottom || (i < rows.length - 1 && y + t.height + 24 > bottom)) {
        t.setText(`…и ещё ${rows.length - i} — наведи на предмет, чтобы увидеть всё`).setColor(INK.dim);
        break;
      }
      this.withTip(t, p.list.map((e) => `«${e.rule.title}»: ${e.label}`).join('\n'));
      y += t.height + 3;
    }
  }

  /** Предмет: имя и категория, характеристики значками (с соседями), от кого что пришло, отключён ли. */
  /** Пергамент сейчас показывает превью перетаскивания для этого места ('' — нет). */
  private dragPanelKey = '';

  /**
   * Описание предмета на пергаменте. preview — расчёт «если положить сюда» (при перетаскивании); что предмет даст соседям —
   * подсказками над ними на сетке.
   */
  private drawItemInfo(it: OwnedItem, preview?: ReturnType<typeof computePower>): void {
    const r = BACKPACK_LAYOUT.power;
    const x = r.x + PANEL.pad;
    const d = ITEMS[it.id];
    const star = starOf(it);
    const name = this.keep(addText(this, x + 40, r.y + 10, `${d.name}${star > 1 ? ` ★${star}` : ''}`, 28, INK.title, PANEL_TITLE));
    const cat = this.keep(fit(this.add.image(x + 16, name.y + name.height / 2, categoryKey(d.category)), 32, 32));
    this.withTip(cat, `Категория: ${CATEGORY_NAMES[d.category]}`);

    const power = preview ?? this.power;
    const p = it.inGrid ? power.powers.get(it.uid) : undefined;
    const base = p?.base ?? starStats(it.id, star);
    const final = p?.final ?? base;
    // Итог с соседями; где число изменилось — зелёным или красным, а в подсказке — сколько было без соседей.
    const baseChips = itemStatChips(it.id, base, it.charges, star);
    const finalChips = itemStatChips(it.id, final, it.charges, star);
    const pairs = matchChips(baseChips, finalChips);
    const chips: PanelChip[] = finalChips.map((ch, i) => {
      const was = pairs[i];
      const changed = was && was.value !== ch.value;
      const better = changed && parseFloat(ch.value.replace(/[^\d.]/g, '')) > parseFloat(was.value.replace(/[^\d.]/g, ''));
      return {
        icon: statIconKey(ch.icon),
        tag: ch.tag ? tagKey(ch.tag) : ch.icon2 ? statIconKey(ch.icon2) : undefined,
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
    if (!it.inGrid) return line('Вне сумок — в бою не участвует.', INK.dim);
    if (!p) return;
    // Сначала хорошие (зелёные), потом плохие (красные) — как в списке «Силы снаряжения».
    for (const e of [...p.received].sort((a, b) => Number(b.good) - Number(a.good))) {
      const src = run.items.find((i) => i.uid === e.source);
      const srcName = src ? ITEMS[src.id].name : '?';
      line(`• ${srcName}: ${e.label}`, e.good ? C.good : C.bad, `Соседство «${e.rule.title}» от предмета «${srcName}».`);
    }
    if (p.blockedBy) line(`Отключён: ${p.blockedBy}`, C.bad, 'В бою этот предмет не сработает и не влияет на соседей.', true);
    else if (p.disabled) line('Отключён соседом', C.bad, 'В бою этот предмет не сработает и не влияет на соседей. Кто мешает — в строках выше.', true);
    if (p.poisoned) line('Отравлен: лечение ранит', C.bad, 'Лечение этого предмета не лечит, а ранит героя.', true);
  }
}
