// Логика боя без Phaser и графики. Её используют и сцена боя, и симуляция (npm run sim).
// Сцена двигает время (step), передаёт нажатия (useActive) и рисует события (drain).
// Характеристики предметов героя — итоговые с учётом ★ и соседства (src/systems/synergy.ts);
// когда предмет исчезает или меняется враг, соседство пересчитывается сразу.
// Условие заказчика действует только в бою с врагами своего заказа (запреты предметов, двойной первый удар).
import {
  BLOCK_MAX,
  ENEMY_BLOCK_MAX,
  ENEMY_ITEM_STATS,
  ENEMY_PATTERN,
  ENEMY_STAT_MULT_BY_NIGHT,
  ENEMY_STATS,
  GHOST_FIRST_HIT_MULT,
  HERO_HP_BY_NIGHT,
  MODIFIER_STATS,
  PARRY_DAMAGE_MULT,
  PARRY_PERK,
  PARRY_REWARD_SHARE,
  type PARRY_RATE_BY_KIND,
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
import { computePower, matches, shieldSlow, type AppliedEffect, type BlockRule, type ItemPower } from './synergy';

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
  /** Таймер пассивного предмета (щит) и оружия со своей перезарядкой. */
  timer: number;
  /** Бьёт по своей перезарядке, а не через общий таймер действий (оружие врага с parallelWeapons). */
  own: boolean;
  /** Прибавка от аур соседей (подкова ведьмака): урон и лечение × (1 + boost); уже в stats. */
  boost: number;
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
  /** Факел героя: на столько секунд дольше перезаряжаются все его предметы (копится до конца боя с ним). */
  torchSlow: number;
  /** Ростовой щит сбит: ещё столько секунд урон героя проходит полностью. */
  guardBroken: number;
  /** Монах: крест закончился — можно бросить святую воду; blessed — ритуал прошёл, вода освящена. */
  ritualReady: boolean;
  blessed: boolean;
  /** Разбойник: кружок бегства уже был; escaped — сбежал (бой с ним закончен, украденное не вернуть). */
  escapeTried: boolean;
  escaped: boolean;
  /** Сколько этот враг украл из кошелька и из награды (вернётся, если его убить). */
  stolenWallet: number;
  stolenReward: number;
  /** Знак Квен: купол поднят; таймер до следующего купола; сколько атак отбито подряд; сколько раз уже был. */
  quenOn: boolean;
  quenTimer: number;
  quenStreak: number;
  quenCount: number;
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
  /** halved — урон срезан модификатором врага (кольчуга, набожный); guarded — ростовым щитом; quen — поглощён Квеном. */
  | { type: 'enemyHit'; taken: number; absorbed: number; buffed: boolean; firstStrike: boolean; halved: boolean; guarded: boolean; quen: boolean; pierced: boolean; item: ItemId | null }
  | { type: 'heroHit'; taken: number; absorbed: number; self: boolean }
  | { type: 'heroHeal'; amount: number }
  | { type: 'enemyHeal'; amount: number }
  | { type: 'heroBlock'; amount: number }
  | { type: 'enemyBlock'; amount: number }
  | { type: 'stun'; seconds: number }
  | { type: 'buff'; mult: number }
  /** Мешок: украдено из кошелька (wallet) и из награды (reward); refund — убил вора, украденное вернулось. */
  | { type: 'steal'; uid: number; wallet: number; reward: number }
  | { type: 'refund'; wallet: number; reward: number }
  /** Перки основного оружия: факел замедлил врага (итог, сек), топор набрал заряд, топор ударил двойным. */
  | { type: 'torchSlow'; seconds: number }
  | { type: 'axeCharge'; charges: number }
  | { type: 'axeRelease'; uid: number }
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
  // Рисунки врагов: щит стражника сбит / поднят, ритуал монаха, бегство разбойника, Квен, бомба назад, оглушение героя
  | { type: 'guardBroken'; seconds: number }
  | { type: 'guardUp' }
  | { type: 'ritual'; broken: boolean }
  | { type: 'escaped'; name: string }
  | { type: 'quen'; on: boolean }
  | { type: 'reflect'; damage: number }
  | { type: 'heroStun'; seconds: number }
  // Парирование: прицел (до выстрела), замах атаки врага (появилась картинка) и удар (окно закрылось или игрок парировал)
  | { type: 'aim'; id: number; item: EnemyItemId; seconds: number }
  /** Рисунок серии group проявляется за seconds до первого удара: копьё — жёлтый отрезок, крест (kind 'cross') — весь крест. */
  | { type: 'telegraph'; group: number; seconds: number; kind?: AttackKind }
  | { type: 'windup'; id: number; uid: number; item: EnemyItemId; kind: AttackKind; group: number | null; index: number; from: number | null; partner: number | null }
  | { type: 'strike'; id: number; parried: boolean };

/** Вид кружка на поле (рисунок атаки и особые кружки: мешок, щит стражника, бегство). */
export type AttackKind = keyof typeof PARRY_RATE_BY_KIND;

/** Атака врага «в полёте»: картинка висит, удар придёт, когда left (сек реального времени) дойдёт до нуля. */
export interface PendingAttack {
  id: number;
  slot: EnemySlot;
  left: number;
  total: number;
  kind: AttackKind;
  /** Ещё столько секунд до появления (следующий удар серии, прицел, мешок после кистеня). */
  delay: number;
  shown: boolean;
  /** Серия (крест, очередь): номер серии и место удара в ней. */
  group: number | null;
  index: number;
  /** Пара «кистень + мешок»: другой кружок пары; отбил один — второй нельзя отбить (locked). */
  partner: number | null;
  locked: boolean;
  /** Кружок щита стражника — в конце какого выпада. */
  from: number | null;
  /** Множитель урона (освящённая святая вода). */
  mult: number;
}

/** Серия ударов в полёте: сколько ударов, сколько уже пришло и сколько отбито. */
interface AttackGroup {
  total: number;
  done: number;
  parried: number;
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
  /** Здоровье героя в начале боя (финальный босс — сколько осталось после дня). Нет — полное. */
  heroHp?: number;
  /** Основное оружие (uid): курсор и перк парирования. Нет — парировать нельзя. */
  mainUid?: number | null;
  /** Заряды топора с прошлых боёв этого дня (финальный бой — после дня). */
  axeCharges?: number;
  /** Монеты героя в начале боя: мешок разбойника крадёт из них. */
  coins?: number;
}

/**
 * Ауры в сумке врага: предмет с auraBoost усиливает урон и лечение предметов, касающихся его стороной клетки.
 * Прибавки складываются; итог — сразу в stats слота, прибавка — в boost (для подсказки).
 */
function applyEnemyAuras(slots: EnemySlot[]): void {
  const cells = (s: EnemySlot) => {
    const w = s.rotated ? s.def.h : s.def.w;
    const h = s.rotated ? s.def.w : s.def.h;
    const out: [number, number][] = [];
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) out.push([s.col + c, s.row + r]);
    return out;
  };
  const owner = new Map<string, EnemySlot>();
  for (const s of slots) for (const [c, r] of cells(s)) owner.set(`${c},${r}`, s);
  for (const src of slots) {
    const amount = src.stats.auraBoost;
    if (!amount) continue;
    const touched = new Set<EnemySlot>();
    for (const [c, r] of cells(src)) {
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const t = owner.get(`${c + dc},${r + dr}`);
        if (t && t !== src) touched.add(t);
      }
    }
    for (const t of touched) t.boost += amount;
  }
  for (const s of slots) {
    if (!s.boost) continue;
    if (s.stats.damage) s.stats.damage *= 1 + s.boost;
    if (s.stats.heal) s.stats.heal *= 1 + s.boost;
  }
}

