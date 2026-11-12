// Экран боя — отображение над логикой src/systems/battle.ts.
// Слева — Людьмак и его рюкзак (сетка, как собрали ночью): пассивные предметы срабатывают сами,
// активные применяются нажатием на предмет. Справа — враг и его сумка (только просмотр).
import * as Phaser from 'phaser';
import { GridView } from '../components/GridView';
import { BATTLE_LAYOUT, BG_BATTLE_KEY, enemyItemKey, enemyKey, HERO_KEY, HORSE_ART, itemKey, statIconKey, UI_ART, type CursorBlade } from '../config/assets';
import { BATTLE_FAST_SPEED, PARRY_PERK } from '../config/balance';
import { CLIENTS } from '../data/clients';
import { ENEMIES } from '../data/enemies';
import { FEEL } from '../config/feel';
import { tutorialAttach, tutorialBlocking, tutorialDone, tutorialRefresh, type Rect } from '../components/Hints';
import { playMusic, sfx } from '../components/Sound';
import { ITEMS, type ItemId } from '../data/items';
import { enemyName, modifierEffect, MODIFIERS } from '../data/modifiers';
import { BattleSim, type BattleEvent, type EnemySlot } from '../systems/battle';
import type { EnemyItemId } from '../data/enemyItems';
import { footprint, MASK, rectMask, type OwnedItem } from '../systems/backpack';
import { pairLinks, starOf } from '../systems/synergy';
import { dayChain, destroyItem, finalChain, resolveFinal, resolveNight, retreatPenalty, run, spendCharge, type DayOutcome } from '../state';
import {
  addBackground,
  addHorse,
  addModifierBadge,
  addMuteButton,
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
  /** Курсор основного оружия в зоне атак (клинок) и его отбивающая часть; null — основное не клинок или его нет. */
  private sword!: Phaser.GameObjects.Image;
  private blade: CursorBlade | null = null;
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
      ? new BattleSim({ items, chain: finalChain(), clients: [], night: run.night, heroHp: run.finalHp ?? undefined, mainUid, axeCharges: run.axeCharges })
      : new BattleSim({ items, chain: dayChain(), clients: run.accepted.map((c) => c.client), night: run.night, mainUid });
    this.speed = 1;
    this.shownStatus = 'fight';
    this.overlay = null;
    this.enemyView = null;
    this.modBadge = null;
    this.hitStopUntil = 0;
    this.parryIcons = new Map();
    this.createSword();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onBattleClick(p));
    this.linksKey = '';

    addBackground(this, BG_BATTLE_KEY);
    addTopBar(this);
    addText(this, 30, 40, `Ночь ${run.night}`, 30).setOrigin(0, 0.5);
    addMuteButton(this, L.mute);
    this.progressText = addText(this, W / 2, 40, '', 30).setOrigin(0.5);
    addLives(this, W - 30, 40);
    // Условие заказчика текущего врага: меняется вместе с заказом.
    this.conditionText = addText(this, L.conditionBanner.x, L.conditionBanner.y, '', 24, C.accent, {
      fontStyle: 'bold',
      backgroundColor: 'rgba(0,0,0,0.7)',
      padding: { x: 14, y: 6 },
    }).setOrigin(0.5);
    // Ускорение — в шапке, рядом с «Без звука».
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

    this.showEnemy();
    this.afterSimChange(); // события начала боя: сгорело, отравлено, взрыв

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
        const r = last.r * 1.3;
        return { x: last.cont.x - r, y: last.cont.y - r, w: r * 2, h: r * 2 };
      }
      return null;
    });
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
  private spawnParryIcon(id: number, item: EnemyItemId): void {
    const P = FEEL.parry;
    const z = L.parryZone;
    const r = P.size / 2;
    let best = { x: z.x + z.w / 2, y: z.y + z.h / 2, d: -1 };
    for (let k = 0; k < 16; k++) {
      const x = Phaser.Math.Between(z.x + r, z.x + z.w - r);
      const y = Phaser.Math.Between(z.y + r, z.y + z.h - r);
      const d = Math.min(Infinity, ...[...this.parryIcons.values()].map((o) => Math.hypot(o.x - x, o.y - y)));
      if (d > best.d) best = { x, y, d };
      if (d >= P.minGap) break;
    }
    const cont = this.add.container(best.x, best.y).setDepth(60);
    const glow = this.add.circle(0, 0, r * 0.95, P.glow, P.glowAlpha);
    const img = fit(this.add.image(0, 0, L.parryIconOverride ?? enemyItemKey(item)), P.size, P.size);
    cont.add([glow, img]);
    const ring = this.add.graphics().setDepth(61);
    const icon: ParryIcon = { cont, img, ring, x: best.x, y: best.y, r };
    this.parryIcons.set(id, icon);
    this.placeParryIcon(icon, 0);
    tutorialRefresh(this); // обучение: первый замах — шаг «Парируй»
  }

  /** Атака по доле полёта t (0 — только вылетела, 1 — удар): растёт и светлеет с ускорением. */
  private placeParryIcon(icon: ParryIcon, t: number): void {
    const P = FEEL.parry;
    const e = Math.pow(Phaser.Math.Clamp(t, 0, 1), P.growPow);
    const s = P.startScale + (1 - P.startScale) * e;
    icon.cont
      .setScale(s)
      .setAlpha(P.startAlpha + (1 - P.startAlpha) * e);
    const v = Math.round(255 * (P.startBright + (1 - P.startBright) * e));
    icon.img.setTint((v << 16) | (v << 8) | v).setAngle(t * P.spinTurns * 360);
    // Золотое кольцо стягивается от ringFrom × полный радиус к полному радиусу — сойдётся в момент удара.
    const R = P.size / 2;
    const rr = R + (R * P.ringFrom - R) * (1 - Phaser.Math.Clamp(t, 0, 1));
    icon.ring.clear().lineStyle(P.ringWidth, P.ringColor, 0.45 + 0.55 * t).strokeCircle(icon.x, icon.y, rr);
    icon.r = (P.size / 2) * Math.max(s * P.hitPad, P.hitMinShare);
  }

  /** Каждый кадр: атаки летят по оставшемуся времени окна; отменённые (враг умер) убираются. */
  private syncParryIcons(): void {
    for (const [id, icon] of this.parryIcons) {
      const p = this.sim.pending.find((a) => a.id === id);
      if (p) this.placeParryIcon(icon, 1 - p.left / p.total);
      else {
        icon.cont.destroy();
        icon.ring.destroy();
        this.parryIcons.delete(id);
      }
    }
  }

  /**
   * Клик: в зоне атак — взмах меча. Отбивает лезвие: летящая атака засчитана, если её круг касается отрезка лезвия
   * (кончик → конец лезвия, в положении покоя); рукоятью не отбить. Вне зоны (меча не видно) — точка курсора.
   * Касается нескольких — отбивается ближайшая к лезвию.
   */
  private onBattleClick(p: Phaser.Input.Pointer): void {
    // ПКМ в зоне атак — прокрутка меча (для красоты, на бой не влияет).
    if (p.button === 2) {
      if (this.inParryZone(p) && this.weaponMode()) {
        this.moveSword(p);
        this.spinSword();
      }
      return;
    }
    if (p.button !== 0) return;
    // Без основного оружия (или оно отключено) парировать нельзя.
    if (!this.inParryZone(p)) return;
    const shield = this.shieldMode();
    if (!shield && !this.weaponMode()) return;
    let blade: Phaser.Geom.Line | null = null;
    this.moveSword(p);
    if (shield) this.punchShield();
    else {
      blade = this.bladeLine();
      this.swingSword();
    }
    // Щит парирует всей областью: атака засчитана, если её круг касается круга щита.
    const shieldR = shield ? (FEEL.parry.shieldSize / 2) * UI_ART.cursorShield.hitShare : 0;
    let hit: number | null = null;
    let best = Infinity;
    for (const [id, icon] of this.parryIcons) {
      const c = { x: icon.cont.x, y: icon.cont.y };
      const d = blade ? segmentDist(blade, c.x, c.y) : Math.hypot(p.x - c.x, p.y - c.y) - shieldR;
      if (d <= icon.r && d < best) {
        best = d;
        hit = id;
      }
    }
    if (hit === null || !this.sim.parry(hit)) return;
    tutorialDone(this, 'parry');
    this.afterSimChange();
  }

  /** Отбивающая часть курсора в положении покоя (мир): от кончика до bladeEnd (UI_ART.cursorWeapons). */
  private bladeLine(): Phaser.Geom.Line {
    const S = this.blade!;
    const k = this.sword.scale;
    const a = Phaser.Math.DegToRad(S.angle);
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
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.moveSword(p));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.setDefaultCursor('default'));
  }

  /** Меч виден только в зоне атак; там же прячется системный курсор. Рукоять ставится так, чтобы кончик (в покое) был на курсоре. */
  private moveSword(p: { x: number; y: number }): void {
    const S = this.blade ?? UI_ART.cursorWeapons.steel_sword!;
    const shield = this.shieldMode();
    const weapon = this.weaponMode();
    const inZone = this.inParryZone(p) && (shield || weapon);
    // От рукояти до кончика по картинке (px с учётом масштаба), повёрнуто на угол покоя.
    const k = this.sword.scale;
    const dx = (S.tip.x - S.grip.x) * this.sword.width * k;
    const dy = (S.tip.y - S.grip.y) * this.sword.height * k;
    const a = Phaser.Math.DegToRad(S.angle);
    const tx = dx * Math.cos(a) - dy * Math.sin(a);
    const ty = dx * Math.sin(a) + dy * Math.cos(a);
    this.sword.setPosition(p.x - tx, p.y - ty).setVisible(inZone && weapon);
    this.shield?.setPosition(p.x, p.y).setVisible(inZone && shield);
    if (inZone !== this.swordShown) {
      this.swordShown = inZone;
      this.input.setDefaultCursor(inZone ? 'none' : 'default');
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

  /** Взмах: рукоять на месте, клинок рубит вправо (по часовой) и возвращается в покой. */
  private swingSword(): void {
    const P = FEEL.parry;
    const base = this.blade!.angle;
    this.tweens.killTweensOf(this.sword);
    this.spinTween?.stop();
    this.spinTween = null;
    this.sword.setAngle(base);
    this.tweens.add({
      targets: this.sword,
      angle: base + P.swingDeg,
      duration: P.swingMs * 0.5,
      ease: 'Cubic.easeOut',
      onComplete: () => this.tweens.add({ targets: this.sword, angle: base, duration: P.swingMs * 0.5, ease: 'Sine.easeInOut' }),
    });
  }

  /** Прокрутка на 360° вокруг рукояти с шлейфом: за мечом остаются гаснущие светлые копии. */
  private spinSword(): void {
    const P = FEEL.parry;
    const base = this.blade!.angle;
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
        if (this.time.now - last >= P.trailEveryMs) {
          last = this.time.now;
          ghost();
        }
      },
      onComplete: () => this.sword.setAngle(base),
    });
  }

  /** Удар пришёл: парирован — искры, звук, предмет отбит; нет — предмет долетает до портрета героя. */
  private resolveParryIcon(id: number, parried: boolean): void {
    const icon = this.parryIcons.get(id);
    if (!icon) return;
    this.parryIcons.delete(id);
    icon.ring.destroy();
    const P = FEEL.parry;
    const { x, y } = icon.cont;
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
    this.floatText(x, y - P.size * 0.6, 'Парировано!', C.accent, P.textSize);
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
    this.refresh();
  }

  update(_time: number, delta: number): void {
    if (this.sim.status !== 'fight') return;
    if (this.time.now < this.hitStopUntil) return; // стоп-кадр: бой замер на мгновение
    if (tutorialBlocking(this)) return; // обучение: пока открыт шаг, бой на паузе
    // Окна парирования идут в реальном времени: ускорение на них не влияет.
    this.sim.step((delta / 1000) * this.speed, delta / 1000);
    this.afterSimChange();
  }

  /** Нарисовать события боя и среагировать на смену статуса. */
  private afterSimChange(): void {
    for (const e of this.sim.drain()) this.showEvent(e);
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
          const d = ITEMS[e.item];
          sfx(this, d.category === 'weapon' && !d.tags.includes('fire') ? 'sword_hit' : 'hit_enemy');
        }
        if (e.firstStrike) this.floatText(L.floatEnemyX, L.floatY + 60, 'удар из тишины', F.buffedDamage, 26);
        if (e.halved) this.floatText(L.floatEnemyX, L.floatY + 110, 'урон вполовину', C.dim, 22);
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
      case 'onHit':
        this.enemyView?.flash(e.uid);
        if (e.steal) this.floatText(L.floatHeroX, L.floatY + 120, `−${e.steal} мон. из награды`, C.accent, 26);
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
        this.spawnParryIcon(e.id, e.item);
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
    run.axeCharges = this.sim.axeCharges;
    addText(this, L.centerX, 640, message, 60, C.accent, { ...TITLE, stroke: '#000', strokeThickness: 8 })
      .setOrigin(0.5)
      .setDepth(90);
    this.time.delayedCall(1500, () => {
      resolveNight(outcome);
      goto(this, 'Results');
    });
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
    this.heroStatus.setText(status.join('\n'));

    // Рюкзак героя: отключённые — серые; пассивные — перезарядка (амулет без действия — светлый);
    // активные — подсвечены, пока их можно нажать.
    for (const slot of sim.slots) this.heroView.setDisabled(slot.item.uid, slot.disabled);
    for (const p of sim.passives) this.heroView.setProgress(p.item.uid, p.stats.cooldown ? p.timer / p.stats.cooldown : 1);
    for (const a of sim.actives) {
      const canUse = sim.status === 'fight' && !a.disabled;
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
    this.enemyStatus.setText(es.join('\n'));

    // Сумка врага: щит — своя перезарядка; действия — заполняется только то, что враг готовит сейчас.
    const next = sim.nextAction();
    for (const s of e.slots) {
      const p =
        s.def.mode === 'passive' || s.own
          ? s.timer / s.stats.cooldown!
          : s.def.mode === 'onHit' || s.def.mode === 'aura'
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
  x: number;
  y: number;
  r: number;
}

/** Расстояние от точки до отрезка (не до бесконечной прямой). */
function segmentDist(l: Phaser.Geom.Line, x: number, y: number): number {
  const dx = l.x2 - l.x1;
  const dy = l.y2 - l.y1;
  const len2 = dx * dx + dy * dy || 1;
  const k = Phaser.Math.Clamp(((x - l.x1) * dx + (y - l.y1) * dy) / len2, 0, 1);
  return Math.hypot(x - (l.x1 + k * dx), y - (l.y1 + k * dy));
}
