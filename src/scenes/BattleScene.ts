// Экран боя — отображение над логикой src/systems/battle.ts.
// Слева — Людьмак и его рюкзак (сетка, как собрали ночью): пассивные предметы срабатывают сами,
// активные применяются нажатием на предмет. Справа — враг и его сумка (только просмотр).
import * as Phaser from 'phaser';
import { GridView } from '../components/GridView';
import { BATTLE_LAYOUT, BG_BATTLE_KEY, enemyItemKey, enemyKey, HERO_KEY, HORSE_ART, itemKey, statIconKey, UI_ART, type CursorBlade } from '../config/assets';
import { BATTLE_FAST_SPEED, ENEMY_PATTERN, PARRY_PERK } from '../config/balance';
import { CLIENTS } from '../data/clients';
import { ENEMIES } from '../data/enemies';
import { FEEL } from '../config/feel';
import { tutorialAttach, tutorialBlocking, tutorialDone, tutorialRefresh, type Rect } from '../components/Hints';
import { playMusic, sfx } from '../components/Sound';
import { ITEMS, type ItemId } from '../data/items';
import { enemyName, modifierEffect, MODIFIERS } from '../data/modifiers';
import { BattleSim, type AttackKind, type BattleEvent, type EnemySlot } from '../systems/battle';
import { ENEMY_ITEMS, type EnemyItemId } from '../data/enemyItems';
import { footprint, MASK, rectMask, type OwnedItem } from '../systems/backpack';
import { pairLinks, starOf } from '../systems/synergy';
import { isSlowCircles, dayChain, destroyItem, finalChain, resolveFinal, resolveNight, retreatPenalty, run, spendCharge, type DayOutcome } from '../state';
import {
  addBackground,
  addHorse,
  addModifierBadge,
  addTopBar,
  addText,
  Button,
  C,
  describeEnemyItem,
  describeOwnedItem,
  fadeIn,
  fit,
  goto,
  W,
  addLives,
  addChips,
  type UiChip,
  itemRarityFrame,
  TITLE,
} from '../ui';

const L = BATTLE_LAYOUT;
const BAR_W = 360;

/** Рамка блока у полоски здоровья: части (рамка, значок, число) и показана ли сейчас. */
interface BlockMark {
  parts: Phaser.GameObjects.GameObject[];
  text: Phaser.GameObjects.Text;
  shown: boolean;
}
/** Сколько пикселей проезжает сумка врага при смене врага. */
const BAG_SLIDE = 500;
/** Пауза перед следующим врагом того же заказа, мс. */
const NEXT_ENEMY_DELAY_MS = 600;

export class BattleScene extends Phaser.Scene {
  private sim!: BattleSim;
  private speed = 1;
  private shownStatus: BattleSim['status'] = 'fight';

  private heroView!: GridView<OwnedItem>;
  private enemyView: GridView<EnemySlot> | null = null;
  private heroImg!: Phaser.GameObjects.Image;
  private enemyImg!: Phaser.GameObjects.Image;
  private heroBar!: Phaser.GameObjects.Rectangle;
  /** Блок у полоски здоровья: жёлтая рамка и значок щита с числом — у героя справа, у врага слева. */
  private heroBlock!: BlockMark;
  private enemyBlock!: BlockMark;
  private heroHpText!: Phaser.GameObjects.Text;
  private heroStatus!: Phaser.GameObjects.Text;
  private enemyBar!: Phaser.GameObjects.Rectangle;
  private enemyHpText!: Phaser.GameObjects.Text;
  private enemyName!: Phaser.GameObjects.Text;
  private enemyStatus!: Phaser.GameObjects.Text;
  private modBadge: Phaser.GameObjects.Container | null = null;
  /** Колода за портретом врага: следующие враги того же заказа. */
  private enemyDeck: Phaser.GameObjects.Image[] = [];
  private progressText!: Phaser.GameObjects.Text;
  private conditionText!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private overlay: Phaser.GameObjects.Container | null = null;
  /** uid → предмет героя (событие heroItem несёт только uid, а бомбе нужен звук и тряска). */
  private itemIds = new Map<number, ItemId>();
  /** До какого момента (time.now) бой стоит — стоп-кадр при смерти врага. */
  private hitStopUntil = 0;
  /** Картинки атак врага в окне парирования: id атаки → иконка, кольцо и центр. */
  /** Летящие атаки врага: откуда летит, куда (точка между сетками), текущий радиус зоны клика. */
  private parryIcons = new Map<number, ParryIcon>();
  /** Центр креста каждой серии; где закончился выпад (там появится щит стражника); прицелы пистоля до выстрела. */
  private groupCenters = new Map<number, { x: number; y: number }>();
  /** Траектории выпадов: щит стражника появится в случайной точке траектории своего выпада. */
  private thrustPaths = new Map<number, NonNullable<ParryIcon['path']>>();
  /** Двойной удар копья: отрезок серии (общий для обоих ударов и щита) и его полоса; чей кружок к какой серии относится. */
  private doubleSegs = new Map<number, NonNullable<ParryIcon['path']>>();
  private doubleLines = new Map<number, Phaser.GameObjects.Graphics>();
  /** Под полосой двойного удара — картинка копья вдоль отрезка. */
  private doubleArt = new Map<number, Phaser.GameObjects.Image>();
  /** Крест монаха: отрезки от центра к каждому появившемуся кружку серии (по одному рисунку на серию). */
  private crossLines = new Map<number, Phaser.GameObjects.Graphics>();
  private lineGroupOf = new Map<number, number>();
  /** Где появится мешок разбойника (выбрано, когда появился его кистень): id мешка → точка. */
  private sackSpots = new Map<number, { x: number; y: number }>();
  private aims = new Map<number, { x: number; y: number; g: Phaser.GameObjects.Graphics; start: number; ms: number }>();
  /** Купол Квена над портретом ведьмака. */
  private quenDome: Phaser.GameObjects.Graphics | null = null;
  /** Курсор основного оружия в зоне атак (клинок) и его отбивающая часть; null — основное не клинок или его нет. */
  private sword!: Phaser.GameObjects.Image;
  private blade: CursorBlade | null = null;
  /** Рабочая часть курсора — светлячки вдоль отрезка клинка (tip → bladeEnd) или по кругу щита. */
  private edgeCopies: Phaser.GameObjects.Image[] = [];
  /** Маска обводки клинка: только лезвие (от кончика до bladeEnd), рукоять без обводки. */
  private edgeMask: Phaser.GameObjects.Graphics | null = null;
  private swordShown = false;
  /** Щит-курсор: основное оружие — щит. */
  private shield: Phaser.GameObjects.Image | null = null;
  /** Идущая прокрутка меча (ПКМ) — останавливается новым взмахом или прокруткой. */
  private spinTween: Phaser.Tweens.Tween | null = null;

  constructor() {
    super('Battle');
  }

  /** Бой с финальным боссом (после дня последней ночи): один враг без заказа, здоровье — сколько осталось. */
  private final = false;

  init(data: { final?: boolean }): void {
    this.final = !!data?.final;
  }

  create(): void {
    fadeIn(this);
    playMusic(this, 'music_day');
    const items = run.items.filter((i) => i.inGrid);
    this.itemIds = new Map(items.map((i) => [i.uid, i.id]));
    // Основное оружие — только из сетки; заряды топора переходят из дня в бой с финальным боссом.
    const mainUid = items.some((i) => i.uid === run.mainUid) ? run.mainUid : null;
    this.sim = this.final
      ? new BattleSim({ items, chain: finalChain(), clients: [], night: run.night, heroHp: run.finalHp ?? undefined, mainUid, axeCharges: run.axeCharges, coins: run.coins })
      : new BattleSim({ items, chain: dayChain(), clients: run.accepted.map((c) => c.client), night: run.night, mainUid, coins: run.coins });
    this.speed = 1;
    this.shownStatus = 'fight';
    this.overlay = null;
    this.enemyView = null;
    this.modBadge = null;
    this.hitStopUntil = 0;
    this.parryIcons = new Map();
    this.groupCenters = new Map();
    this.thrustPaths = new Map();
    this.doubleSegs = new Map();
    this.doubleLines = new Map();
    this.doubleArt = new Map();
    this.crossLines = new Map();
    this.lineGroupOf = new Map();
    this.sackSpots = new Map();
    this.aims = new Map();
    this.kick = { x: 0, y: 0 };
    this.kickTween = null;
    this.circleSlow = isSlowCircles() ? FEEL.parry.slowMult : 1;
    this.kickAim = null;
    this.quenDome = null;
    this.createSword();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onBattleClick(p));
    this.linksKey = '';

    addBackground(this, BG_BATTLE_KEY);
    addTopBar(this);
    addText(this, 30, 40, `Ночь ${run.night}`, 30).setOrigin(0, 0.5);
    this.progressText = addText(this, W / 2, 40, '', 30).setOrigin(0.5);
    addLives(this, W - 30, 40);
    // Условие заказчика текущего врага: меняется вместе с заказом.
    this.conditionText = addText(this, L.conditionBanner.x, L.conditionBanner.y, '', 24, C.accent, {
      fontStyle: 'bold',
      backgroundColor: 'rgba(0,0,0,0.7)',
      padding: { x: 14, y: 6 },
    }).setOrigin(0.5);
    // Ускорение — в шапке.
    const sp = L.speed;
    const speedBtn = new Button(this, sp.x, sp.y, sp.w, sp.h, 'Ускорение ×1', () => {
      this.speed = this.speed === 1 ? BATTLE_FAST_SPEED : 1;
      speedBtn.setLabel(`Ускорение ×${this.speed}`);
    }, 22);
    // Подсказка растёт вверх от нижнего края (над строкой подсказок обучения), в промежутке между сетками.
    this.info = addText(this, L.centerX, L.infoBottom, '', 22, C.text, {
      align: 'center',
      wordWrap: { width: 700 },
      backgroundColor: 'rgba(0,0,0,0.75)',
      padding: { x: 10, y: 6 },
    })
      .setOrigin(0.5, 1)
      .setDepth(70);

    // Людьмак: портрет, справа от него имя, здоровье, статусы.
    const hp = L.heroPortrait;
    this.heroImg = fit(this.add.image(hp.x, hp.y, HERO_KEY), hp.w, hp.h);
    const hx = hp.x + hp.w / 2 + 30;
    addText(this, hx, hp.y - 110, 'Людьмак', 36, C.accent, TITLE);
    [this.heroBar, this.heroHpText] = this.makeBar(hx, hp.y - 40);
    this.heroBlock = this.makeBlockMark(hx, hp.y - 40, 'right');
    // Дебафы героя — плашками-тегами со значком (медлительность от щитов), под ними — статусы текстом.
    this.heroDebuffs = this.add.container(0, 0);
    this.debuffKey = '';
    this.debuffPos = { x: hx, y: hp.y };
    this.heroStatus = addText(this, hx, hp.y, '', 24, C.block);

    // Враг: портрет, слева от него имя, здоровье, статусы (выравнивание по правому краю).
    const ep = L.enemyPortrait;
    this.enemyImg = this.add.image(ep.x, ep.y, enemyKey(this.sim.enemy.id)).setDepth(2);
    this.enemyDeck = [];
    const ex = ep.x - ep.w / 2 - 30;
    this.enemyName = addText(this, ex, ep.y - 110, '', 36, C.bad, TITLE).setOrigin(1, 0);
    [this.enemyBar, this.enemyHpText] = this.makeBar(ex - BAR_W, ep.y - 40);
    this.enemyBlock = this.makeBlockMark(ex - BAR_W, ep.y - 40, 'left');
    this.enemyStatus = addText(this, ex, ep.y, '', 24, C.block, { align: 'right' }).setOrigin(1, 0);