/** Условие, когда у врага нет заказчика (финальный босс). */
const NO_CONDITION: ClientCondition = { title: '' };

export class BattleSim {
  readonly chain: ChainLink[];
  readonly clients: ClientId[];
  readonly night: number;
  private rng: Rng;
  /** Детерминированный пятиударный цикл шанса пробить блок для каждого предмета. */
  private blockPierceAttacks = new Map<number, number>();

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
  /** По каждому заказу: сколько атак врагов дошло до удара и сколько из них отбито (условие Безголового). */
  attacks: number[];
  parried: number[];
  /** Атаки текущего врага в полёте (окно парирования). Смерть врага их отменяет. */
  pending: PendingAttack[] = [];
  private nextPendingId = 1;
  private groups = new Map<number, AttackGroup>();
  private nextGroupId = 1;
  /** Монеты героя: в начале боя и сейчас (мешок разбойника крадёт, смерть вора возвращает). */
  private coinsStart: number;
  wallet: number;
  /** Герой оглушён (пропущенная бомба ведьмака): ещё столько секунд активные предметы не нажимаются. */
  heroStun = 0;
  private events: BattleEvent[] = [];

  constructor(cfg: BattleConfig) {
    this.chain = cfg.chain;
    this.clients = cfg.clients;
    this.night = cfg.night;
    this.heroMaxHp = HERO_HP_BY_NIGHT[cfg.night - 1];
    this.heroHp = Math.min(this.heroMaxHp, Math.max(1, cfg.heroHp ?? this.heroMaxHp));
    this.mainUid = cfg.mainUid ?? null;
    this.axeCharges = cfg.axeCharges ?? 0;
    this.coinsStart = cfg.coins ?? 0;
    this.wallet = this.coinsStart;
    this.rng = cfg.rng ?? Math.random;
    this.stolen = Array.from({ length: cfg.clients.length }, () => 0);
    this.attacks = Array.from({ length: cfg.clients.length }, () => 0);
    this.parried = Array.from({ length: cfg.clients.length }, () => 0);
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

  /** Сколько монет кошелька за бой унёс мешок (без возвращённого). */
  get walletLost(): number {
    return this.coinsStart - this.wallet;
  }

  /** Отбито ли не меньше PARRY_REWARD_SHARE атак врагов заказа k (атак не было — да). */
  parryGoalMet(k: number): boolean {
    return this.attacks[k] === 0 || this.parried[k] / this.attacks[k] >= PARRY_REWARD_SHARE;
  }

  /** Для итогов дня: выполнено ли условие на отбитые атаки по каждому заказу. */
  get parryGoals(): boolean[] {
    return this.clients.map((_, k) => this.parryGoalMet(k));
  }

  /** Заказчик текущего врага (null — у финального босса заказчика нет). */
  get client(): ClientId | null {
    return this.clients[this.chain[this.index].contract] ?? null;
  }

  /** Условие заказчика, которое действует сейчас (только на врагов его заказа). */
  get condition(): ClientCondition {
    return this.client ? CLIENTS[this.client].condition : NO_CONDITION;
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

  /**
   * Щит-курсор: уровень лучшего работающего щита в рюкзаке (0 — щита нет или он отключён). Есть щит — атаки
   * отбиваются им; медлительность (атаки предметов героя реже) — в computePower.
   */
  get shieldStar(): number {
    let best = 0;
    for (const s of this.slots) if (s.def.parryShield && !s.disabled) best = Math.max(best, s.item.star ?? 1);
    return best;
  }

  /** Медлительность от щитов: на сколько секунд реже бьют предметы героя с уроном (сумма по работающим щитам). */
  get slowSec(): number {
    return shieldSlow(this.items, this.powers);
  }

  get slowed(): boolean {
    return this.slowSec > 0;
  }

  /** Основное оружие (uid) — курсор и перк парирования. */
  readonly mainUid: number | null;
  /** Заряды топора за парирования (весь день); набрал PARRY_PERK.axeCharges — следующий удар топора двойной. */
  axeCharges: number;

  /** Основное оружие в бою, если оно есть и работает (не отключено). null — парировать нельзя. */
  get mainSlot(): HeroSlot | null {
    const s = this.slots.find((x) => x.item.uid === this.mainUid);
    return s && !s.disabled && s.def.parryPerk ? s : null;
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
    const client = this.client ? CLIENTS[this.client] : null;
    const ban = client?.condition.ban ?? [];
    const reason = client ? `${client.condition.title.toLowerCase()} (заказ ${client.genitive})` : '';
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
      const itemDef = ENEMY_ITEMS[b.item];
      return {
        uid: i,
        inGrid: true,
        col: b.col,
        row: b.row,
        rotated: b.rotated ?? false,
        def: itemDef,
        stats: { ...stats },
        charges: stats.charges ?? Infinity,
        timer: 0,
        // Своя перезарядка: оружие ведьмака (parallelWeapons) и пистоль (прицел) — стреляет параллельно со шпагой.
        own: (!!def.parallelWeapons && itemDef.mode === 'action' && itemDef.category === 'weapon') || itemDef.pattern === 'aim',
        boost: 0,
      };
    });
    applyEnemyAuras(slots);
    const order = [...slots].sort((a, b) => a.def.priority - b.def.priority || a.uid - b.uid);
    this.enemy = {
      id,
      mod,
      power,
      hp,
      maxHp: hp,
      block: 0,
      actionTimer: 0,
      stun: 0,
      hitOnce: false,
      haste: 0,
      dodgeBomb: !!def.dodgeFirstBomb,
      torchSlow: 0,
      guardBroken: 0,
      ritualReady: false,
      blessed: false,
      escapeTried: false,
      escaped: false,
      stolenWallet: 0,
      stolenReward: 0,
      quenOn: false,
      quenTimer: 0,
      quenStreak: 0,
      quenCount: 0,
      slots,
      order,
    };
    this.groups.clear();
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

    // Атаки в полёте: ещё не появилась — ждёт своей очереди; окно закрылось — удар.
    for (const p of [...this.pending]) {
      if (!p.shown) {
        p.delay -= realDt;
        if (p.delay > 0) continue;
        this.show(p);
        continue;
      }
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
        // Топор-основное с полными зарядами: этот удар двойной, заряды сгорают.
        let mult = 1;
        if (p.def.parryPerk === 'axe' && p.item.uid === this.mainUid && this.axeCharges >= PARRY_PERK.axeCharges) {
          mult = PARRY_PERK.axeMult;
          this.axeCharges = 0;
          this.events.push({ type: 'axeRelease', uid: p.item.uid });
        }
        this.applyHero(p, mult);
        if (Number.isFinite(p.charges)) this.spendHeroCharge(p); // хлеб съедается
        if (this.checkEnd()) return;
      }
    }

