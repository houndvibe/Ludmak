// Логика боя без Phaser и графики. Её используют и сцена боя, и симуляция (npm run sim).
// Сцена двигает время (step), передаёт нажатия (useActive) и рисует события (drain).
// Характеристики предметов героя — итоговые с учётом ★ и соседства (src/systems/synergy.ts);
// когда предмет исчезает или меняется враг, соседство пересчитывается сразу.
// Условие заказчика действует только в бою с врагами своего заказа (запреты предметов, двойной первый удар).
import {
  BLOCK_MAX,
  ENEMY_BLOCK_MAX,
  ENEMY_ITEM_STATS,
  ENEMY_STAT_MULT_BY_NIGHT,
  ENEMY_STATS,
  GHOST_FIRST_HIT_MULT,
  HERO_HP_BY_NIGHT,
  MODIFIER_STATS,
  PARRY_DAMAGE_MULT,
  type EnemyItemStats,
  type ItemStats,
} from '../config/balance';
import { CLIENTS, type ClientCondition, type ClientId } from '../data/clients';
import { ENEMIES, type EnemyId } from '../data/enemies';
import { ENEMY_ITEMS, type EnemyItemDef, type EnemyItemId } from '../data/enemyItems';
import { FEEL } from '../config/feel';
import { ITEMS, type ItemDef, type ItemId } from '../data/items';
import { enemyName, type ModifierId } from '../data/modifiers';
import type { OwnedItem, Placement } from './backpack';
import type { Rng } from './random';
import { computePower, matches, type AppliedEffect, type BlockRule, type ItemPower } from './synergy';

export interface ChainLink {
  enemy: EnemyId;
  /** Индекс заказа, к которому относится враг. */
  contract: number;
  /** Модификатор врага (null — без модификатора). */
  mod: ModifierId | null;
}

/** Множитель здоровья и силы предметов врага (урон, лечение, блок): ночь × ветеран. */
export function enemyPower(night: number, mod: ModifierId | null): number {
  return ENEMY_STAT_MULT_BY_NIGHT[night - 1] * (mod === 'veteran' ? 1 + MODIFIER_STATS.veteran : 1);
}

/** Дополнительный множитель урона предметов врага (пьяный). */
export function enemyDamageMult(mod: ModifierId | null): number {
  return mod === 'drunk' ? 1 + MODIFIER_STATS.drunkDamage : 1;
}

export interface HeroSlot {
  item: OwnedItem;
  def: ItemDef;
  /** Итоговые характеристики (★ + соседи). */
  stats: ItemStats;
  disabled: boolean;
  poisoned: boolean;
  /** Таймер перезарядки пассивного предмета. */
  timer: number;
  /** Оставшиеся заряды активного предмета. */
  charges: number;
}

export interface EnemySlot extends Placement {
  def: EnemyItemDef;
  stats: EnemyItemStats;
  /** Infinity — без ограничения зарядов. */
  charges: number;
  /** Таймер пассивного предмета (щит). */
  timer: number;
}

export interface EnemyState {
  id: EnemyId;
  mod: ModifierId | null;
  /** Множитель здоровья и силы предметов (ночь × ветеран). */
  power: number;
  hp: number;
  maxHp: number;
  block: number;
  /** Подготовка текущего действия (общий таймер действий). */
  actionTimer: number;
  stun: number;
  /** Герой уже попал по этому врагу (для двойного первого удара призрака). */
  hitOnce: boolean;
  /** Чуткий сон: сколько секунд ещё готовит удары быстрее. */
  haste: number;
  /** Ещё увернётся от следующей бомбы (ведьмак — от первой). */
  dodgeBomb: boolean;
  slots: EnemySlot[];
  /** Слоты в порядке использования: priority, при равенстве — порядок в раскладке. */
  order: EnemySlot[];
}

