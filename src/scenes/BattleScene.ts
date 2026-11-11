// Экран боя — отображение над логикой src/systems/battle.ts.
// Слева — Людьмак и его рюкзак (сетка, как собрали ночью): пассивные предметы срабатывают сами,
// активные применяются нажатием на предмет. Справа — враг и его сумка (только просмотр).
import * as Phaser from 'phaser';
import { GridView } from '../components/GridView';
import { BATTLE_LAYOUT, BG_BATTLE_KEY, enemyItemKey, enemyKey, HERO_KEY, HORSE_ART, itemKey } from '../config/assets';
import { BATTLE_FAST_SPEED } from '../config/balance';
import { CLIENTS } from '../data/clients';
import { ENEMIES } from '../data/enemies';
import { FEEL } from '../config/feel';
import { tutorialAttach, tutorialBlocking, tutorialDone, type Rect } from '../components/Hints';
import { playMusic, sfx } from '../components/Sound';
import { ITEMS, type ItemId } from '../data/items';
import { enemyName, modifierEffect, MODIFIERS } from '../data/modifiers';
import { BattleSim, type BattleEvent, type EnemySlot } from '../systems/battle';
import { footprint, MASK, rectMask, type OwnedItem } from '../systems/backpack';
import { starOf } from '../systems/synergy';
import { dayChain, destroyItem, resolveNight, retreatPenalty, run, spendCharge, type DayOutcome } from '../state';
import {
  addBackground,
  addHorse,
  addModifierBadge,
  addMuteButton,
  addText,
  Button,
  C,
  describeEnemyItem,
  describeOwnedItem,
  fadeIn,
  fit,
  goto,
  W,
  itemRarityFrame,
} from '../ui';