    // Подложка рюкзака — лошадь с сумками, сетка героя поверх.
    addHorse(this, L.heroGrid.x, L.heroGrid.y, L.cell);
    this.heroView = new GridView<OwnedItem>(this, {
      x: L.heroGrid.x,
      y: L.heroGrid.y,
      cell: L.cell,
      mask: MASK,
      mode: 'battle',
      cellFillColor: HORSE_ART.cellFillColor,
      cellFillAlpha: HORSE_ART.cellFillAlpha,
      cellLineColor: HORSE_ART.cellLineColor,
      cellLineAlpha: HORSE_ART.cellLineAlpha,
      items: () => items,
      shape: (it) => ({
        w: ITEMS[it.id].w,
        h: ITEMS[it.id].h,
        key: itemKey(it.id),
        star: starOf(it),
        frame: itemRarityFrame(it.id),
      }),
      describe: (it) => describeOwnedItem(it, this.sim.powers, this.sim.items),
      onHover: (t) => this.info.setText(t ?? ''),
      onClick: (it) => {
        if (!this.sim.useActive(it.uid)) return;
        tutorialDone(this, 'useActive');
        this.afterSimChange();
      },
    });
    for (const s of this.sim.slots) if (Number.isFinite(s.charges)) this.heroView.setCharges(s.item.uid, s.charges);
    this.heroView.setMain(this.sim.mainUid);

    this.createLog();
    this.showEnemy();
    this.afterSimChange(); // события начала боя: сгорело, отравлено, взрыв
    this.playIntro();