/** Что произошло за шаг — сцена превращает это во вспышки, цифры и звуки. */
export type BattleEvent =
  | { type: 'heroItem'; uid: number; name: string; active: boolean }
  | { type: 'heroCharge'; uid: number; left: number }
  | { type: 'enemyItem'; uid: number; name: string }
  | { type: 'enemyCharge'; uid: number; left: number }
  /** halved — урон срезан модификатором врага (кольчуга, набожный). */
  | { type: 'enemyHit'; taken: number; absorbed: number; buffed: boolean; firstStrike: boolean; halved: boolean; item: ItemId }
  | { type: 'heroHit'; taken: number; absorbed: number; self: boolean }
  | { type: 'heroHeal'; amount: number }
  | { type: 'enemyHeal'; amount: number }
  | { type: 'heroBlock'; amount: number }
  | { type: 'enemyBlock'; amount: number }
  | { type: 'stun'; seconds: number }
  | { type: 'buff'; mult: number }
  | { type: 'onHit'; uid: number; steal: number }
  // Соседство
  | { type: 'burned'; uid: number; name: string; reason: string }
  | { type: 'enabled'; uid: number; name: string }
  | { type: 'poisoned'; uid: number; name: string }
  | { type: 'explode'; uid: number; name: string; damage: number }
  | { type: 'bonusLost'; uid: number; name: string }
  // Условия заказчиков и модификаторы врагов
  | { type: 'blocked'; uid: number; name: string; reason: string }
  | { type: 'enemyMiss'; name: string }
  | { type: 'woke'; seconds: number }
  // Босс
  | { type: 'dodge'; name: string; item: string }
  // Парирование: замах атаки врага (появилась картинка) и удар (окно закрылось или игрок парировал)
  | { type: 'windup'; id: number; uid: number; item: EnemyItemId }
  | { type: 'strike'; id: number; parried: boolean };

/** Атака врага «в полёте»: картинка висит, удар придёт, когда left (сек реального времени) дойдёт до нуля. */
export interface PendingAttack {
  id: number;
  slot: EnemySlot;
  left: number;
  total: number;
}

/**
 * fight     — идёт бой с текущим врагом;
 * enemyDown — враг повержен, дальше ещё враги;
 * won       — побеждён последний враг цепочки; lost — герой погиб.
 */
export type BattleStatus = 'fight' | 'enemyDown' | 'won' | 'lost';

export interface BattleConfig {
  /** Предметы героя в сетке. Сам бой их не меняет: расход зарядов и взрывы сообщает событиями. */
  items: OwnedItem[];
  chain: ChainLink[];
  /** Заказчик каждого заказа цепочки по порядку (условия заказчиков). Длина = число заказов. */
  clients: ClientId[];
  night: number;
  rng?: Rng;
}

export class BattleSim {
  readonly chain: ChainLink[];
  readonly clients: ClientId[];
  readonly night: number;
  private rng: Rng;

  /** Здоровье героя в эту ночь (растёт с уровнем). */
  readonly heroMaxHp: number;
  heroHp: number;
  block = 0;
  weaponBuff = { mult: 1, time: 0 };
  /** Предметы героя, которые ещё в рюкзаке. */
  items: OwnedItem[];
  /** Итоговые характеристики и эффекты соседства — для подсказок. */
  powers = new Map<number, ItemPower>();
  /** Эффекты соседства при текущем враге — для полосок связей на сетке. */
  effects: AppliedEffect[] = [];
  slots: HeroSlot[] = [];
  index = 0;
  enemy!: EnemyState;
  /** Украдено из награды каждого заказа. */
  stolen: number[];
  status: BattleStatus = 'fight';
  /** Атаки текущего врага в полёте (окно парирования). Смерть врага их отменяет. */
  pending: PendingAttack[] = [];
  private nextPendingId = 1;
  private events: BattleEvent[] = [];

  constructor(cfg: BattleConfig) {
    this.chain = cfg.chain;
    this.clients = cfg.clients;
    this.night = cfg.night;
    this.heroMaxHp = HERO_HP_BY_NIGHT[cfg.night - 1];
    this.heroHp = this.heroMaxHp;
    this.rng = cfg.rng ?? Math.random;
    this.stolen = Array.from({ length: cfg.clients.length }, () => 0);
    this.items = [...cfg.items];
    this.slots = this.items.map((item) => ({
      item,
      def: ITEMS[item.id],
      stats: { price: 0 }, // заполнит recompute()
      disabled: false,
      poisoned: false,
      timer: 0,
      charges: item.charges ?? Infinity, // без зарядов (меч, щит) — срабатывает без счёта
    }));
    this.spawn(true); // первый враг и соседство с учётом условия его заказа
    this.explodeAtStart();
  }

  /** Заказчик текущего врага. */
  get client(): ClientId {
    return this.clients[this.chain[this.index].contract];
  }

  /** Условие заказчика, которое действует сейчас (только на врагов его заказа). */
  get condition(): ClientCondition {
    return CLIENTS[this.client].condition;
  }