const L = BATTLE_LAYOUT;
const BAR_W = 360;
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
  private heroHpText!: Phaser.GameObjects.Text;
  private heroStatus!: Phaser.GameObjects.Text;
  private enemyBar!: Phaser.GameObjects.Rectangle;
  private enemyHpText!: Phaser.GameObjects.Text;
  private enemyName!: Phaser.GameObjects.Text;
  private enemyStatus!: Phaser.GameObjects.Text;
  private modBadge: Phaser.GameObjects.Container | null = null;
  private progressText!: Phaser.GameObjects.Text;
  private conditionText!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private overlay: Phaser.GameObjects.Container | null = null;
  /** uid → предмет героя (событие heroItem несёт только uid, а бомбе нужен звук и тряска). */
  private itemIds = new Map<number, ItemId>();
  /** До какого момента (time.now) бой стоит — стоп-кадр при смерти врага. */
  private hitStopUntil = 0;

  constructor() {
    super('Battle');
  }

  create(): void {
    fadeIn(this);
    playMusic(this, 'music_day');
    const items = run.items.filter((i) => i.inGrid);
    this.itemIds = new Map(items.map((i) => [i.uid, i.id]));
    this.sim = new BattleSim({ items, chain: dayChain(), clients: run.accepted.map((c) => c.client), night: run.night });
    this.speed = 1;
    this.shownStatus = 'fight';
    this.overlay = null;
    this.enemyView = null;
    this.modBadge = null;
    this.hitStopUntil = 0;

    addBackground(this, BG_BATTLE_KEY);
    this.add.rectangle(0, 0, W, 80, 0x000000, 0.6).setOrigin(0);
    addText(this, 30, 40, `Ночь ${run.night}`, 30).setOrigin(0, 0.5);
    addMuteButton(this, L.mute);
    this.progressText = addText(this, W / 2, 40, '', 30).setOrigin(0.5);
    // Условие заказчика текущего врага: меняется вместе с заказом.
    this.conditionText = addText(this, L.conditionBanner.x, L.conditionBanner.y, '', 24, C.accent, {
      fontStyle: 'bold',
      backgroundColor: 'rgba(0,0,0,0.7)',
      padding: { x: 14, y: 6 },
    }).setOrigin(0.5);
    const speedBtn = new Button(this, L.centerX, 140, 280, 60, 'Ускорение ×1', () => {
      this.speed = this.speed === 1 ? BATTLE_FAST_SPEED : 1;
      speedBtn.setLabel(`Ускорение ×${this.speed}`);
    });
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
    addText(this, hx, hp.y - 110, 'Людьмак', 34, C.accent, { fontStyle: 'bold' });
    [this.heroBar, this.heroHpText] = this.makeBar(hx, hp.y - 40);
    this.heroStatus = addText(this, hx, hp.y, '', 24, C.block);

    // Враг: портрет, слева от него имя, здоровье, статусы (выравнивание по правому краю).
    const ep = L.enemyPortrait;
    this.enemyImg = this.add.image(ep.x, ep.y, enemyKey(this.sim.enemy.id));
    const ex = ep.x - ep.w / 2 - 30;
    this.enemyName = addText(this, ex, ep.y - 110, '', 34, C.bad, { fontStyle: 'bold' }).setOrigin(1, 0);
    [this.enemyBar, this.enemyHpText] = this.makeBar(ex - BAR_W, ep.y - 40);
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
      return null;
    });
  }

  /** Где на экране предмет из рюкзака героя (для подсветки в обучении). */
  private pieceRect(it: OwnedItem): Rect {
    const f = footprint(it.id, it.rotated);
    return { x: L.heroGrid.x + it.col * L.cell, y: L.heroGrid.y + it.row * L.cell, w: f.w * L.cell, h: f.h * L.cell };
  }

  /** Полоска здоровья: x — левый край. */
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
    // Имя с модификатором бывает длинным: уменьшаем шрифт, чтобы не залезть под кнопку ускорения.
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
    const inContract = sim.chain.filter((c) => c.contract === contract);
    const nth = sim.chain.slice(0, sim.index + 1).filter((c) => c.contract === contract).length;
    const client = CLIENTS[run.accepted[contract].client];
    this.progressText.setText(`Заказ ${contract + 1}/${run.accepted.length}: ${client.name} · враг ${nth} из ${inContract.length}`);
    // Длинное условие («чтобы никто не услышал») не должно заезжать на полоски здоровья: уменьшаем шрифт.
    this.conditionText.setFontSize(24).setText(`Заказ ${client.genitive}: ${client.condition.title.toLowerCase()}`);
    if (this.conditionText.width > L.conditionMaxW) this.conditionText.setFontSize(Math.floor((24 * L.conditionMaxW) / this.conditionText.width));

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
      describe: (s) => `${s.def.name}: ${describeEnemyItem(s.def.id, mod)}`,
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
    this.sim.step((delta / 1000) * this.speed);
    this.afterSimChange();
  }

  /** Нарисовать события боя и среагировать на смену статуса. */
  private afterSimChange(): void {
    for (const e of this.sim.drain()) this.showEvent(e);
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
      this.finish({ kind: 'win', defeated: this.sim.defeated, stolen: this.sim.stolen }, 'Все заказы выполнены');
    } else if (status === 'lost') {
      sfx(this, 'hero_death');
      this.finish({ kind: 'death', defeated: this.sim.defeated, stolen: this.sim.stolen }, 'Людьмак пал в бою');
    }
  }

  /** Враг повержен: стоп-кадр, звук, баннер «Победа над …», а если это был последний враг заказа — «Заказ выполнен». */
  private onEnemyDeath(): void {
    const sim = this.sim;
    this.hitStopUntil = this.time.now + FEEL.hitStopMs;
    sfx(this, 'enemy_death');
    const link = sim.chain[sim.index];
    this.banner(`Победа над: ${enemyName(link.enemy, link.mod).toLowerCase()}`, C.text, 0);
    if (sim.status === 'won' || sim.nextIsNewContract) {
      this.time.delayedCall(FEEL.banner.staggerMs, () => sfx(this, 'contract_done'));
      this.banner('Заказ выполнен', C.good, FEEL.banner.staggerMs);
    }
  }

  /** Короткий баннер посередине: всплывает и тает, игру не останавливает. */
  private banner(text: string, color: string, delay: number): void {
    const t = addText(this, L.centerX, L.bannerY, text, FEEL.banner.size, color, { fontStyle: 'bold', stroke: '#000', strokeThickness: 8 })
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
          sfx(this, 'hit_enemy');
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

  /** Следующий враг цепочки: сумка старого уезжает, нового — приезжает. */
  private nextEnemy(): void {
    this.sim.advance();
    this.shownStatus = this.sim.status;
    this.showEnemy();
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
    box.add(addText(this, 0, -80, 'Привал', 30, C.text, { fontStyle: 'bold' }).setOrigin(0.5));
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
      this.finish({ kind: 'retreat', defeated, stolen: sim.stolen }, 'Людьмак отступил');
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

  private finish(outcome: DayOutcome, message: string): void {
    this.refresh();
    addText(this, L.centerX, 640, message, 60, C.accent, { fontStyle: 'bold', stroke: '#000', strokeThickness: 8 })
      .setOrigin(0.5)
      .setDepth(90);
    this.time.delayedCall(1500, () => {
      resolveNight(outcome);
      goto(this, 'Results');
    });
  }

  // ─── Отрисовка ───────────────────────────────────────────────────────────

  private refresh(): void {
    const sim = this.sim;
    this.heroBar.width = (BAR_W * sim.heroHp) / sim.heroMaxHp;
    this.heroHpText.setText(`${sim.heroHp} / ${sim.heroMaxHp}`);
    const status: string[] = [];
    if (sim.block > 0) status.push(`Блок: ${sim.block}`);
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
    this.enemyHpText.setText(`${e.hp} / ${e.maxHp}`);
    const es: string[] = [];
    if (e.block > 0) es.push(`Блок: ${e.block}`);
    if (e.stun > 0) es.push(`Оглушён: ${e.stun.toFixed(1)} с`);
    if (e.haste > 0) es.push(`Разбужен: ${e.haste.toFixed(1)} с`);
    this.enemyStatus.setText(es.join('\n'));

    // Сумка врага: щит — своя перезарядка; действия — заполняется только то, что враг готовит сейчас.
    const next = sim.nextAction();
    for (const s of e.slots) {
      const p =
        s.def.mode === 'passive' ? s.timer / s.stats.cooldown! : s.def.mode === 'onHit' ? 1 : s === next ? e.actionTimer / s.stats.cooldown! : 0;
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