    // Обучение: как идёт бой (рюкзак героя); если взят огонь — почему он не работает (сам предмет);
    // если есть активный предмет — нажать его. Ненужные шаги пропускаются. Пока шаг на экране, бой на паузе.
    tutorialAttach(this, (id) => {
      if (id === 'battleStart') return { x: L.heroGrid.x, y: L.heroGrid.y, w: MASK.cols * L.cell, h: MASK.rows * L.cell };
      if (id === 'fireBanned') {
        const fire = this.sim.slots.find((s) => s.disabled && s.def.tags.includes('fire'));
        return fire ? this.pieceRect(fire.item) : 'skip';
      }
      if (id === 'useActive') {
        const a = this.sim.actives.find((s) => !s.disabled && s.charges > 0);
        return a ? this.pieceRect(a.item) : 'skip';
      }
      if (id === 'parry') {
        // Шаг ждёт первого замаха врага; пока атаки нет — шага не видно, бой идёт. Подсветка — там, где предмет сейчас.
        const last = [...this.parryIcons.values()].pop();
        if (!last) return null;
        const r = last.r * 1.1;
        return { x: last.cont.x - r, y: last.cont.y - r, w: r * 2, h: r * 2 };
      }
      return null;
    });
  }

  /** До какого момента (time.now) идёт вступление — бой стоит. */
  private introUntil = 0;

  /**
   * Вступление боя: камера отъезжает к обычному виду, портреты героя и врага въезжают с боков, по центру — надпись
   * «Ночь N — охота» (у финального боя — «Финальный бой»). Пока идёт — бой стоит.
   */
  private playIntro(): void {
    const B = FEEL.battleIntro;
    this.introUntil = this.time.now + B.introMs;
    const cam = this.cameras.main;
    cam.setZoom(B.fromZoom);
    cam.zoomTo(1, B.introMs, 'Cubic.easeOut');
    for (const [img, dir] of [[this.heroImg, -1], [this.enemyImg, 1]] as const) {
      const x = img.x;
      img.setX(x + dir * B.slidePx).setAlpha(0);
      this.tweens.add({ targets: img, x, alpha: 1, duration: B.introMs, ease: 'Cubic.easeOut' });
    }
    const title = addText(this, W / 2, L.bannerY, this.final ? 'Финальный бой' : `Ночь ${run.night} — охота`, B.titleSize, C.accent, {
      ...TITLE,
      stroke: '#000',
      strokeThickness: 10,
    })
      .setOrigin(0.5)
      .setDepth(95)
      .setScale(1.3)
      .setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({ targets: title, alpha: 0, y: L.bannerY - 40, delay: B.titleMs, duration: 400, onComplete: () => title.destroy() });
  }

  /** Где на экране предмет из рюкзака героя (для подсветки в обучении). */
  private pieceRect(it: OwnedItem): Rect {
    const f = footprint(it.id, it.rotated);
    return { x: L.heroGrid.x + it.col * L.cell, y: L.heroGrid.y + it.row * L.cell, w: f.w * L.cell, h: f.h * L.cell };
  }

  /** Полоски связей соседства в рюкзаке героя: перерисовать, только если соседство изменилось. */
  private linksKey = '';
  private syncLinks(): void {
    const links = pairLinks(this.sim.effects);
    const key = links.map((l) => `${l.a}:${l.b}:${l.kind}`).join(',');
    if (key === this.linksKey) return;
    this.linksKey = key;
    this.heroView.setLinks(links);
  }

  // ─── Парирование ─────────────────────────────────────────────────────────

  /**
   * Атака врага летит из глубины: появляется маленькой и тусклой в своей точке между сетками и за окно парирования
   * вырастает на месте до полного размера (полный размер — удар). Точка — случайная, подальше от уже летящих
   * (чисто визуально, на исход боя не влияет).
   */
  private spawnParryIcon(e: Extract<BattleEvent, { type: 'windup' }>): void {
    const P = FEEL.parry;
    const Q = FEEL.patterns;
    const z = L.parryZone;
    const r = P.size / 2;
    let pos: { x: number; y: number };
    let path: ParryIcon['path'] = null;
    switch (e.kind) {
      case 'thrust': {
        // Выпад: справа налево по прямой, полоса траектории видна заранее.
        const y = Phaser.Math.Between(z.y + r, z.y + z.h - r);
        path = { x0: z.x + z.w - r, y0: y, x1: z.x + r + (z.w - 2 * r) * Q.thrustTo, y1: y };
        pos = { x: path.x0, y };
        break;
      }
      case 'double': {
        // Двойной удар копья: жёлтый отрезок (уже проявился заранее); первый удар — на левом конце, второй — на правом.
        const seg = this.doubleSegs.get(e.group!) ?? this.telegraph(e.group!, 0);
        pos = e.index === 0 ? { x: seg.x1, y: seg.y1 } : { x: seg.x0, y: seg.y0 };
        this.thrustPaths.set(e.id, seg);
        this.lineGroupOf.set(e.id, e.group!);
        break;
      }
      case 'guard':
      {
        // Щит — в случайной точке жёлтой траектории выпада (полоса двойного удара висит, пока щит на поле).
        const tp = e.from !== null ? this.thrustPaths.get(e.from) : undefined;
        const lg = e.from !== null ? this.lineGroupOf.get(e.from) : undefined;
        if (lg !== undefined) this.lineGroupOf.set(e.id, lg);
        const k = Math.random();
        pos = tp ? { x: Phaser.Math.Linear(tp.x0, tp.x1, k), y: Phaser.Math.Linear(tp.y0, tp.y1, k) } : this.freeSpot();
      }
        break;
      case 'cross': {
        // Крест как на распятии: c — перекрестье (новое у каждой серии); верх короткий, низ длинный, поперечина — в верхней
        // части. Точки — верх, низ, лево, право; ко второй точке отрезок растёт от первой, к четвёртой — от третьей.
        let c = this.groupCenters.get(e.group!);
        if (!c) {
          const R = Q.crossR;
          const xs = CROSS_ORDER.map(([dx]) => dx * R);
          const ys = CROSS_ORDER.map(([, dy]) => dy * R);
          c = {
            x: Phaser.Math.Between(z.x + r - Math.min(...xs), z.x + z.w - r - Math.max(...xs)),
            y: Phaser.Math.Between(z.y + r - Math.min(...ys), z.y + z.h - r - Math.max(...ys)),
          };
          this.groupCenters.set(e.group!, c);
        }
        const at = (i: number) => {
          const [dx, dy] = CROSS_ORDER[i % CROSS_ORDER.length];
          return { x: c!.x + dx * Q.crossR, y: c!.y + dy * Q.crossR };
        };
        pos = at(e.index);
        if (e.index % 2 === 1) this.growCrossArm(e.group!, at(e.index - 1), pos);
        break;
      }
      case 'sack':
        pos = this.sackSpots.get(e.id) ?? this.freeSpot();
        this.sackSpots.delete(e.id);
        break;
      case 'aim': {
        const a = this.aims.get(e.id);
        a?.g.destroy();
        this.aims.delete(e.id);
        pos = a ? { x: a.x, y: a.y } : this.freeSpot();
        break;
      }
      default:
        pos = this.freeSpot();
    }
    const cont = this.add.container(pos.x, pos.y).setDepth(60);
    const glow = this.add.circle(0, 0, r * 0.95, P.glow, P.glowAlpha);
    // Бегство разбойника — его портрет; остальное — картинка предмета.
    // Щит стражника — картинка его ростового щита (кружок принадлежит копью, но бить надо по щиту).
    const guardItem = this.sim.enemy.slots.find((s) => s.stats.guardMult)?.def.id;
    const key =
      e.kind === 'escape'
        ? enemyKey(this.sim.enemy.id)
        : e.kind === 'guard' && guardItem
          ? enemyItemKey(guardItem)
          : L.parryIconOverride ?? enemyItemKey(e.item);
    const img = fit(this.add.image(0, 0, key), P.size, P.size);
    cont.add([glow, img]);
    const ring = this.add.graphics().setDepth(61);
    // Заливка внутри кольца — под чёрным кругом с предметом (сам круг с картинкой поверх неё, линия кольца — поверх всего).
    const fill = this.add.graphics().setDepth(59.5);
    const sackPair = e.kind !== 'sack' && e.partner !== null;
    const line = path || sackPair ? this.add.graphics().setDepth(59) : null;
    if (line && path) line.lineStyle(4, Q.lineColor, Q.thrustLineAlpha).lineBetween(path.x0, path.y0, path.x1, path.y1);
    const icon: ParryIcon = { cont, img, ring, fill, x: pos.x, y: pos.y, r, kind: e.kind, item: e.item, path, line, locked: false };
    this.parryIcons.set(e.id, icon);
    if (line && sackPair) {
      // Кистень разбойника: место мешка выбрано сразу, к нему за время ожидания растёт отрезок.
      const to = this.freeSpot();
      this.sackSpots.set(e.partner!, to);
      const from = { ...pos };
      this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: Q.sackDelay * 1000 * this.circleSlow,
        onUpdate: (tw) => {
          if (!line.active) return;
          const k = tw.getValue() ?? 1;
          line
            .clear()
            .lineStyle(Q.sackLineWidth, Q.sackLineColor, Q.sackLineAlpha)
            .lineBetween(from.x, from.y, Phaser.Math.Linear(from.x, to.x, k), Phaser.Math.Linear(from.y, to.y, k));
        },
      });
    }
    this.placeParryIcon(icon, 0);
    tutorialRefresh(this); // обучение: первый замах — шаг «Парируй»
  }

  /** Крест: отрезок вырастает от предыдущей точки серии к новой — вертикаль, потом поперечина. */
  private growCrossArm(group: number, c: { x: number; y: number }, to: { x: number; y: number }): void {
    const Q = FEEL.patterns;
    let g = this.crossLines.get(group);
    if (!g) {
      g = this.add.graphics().setDepth(59);
      this.crossLines.set(group, g);
    }
    // Каждая рука — свой рисунок внутри общего (рисуем в отдельный Graphics, чтобы расти независимо).
    const arm = this.add.graphics().setDepth(59);
    const done = g;
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: Q.crossArmMs,
      ease: 'Cubic.easeOut',
      onUpdate: (tw) => {
        if (!arm.active) return;
        const k = tw.getValue() ?? 1;
        arm
          .clear()
          .lineStyle(Q.crossLineWidth, Q.crossLineColor, Q.crossLineAlpha)
          .lineBetween(c.x, c.y, Phaser.Math.Linear(c.x, to.x, k), Phaser.Math.Linear(c.y, to.y, k));
      },
      onComplete: () => {
        if (!arm.active) return;
        arm.destroy();
        if (done.active) done.lineStyle(Q.crossLineWidth, Q.crossLineColor, Q.crossLineAlpha).lineBetween(c.x, c.y, to.x, to.y);
      },
    });
    // Растущая рука гаснет вместе с крестом.
    done.once(Phaser.GameObjects.Events.DESTROY, () => arm.destroy());
  }

  /** Двойной удар копья: жёлтый отрезок серии плавно проявляется за seconds до первого удара. */
  private telegraph(group: number, seconds: number): NonNullable<ParryIcon['path']> {
    const P = FEEL.parry;
    const Q = FEEL.patterns;
    const z = L.parryZone;
    const r = P.size / 2;
    const y = Phaser.Math.Between(z.y + r, z.y + z.h - r);
    const seg = { x0: z.x + z.w - r, y0: y, x1: z.x + r + (z.w - 2 * r) * Q.thrustTo, y1: y };
    this.doubleSegs.set(group, seg);
    // Копьё лежит вдоль отрезка остриём к герою (картинка вертикальная, остриё вверх — поворот на −90°), полоса — поверх.
    const art = this.add.image((seg.x0 + seg.x1) / 2, seg.y0, enemyItemKey('spear')).setDepth(58).setAngle(-90);
    art.setScale(Math.abs(seg.x0 - seg.x1) / art.height);
    const g = this.add.graphics().setDepth(59);
    g.lineStyle(4, Q.lineColor, Q.thrustLineAlpha).lineBetween(seg.x0, seg.y0, seg.x1, seg.y1);
    if (seconds > 0) {
      g.setAlpha(0);
      art.setAlpha(0);
      this.tweens.add({ targets: [g, art], alpha: 1, duration: seconds * 1000 * this.circleSlow, ease: 'Sine.easeOut' });
    }
    this.doubleLines.set(group, g);
    this.doubleArt.set(group, art);
    return seg;
  }

  /** Случайная точка поля подальше от уже летящих атак и прицелов (чисто визуально, на исход боя не влияет). */
  private freeSpot(): { x: number; y: number } {
    const P = FEEL.parry;
    const z = L.parryZone;
    const r = P.size / 2;
    const taken = [...[...this.parryIcons.values()].map((o) => ({ x: o.x, y: o.y })), ...[...this.aims.values()]];
    let best = { x: z.x + z.w / 2, y: z.y + z.h / 2, d: -1 };
    for (let k = 0; k < 16; k++) {
      const x = Phaser.Math.Between(z.x + r, z.x + z.w - r);
      const y = Phaser.Math.Between(z.y + r, z.y + z.h - r);
      const d = Math.min(Infinity, ...taken.map((o) => Math.hypot(o.x - x, o.y - y)));
      if (d > best.d) best = { x, y, d };
      if (d >= P.minGap) break;
    }
    return { x: best.x, y: best.y };
  }

  /** Пистоль целится: красный прицел сжимается в точке будущего выстрела. */
  private spawnAim(id: number, seconds: number): void {
    const pos = this.freeSpot();
    const g = this.add.graphics().setDepth(58);
    this.aims.set(id, { ...pos, g, start: this.time.now, ms: seconds * 1000 * this.circleSlow });
    this.drawAim(id);
  }

  private drawAim(id: number): void {
    const a = this.aims.get(id);
    if (!a) return;
    const P = FEEL.parry;
    const Q = FEEL.patterns;
    const t = Phaser.Math.Clamp((this.time.now - a.start) / Math.max(1, a.ms), 0, 1);
    const R = (P.size / 2) * (Q.aimFrom + (1 - Q.aimFrom) * t);
    a.g.clear().lineStyle(4, Q.aimColor, 0.5 + 0.5 * t).strokeCircle(a.x, a.y, R);
    a.g.lineBetween(a.x - R * 1.25, a.y, a.x - R * 0.5, a.y).lineBetween(a.x + R * 0.5, a.y, a.x + R * 1.25, a.y);
    a.g.lineBetween(a.x, a.y - R * 1.25, a.x, a.y - R * 0.5).lineBetween(a.x, a.y + R * 0.5, a.x, a.y + R * 1.25);
    a.g.fillStyle(Q.aimColor, 0.9).fillCircle(a.x, a.y, 5);
  }

  /** Атака по доле полёта t (0 — только вылетела, 1 — удар): растёт и светлеет с ускорением. */
  private placeParryIcon(icon: ParryIcon, t: number): void {
    const P = FEEL.parry;
    if (icon.path) {
      // Выпад едет по линии (равномерно), кольцо — за ним.
      const k = Phaser.Math.Clamp(t, 0, 1);
      icon.x = Phaser.Math.Linear(icon.path.x0, icon.path.x1, k);
      icon.y = Phaser.Math.Linear(icon.path.y0, icon.path.y1, k);
      icon.cont.setPosition(icon.x, icon.y);
    }
    // Щит стражника — окно короткое, поэтому он сразу полного размера и яркий (не летит из глубины).
    const e = icon.kind === 'guard' ? 1 : Math.pow(Phaser.Math.Clamp(t, 0, 1), P.growPow);
    const s = P.startScale + (1 - P.startScale) * e;
    icon.cont
      .setScale(s)
      .setAlpha(P.startAlpha + (1 - P.startAlpha) * e);
    const v = Math.round(255 * (P.startBright + (1 - P.startBright) * e));
    icon.img.setTint((v << 16) | (v << 8) | v).setAngle(t * P.spinTurns * 360);
    // Золотое кольцо стягивается от ringFrom × полный радиус к полному радиусу — сойдётся в момент удара.
    const R = P.size / 2;
    const rr = R + (R * P.ringFrom - R) * (1 - Phaser.Math.Clamp(t, 0, 1));
    icon.ring.clear();
    icon.fill.clear();
    const ringColor = this.ringColorOf(icon);
    // Зона клика — всё внутри кольца (вместе с его линией): что видишь, туда и бьёшь. Внутри — лёгкая заливка.
    // Кружок, который уже не отбить (мешок после отбитого кистеня), — кольцо в lockedRing раз толще.
    const width = P.ringWidth * (icon.locked ? FEEL.patterns.lockedRing : 1);
    icon.fill.fillStyle(ringColor, P.ringFillAlpha).fillCircle(icon.x, icon.y, rr);
    icon.ring.lineStyle(width, ringColor, 0.45 + 0.55 * t).strokeCircle(icon.x, icon.y, rr);
    icon.r = rr + P.ringWidth / 2;
  }

  /** Каждый кадр: атаки летят по оставшемуся времени окна; отменённые (враг умер) убираются. */
  private syncParryIcons(): void {
    for (const [id, icon] of this.parryIcons) {
      const p = this.sim.pending.find((a) => a.id === id);
      if (p) {
        icon.locked = p.locked;
        this.placeParryIcon(icon, 1 - p.left / p.total);
      } else {
        icon.cont.destroy();
        icon.ring.destroy();
        icon.fill.destroy();
        icon.line?.destroy();
        this.parryIcons.delete(id);
      }
    }
    // Крест гаснет, когда все удары его серии пришли.
    for (const [grp, g] of this.crossLines) {
      if (this.sim.pending.some((p) => p.group === grp)) continue;
      this.crossLines.delete(grp);
      this.tweens.add({ targets: g, alpha: 0, duration: 250, onComplete: () => g.destroy() });
    }
    // Полоса двойного удара гаснет, когда на поле не осталось ни его ударов, ни его щита.
    for (const [grp, g] of this.doubleLines) {
      if ([...this.parryIcons.keys()].some((id) => this.lineGroupOf.get(id) === grp)) continue;
      if (this.sim.pending.some((p) => p.group === grp)) continue; // второй удар ещё не появился
      g.destroy();
      this.doubleArt.get(grp)?.destroy();
      this.doubleArt.delete(grp);
      this.doubleLines.delete(grp);
      this.doubleSegs.delete(grp);
    }
    // Прицелы: отменённые (враг умер) убираются, остальные сжимаются.
    for (const [id, a] of this.aims) {
      if (this.sim.pending.some((p) => p.id === id)) this.drawAim(id);
      else {
        a.g.destroy();
        this.aims.delete(id);
      }
    }
  }

  /**
   * Клик: в зоне атак — взмах меча. Отбивает лезвие: летящая атака засчитана, если её круг касается отрезка лезвия
   * (кончик → конец лезвия, в положении покоя); рукоятью не отбить. Вне зоны (меча не видно) — точка курсора.
   * Касается нескольких — отбивается ближайшая к точке клика (кончику лезвия).
   */
  /** Отскок курсора от прицела пистоля: сдвиг картинки курсора (и точки удара) от мыши, пружинит обратно к нулю. */
  private kick = { x: 0, y: 0 };
  /** Медленные кружки (галочка в меню): во столько раз дольше живут кружки на поле. */
  private circleSlow = 1;
  private kickTween: Phaser.Tweens.Tween | null = null;
  /** Последнее положение мыши — курсор перерисовывается каждый кадр, пока идёт отскок. */
  private lastPointer = { x: 0, y: 0 };

  /** Прицел, от которого отброшен курсор: пока его выстрел не случился, курсор остаётся отброшенным. */
  private kickAim: number | null = null;

  /**
   * Клик по прицелу до выстрела — наказание за поспешность: курсор отшвыривает в самый дальний от прицела угол поля
   * атак. Дальше он снова слушается мыши (со сдвигом) — успел довести обратно и отбить выстрел, значит, заслужил.
   * Как только выстрел случился, курсор сразу возвращается к мыши.
   */
  private aimHit(x: number, y: number): boolean {
    const P = FEEL.parry;
    const Q = FEEL.patterns;
    for (const [id, a] of this.aims) {
      const t = Phaser.Math.Clamp((this.time.now - a.start) / Math.max(1, a.ms), 0, 1);
      const R = (P.size / 2) * (Q.aimFrom + (1 - Q.aimFrom) * t);
      if (Math.hypot(x - a.x, y - a.y) > R) continue;
      const z = L.parryZone;
      const m = Q.aimKickMargin;
      const corners = [
        { x: z.x + m, y: z.y + m },
        { x: z.x + z.w - m, y: z.y + m },
        { x: z.x + m, y: z.y + z.h - m },
        { x: z.x + z.w - m, y: z.y + z.h - m },
      ];
      const far = corners.reduce((b, c) => (Math.hypot(c.x - a.x, c.y - a.y) > Math.hypot(b.x - a.x, b.y - a.y) ? c : b));
      this.kickTween?.stop();
      const to = { x: far.x - this.lastPointer.x, y: far.y - this.lastPointer.y };
      this.kickTween = this.tweens.add({ targets: this.kick, ...to, duration: Q.aimKickOutMs, ease: 'Back.easeOut' });
      this.kickAim = id;
      sfx(this, 'block');
      return true;
    }
    return false;
  }

  /**
   * Где нарисован курсор для мыши m: со сдвигом отброса. Отброшенный курсор не выходит за поле атак — упёрся в край,
   * сдвиг уменьшается (иначе мышь улетела бы за экран раньше, чем курсор дошёл до цели).
   */
  private cursorAt(m: { x: number; y: number }): { x: number; y: number } {
    if (!this.kick.x && !this.kick.y) return { x: m.x, y: m.y };
    const z = L.parryZone;
    const x = Phaser.Math.Clamp(m.x + this.kick.x, z.x, z.x + z.w);
    const y = Phaser.Math.Clamp(m.y + this.kick.y, z.y, z.y + z.h);
    if (!this.kickTween?.isPlaying()) this.kick = { x: x - m.x, y: y - m.y };
    return { x, y };
  }

  private onBattleClick(p: Phaser.Input.Pointer): void {
    // Парирование — правой кнопкой мыши (клинок прокручивается на 360° вокруг рукояти). Левая кнопка ничего не делает.
    if (p.button !== 2) return;
    // Точка удара — где нарисован курсор (с отбросом от прицела). Клик по прицелу — новый отброс, не удар.
    const kicked = !!(this.kick.x || this.kick.y);
    const q = this.cursorAt(p);
    // Без основного оружия (или оно отключено) парировать нельзя. Отброшенный курсор всегда в поле.
    if (!kicked && !this.inParryZone(p)) return;
    const shield = this.shieldMode();
    if (!shield && !this.weaponMode()) return;
    if (this.aimHit(q.x, q.y)) return;
    let blade: Phaser.Geom.Line | null = null;
    this.moveSword(p);
    // Отпечаток курсора в положении покоя — снимаем до взмаха: понадобится, если клик мимо.
    const ghost = shield && this.shield ? this.shield : this.sword;
    const mark = { x: ghost.x, y: ghost.y, angle: shield ? 0 : this.restAngle() };
    if (shield) this.punchShield();
    else {
      blade = this.bladeLine();
      this.spinSword();
    }
    // Щит парирует всей областью: атака засчитана, если её круг касается круга щита.
    const shieldR = shield ? (FEEL.parry.shieldSize / 2) * UI_ART.cursorShield.hitShare : 0;
    let hit: number | null = null;
    let best = Infinity;
    for (const [id, icon] of this.parryIcons) {
      if (icon.locked) continue; // пара: другой кружок уже отбит
      const c = { x: icon.cont.x, y: icon.cont.y };
      const d = blade ? segmentDist(blade, c.x, c.y) : Math.hypot(q.x - c.x, q.y - c.y) - shieldR;
      if (d > icon.r) continue;
      // Задеты несколько — отбивается ближайший к точке клика (кончику), а не к середине клинка:
      // иначе длинный клинок задевал кистень, а целился игрок в мешок.
      const near = Math.hypot(q.x - c.x, q.y - c.y);
      if (near < best) {
        best = near;
        hit = id;
      }
    }
    if (hit === null || !this.sim.parry(hit)) {
      this.missMark(ghost, mark);
      // И силуэт ближайшего кружка, мимо которого ударил, — того размера, что был в момент клика.
      let near: ParryIcon | null = null;
      let nd = Infinity;
      for (const icon of this.parryIcons.values()) {
        const d = Math.hypot(icon.cont.x - q.x, icon.cont.y - q.y);
        if (!icon.locked && d < nd) {
          nd = d;
          near = icon;
        }
      }
      if (near) this.missCircle(near);
      return;
    }
    tutorialDone(this, 'parry');
    this.afterSimChange();
  }

  /** Цвет кольца и заливки: всё, что наносит урон (и снаряды), — красное, щит стражника — жёлтый, мешок — синий, бегство — фиолетовое. */
  private ringColorOf(icon: ParryIcon): number {
    const Q = FEEL.patterns;
    if (icon.kind === 'guard') return Q.guardColor;
    if (icon.kind === 'escape') return Q.escapeColor;
    if (icon.kind === 'sack') return Q.sackColor;
    return FEEL.parry.ringColor;
  }

  /** Кружок отбит: его кольцо (того размера, что было в момент удара) разлетается осколками-дугами того же цвета. */
  private shatterRing(icon: ParryIcon): void {
    const P = FEEL.parry;
    const Q = FEEL.patterns;
    const rr = icon.r - P.ringWidth / 2;
    const color = this.ringColorOf(icon);
    const n = Q.shatterPieces;
    for (let i = 0; i < n; i++) {
      const a0 = (Math.PI * 2 * i) / n;
      const a1 = a0 + (Math.PI * 2) / n - 0.12;
      const mid = (a0 + a1) / 2;
      const g = this.add.graphics().setDepth(61).setPosition(icon.x, icon.y);
      g.lineStyle(P.ringWidth, color, 1).beginPath().arc(0, 0, rr, a0, a1).strokePath();
      const d = Q.shatterDist * Phaser.Math.FloatBetween(0.6, 1);
      this.tweens.add({
        targets: g,
        x: icon.x + Math.cos(mid) * d,
        y: icon.y + Math.sin(mid) * d,
        angle: Phaser.Math.Between(-60, 60),
        alpha: 0,
        duration: Q.shatterMs,
        ease: 'Cubic.easeOut',
        onComplete: () => g.destroy(),
      });
    }
  }

  /** Промах: на месте клика остаётся светлый силуэт курсора и тает (FEEL.parry.miss). */
  private missMark(src: Phaser.GameObjects.Image, at: { x: number; y: number; angle: number }): void {
    const M = FEEL.parry.miss;
    const scale = src === this.shield ? FEEL.parry.shieldSize / Math.max(src.width, src.height) : src.scale;
    const g = this.add
      .image(at.x, at.y, src.texture.key)
      .setOrigin(src.originX, src.originY)
      .setScale(scale)
      .setAngle(at.angle)
      .setTintFill(M.color)
      .setAlpha(M.alpha)
      .setDepth(55);
    this.tweens.add({ targets: g, alpha: 0, delay: M.holdMs, duration: M.fadeMs, onComplete: () => g.destroy() });
  }

  /** Промах: силуэт кружка, по которому не попал, — круг размером с его кольцо в момент клика, тает как отпечаток курсора. */
  private missCircle(icon: ParryIcon): void {
    const M = FEEL.parry.miss;
    const R = icon.r; // зона клика (кольцо) в момент клика
    const g = this.add.graphics().setDepth(55).setPosition(icon.cont.x, icon.cont.y);
    g.fillStyle(M.color, M.alpha * 0.5).fillCircle(0, 0, R).lineStyle(3, M.color, M.alpha * 1.5).strokeCircle(0, 0, R);
    this.tweens.add({ targets: g, alpha: 0, delay: M.holdMs, duration: M.fadeMs, onComplete: () => g.destroy() });
  }

  /** Угол покоя курсора-клинка (UI_ART.cursorWeapons). */
  private restAngle(): number {
    return this.blade?.angle ?? 0;
  }

  /** Отбивающая часть курсора в положении покоя (мир): от кончика до bladeEnd (UI_ART.cursorWeapons). */
  private bladeLine(): Phaser.Geom.Line {
    const S = this.blade!;
    const k = this.sword.scale;
    const a = Phaser.Math.DegToRad(this.restAngle());
    const world = (q: { x: number; y: number }) => {
      const dx = (q.x - S.grip.x) * this.sword.width * k;
      const dy = (q.y - S.grip.y) * this.sword.height * k;
      return { x: this.sword.x + dx * Math.cos(a) - dy * Math.sin(a), y: this.sword.y + dx * Math.sin(a) + dy * Math.cos(a) };
    };
    const t = world(S.tip);
    const e = world(S.bladeEnd);
    return new Phaser.Geom.Line(t.x, t.y, e.x, e.y);
  }

  private inParryZone(p: { x: number; y: number }): boolean {
    const z = L.parryZone;
    return p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h;
  }

  /**
   * Курсор — картинка основного оружия (UI_ART.cursorWeapons): держится за рукоять, вращается вокруг неё, а в покое
   * кончик ровно на курсоре — точка клика. Основное — щит: картинка щита, центр на курсоре. Нет основного — обычная стрелка.
   */
  private createSword(): void {
    const P = FEEL.parry;
    const main = this.sim.slots.find((s) => s.item.uid === this.sim.mainUid);
    this.blade = main && main.def.parryPerk !== 'shield' ? UI_ART.cursorWeapons[main.def.id] ?? null : null;
    const S = this.blade ?? UI_ART.cursorWeapons.steel_sword!;
    this.sword = this.add
      .image(0, 0, itemKey(this.blade && main ? main.def.id : 'steel_sword'))
      .setOrigin(S.grip.x, S.grip.y)
      .setDepth(2500)
      .setVisible(false);
    this.sword.setScale(S.size / this.sword.height).setAngle(S.angle);
    this.swordShown = false;
    this.spinTween = null;
    this.shield =
      main && main.def.parryPerk === 'shield'
        ? fit(this.add.image(0, 0, itemKey(main.def.id)), P.shieldSize, P.shieldSize).setDepth(2500).setVisible(false)
        : null;
    // Обводка рабочей части: копии картинки курсора, залитые цветом и сдвинутые во все стороны, позади самого курсора;
    // у клинка они обрезаны маской по лезвию.
    const E = FEEL.parry.edge;
    const src = this.shield ?? this.sword;
    this.edgeMask = this.blade ? this.make.graphics({}, false) : null;
    const mask = this.edgeMask?.createGeometryMask() ?? null;
    this.edgeCopies = EDGE_DIRS.map(() => {
      const c = this.add.image(0, 0, src.texture.key).setOrigin(src.originX, src.originY).setTintFill(E.color).setAlpha(E.alpha);
      c.setDepth(src.depth - 1).setVisible(false);
      if (mask) c.setMask(mask);
      return c;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.moveSword(p));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.setDefaultCursor('default'));
  }

  /** Меч виден только в зоне атак; там же прячется системный курсор. Рукоять ставится так, чтобы кончик (в покое) был на курсоре. */
  private moveSword(m: { x: number; y: number }): void {
    this.lastPointer = { x: m.x, y: m.y };
    // Курсор рисуется со сдвигом отскока от прицела (сама мышь на месте).
    const kicked = !!(this.kick.x || this.kick.y);
    const p = this.cursorAt(m);
    const S = this.blade ?? UI_ART.cursorWeapons.steel_sword!;
    const shield = this.shieldMode();
    const weapon = this.weaponMode();
    const inField = kicked || this.inParryZone(m); // на поле атак системного курсора нет вовсе — даже когда парировать нечем
    const inZone = inField && (shield || weapon);
    // От рукояти до кончика по картинке (px с учётом масштаба), повёрнуто на угол покоя.
    const k = this.sword.scale;
    const dx = (S.tip.x - S.grip.x) * this.sword.width * k;
    const dy = (S.tip.y - S.grip.y) * this.sword.height * k;
    // Рукоять ставится так, чтобы кончик в покое был на курсоре; прокрутка вращает клинок вокруг рукояти.
    const a = Phaser.Math.DegToRad(S.angle);
    const tx = dx * Math.cos(a) - dy * Math.sin(a);
    const ty = dx * Math.sin(a) + dy * Math.cos(a);
    this.sword.setPosition(p.x - tx, p.y - ty).setVisible(inZone && weapon);
    this.shield?.setPosition(p.x, p.y).setVisible(inZone && shield);
    if (inField !== this.swordShown) {
      this.swordShown = inField;
      this.input.setDefaultCursor(inField ? 'none' : 'default');
    }
  }

  /**
   * Рабочая часть курсора каждый кадр (вместе со взмахом и прокруткой): обводка по силуэту — у клинка только лезвие
   * от кончика до конца лезвия (рукоять не отбивает), у щита — весь щит.
   */
  private drawEdge(): void {
    const E = FEEL.parry.edge;
    const src = this.shield?.visible ? this.shield : this.sword.visible && this.blade ? this.sword : null;
    for (const [i, c] of this.edgeCopies.entries()) {
      if (!src) {
        c.setVisible(false);
        continue;
      }
      const [dx, dy] = EDGE_DIRS[i];
      c.setVisible(true).setPosition(src.x + dx * E.width, src.y + dy * E.width).setScale(src.scaleX, src.scaleY).setAngle(src.angle);
    }
    if (src === this.sword && this.blade && this.edgeMask) {
      const S = this.blade;
      const k = this.sword.scale;
      const a = Phaser.Math.DegToRad(this.sword.angle);
      const world = (q: { x: number; y: number }) => {
        const dx = (q.x - S.grip.x) * this.sword.width * k;
        const dy = (q.y - S.grip.y) * this.sword.height * k;
        return { x: this.sword.x + dx * Math.cos(a) - dy * Math.sin(a), y: this.sword.y + dx * Math.sin(a) + dy * Math.cos(a) };
      };
      const t = world(S.tip);
      const e = world(S.bladeEnd);
      // Маска — широкая полоса вдоль лезвия: за кончиком с запасом, у конца лезвия — ровно по нему.
      const len = Math.hypot(e.x - t.x, e.y - t.y) || 1;
      const ux = (e.x - t.x) / len;
      const uy = (e.y - t.y) / len;
      const w = this.sword.displayWidth;
      const pad = E.width * 3;
      const tx = t.x - ux * pad;
      const ty = t.y - uy * pad;
      this.edgeMask
        .clear()
        .fillStyle(0xffffff)
        .fillPoints(
          [
            new Phaser.Math.Vector2(tx - uy * w, ty + ux * w),
            new Phaser.Math.Vector2(tx + uy * w, ty - ux * w),
            new Phaser.Math.Vector2(e.x + uy * w, e.y - ux * w),
            new Phaser.Math.Vector2(e.x - uy * w, e.y + ux * w),
          ],
          true,
        );
    }
  }

  /** Основное оружие — щит и он работает (не отключён условием заказа или соседом). */
  private shieldMode(): boolean {
    return this.shield !== null && this.sim.mainSlot?.def.parryPerk === 'shield';
  }

  /** Основное оружие — клинок и оно работает. */
  private weaponMode(): boolean {
    return this.blade !== null && !!this.sim.mainSlot;
  }

  /** Удар щитом на клик: толкается вперёд (увеличивается) и возвращается. */
  private punchShield(): void {
    const sh = this.shield;
    if (!sh) return;
    const P = FEEL.parry;
    const base = P.shieldSize / Math.max(sh.width, sh.height);
    this.tweens.killTweensOf(sh);
    sh.setScale(base);
    this.tweens.add({ targets: sh, scale: base * P.shieldPunch, duration: P.shieldPunchMs / 2, yoyo: true, ease: 'Quad.easeOut' });
  }

  /** Парирование (ПКМ): прокрутка на 360° вокруг рукояти с шлейфом — за клинком остаются гаснущие светлые копии. */
  private spinSword(): void {
    const P = FEEL.parry;
    const base = this.restAngle();
    this.tweens.killTweensOf(this.sword);
    this.spinTween?.stop();
    this.sword.setAngle(base);
    let last = -Infinity;
    const ghost = () => {
      const g = this.add
        .image(this.sword.x, this.sword.y, this.sword.texture.key)
        .setOrigin(this.sword.originX, this.sword.originY)
        .setScale(this.sword.scale)
        .setAngle(this.sword.angle)
        .setTint(P.trailTint)
        .setAlpha(P.trailAlpha)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(this.sword.depth - 1);
      this.tweens.add({ targets: g, alpha: 0, duration: P.trailFadeMs, onComplete: () => g.destroy() });
    };
    this.spinTween = this.tweens.addCounter({
      from: 0,
      to: 360,
      duration: P.spinMs,
      ease: 'Cubic.easeInOut',
      onUpdate: (tw) => {
        this.sword.setAngle(base + (tw.getValue() ?? 0));
        this.moveSword(this.lastPointer);
        if (this.time.now - last >= P.trailEveryMs) {
          last = this.time.now;
          ghost();
        }
      },
      onComplete: () => {
        this.sword.setAngle(base);
        this.moveSword(this.lastPointer);
      },
    });
  }

  /** Удар пришёл: парирован — искры, звук, предмет отбит; нет — предмет долетает до портрета героя. */
  private resolveParryIcon(id: number, parried: boolean): void {
    const icon = this.parryIcons.get(id);
    if (!icon) return;
    this.parryIcons.delete(id);
    icon.ring.destroy();
        icon.fill.destroy();
    icon.line?.destroy();
    const P = FEEL.parry;
    const { x, y } = icon.cont;
    if (icon.path) this.thrustPaths.set(id, icon.path); // щит стражника появится на этой траектории
    if (!parried && icon.item === 'cow_pie') this.stain(x, y);
    if (!parried && (icon.kind === 'escape' || icon.kind === 'guard')) {
      // Бегство и щит просто гаснут; пропущенный мешок, как удар, долетает до героя.
      this.tweens.add({
        targets: icon.cont,
        x,
        y,
        alpha: 0,
        scale: icon.cont.scale * 0.6,
        duration: P.knockMs,
        ease: 'Quad.easeIn',
        onComplete: () => icon.cont.destroy(),
      });
      return;
    }
    if (!parried) {
      this.tweens.add({
        targets: icon.cont,
        x: L.heroPortrait.x,
        y: L.heroPortrait.y,
        scale: icon.cont.scale * 0.7,
        duration: P.hitFlyMs,
        ease: 'Quad.easeIn',
        onComplete: () => icon.cont.destroy(),
      });
      return;
    }
    this.shatterRing(icon);
    // Отбит вправо (по ходу взмаха) и вниз, крутится и гаснет.
    this.tweens.add({
      targets: icon.cont,
      x: x + P.knockDist,
      y: y + P.knockDist * 0.8,
      angle: 540,
      scale: icon.cont.scale * 0.45,
      alpha: 0,
      duration: P.knockMs,
      ease: 'Cubic.easeOut',
      onComplete: () => icon.cont.destroy(),
    });
    sfx(this, 'parry');
    this.sparks(x, y);
    this.floatText(x, y - P.size * 0.6, PARRY_TEXT[icon.kind] ?? 'Парировано!', C.accent, P.textSize);
  }

  /** Пропущенная лепёшка: бурая клякса на месте кружка поверх поля — закрывает обзор, клики проходят сквозь. */
  private stain(x: number, y: number): void {
    const S = FEEL.stain;
    const R = (FEEL.parry.size / 2) * S.size;
    const g = this.add.graphics().setDepth(62).setPosition(x, y);
    g.fillStyle(S.color, S.alpha).fillCircle(0, 0, R);
    for (let i = 0; i < 7; i++) {
      const a = (Math.PI * 2 * i) / 7 + Phaser.Math.FloatBetween(-0.3, 0.3);
      const d = R * Phaser.Math.FloatBetween(0.7, 1.05);
      g.fillCircle(Math.cos(a) * d, Math.sin(a) * d, R * Phaser.Math.FloatBetween(0.25, 0.45));
    }
    g.setScale(0.4);
    this.tweens.add({ targets: g, scale: 1, duration: 120, ease: 'Back.easeOut' });
    this.tweens.add({ targets: g, alpha: 0, delay: S.holdMs, duration: S.fadeMs, onComplete: () => g.destroy() });
  }

  /** Купол Квена над портретом ведьмака: золотой пульсирующий круг, пока поднят. */
  private setQuen(on: boolean): void {
    if (!on) {
      const d = this.quenDome;
      this.quenDome = null;
      if (d) this.tweens.add({ targets: d, alpha: 0, scale: 1.3, duration: 250, onComplete: () => d.destroy() });
      return;
    }
    if (this.quenDome) return;
    const Q = FEEL.quen;
    const ep = L.enemyPortrait;
    const g = this.add.graphics().setDepth(3).setPosition(ep.x, ep.y);
    const R = Math.max(ep.w, ep.h) * 0.6;
    g.fillStyle(Q.color, Q.alpha).fillCircle(0, 0, R).lineStyle(6, Q.color, 0.9).strokeCircle(0, 0, R);
    g.setAlpha(0);
    this.tweens.add({ targets: g, alpha: 1, duration: 250 });
    this.tweens.add({ targets: g, scale: 1.05, duration: Q.pulseMs, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.quenDome = g;
  }

  /** Вспышка искр, нарисованная кодом: короткие светлые черточки разлетаются и гаснут. */
  private sparks(x: number, y: number): void {
    const P = FEEL.parry;
    for (let i = 0; i < P.sparks; i++) {
      const a = (Math.PI * 2 * i) / P.sparks + Phaser.Math.FloatBetween(-0.2, 0.2);
      const len = Phaser.Math.Between(12, 28);
      const s = this.add.rectangle(x, y, len, 4, i % 3 === 0 ? 0xffffff : i % 3 === 1 ? 0xfff2b0 : 0xffc04a).setRotation(a).setDepth(65);
      const dist = P.sparkDist * Phaser.Math.FloatBetween(0.6, 1);
      this.tweens.add({
        targets: s,
        x: x + Math.cos(a) * dist,
        y: y + Math.sin(a) * dist,
        alpha: 0,
        scaleX: 0.3,
        duration: P.sparkMs,
        ease: 'Cubic.easeOut',
        onComplete: () => s.destroy(),
      });
    }
  }

  /** Полоска здоровья: x — левый край. */
  /** Рамка блока вокруг полоски здоровья (x — левый край полоски) и значок щита с числом сбоку (side). */
  private makeBlockMark(x: number, y: number, side: 'left' | 'right'): BlockMark {
    const F = FEEL.blockMark;
    const frame = this.add.graphics().setAlpha(0);
    const pad = F.width / 2 + 2;
    frame.lineStyle(F.width, F.color, 1).strokeRect(x - pad, y - 17 - pad, BAR_W + pad * 2, 34 + pad * 2);
    const ix = side === 'right' ? x + BAR_W + F.gap + F.icon / 2 : x - F.gap - F.icon / 2;
    const icon = fit(this.add.image(ix, y, statIconKey('block')), F.icon, F.icon).setAlpha(0);
    const text = addText(this, ix, y + F.icon / 2 - 4, '', F.textSize, '#' + F.color.toString(16).padStart(6, '0'), {
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 4,
    })
      .setOrigin(0.5, 0)
      .setAlpha(0);
    return { parts: [frame, icon, text], text, shown: false };
  }

  /** Показать блок (рамка, значок, число) или спрятать, когда блок кончился. */
  private setBlockMark(m: BlockMark, block: number): void {
    const on = block > 0;
    if (on) m.text.setText(`${block}`);
    if (on === m.shown) return;
    m.shown = on;
    this.tweens.killTweensOf(m.parts);
    this.tweens.add({ targets: m.parts, alpha: on ? 1 : 0, duration: FEEL.blockMark.fadeMs });
  }

  private makeBar(x: number, y: number): [Phaser.GameObjects.Rectangle, Phaser.GameObjects.Text] {
    this.add.rectangle(x, y, BAR_W, 34, 0x000000, 0.7).setOrigin(0, 0.5).setStrokeStyle(2, C.border);
    const bar = this.add.rectangle(x, y, BAR_W, 34, 0xb03a3a).setOrigin(0, 0.5);
    const text = addText(this, x + BAR_W / 2, y, '', 22).setOrigin(0.5);
    return [bar, text];
  }

  /** Портрет, имя, заголовок и сумка текущего врага. Старая сумка уезжает, новая приезжает. */
  private showEnemy(): void {
    const sim = this.sim;
    const { contract, mod } = sim.chain[sim.index];
    const def = ENEMIES[sim.enemy.id];
    this.enemyImg.setTexture(enemyKey(def.id));
    fit(this.enemyImg, L.enemyPortrait.w, L.enemyPortrait.h);
    // Имя с модификатором бывает длинным: уменьшаем шрифт, чтобы не залезть в середину экрана.
    this.enemyName.setFontSize(34).setText(enemyName(def.id, mod));
    if (this.enemyName.width > L.enemyNameMaxW) this.enemyName.setFontSize(Math.floor((34 * L.enemyNameMaxW) / this.enemyName.width));

    // Значок модификатора на углу портрета; подсказка при наведении объясняет эффект.
    this.modBadge?.destroy();
    this.modBadge = null;
    if (mod) {
      const ep = L.enemyPortrait;
      const b = L.modifierBadge;
      const badge = addModifierBadge(this, ep.x + ep.w / 2 + b.dx, ep.y - ep.h / 2 + b.dy, b.r, mod).setDepth(20);
      badge.setInteractive({ useHandCursor: true });
      badge.on('pointerover', () => this.info.setText(`${MODIFIERS[mod].name}: ${modifierEffect(mod)}`));
      badge.on('pointerout', () => this.info.setText(''));
      this.modBadge = badge;
    }
    this.drawEnemyDeck();
    if (this.final) {
      this.progressText.setText(`Финальный бой: ${ENEMIES[def.id].name.toLowerCase()}`);
      this.conditionBase = '';
      this.conditionText.setVisible(false);
    }
    const inContract = sim.chain.filter((c) => c.contract === contract);
    const nth = sim.chain.slice(0, sim.index + 1).filter((c) => c.contract === contract).length;
    const client = this.final ? null : CLIENTS[run.accepted[contract].client];
    if (client) {
    this.progressText.setText(`Заказ ${contract + 1}/${run.accepted.length}: ${client.name} · враг ${nth} из ${inContract.length}`);
    this.conditionBase = `Заказ ${client.genitive}: ${client.condition.title.toLowerCase()}`;
    this.setConditionText(this.conditionLine());
    }

    const old = this.enemyView;
    if (old) {
      this.tweens.add({ targets: old, x: old.x + BAG_SLIDE, alpha: 0, duration: 350, ease: 'Cubic.easeIn', onComplete: () => old.destroy() });
    }
    const x = L.enemyGrid.right - def.bagCols * L.cell;
    const view = new GridView<EnemySlot>(this, {
      x: old ? x + BAG_SLIDE : x,
      y: L.enemyGrid.y,
      cell: L.cell,
      mask: rectMask(def.bagCols, def.bagRows),
      mode: 'view',
      items: () => sim.enemy.slots,
      shape: (s) => ({ w: s.def.w, h: s.def.h, key: enemyItemKey(s.def.id) }),
      describe: (s) => `${s.def.name}: ${describeEnemyItem(s.def.id, mod)}${s.boost ? ` · от подковы +${Math.round(s.boost * 100)}% (уже в уроне)` : ''}`,
      onHover: (t) => this.info.setText(t ?? ''),
    });
    if (old) {
      view.setAlpha(0);
      this.tweens.add({ targets: view, x, alpha: 1, duration: 400, delay: 200, ease: 'Cubic.easeOut' });
    }
    for (const s of sim.enemy.slots) view.setCharges(s.uid, Number.isFinite(s.charges) ? s.charges : null);
    this.enemyView = view;
    this.setQuen(false);
    this.refresh();
  }

  update(_time: number, delta: number): void {
    // Выстрел, от прицела которого отброшен курсор, случился — курсор сразу возвращается к мыши.
    if (this.kickAim !== null && !this.sim.pending.some((a) => a.id === this.kickAim)) {
      this.kickAim = null;
      this.kickTween?.stop();
      this.kickTween = null;
      this.kick = { x: 0, y: 0 };
      this.moveSword(this.lastPointer);
    }
    if (this.kick.x || this.kick.y) this.moveSword(this.lastPointer); // отброшенный курсор едет и без движения мыши
    this.drawEdge();
    if (this.sim.status !== 'fight') return;
    if (this.time.now < this.introUntil) return; // вступление: бой ещё не начался
    if (this.time.now < this.hitStopUntil) return; // стоп-кадр: бой замер на мгновение
    if (tutorialBlocking(this)) return; // обучение: пока открыт шаг, бой на паузе
    // Окна парирования идут в реальном времени: ускорение на них не влияет.
    // Медленные кружки (галочка в меню): окна парирования и серии идут в circleSlow раз медленнее.
    this.sim.step((delta / 1000) * this.speed, delta / 1000 / this.circleSlow);
    this.afterSimChange();
  }

  /** Нарисовать события боя и среагировать на смену статуса. */
  private afterSimChange(): void {
    for (const e of this.sim.drain()) {
      this.logEvent(e); // до showEvent: удар ещё знает свой кружок (что прилетело)
      this.showEvent(e);
    }
    this.syncParryIcons();
    this.syncLinks();
    this.refresh();
    const status = this.sim.status;
    if (status === this.shownStatus) return;
    this.shownStatus = status;
    if (status === 'enemyDown' || status === 'won') this.onEnemyDeath();
    if (status === 'enemyDown') {
      // Внутри заказа следующий враг выходит сам; пауза с выбором — только на привале между заказами.
      if (this.sim.nextIsNewContract) this.showPause();
      else this.time.delayedCall(NEXT_ENEMY_DELAY_MS, () => this.nextEnemy());
    } else if (status === 'won') {
      if (this.final) this.finishFinal(true);
      else this.finish({ kind: 'win', defeated: this.sim.defeated, stolen: this.sim.stolen, parryGoals: this.sim.parryGoals, heroHp: this.sim.heroHp }, 'Все заказы выполнены');
    } else if (status === 'lost') {
      sfx(this, 'hero_death');
      if (this.final) this.finishFinal(false);
      else this.finish({ kind: 'death', defeated: this.sim.defeated, stolen: this.sim.stolen, parryGoals: this.sim.parryGoals }, 'Людьмак пал в бою');
    }
  }

  /** Враг повержен: стоп-кадр, звук, баннер «Победа над …», а если это был последний враг заказа — «Заказ выполнен». */
  private onEnemyDeath(): void {
    const sim = this.sim;
    this.hitStopUntil = this.time.now + FEEL.hitStopMs;
    sfx(this, 'enemy_death');
    const link = sim.chain[sim.index];
    this.banner(`Победа над: ${enemyName(link.enemy, link.mod).toLowerCase()}`, C.text, 0);
    if (!sim.enemy.escaped) this.log(`Повержен: ${enemyName(link.enemy, link.mod)}`, C.accent);
    if (!this.final && (sim.status === 'won' || sim.nextIsNewContract)) {
      this.time.delayedCall(FEEL.banner.staggerMs, () => sfx(this, 'contract_done'));
      this.banner('Заказ выполнен', C.good, FEEL.banner.staggerMs);
    }
  }

  /** Короткий баннер посередине: всплывает и тает, игру не останавливает. */
  private banner(text: string, color: string, delay: number): void {
    const t = addText(this, L.centerX, L.bannerY, text, FEEL.banner.size, color, { ...TITLE, stroke: '#000', strokeThickness: 8 })
      .setOrigin(0.5)
      .setDepth(75)
      .setAlpha(0);
    const half = FEEL.banner.durationMs / 2;
    this.tweens.add({ targets: t, alpha: 1, y: L.bannerY - 20, duration: half * 0.4, delay });
    this.tweens.add({ targets: t, alpha: 0, y: L.bannerY - 60, duration: half, delay: delay + half, onComplete: () => t.destroy() });
  }

  /** Тряска камеры (только сильные удары по герою и взрывы). */
  private shake(intensity: number, ms: number): void {
    this.cameras.main.shake(ms, intensity);
  }

  // ─── Журнал боя ──────────────────────────────────────────────────────────

  /** Журнал боя справа внизу: строки снизу вверх, старые гаснут и уходят. */
  private logBox!: Phaser.GameObjects.Container;
  private logLines: Phaser.GameObjects.Text[] = [];
  /** Чем ударил враг последним (для строки урона по герою): имя предмета или «…» у бегства, мешка. */
  private lastHit = '';

  private createLog(): void {
    const G = L.log;
    this.logLines = [];
    if (!this.final) run.battleLog = []; // журнал дня — для итогов ночи
    this.lastHit = '';
    this.logBox = this.add.container(G.x, G.y).setDepth(50);
    this.logBox.add(this.add.rectangle(0, 0, G.w, G.h, 0x000000, G.alpha).setOrigin(0).setStrokeStyle(1, C.border));
  }

  /** Новая строка журнала: снизу; лишние сверху удаляются, верхние тусклее. */
  private log(text: string, color: string): void {
    const G = L.log;
    if (!this.final) run.battleLog.push({ text, color });
    const t = addText(this, G.pad, 0, text, G.size, color, { wordWrap: { width: G.w - 2 * G.pad } });
    this.logBox.add(t);
    this.logLines.push(t);
    while (this.logLines.length > G.lines) this.logLines.shift()!.destroy();
    let y = G.h - G.pad;
    for (let i = this.logLines.length - 1; i >= 0; i--) {
      const line = this.logLines[i];
      y -= line.height;
      // Не влезла в полосу (длинные строки переносятся) — старые сверху убираем.
      if (y < G.pad / 2) {
        this.logLines.splice(0, i + 1).forEach((l) => l.destroy());
        break;
      }
      line.setY(y).setAlpha(1 - (this.logLines.length - 1 - i) * G.fade);
      y -= 2;
    }
  }

  /** Важное из событий боя — в журнал: удары с числами, парирования, лечение, блок, особые события. */
  private logEvent(e: BattleEvent): void {
    const foe = () => enemyName(this.sim.enemy.id, this.sim.enemy.mod);
    switch (e.type) {
      case 'strike': {
        const icon = this.parryIcons.get(e.id);
        if (!icon) break;
        const name = icon.kind === 'escape' ? 'бегство' : icon.kind === 'guard' ? 'щит' : ENEMY_ITEMS[icon.item].name;
        this.lastHit = ENEMY_ITEMS[icon.item].name;
        if (e.parried) this.log(`Отбито: ${name.toLowerCase()}`, C.good);
        break;
      }
      case 'enemyHit': {
        const what = e.item ? ITEMS[e.item].name : 'Бомба';
        if (e.quen) this.log(`${what} → Квен поглотил`, C.dim);
        else if (e.taken > 0 || e.absorbed > 0)
          this.log(`${what} → ${foe()} −${e.taken}${e.absorbed ? ` (блок ${e.absorbed})` : ''}${e.guarded ? ' (в щит)' : ''}`, C.text);
        break;
      }
      case 'heroHit':
        if (e.self) this.log(`Самоурон −${e.taken}`, C.bad);
        else if (e.taken > 0 || e.absorbed > 0) this.log(`${this.lastHit || 'Удар'}: −${e.taken}${e.absorbed ? ` (блок ${e.absorbed})` : ''}`, C.bad);
        break;
      case 'heroHeal':
        if (e.amount > 0) this.log(`Лечение +${e.amount}`, C.good);
        break;
      case 'enemyHeal':
        if (e.amount > 0) this.log(`${foe()} лечится +${e.amount}`, C.accent);
        break;
      case 'heroBlock':
        this.log(`Блок +${e.amount}`, C.good);
        break;
      case 'stun':
        this.log(`${foe()} оглушён на ${e.seconds} с`, C.accent);
        break;
      case 'steal':
        this.log(`Украдено ${e.wallet + e.reward} мон.${e.reward ? ' (из награды)' : ''}`, C.accent);
        break;
      case 'refund':
        this.log(`Возвращено ${e.wallet + e.reward} мон.`, C.accent);
        break;
      case 'guardBroken':
        this.log(`Щит сбит на ${e.seconds} с`, C.accent);
        break;
      case 'guardUp':
        this.log('Щит поднят', C.accent);
        break;
      case 'ritual':
        this.log(e.broken ? 'Ритуал сорван' : 'Ритуал прошёл — вода освящена', C.accent);
        break;
      case 'escaped':
        this.log(`${e.name} сбежал`, C.accent);
        break;
      case 'quen':
        this.log(e.on ? 'Квен поднят' : 'Квен спал', C.accent);
        break;
      case 'reflect':
        this.log(`Бомба вернулась: ${foe()} −${e.damage}`, C.accent);
        break;
      case 'heroStun':
        this.log(`Людьмак оглушён на ${e.seconds} с`, C.accent);
        break;
      case 'enemyMiss':
        this.log(`${e.name}: промах`, C.dim);
        break;
      case 'dodge':
        this.log(`${e.name} уклонился: ${e.item.toLowerCase()}`, C.accent);
        break;
    }
  }

  private showEvent(e: BattleEvent): void {
    const F = FEEL.float;
    switch (e.type) {
      case 'heroItem': {
        this.heroView.flash(e.uid);
        if (e.active) this.floatText(L.centerX, L.itemNameY, e.name, C.accent, 30);
        const id = this.itemIds.get(e.uid);
        if (e.active && id && ITEMS[id].tags.includes('bomb')) {
          sfx(this, 'bomb');
          this.shake(FEEL.shake.explosionIntensity, FEEL.shake.explosionMs);
        }
        break;
      }
      case 'heroCharge':
        spendCharge(e.uid); // расходник тратится навсегда
        this.heroView.setCharges(e.uid, e.left);
        if (e.left <= 0) {
          this.heroView.removePiece(e.uid);
          sfx(this, 'item_vanish');
        }
        break;
      case 'enemyItem':
        this.enemyView?.flash(e.uid);
        this.floatText(L.centerX, L.itemNameY, e.name, C.bad, 30);
        break;
      case 'enemyCharge':
        this.enemyView?.setCharges(e.uid, e.left);
        if (e.left <= 0) this.enemyView?.removePiece(e.uid);
        break;
      case 'enemyHit':
        if (e.absorbed > 0) {
          this.floatText(L.floatEnemyX, L.floatY + 60, `блок ${e.absorbed}`, F.block);
          sfx(this, 'block');
        }
        if (e.taken > 0) {
          this.floatNumber(L.floatEnemyX, `−${e.taken}`, e.buffed || e.firstStrike ? F.buffedDamage : F.enemyDamage, e.taken);
          this.hitFx(this.enemyImg, L.enemyPortrait.x);
          // Клинок героя (оружие без огня: меч, кинжал, топор, серп) звенит, остальное — обычный удар.
          const d = e.item ? ITEMS[e.item] : null;
          sfx(this, d && d.category === 'weapon' && !d.tags.includes('fire') ? 'sword_hit' : 'hit_enemy');
        }
        if (e.firstStrike) this.floatText(L.floatEnemyX, L.floatY + 60, 'удар из тишины', F.buffedDamage, 26);
        if (e.halved) this.floatText(L.floatEnemyX, L.floatY + 110, 'урон вполовину', C.dim, 22);
        if (e.guarded) this.floatText(L.floatEnemyX, L.floatY + 160, 'в щит', C.dim, 22);
        if (e.quen) this.floatText(L.floatEnemyX, L.floatY + 60, 'Квен', F.block, 26);
        break;
      case 'heroHit':
        if (e.absorbed > 0) {
          this.floatText(L.floatHeroX, L.floatY + 60, `блок ${e.absorbed}`, F.block);
          sfx(this, 'block');
        }
        if (e.taken > 0) {
          this.floatNumber(L.floatHeroX, `−${e.taken}`, e.self ? F.selfDamage : F.heroDamage, e.taken);
          this.hitFx(this.heroImg, L.heroPortrait.x);
          sfx(this, e.self ? 'self_damage' : 'hit_hero');
          if (!e.self && e.taken >= FEEL.shake.heroHitThreshold) this.shake(FEEL.shake.heroHitIntensity, FEEL.shake.heroHitMs);
        }
        break;
      case 'heroHeal':
        this.floatNumber(L.floatHeroX, `+${e.amount}`, F.heal, e.amount);
        sfx(this, 'heal');
        break;
      case 'enemyHeal':
        this.floatNumber(L.floatEnemyX, `+${e.amount}`, F.heal, e.amount);
        sfx(this, 'heal');
        break;
      case 'heroBlock':
        this.floatText(L.floatHeroX, L.floatY + 60, `+${e.amount} блок`, F.block);
        sfx(this, 'block');
        break;
      case 'enemyBlock':
        this.floatText(L.floatEnemyX, L.floatY + 60, `+${e.amount} блок`, F.block);
        sfx(this, 'block');
        break;
      case 'stun':
        this.floatText(L.floatEnemyX, L.floatY + 60, `оглушён ${e.seconds} с`, F.block);
        sfx(this, 'stun');
        break;
      case 'buff':
        this.floatText(L.floatHeroX, L.floatY + 60, `оружие ×${e.mult}`, C.accent);
        break;
      case 'steal':
        // Мешок не отбит: монеты уходят из кошелька сразу (пуст — из награды заказа).
        this.enemyView?.flash(e.uid);
        run.coins = Math.max(0, run.coins - e.wallet);
        if (e.wallet) this.floatText(L.floatHeroX, L.floatY + 120, `−${e.wallet} мон.`, C.bad, 30);
        if (e.reward) this.floatText(L.floatHeroX, L.floatY + 160, `−${e.reward} мон. из награды`, C.accent, 24);
        sfx(this, 'item_vanish');
        break;
      case 'refund':
        run.coins += e.wallet;
        this.floatText(L.floatHeroX, L.floatY + 120, `+${e.wallet + e.reward} мон. возвращено`, C.good, 28);
        break;
      case 'guardBroken':
        this.floatText(L.floatEnemyX, L.floatY + 60, 'щит сбит!', C.good, 34);
        sfx(this, 'block');
        break;
      case 'guardUp':
        this.floatText(L.floatEnemyX, L.floatY + 60, 'щит поднят', C.dim, 26);
        break;
      case 'ritual':
        this.floatText(L.floatEnemyX, L.floatY + 60, e.broken ? 'ритуал сорван' : 'вода освящена!', e.broken ? C.good : C.bad, 30);
        break;
      case 'escaped':
        this.banner(`${e.name} сбежал`, C.bad, 0);
        break;
      case 'quen':
        this.setQuen(e.on);
        this.floatText(L.floatEnemyX, L.floatY + 60, e.on ? 'Квен!' : 'Квен спал', e.on ? C.bad : C.good, 32);
        break;
      case 'reflect':
        this.floatText(L.floatEnemyX, L.floatY - 60, 'бомба вернулась!', C.good, 32);
        sfx(this, 'bomb');
        this.shake(FEEL.shake.explosionIntensity, FEEL.shake.explosionMs);
        break;
      case 'heroStun':
        this.floatText(L.floatHeroX, L.floatY + 60, `оглушён ${e.seconds} с`, C.bad, 28);
        sfx(this, 'bomb');
        this.shake(FEEL.shake.explosionIntensity, FEEL.shake.explosionMs);
        break;
      case 'telegraph':
        this.telegraph(e.group, e.seconds);
        break;
      case 'aim':
        this.spawnAim(e.id, e.seconds);
        break;
      // Соседство
      case 'burned':
        this.floatText(L.centerX, L.itemNameY - 60, `${e.name}: ${e.reason.toLowerCase()}`, C.bad, 26);
        sfx(this, 'item_burn');
        break;
      case 'poisoned':
        this.floatText(L.centerX, L.itemNameY - 60, `${e.name}: отравлена`, C.bad, 26);
        break;
      case 'explode':
        destroyItem(e.uid); // все заряды потеряны — предмет исчезает навсегда
        this.heroView.removePiece(e.uid);
        this.floatText(L.centerX, L.itemNameY - 60, `Взрыв! ${e.name}`, C.bad, 32);
        sfx(this, 'bomb');
        sfx(this, 'item_vanish');
        this.shake(FEEL.shake.explosionIntensity, FEEL.shake.explosionMs);
        break;
      case 'enabled':
        this.floatText(L.centerX, L.itemNameY - 60, `${e.name} снова работает`, C.good, 26);
        break;
      case 'bonusLost':
        this.floatText(L.centerX, L.itemNameY - 60, `${e.name}: бонус соседа пропал`, C.dim, 24);
        break;
      // Условия заказчиков и модификаторы врагов
      case 'blocked':
        this.floatText(L.centerX, L.itemNameY - 60, `${e.name}: ${e.reason}`, C.bad, 26);
        sfx(this, 'item_burn');
        break;
      case 'windup':
        this.spawnParryIcon(e);
        break;
      case 'strike':
        this.resolveParryIcon(e.id, e.parried);
        break;
      case 'enemyMiss':
        this.floatText(L.floatHeroX, L.floatY, 'промах!', C.dim, 34);
        break;
      case 'woke':
        this.floatText(L.floatEnemyX, L.floatY + 60, `проснулся: быстрее на ${e.seconds} с`, C.bad, 26);
        break;
      case 'dodge':
        this.floatText(L.floatEnemyX, L.floatY, `${e.name} уклонился`, C.accent, 34);
        break;
    }
  }

  /**
   * Колода позади портрета: следующие враги того же заказа, как карты — каждая дальше сдвинута, повёрнута и темнее.
   * Ближняя к текущему — сверху колоды.
   */
  private drawEnemyDeck(): void {
    for (const c of this.enemyDeck) c.destroy();
    this.enemyDeck = [];
    const sim = this.sim;
    const D = FEEL.enemyDeck;
    const ep = L.enemyPortrait;
    const { contract } = sim.chain[sim.index];
    const next: typeof sim.chain = [];
    for (let i = sim.index + 1; i < sim.chain.length && sim.chain[i].contract === contract; i++) next.push(sim.chain[i]);
    next.slice(0, D.max).forEach((link, i) => {
      const n = i + 1;
      const card = fit(this.add.image(ep.x + D.offsetX * n, ep.y + D.offsetY * n, enemyKey(link.enemy)), ep.w, ep.h)
        .setAngle(D.angleDeg * n)
        .setTint(D.dark)
        .setDepth(1.9 - i * 0.01);
      this.enemyDeck.push(card);
    });
  }

  /** Следующий враг цепочки: сумка старого уезжает, нового — приезжает; портрет выезжает из колоды на место текущего. */
  private nextEnemy(): void {
    const fromDeck = this.enemyDeck.length > 0 && this.sim.chain[this.sim.index + 1]?.contract === this.sim.chain[this.sim.index].contract;
    this.sim.advance();
    this.shownStatus = this.sim.status;
    this.showEnemy();
    if (fromDeck) {
      const D = FEEL.enemyDeck;
      const ep = L.enemyPortrait;
      this.enemyImg.setPosition(ep.x + D.offsetX, ep.y + D.offsetY).setAngle(D.angleDeg).setTint(D.dark);
      this.tweens.add({
        targets: this.enemyImg,
        x: ep.x,
        y: ep.y,
        angle: 0,
        duration: D.promoteMs,
        ease: 'Cubic.easeOut',
        onUpdate: (tw) => {
          const v = Math.round(Phaser.Math.Linear((D.dark >> 16) & 0xff, 255, tw.progress));
          this.enemyImg.setTint((v << 16) | (v << 8) | v);
        },
        onComplete: () => this.enemyImg.clearTint(),
      });
    }
  }

  /** Привал между заказами: пауза с выбором «Дальше / Отступить». Здоровье не восстанавливается. */
  private showPause(): void {
    const sim = this.sim;
    const defeated = sim.defeated;
    const total = sim.chain.length;
    const penalty = retreatPenalty(defeated, sim.stolen);
    const next = sim.chain[defeated];
    sfx(this, 'rest');
    const box = this.add.container(L.centerX, 640).setDepth(80);
    box.add(this.add.rectangle(0, 0, 680, 360, 0x000000, 0.88).setStrokeStyle(2, C.border));
    box.add(addText(this, 0, -130, `Заказ выполнен (${defeated} из ${total})`, 34, C.good).setOrigin(0.5));
    box.add(addText(this, 0, -80, 'Привал', 34, C.text, TITLE).setOrigin(0.5));
    box.add(addText(this, 0, -36, `Дальше — заказ: ${CLIENTS[run.accepted[next.contract].client].name}.`, 24, C.text).setOrigin(0.5));
    box.add(
      new Button(this, -160, 80, 290, 80, 'Дальше', () => {
        this.closeOverlay();
        this.nextEnemy();
      }, 30),
    );
    // Упырь «Без спешки»: пока его заказ не выполнен, отступить нельзя.
    const blockedBy = sim.retreatBlockedBy;
    const retreat = new Button(this, 160, 80, 290, 80, blockedBy ? 'Отступить нельзя' : `Отступить (−${penalty})`, () => {
      this.closeOverlay();
      sfx(this, 'retreat');
      this.finish({ kind: 'retreat', defeated, stolen: sim.stolen, parryGoals: sim.parryGoals, heroHp: sim.heroHp }, 'Людьмак отступил');
    }, 30).setEnabled(!blockedBy);
    box.add(retreat);
    if (blockedBy) {
      const c = CLIENTS[blockedBy];
      box.add(addText(this, 0, 145, `${c.name}: «${c.condition.title.toLowerCase()}» — заказ ещё не выполнен`, 22, C.bad).setOrigin(0.5));
    }
    this.overlay = box;
  }

  private closeOverlay(): void {
    this.overlay?.destroy();
    this.overlay = null;
  }

  /**
   * Конец боя с финальным боссом: победа — победа в игре; поражение — −1 жизнь и бой заново с полным здоровьем,
   * пока есть жизни, иначе конец игры.
   */
  private finishFinal(won: boolean): void {
    this.refresh();
    if (run.quickFight) return this.finishQuick(won ? 'Ведьмак повержен' : 'Людьмак пал в бою');
    const again = resolveFinal(won);
    const name = ENEMIES[this.sim.enemy.id].name.toLowerCase();
    const message = won ? `${name[0].toUpperCase()}${name.slice(1)} повержен` : again ? 'Людьмак пал — ещё одна попытка' : 'Людьмак пал в бою';
    addText(this, L.centerX, 640, message, 60, won ? C.good : C.accent, { ...TITLE, stroke: '#000', strokeThickness: 8 })
      .setOrigin(0.5)
      .setDepth(90);
    // Победа — домой (эпилог: дверь заперта, записка на стене); последняя жизнь — конец игры.
    this.time.delayedCall(1800, () => goto(this, again ? 'Battle' : won ? 'Home' : 'GameOver', again ? { final: true } : undefined));
  }

  private finish(outcome: DayOutcome, message: string): void {
    this.refresh();
    if (run.quickFight) return this.finishQuick(outcome.kind === 'win' ? 'Победа' : message);
    run.axeCharges = this.sim.axeCharges;
    addText(this, L.centerX, 640, message, 60, C.accent, { ...TITLE, stroke: '#000', strokeThickness: 8 })
      .setOrigin(0.5)
      .setDepth(90);
    this.time.delayedCall(1500, () => {
      resolveNight(outcome);
      goto(this, 'Results');
    });
  }

  /** Быстрый бой из меню закончился: надпись — и обратно в меню, без итогов, жизней и наград. */
  private finishQuick(message: string): void {
    addText(this, L.centerX, 640, message, 60, C.accent, { ...TITLE, stroke: '#000', strokeThickness: 8 })
      .setOrigin(0.5)
      .setDepth(90);
    this.time.delayedCall(1500, () => goto(this, 'Menu'));
  }

  // ─── Отрисовка ───────────────────────────────────────────────────────────

  /** Плашка условия заказа без счётчика (счётчик отбитых атак у Безголового дописывается на лету). */
  private conditionBase = '';

  /** Строка плашки условия: у Безголового — «отбито X из Y» по его заказу. */
  private conditionLine(): string {
    const sim = this.sim;
    if (!sim.condition.parryReward) return this.conditionBase;
    const k = sim.chain[sim.index].contract;
    return `${this.conditionBase} · отбито ${sim.parried[k]} из ${sim.attacks[k]}`;
  }

  /** Длинное условие («чтобы никто не услышал») не должно заезжать на полоски здоровья: уменьшаем шрифт. */
  private setConditionText(text: string): void {
    if (this.conditionText.text === text) return;
    this.conditionText.setFontSize(24).setText(text);
    if (this.conditionText.width > L.conditionMaxW) this.conditionText.setFontSize(Math.floor((24 * L.conditionMaxW) / this.conditionText.width));
  }

  /** Плашки дебафов героя под полоской здоровья; статусы текстом сдвигаются под них. */
  private heroDebuffs!: Phaser.GameObjects.Container;
  private debuffKey = '';
  private debuffPos = { x: 0, y: 0 };

  private syncDebuffs(): void {
    const slow = Math.round(this.sim.slowSec * 10) / 10;
    const axe = this.sim.mainSlot?.def.parryPerk === 'axe' ? this.sim.axeCharges : -1;
    const key = `${slow}|${axe}|${!this.sim.mainSlot}`;
    if (key === this.debuffKey) return;
    this.debuffKey = key;
    this.heroDebuffs.removeAll(true);
    const chips: UiChip[] = [];
    if (slow > 0) {
      chips.push({
        icon: statIconKey('slow'),
        value: `Медлительность +${slow} с`,
        color: C.bad,
        hint: `Медлительность от щитов в рюкзаке: твои предметы с уроном бьют на ${slow} с реже.`,
      });
    }
    if (axe >= 0) {
      chips.push({
        icon: statIconKey('parry'),
        icon2: statIconKey('charges'),
        value: `${axe}/${PARRY_PERK.axeCharges}`,
        color: axe >= PARRY_PERK.axeCharges ? C.good : C.text,
        hint: `Заряды топора за парирования: ${axe} из ${PARRY_PERK.axeCharges}. Набрал — следующий удар топора ×${PARRY_PERK.axeMult}. Пропустил атаку — заряды сгорают.`,
      });
    }
    if (!this.sim.mainSlot) {
      chips.push({
        icon: statIconKey('parry'),
        value: 'Нечем отбивать',
        color: C.bad,
        hint: 'Основного оружия нет или оно отключено — атаки не отбить. Основное выбирается двойным кликом в сумках.',
        cross: true,
      });
    }
    const { h } = addChips(this, this.debuffPos.x, this.debuffPos.y, chips, { h: 34, container: this.heroDebuffs });
    this.heroStatus.setY(this.debuffPos.y + (chips.length ? h + 8 : 0));
  }

  private refresh(): void {
    const sim = this.sim;
    this.syncDebuffs();
    this.setConditionText(this.conditionLine());
    this.heroBar.width = (BAR_W * sim.heroHp) / sim.heroMaxHp;
    this.setBlockMark(this.heroBlock, sim.block);
    this.heroHpText.setText(`${sim.heroHp} / ${sim.heroMaxHp}`);
    const status: string[] = [];
    if (sim.weaponBuff.time > 0) status.push(`Оружие ×${sim.weaponBuff.mult}: ${sim.weaponBuff.time.toFixed(1)} с`);
    if (sim.heroStun > 0) status.push(`Оглушён: ${sim.heroStun.toFixed(1)} с`);
    this.heroStatus.setText(status.join('\n'));

    // Рюкзак героя: отключённые — серые; пассивные — перезарядка (амулет без действия — светлый);
    // активные — подсвечены, пока их можно нажать.
    for (const slot of sim.slots) this.heroView.setDisabled(slot.item.uid, slot.disabled);
    for (const p of sim.passives) this.heroView.setProgress(p.item.uid, p.stats.cooldown ? p.timer / p.stats.cooldown : 1);
    for (const a of sim.actives) {
      const canUse = sim.status === 'fight' && !a.disabled && sim.heroStun <= 0;
      this.heroView.setReady(a.item.uid, canUse);
      this.heroView.setProgress(a.item.uid, canUse ? 1 : 0);
    }

    const e = sim.enemy;
    this.enemyBar.width = (BAR_W * e.hp) / e.maxHp;
    this.setBlockMark(this.enemyBlock, e.block);
    this.enemyHpText.setText(`${e.hp} / ${e.maxHp}`);
    const es: string[] = [];
    if (e.stun > 0) es.push(`Оглушён: ${e.stun.toFixed(1)} с`);
    if (e.haste > 0) es.push(`Разбужен: ${e.haste.toFixed(1)} с`);
    if (e.torchSlow > 0) es.push(`Замедлен факелом: +${e.torchSlow.toFixed(1)} с`);
    const guard = e.slots.find((s) => s.stats.guardMult);
    if (guard) es.push(e.guardBroken > 0 ? `Щит сбит: ${e.guardBroken.toFixed(1)} с` : `За щитом: урон ×${guard.stats.guardMult}`);
    if (e.quenOn) es.push(`Квен: отбей подряд ${e.quenStreak}/${ENEMY_PATTERN.quen.parries}`);
    // Монах: ритуал прошёл — бафф держится, пока освящённая вода не долетела.
    if (e.blessed || sim.pending.some((p) => p.slot.def.afterRitual && p.mult > 1)) es.push(`Вода освящена: ×${ENEMY_PATTERN.blessMult}`);
    this.enemyStatus.setText(es.join('\n'));

    // Сумка врага: щит — своя перезарядка; действия — заполняется только то, что враг готовит сейчас.
    const next = sim.nextAction();
    for (const s of e.slots) {
      // Ростовой щит: светлый, пока поднят; сбит — тёмный и заполняется, пока не поднимется снова.
      const p = s.stats.guardMult
        ? e.guardBroken > 0
          ? 1 - e.guardBroken / (s.stats.guardBreak || 1)
          : 1
        : (s.def.mode === 'passive' || s.own) && s.stats.cooldown
          ? s.timer / s.stats.cooldown
          : s.def.mode === 'onHit'
            ? // Мешок вылетает вместе с ударом оружия — его перезарядка та же, что у готовящегося удара.
              next && next.def.category === 'weapon'
              ? e.actionTimer / next.stats.cooldown!
              : 0
            : s.def.mode === 'aura'
            ? 1
            : s === next
              ? e.actionTimer / s.stats.cooldown!
              : 0;
      this.enemyView?.setProgress(s.uid, p);
    }
  }

  private floatText(x: number, y: number, str: string, color: string, size = FEEL.float.size): void {
    const t = addText(this, x + Phaser.Math.Between(-40, 40), y, str, size, color, {
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 6,
    })
      .setOrigin(0.5)
      .setDepth(60);
    this.tweens.add({ targets: t, y: y - FEEL.float.rise, alpha: 0, duration: FEEL.float.durationMs, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  /** Цифра урона или лечения: цвет по типу, большие удары (от FEEL.float.bigHit) — крупнее. */
  private floatNumber(x: number, str: string, color: string, amount: number): void {
    this.floatText(x, L.floatY, str, color, amount >= FEEL.float.bigHit ? FEEL.float.bigSize : FEEL.float.size);
  }

  /** Вспышка и покачивание портрета при ударе. */
  private hitFx(img: Phaser.GameObjects.Image, baseX: number): void {
    this.tweens.killTweensOf(img);
    img.x = baseX;
    img.setTintFill(0xffffff);
    this.time.delayedCall(70, () => img.clearTint());
    this.tweens.add({ targets: img, x: baseX + 14, duration: 45, yoyo: true, repeat: 1, onComplete: () => (img.x = baseX) });
  }
}

/** Летящая атака врага: контейнер (свечение + предмет), его точка, радиус зоны клика сейчас. */
interface ParryIcon {
  cont: Phaser.GameObjects.Container;
  img: Phaser.GameObjects.Image;
  /** Золотое кольцо-таймер вокруг точки (не масштабируется вместе с предметом). */
  ring: Phaser.GameObjects.Graphics;
  /** Заливка внутри кольца (под кружком с предметом). */
  fill: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
  r: number;
  kind: AttackKind;
  item: EnemyItemId;
  /** Выпад: откуда и куда едет; полоса траектории. */
  path: { x0: number; y0: number; x1: number; y1: number } | null;
  line: Phaser.GameObjects.Graphics | null;
  /** Пара «кистень + мешок»: другой уже отбит — этот не отбить. */
  locked: boolean;
}

/**
 * Крест монаха: порядок точек — верх, низ, лево, право (доли FEEL.patterns.crossR от перекрестья). Верх короче низа —
 * поперечина в верхней части, как на церковном кресте.
 */
const CROSS_ORDER: [number, number][] = [
  [0, -0.7],
  [0, 1.4],
  [-1, 0],
  [1, 0],
];

/** Надпись при удачном парировании особых кружков. */
const PARRY_TEXT: Partial<Record<AttackKind, string>> = {
  sack: 'Мешок отбит!',
  guard: 'Щит сбит!',
  escape: 'Не уйдёшь!',
  reflect: 'Лови!',
};

/** Расстояние от точки до отрезка (не до бесконечной прямой). */
function segmentDist(l: Phaser.Geom.Line, x: number, y: number): number {
  const dx = l.x2 - l.x1;
  const dy = l.y2 - l.y1;
  const len2 = dx * dx + dy * dy || 1;
  const k = Phaser.Math.Clamp(((x - l.x1) * dx + (y - l.y1) * dy) / len2, 0, 1);
  return Math.hypot(x - (l.x1 + k * dx), y - (l.y1 + k * dy));
}

/** Обводка курсора: копии картинки сдвинуты в этих направлениях на FEEL.parry.edge.width px. */
const EDGE_DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.71, 0.71],
  [-0.71, 0.71],
  [0.71, -0.71],
  [-0.71, -0.71],
];