  /**
   * Чей заказ не даёт отступить на привале: заказчик с «без спешки», чей заказ ещё не выполнен.
   * На привале выполнены все заказы до следующего врага. null — отступить можно.
   */
  get retreatBlockedBy(): ClientId | null {
    const next = this.chain[this.defeated];
    if (!next) return null;
    return this.clients.slice(next.contract).find((c) => CLIENTS[c].condition.noRetreat) ?? null;
  }

  /** Пассивные предметы с перезарядкой (срабатывают сами). */
  get passives(): HeroSlot[] {
    return this.slots.filter((s) => s.def.mode === 'passive');
  }

  get actives(): HeroSlot[] {
    return this.slots.filter((s) => s.def.mode === 'active');
  }

  /** Сколько врагов цепочки уже побеждено. */
  get defeated(): number {
    return this.status === 'fight' || this.status === 'lost' ? this.index : this.index + 1;
  }

  /** Следующий враг относится к другому заказу (пауза — это привал). */
  get nextIsNewContract(): boolean {
    const next = this.chain[this.index + 1];
    return !!next && next.contract !== this.chain[this.index].contract;
  }

  /** Забрать события, накопленные с прошлого вызова. */
  drain(): BattleEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Перейти к следующему врагу после паузы enemyDown. */
  advance(): void {
    if (this.status !== 'enemyDown') return;
    this.index++;
    this.spawn();
    this.status = 'fight';
  }

  // ─── Соседство ───────────────────────────────────────────────────────────

  /**
   * Внешние запреты сейчас: условие заказчика текущего врага и враг с факелом (вся Еда сгорает).
   * Причина видна в подсказке предмета.
   */
  private blockRule(): BlockRule {
    const client = CLIENTS[this.client];
    const ban = client.condition.ban ?? [];
    const reason = `${client.condition.title.toLowerCase()} (заказ ${client.genitive})`;
    const link = this.chain[this.index];
    const torch = link.mod === 'torchbearer';
    const torchReason = `сгорела — ${enemyName(link.enemy, link.mod).toLowerCase()}`;
    return (id) => {
      if (ban.some((sel) => matches(sel, id))) return reason;
      if (torch && ITEMS[id].category === 'food') return torchReason;
      return null;
    };
  }

  /** Пересчитать соседство по оставшимся предметам и внешним запретам и сообщить, что изменилось. */
  private recompute(initial = false): void {
    const power = computePower(this.items, this.blockRule());
    this.powers = power.powers;
    this.effects = power.effects;
    for (const slot of this.slots) {
      const p = this.powers.get(slot.item.uid)!;
      const was = { disabled: slot.disabled, stats: slot.stats };
      slot.stats = p.final;
      slot.disabled = p.disabled;
      slot.poisoned = p.poisoned;
      const name = slot.def.name;
      const uid = slot.item.uid;
      if (initial) {
        if (p.blockedBy) {
          this.events.push({ type: 'blocked', uid, name, reason: p.blockedBy });
        } else if (p.disabled) {
          const by = p.received.find((e) => e.rule.effect.kind === 'disable');
          this.events.push({ type: 'burned', uid, name, reason: by?.label ?? 'Отключён' });
        }
        if (p.poisoned) this.events.push({ type: 'poisoned', uid, name });
        continue;
      }
      if (!was.disabled && p.disabled && p.blockedBy) this.events.push({ type: 'blocked', uid, name, reason: p.blockedBy });
      else if (was.disabled && !p.disabled) this.events.push({ type: 'enabled', uid, name });
      else if (!p.disabled && statsWeaker(p.final, was.stats)) this.events.push({ type: 'bonusLost', uid, name });
    }
  }

  /** Шумные предметы рядом с огнём могут взорваться в начале боя: урон герою, все заряды теряются. */
  private explodeAtStart(): void {
    let removed = false;
    for (const slot of [...this.slots]) {
      const p = this.powers.get(slot.item.uid)!;
      if (p.disabled || p.explodeChance <= 0 || this.rng() >= p.explodeChance) continue;
      this.heroHp = Math.max(1, this.heroHp - p.explodeDamage); // взрыв не убивает в начале дня
      this.events.push({ type: 'explode', uid: slot.item.uid, name: slot.def.name, damage: p.explodeDamage });
      this.events.push({ type: 'heroHit', taken: p.explodeDamage, absorbed: 0, self: true });
      this.removeSlot(slot);
      removed = true;
    }
    if (removed) this.recompute();
  }