    if (this.heroStun > 0) this.heroStun = Math.max(0, this.heroStun - dt);
    const e = this.enemy;
    if (e.guardBroken > 0) {
      e.guardBroken = Math.max(0, e.guardBroken - dt);
      if (e.guardBroken === 0) this.events.push({ type: 'guardUp' });
    }
    // Знак Квен: через first (потом every) секунд — купол.
    if (ENEMIES[e.id].quen && !e.quenOn) {
      e.quenTimer += dt;
      if (e.quenTimer >= (e.quenCount ? ENEMY_PATTERN.quen.every : ENEMY_PATTERN.quen.first)) {
        e.quenOn = true;
        e.quenStreak = 0;
        e.quenCount++;
        this.events.push({ type: 'quen', on: true });
      }
    }
    if (e.haste > 0) e.haste = Math.max(0, e.haste - dt); // чуткий сон: время идёт и под оглушением
    if (e.stun > 0) {
      e.stun = Math.max(0, e.stun - dt); // оглушённый враг не готовит действия и не тикает щитом
      return;
    }
    for (const s of e.slots) {
      // Щит — сам по перезарядке; оружие врага с parallelWeapons — тоже, каждое своё.
      if ((s.def.mode !== 'passive' && !s.own) || s.charges <= 0 || !s.stats.cooldown) continue;
      if (s.own && this.pending.some((p) => p.slot === s)) continue; // своё оружие ждёт, пока его удары в полёте
      s.timer += dt;
      if (s.timer >= s.stats.cooldown! + e.torchSlow) {
        s.timer -= s.stats.cooldown! + e.torchSlow;
        this.useEnemyItem(s);
      }
    }
    // Пока серия (крест, очередь) в полёте, следующее действие не готовится.
    const busy = this.pending.some((p) => p.group !== null && !p.slot.own);
    const next = busy ? null : this.nextAction();
    if (next) {
      e.actionTimer += dt * (e.haste > 0 ? MODIFIER_STATS.lightSleeperSpeed : 1);
      if (e.actionTimer >= next.stats.cooldown! + e.torchSlow) {
        e.actionTimer = 0;
        this.useEnemyItem(next);
        this.checkEnd();
      }
    }
  }

  // ─── Герой ───────────────────────────────────────────────────────────────

  /**
   * Игрок нажал картинку атаки: удар приходит сразу, ослабленный (PARRY_DAMAGE_MULT); мешок не крадёт, щит стражника
   * сбит, бегство сорвано, бомба летит обратно. Пара «кистень + мешок»: второй кружок пары отбить уже нельзя.
   */
  parry(id: number): boolean {
    const p = this.pending.find((a) => a.id === id);
    const main = this.mainSlot;
    if (!p || !p.shown || p.locked || !main || this.status !== 'fight') return false;
    if (p.partner !== null) {
      const q = this.pending.find((a) => a.id === p.partner);
      if (q) q.locked = true;
    }
    const perk = main.def.parryPerk!;
    this.strike(p, true, perk === 'shield' ? PARRY_PERK.shieldMult : PARRY_DAMAGE_MULT);
    if (this.status === 'fight') this.parryPerk(main);
    this.checkEnd();
    return true;
  }

  /** Перк основного оружия после парирования. */
  private parryPerk(main: HeroSlot): void {
    const perk = main.def.parryPerk;
    if (perk === 'dagger' && main.stats.damage) {
      // Кинжал отвечает долей своего урона (итог с соседями, бафф масла, сопротивление врага).
      const mult = this.weaponBuff.mult;
      const resist = this.resistMult(main.def);
      this.events.push({ type: 'heroItem', uid: main.item.uid, name: main.def.name, active: false });
      this.damageEnemy(Math.round(main.stats.damage * PARRY_PERK.daggerMult * mult * resist), mult > 1, resist < 1, main.def.id, main.item.uid);
    } else if (perk === 'torch') {
      const e = this.enemy;
      e.torchSlow = Math.min(PARRY_PERK.torchSlowMax, Math.round((e.torchSlow + PARRY_PERK.torchSlow) * 10) / 10);
      this.events.push({ type: 'torchSlow', seconds: e.torchSlow });
    } else if (perk === 'axe') {
      this.axeCharges = Math.min(PARRY_PERK.axeCharges, this.axeCharges + 1);
      this.events.push({ type: 'axeCharge', charges: this.axeCharges });
    } else if (perk === 'sickle') {
      const amount = Math.min(PARRY_PERK.sickleHeal, this.heroMaxHp - this.heroHp);
      this.heroHp += amount;
      this.events.push({ type: 'heroHeal', amount });
    }
  }

  /** Применить активный предмет героя. false — нельзя (не бой, отключён, нет зарядов, не активный). */
  useActive(uid: number): boolean {
    const slot = this.actives.find((a) => a.item.uid === uid);
    if (!slot || this.status !== 'fight' || slot.disabled || slot.charges <= 0 || this.heroStun > 0) return false;
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

  private applyHero(slot: HeroSlot, extraMult = 1): void {
    const { def, stats: s } = slot;
    // Ведьмак уворачивается от первой бомбы: заряд тратится (это делает useActive), эффекта нет.
    if (def.tags.includes('bomb') && this.enemy.dodgeBomb) {
      this.enemy.dodgeBomb = false;
      this.events.push({ type: 'dodge', name: ENEMIES[this.enemy.id].name, item: def.name });
      return;
    }
    if (s.damage) {
      const mult = (def.category === 'weapon' ? this.weaponBuff.mult : 1) * extraMult;
      const resist = this.resistMult(def);
      this.damageEnemy(Math.round(s.damage * mult * resist), mult > 1, resist < 1, def.id, slot.item.uid);
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

  private damageEnemy(dmg: number, buffed: boolean, halved: boolean, item: ItemId | null, itemUid?: number): void {
    const e = this.enemy;
    // Призрак: первый удар героя по каждому врагу его заказа — усиленный.
    const firstStrike = !e.hitOnce && !!this.condition.firstHitBonus;
    e.hitOnce = true;
    if (firstStrike) dmg = Math.round(dmg * GHOST_FIRST_HIT_MULT);
    // Квен поглощает всё; ростовой щит, пока не сбит, режет урон.
    const quen = e.quenOn;
    let guarded = false;
    if (quen) dmg = 0;
    else {
      const guard = e.slots.find((s) => s.stats.guardMult);
      if (guard && e.guardBroken <= 0) {
        dmg = Math.round(dmg * guard.stats.guardMult!);
        guarded = true;
      }
    }
    const chance = itemUid === undefined ? 0 : this.powers.get(itemUid)?.blockPierceChance ?? 0;
    const attackNo = itemUid === undefined ? 0 : this.blockPierceAttacks.get(itemUid) ?? 0;
    if (itemUid !== undefined) this.blockPierceAttacks.set(itemUid, attackNo + 1);
    const roll = itemUid === undefined ? 0 : (attackNo + itemUid % 5) % 5;
    const pierced = e.block > 0 && chance > 0 && roll < Math.round(chance * 5);
    const absorbed = pierced ? 0 : Math.min(e.block, dmg);
    e.block -= absorbed;
    const taken = dmg - absorbed;
    e.hp = Math.max(0, e.hp - taken);
    this.events.push({ type: 'enemyHit', taken, absorbed, buffed, firstStrike, halved, guarded, quen, pierced, item });
    // Разбойник: здоровье упало ниже порога — кружок бегства (один раз за бой).
    if (ENEMIES[e.id].escape && !e.escapeTried && e.hp > 0 && e.hp < e.maxHp * ENEMY_PATTERN.escapeBelow) {
      e.escapeTried = true;
      this.addPending(e.slots[0], 'escape', FEEL.parry.window * FEEL.patterns.escapeWindow, 0);
    }
  }

  // ─── Враг ────────────────────────────────────────────────────────────────

  /** Следующее действие врага: первый доступный предмет-действие по порядку использования. */
  nextAction(): EnemySlot | null {
    const e = this.enemy;
    return (
      e.order.find(
        (s) =>
          s.def.mode === 'action' &&
          !s.own &&
          s.charges > 0 &&
          (!s.stats.healBelow || e.hp / e.maxHp < s.stats.healBelow) &&
          (!s.def.afterRitual || e.ritualReady),
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
    // Святая вода — после креста; ритуал прошёл — освящённая.
    let mult = 1;
    if (slot.def.afterRitual) {
      if (e.blessed) mult = ENEMY_PATTERN.blessMult;
      e.blessed = false;
      e.ritualReady = false;
    }
    if (s.damage) {
      // Атака не бьёт сразу: замах, окно парирования (реальное время), потом удар (strike). Рисунок — по предмету.
      const W = FEEL.parry.window;
      const P = FEEL.patterns;
      const pat = slot.def.pattern;
      if ((pat === 'cross' || pat === 'burst' || pat === 'double') && (s.series ?? 1) > 1) {
        const group = this.nextGroupId++;
        this.groups.set(group, { total: s.series!, done: 0, parried: 0 });
        // Двойной удар копья: сначала проявляется отрезок (lead), удары — после.
        const lead = pat === 'double' ? s.lead ?? 0 : 0;
        if (pat === 'double') this.events.push({ type: 'telegraph', group, seconds: lead });
        // Крест: весь рисунок проступает до первого кружка серии (порядок сторон выбирает сцена).
        const tele = pat === 'cross' ? P.crossTelegraph : 0;
        if (pat === 'cross') this.events.push({ type: 'telegraph', group, seconds: tele, kind: 'cross' });
        for (let i = 0; i < s.series!; i++) this.addPending(slot, pat, W, lead + tele + i * (s.seriesStep ?? 0), group, i);
      } else if (pat === 'aim') {
        const p = this.addPending(slot, 'aim', W * P.aimWindow, s.aim ?? 0);
        this.events.push({ type: 'aim', id: p.id, item: slot.def.id, seconds: s.aim ?? 0 });
      } else {
        const kind: AttackKind = pat === 'thrust' ? 'thrust' : pat === 'reflect' ? 'reflect' : 'hit';
        const p = this.addPending(slot, kind, W * (kind === 'thrust' ? P.thrustWindow : 1), 0);
        p.mult = mult;
        // Мешок разбойника: с каждым ударом оружия — кружок мешка в другом месте; отбить можно что-то одно.
        const sack = e.slots.find((o) => o.def.mode === 'onHit');
        if (sack && slot.def.category === 'weapon') {
          const q = this.addPending(sack, 'sack', W, P.sackDelay);
          p.partner = q.id;
          q.partner = p.id;
          // Кистень уже на поле: сцене нужно знать его мешок (отрезок к месту, где мешок появится).
          for (const ev of this.events) if (ev.type === 'windup' && ev.id === p.id) ev.partner = q.id;
        }
      }
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

  /** Новый кружок на поле: появится через delay секунд (серия, прицел), окно — total секунд. */
  private addPending(slot: EnemySlot, kind: AttackKind, total: number, delay: number, group: number | null = null, index = 0, from: number | null = null): PendingAttack {
    const p: PendingAttack = {
      id: this.nextPendingId++,
      slot,
      left: total,
      total,
      kind,
      delay,
      shown: false,
      group,
      index,
      partner: null,
      locked: false,
      from,
      mult: 1,
    };
    this.pending.push(p);
    if (delay <= 0) this.show(p);
    return p;
  }

  /** Кружок появился на поле — сцена рисует его, окно пошло. */
  private show(p: PendingAttack): void {
    p.shown = true;
    this.events.push({ type: 'windup', id: p.id, uid: p.slot.uid, item: p.slot.def.id, kind: p.kind, group: p.group, index: p.index, from: p.from, partner: p.partner });
  }

  /**
   * Удар кружка: окно закрылось или игрок отбил. Каждый кружок — атака (счёт Безголового, сгорание зарядов топора).
   * Мешок крадёт, щит стражника сбивается, бегство удаётся, бомба ведьмака летит обратно, остальное — урон герою.
   * Пьяный бросает кубик на промах в момент удара (только удары с уроном).
   */
  private strike(p: PendingAttack, parried: boolean, parryMult = PARRY_DAMAGE_MULT): void {
    this.pending = this.pending.filter((a) => a !== p);
    this.events.push({ type: 'strike', id: p.id, parried });
    const k = this.chain[this.index].contract;
    if (k < this.attacks.length) {
      this.attacks[k]++;
      if (parried) this.parried[k]++;
    }
    const e = this.enemy;
    const s = p.slot.stats;
    // Квен спадает после стольких отбитых подряд; пропуск сбрасывает счёт.
    if (e.quenOn) {
      e.quenStreak = parried ? e.quenStreak + 1 : 0;
      if (e.quenStreak >= ENEMY_PATTERN.quen.parries) {
        e.quenOn = false;
        e.quenTimer = 0;
        this.events.push({ type: 'quen', on: false });
      }
    }
    // Топор-основное: пропущенная атака сжигает накопленные заряды.
    if (!parried && this.axeCharges > 0 && this.mainSlot?.def.parryPerk === 'axe') {
      this.axeCharges = 0;
      this.events.push({ type: 'axeCharge', charges: 0 });
    }
    // Серия закончилась: у монаха — ритуал (пропущен хоть один — вода освящена); после креста — святая вода.
    if (p.group !== null) {
      const g = this.groups.get(p.group);
      if (g) {
        g.done++;
        if (parried) g.parried++;
        if (g.done >= g.total) {
          this.groups.delete(p.group);
          if (ENEMIES[e.id].ritual) {
            const broken = g.parried >= g.total;
            if (!broken) e.blessed = true; // сорван — просто без освящения
            e.ritualReady = true;
            this.events.push({ type: 'ritual', broken });
            // Святая вода летит сразу за последним ударом креста — без паузы на подготовку (динамика).
            const water = e.order.find((s) => s.def.afterRitual && s.charges > 0);
            if (water) {
              e.actionTimer = 0;
              this.useEnemyItem(water);
            }
          }
          // Двойной удар копья отбит целиком — щит стражника в случайной точке отрезка: отбей и его, и щит опущен.
          if (p.kind === 'double' && g.parried >= g.total && e.slots.some((o) => o.stats.guardMult)) {
            this.addPending(p.slot, 'guard', FEEL.parry.window * FEEL.patterns.guardWindow, 0, null, 0, p.id);
          }
        }
      }
    }
    if (p.kind === 'sack') {
      if (!parried) this.steal(p.slot);
      return;
    }
    if (p.kind === 'guard') {
      const guard = e.slots.find((o) => o.stats.guardMult);
      if (parried && guard) {
        e.guardBroken = guard.stats.guardBreak ?? 0;
        this.events.push({ type: 'guardBroken', seconds: e.guardBroken });
      }
      return;
    }
    if (p.kind === 'escape') {
      if (!parried) {
        e.escaped = true;
        this.events.push({ type: 'escaped', name: enemyName(e.id, e.mod) });
      }
      return;
    }
    if (p.kind === 'reflect' && parried) {
      // Бомба отбита — взрывается у врага (блок и Квен её не держат).
      const dmg = Math.round((s.damage ?? 0) * e.power);
      e.hp = Math.max(0, e.hp - dmg);
      this.events.push({ type: 'reflect', damage: dmg });
      this.events.push({ type: 'enemyHit', taken: dmg, absorbed: 0, buffed: false, firstStrike: false, halved: false, guarded: false, quen: false, pierced: false, item: null });
      return;
    }
    if (e.mod === 'drunk' && this.rng() < MODIFIER_STATS.drunkMiss) {
      // Пьяный промахнулся: урона нет (заряд всё равно потрачен).
      this.events.push({ type: 'enemyMiss', name: p.slot.def.name });
      return;
    }
    const dmg = (s.damage ?? 0) * p.mult * e.power * enemyDamageMult(e.mod) * (s.monsterMult ?? 1) * (parried ? parryMult : 1);
    this.damageHero(Math.round(dmg));
    // Монах получает 5 очков блока за каждый пропущенный кружок креста.
    if (p.kind === 'cross' && ENEMIES[e.id].ritual && !parried) {
      const amount = Math.min(5, ENEMY_BLOCK_MAX - e.block);
      if (amount > 0) {
        e.block += amount;
        this.events.push({ type: 'enemyBlock', amount });
      }
    }
    if (p.kind === 'reflect') {
      // Бомба не отбита: герой оглушён — активные предметы не нажимаются.
      this.heroStun = Math.max(this.heroStun, ENEMY_PATTERN.bombStun);
      this.events.push({ type: 'heroStun', seconds: ENEMY_PATTERN.bombStun });
    }
    // Выпад стражника отбит — сразу кружок щита в конце линии: отбей и его, и щит опущен.
    if (p.kind === 'thrust' && parried && e.slots.some((o) => o.stats.guardMult)) {
      this.addPending(p.slot, 'guard', FEEL.parry.window * FEEL.patterns.guardWindow, 0, null, 0, p.id);
    }
  }

  /** Мешок не отбит: крадёт из кошелька героя, а когда кошелёк пуст — из награды текущего заказа. */
  private steal(sack: EnemySlot): void {
    const e = this.enemy;
    const n = sack.stats.stealCoins ?? 0;
    const wallet = Math.min(n, this.wallet);
    const reward = n - wallet;
    this.wallet -= wallet;
    e.stolenWallet += wallet;
    const k = this.chain[this.index].contract;
    if (k < this.stolen.length) {
      this.stolen[k] += reward;
      e.stolenReward += reward;
    }
    this.events.push({ type: 'steal', uid: sack.uid, wallet, reward });
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
    const e = this.enemy;
    if (e.hp <= 0 || e.escaped) {
      // Вор убит — украденное возвращается; сбежал — пропало.
      if (e.hp <= 0 && (e.stolenWallet || e.stolenReward)) {
        this.wallet += e.stolenWallet;
        const k = this.chain[this.index].contract;
        if (k < this.stolen.length) this.stolen[k] -= e.stolenReward;
        this.events.push({ type: 'refund', wallet: e.stolenWallet, reward: e.stolenReward });
        e.stolenWallet = 0;
        e.stolenReward = 0;
      }
      this.status = this.index >= this.chain.length - 1 ? 'won' : 'enemyDown';
      this.pending = []; // убитый (сбежавший) враг уже не ударит: его атаки в полёте отменяются
      this.groups.clear();
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