  private removeSlot(slot: HeroSlot): void {
    this.slots = this.slots.filter((s) => s !== slot);
    this.items = this.items.filter((i) => i.uid !== slot.item.uid);
  }

  /** Вывести врага chain[index] и пересчитать запреты: условие его заказа (initial — начало дня). */
  private spawn(initial = false): void {
    const { enemy: id, mod } = this.chain[this.index];
    const def = ENEMIES[id];
    const power = enemyPower(this.night, mod);
    const hp = Math.round(ENEMY_STATS[id].hp * power);
    const slots: EnemySlot[] = def.bag.map((b, i) => {
      const stats = ENEMY_ITEM_STATS[b.item];
      return {
        uid: i,
        inGrid: true,
        col: b.col,
        row: b.row,
        rotated: b.rotated ?? false,
        def: ENEMY_ITEMS[b.item],
        stats,
        charges: stats.charges ?? Infinity,
        timer: 0,
      };
    });
    const order = [...slots].sort((a, b) => a.def.priority - b.def.priority || a.uid - b.uid);
    this.enemy = { id, mod, power, hp, maxHp: hp, block: 0, actionTimer: 0, stun: 0, hitOnce: false, haste: 0, dodgeBomb: !!def.dodgeFirstBomb, slots, order };
    for (const p of this.passives) p.timer = 0;
    this.recompute(initial);
  }

  // ─── Время ───────────────────────────────────────────────────────────────

  /** Продвинуть бой на dt секунд игрового времени. */
  /**
   * Продвинуть бой: dt — игровое время (с ускорением), realDt — реальное (окна парирования от ускорения не зависят).
   * Симуляция передаёт одно dt — для неё это бой на ×1.
   */
  step(dt: number, realDt = dt): void {
    if (this.status !== 'fight') return;

    // Атаки в полёте: окно закрылось — удар.
    for (const p of [...this.pending]) {
      p.left -= realDt;
      if (p.left > 0) continue;
      this.strike(p, false);
      if (this.checkEnd()) return;
    }

    if (this.weaponBuff.time > 0) {
      this.weaponBuff.time = Math.max(0, this.weaponBuff.time - dt);
      if (this.weaponBuff.time === 0) this.weaponBuff.mult = 1;
    }

    for (const p of this.passives) {
      if (p.disabled || !p.stats.cooldown) continue; // сгоревшее и амулеты без своего действия не тикают
      p.timer += dt;
      if (p.timer >= p.stats.cooldown) {
        p.timer -= p.stats.cooldown;
        this.events.push({ type: 'heroItem', uid: p.item.uid, name: p.def.name, active: false });
        this.applyHero(p);
        if (Number.isFinite(p.charges)) this.spendHeroCharge(p); // хлеб съедается
        if (this.checkEnd()) return;
      }
    }

    const e = this.enemy;
    if (e.haste > 0) e.haste = Math.max(0, e.haste - dt); // чуткий сон: время идёт и под оглушением
    if (e.stun > 0) {
      e.stun = Math.max(0, e.stun - dt); // оглушённый враг не готовит действия и не тикает щитом
      return;
    }
    for (const s of e.slots) {
      if (s.def.mode !== 'passive' || s.charges <= 0) continue;
      s.timer += dt;
      if (s.timer >= s.stats.cooldown!) {
        s.timer -= s.stats.cooldown!;
        this.useEnemyItem(s);
      }
    }
    const next = this.nextAction();
    if (next) {
      e.actionTimer += dt * (e.haste > 0 ? MODIFIER_STATS.lightSleeperSpeed : 1);
      if (e.actionTimer >= next.stats.cooldown!) {
        e.actionTimer = 0;
        this.useEnemyItem(next);
        this.checkEnd();
      }
    }
  }

  // ─── Герой ───────────────────────────────────────────────────────────────

  /** Игрок нажал картинку атаки: удар приходит сразу, ослабленный (PARRY_DAMAGE_MULT), и не крадёт монеты. */
  parry(id: number): boolean {
    const p = this.pending.find((a) => a.id === id);
    if (!p || this.status !== 'fight') return false;
    this.strike(p, true);
    this.checkEnd();
    return true;
  }

  /** Применить активный предмет героя. false — нельзя (не бой, отключён, нет зарядов, не активный). */
  useActive(uid: number): boolean {
    const slot = this.actives.find((a) => a.item.uid === uid);
    if (!slot || this.status !== 'fight' || slot.disabled || slot.charges <= 0) return false;
    this.events.push({ type: 'heroItem', uid, name: slot.def.name, active: true });
    this.applyHero(slot);
    // Чуткий сон: шумный предмет будит врага — он какое-то время готовит удары быстрее.
    if (slot.def.tags.includes('noisy') && this.enemy.mod === 'lightSleeper') {
      this.enemy.haste = MODIFIER_STATS.lightSleeperSeconds;
      this.events.push({ type: 'woke', seconds: MODIFIER_STATS.lightSleeperSeconds });
    }
    this.spendHeroCharge(slot);
    this.checkEnd();
    return true;
  }

  /** Потратить заряд предмета героя; последний — предмет исчезает, его влияние на соседей пропадает сразу. */
  private spendHeroCharge(slot: HeroSlot): void {
    slot.charges--;
    this.events.push({ type: 'heroCharge', uid: slot.item.uid, left: slot.charges });
    if (slot.charges <= 0) {
      this.removeSlot(slot);
      this.recompute();
    }
  }

  private applyHero(slot: HeroSlot): void {
    const { def, stats: s } = slot;
    // Ведьмак уворачивается от первой бомбы: заряд тратится (это делает useActive), эффекта нет.
    if (def.tags.includes('bomb') && this.enemy.dodgeBomb) {
      this.enemy.dodgeBomb = false;
      this.events.push({ type: 'dodge', name: ENEMIES[this.enemy.id].name, item: def.name });
      return;
    }
    if (s.damage) {
      const mult = def.category === 'weapon' ? this.weaponBuff.mult : 1;
      const resist = this.resistMult(def);
      this.damageEnemy(Math.round(s.damage * mult * resist), mult > 1, resist < 1, def.id);
    }
    if (s.heal) {
      if (slot.poisoned) {
        // Отравленная еда: лечение превращается в урон по герою.
        const dmg = Math.round(s.heal);
        this.heroHp = Math.max(0, this.heroHp - dmg);
        this.events.push({ type: 'heroHit', taken: dmg, absorbed: 0, self: true });
      } else {
        const amount = Math.min(Math.round(s.heal), this.heroMaxHp - this.heroHp);
        this.heroHp += amount;
        this.events.push({ type: 'heroHeal', amount });
      }
    }
    if (s.block) {
      const amount = Math.round(s.block);
      this.block = Math.min(BLOCK_MAX, this.block + amount);
      this.events.push({ type: 'heroBlock', amount });
    }
    if (s.stun) {
      this.enemy.stun = Math.max(this.enemy.stun, s.stun);
      this.events.push({ type: 'stun', seconds: Math.round(s.stun * 10) / 10 });
    }
    if (s.weaponMult) {
      this.weaponBuff = { mult: s.weaponMult, time: s.buffDuration ?? 0 };
      this.events.push({ type: 'buff', mult: s.weaponMult });
    }
    if (s.selfDamage && this.rng() < (s.selfDamageChance ?? 1)) {
      this.heroHp = Math.max(0, this.heroHp - s.selfDamage);
      this.events.push({ type: 'heroHit', taken: s.selfDamage, absorbed: 0, self: true });
    }
  }

  /** Какую долю урона предмета героя получает текущий враг: кольчуга режет обычное оружие, набожный — Проклятое. */
  private resistMult(def: ItemDef): number {
    const mod = this.enemy.mod;
    let m = 1;
    if (mod === 'chainmail' && def.category === 'weapon' && !def.tags.includes('fire')) {
      m *= MODIFIER_STATS.chainmailMult;
    }
    if (mod === 'pious' && def.tags.includes('curse')) m *= MODIFIER_STATS.piousMult;
    return m;
  }

  private damageEnemy(dmg: number, buffed: boolean, halved: boolean, item: ItemId): void {
    // Призрак: первый удар героя по каждому врагу его заказа — усиленный.
    const firstStrike = !this.enemy.hitOnce && !!this.condition.firstHitBonus;
    this.enemy.hitOnce = true;
    if (firstStrike) dmg = Math.round(dmg * GHOST_FIRST_HIT_MULT);
    const absorbed = Math.min(this.enemy.block, dmg);
    this.enemy.block -= absorbed;
    const taken = dmg - absorbed;
    this.enemy.hp = Math.max(0, this.enemy.hp - taken);
    this.events.push({ type: 'enemyHit', taken, absorbed, buffed, firstStrike, halved, item });
  }

  // ─── Враг ────────────────────────────────────────────────────────────────

  /** Следующее действие врага: первый доступный предмет-действие по порядку использования. */
  nextAction(): EnemySlot | null {
    const e = this.enemy;
    return (
      e.order.find(
        (s) => s.def.mode === 'action' && s.charges > 0 && (!s.stats.healBelow || e.hp / e.maxHp < s.stats.healBelow),
      ) ?? null
    );
  }

  private useEnemyItem(slot: EnemySlot): void {
    const e = this.enemy;
    const s = slot.stats;
    this.events.push({ type: 'enemyItem', uid: slot.uid, name: slot.def.name });
    if (Number.isFinite(slot.charges)) {
      slot.charges--;
      this.events.push({ type: 'enemyCharge', uid: slot.uid, left: slot.charges });
    }
    if (s.damage) {
      // Атака не бьёт сразу: замах, окно парирования (реальное время), потом удар (strike).
      const window = FEEL.parry.window;
      const p: PendingAttack = { id: this.nextPendingId++, slot, left: window, total: window };
      this.pending.push(p);
      this.events.push({ type: 'windup', id: p.id, uid: slot.uid, item: slot.def.id });
    }
    if (s.heal) {
      const amount = Math.min(Math.round(s.heal * e.power), e.maxHp - e.hp);
      e.hp += amount;
      this.events.push({ type: 'enemyHeal', amount });
    }
    if (s.block) {
      const amount = Math.round(s.block * e.power);
      e.block = Math.min(ENEMY_BLOCK_MAX, e.block + amount);
      this.events.push({ type: 'enemyBlock', amount });
    }
  }

  /** Удар атаки в полёте: полный или парированный. Пьяный бросает кубик на промах в момент удара. */
  private strike(p: PendingAttack, parried: boolean): void {
    this.pending = this.pending.filter((a) => a !== p);
    this.events.push({ type: 'strike', id: p.id, parried });
    const e = this.enemy;
    const s = p.slot.stats;
    if (e.mod === 'drunk' && this.rng() < MODIFIER_STATS.drunkMiss) {
      // Пьяный промахнулся: урона нет, мешок не срабатывает (заряд всё равно потрачен).
      this.events.push({ type: 'enemyMiss', name: p.slot.def.name });
      return;
    }
    const dmg = (s.damage ?? 0) * e.power * enemyDamageMult(e.mod) * (s.monsterMult ?? 1) * (parried ? PARRY_DAMAGE_MULT : 1);
    const taken = this.damageHero(Math.round(dmg));
    if (taken > 0 && !parried) {
      // Мешок разбойника: крадёт при каждом прошедшем ударе; парированный удар не крадёт.
      for (const o of e.slots) {
        if (o.def.mode !== 'onHit') continue;
        const steal = o.stats.stealCoins ?? 0;
        this.stolen[this.chain[this.index].contract] += steal;
        this.events.push({ type: 'onHit', uid: o.uid, steal });
      }
    }
  }

  /** Урон герою: сначала съедает блок. Возвращает урон по здоровью. */
  private damageHero(dmg: number): number {
    const absorbed = Math.min(this.block, dmg);
    this.block -= absorbed;
    const taken = dmg - absorbed;
    this.heroHp = Math.max(0, this.heroHp - taken);
    this.events.push({ type: 'heroHit', taken, absorbed, self: false });
    return taken;
  }

  // ─── Исход ───────────────────────────────────────────────────────────────

  /** true — бой с текущим врагом закончен. Привал между заказами — только пауза, здоровье не восстанавливается. */
  private checkEnd(): boolean {
    if (this.enemy.hp <= 0) {
      this.status = this.index >= this.chain.length - 1 ? 'won' : 'enemyDown';
      this.pending = []; // убитый враг уже не ударит: его атаки в полёте отменяются
      return true;
    }
    if (this.heroHp <= 0) {
      this.status = 'lost';
      return true;
    }
    return false;
  }
}

/** Какая-то из характеристик стала меньше (пропал бонус соседа). */
function statsWeaker(now: ItemStats, before: ItemStats): boolean {
  return (['damage', 'heal', 'block', 'stun', 'buffDuration'] as const).some((k) => (now[k] ?? 0) < (before[k] ?? 0) - 1e-9);
}
