// Симуляция боёв и экономики без графики: npm run sim
// Гоняет src/systems/battle.ts много раз и печатает процент побед, оставшееся здоровье героя и деньги по ночам.
//
// Бот: лечение — когда оно не уйдёт впустую; остальные расходники (бомба, масло, мандрагора) —
// по одному заряду каждого предмета на врага, в начале боя с ним (оглушение — только если враг не оглушён).
// Заказы бот выбирает из очереди: босс — всегда, дальше — где условие не отключает его предметы, в остальном как придут.
// Основные таблицы — бот никогда не отступает. Отдельная таблица «Бот-игрок» — варианты с отступлением на привале
// и с неполным набором заказов. Расходники тратятся как в игре: заряды кончились — предмет пропал до конца дня.
//
// Эталонные сборки по ночам (REF): «осмысленная» — с позициями под соседство и с лечением;
// «наивная» — те же предметы, разложенные случайно (в каждом прогоне заново), без учёта соседства.
// Бюджет сборки к ночи n = стартовые монеты + Σ(доход − восполнение расходников) за прошлые ночи.
// Проигрыш забега — START_LIVES смертей; шанс пройти забег считается из шанса смерти в каждую ночь (ночи независимы).
// Дополнительно: альтернативные сборки (щит, масло, мандрагора, проклятие) и «откуда урон» — урон по типам врагов
// и здоровье героя на привалах.
import {
  BALANCE_PARRY_RATE,
  FINAL_BOSS,
  PARRY_REWARD_MULT,
  SHIELD_PARRY_BONUS,
  HERO_HP_BY_NIGHT,
  ITEM_STATS,
  NIGHTS,
  START_COINS,
  SHOP_SIZE,
  SHOP_TIER_WEIGHTS_BY_NIGHT,
  START_ITEMS,
  START_LIVES,
} from '../config/balance';
import { CLIENT_IDS, CLIENTS, type ClientId } from '../data/clients';
import { ENEMIES, ENEMY_IDS, type EnemyId } from '../data/enemies';
import { ITEM_IDS, ITEMS, type ItemId } from '../data/items';
import { MODIFIER_IDS, MODIFIERS, type ModifierId } from '../data/modifiers';
import { canPlace, findSpot, MASK, type OwnedItem } from '../systems/backpack';
import { BattleSim, type ChainLink } from '../systems/battle';
import { fixedContract, generateQueue, levelForNight, rollEnemies, type Contract } from '../systems/contracts';
import type { Rng } from '../systems/random';
import { computePower, gearSummary, matches, maxCharges } from '../systems/synergy';
import { rollShopOffers } from '../systems/shop';

const RUNS = 500;
/** Шаг симуляции — как кадр игры при 60 fps. */
const DT = 1 / 60;
/** Защита от вечного боя: столько секунд на одного врага — и бой считается проигранным. */
const MAX_SECONDS_PER_ENEMY = 300;

/** Предмет сборки: просто id (первое свободное место) или id с позицией и уровнем ★. */
type BuildEntry = ItemId | { id: ItemId; col: number; row: number; rotated?: boolean; star?: number };

const idOf = (e: BuildEntry) => (typeof e === 'string' ? e : e.id);
const starOfEntry = (e: BuildEntry) => (typeof e === 'string' ? 1 : (e.star ?? 1));

/** Воспроизводимый генератор (mulberry32). */
function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const newItem = (uid: number, id: ItemId, star: number, spot: { col: number; row: number; rotated: boolean }): OwnedItem => ({
  uid,
  id,
  inGrid: true,
  ...spot,
  star,
  charges: maxCharges(id, star),
});

/** Раскладка как задано: с позицией — туда, без — в первое свободное место. Не влезшие пропускаются. */
function pack(build: BuildEntry[]): { items: OwnedItem[]; skipped: ItemId[] } {
  const items: OwnedItem[] = [];
  const skipped: ItemId[] = [];
  build.forEach((e, uid) => {
    const id = idOf(e);
    const spot =
      typeof e === 'string'
        ? findSpot(items, id)
        : canPlace(items, id, e.rotated ?? false, e.col, e.row)
          ? { col: e.col, row: e.row, rotated: e.rotated ?? false }
          : null;
    if (!spot) return skipped.push(id);
    items.push(newItem(uid, id, starOfEntry(e), spot));
  });
  return { items, skipped };
}

/** «Наивная» раскладка: предметы в случайном порядке, каждый — в случайное подходящее место (с поворотом или без). */
function packRandom(build: BuildEntry[], rng: Rng): OwnedItem[] {
  const order = build.map((e, uid) => ({ e, uid }));
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const items: OwnedItem[] = [];
  // Крупные предметы первыми, чтобы всё влезало так же, как у осмысленной сборки.
  order.sort((a, b) => ITEMS[idOf(b.e)].w * ITEMS[idOf(b.e)].h - ITEMS[idOf(a.e)].w * ITEMS[idOf(a.e)].h);
  for (const { e, uid } of order) {
    const id = idOf(e);
    const spots: { col: number; row: number; rotated: boolean }[] = [];
    for (const rotated of [false, true])
      for (let row = 0; row < MASK.rows; row++)
        for (let col = 0; col < MASK.cols; col++) if (canPlace(items, id, rotated, col, row)) spots.push({ col, row, rotated });
    if (spots.length) items.push(newItem(uid, id, starOfEntry(e), spots[Math.floor(rng() * spots.length)]));
  }
  return items;
}

/** Один день: цепочка врагов, заказчики, сами заказы (для дохода; в исследовательских таблицах их нет). */
type DayPlan = { chain: ChainLink[]; clients: ClientId[]; contracts?: Contract[] };

interface DayResult {
  /**
   * Последняя ночь: бой с финальным боссом после дня. carried — победил со здоровьем, что осталось (null — днём погиб),
   * full — победил с полным здоровьем (повторная попытка после смерти). Предметы — что осталось после дня.
   */
  final?: { carried: boolean | null; full: boolean };
  /** Здоровье в конце дня (0 — смерть). */
  hp: number;
  won: boolean;
  /** Награды выполненных заказов (за вычетом украденного) минус неустойки за невыполненные. Кикимора — тоже доход: она гасит долг. */
  income: number;
  /** Сколько стоит купить заново потраченные за день заряды расходников. */
  replacement: number;
  /** Отступил на привале (бот с правилом отступления). */
  retreated: boolean;
  /** Сколько заказов выполнено. */
  done: number;
}

/** Правила бота сверх базовых: отступить на привале, если здоровья меньше этой доли (null — не отступать). */
interface BotRules {
  retreatBelow: number | null;
  /** Доля атак врага, которые бот парирует (0..1), сразу при замахе. Нет поля — BALANCE_PARRY_RATE. */
  parryRate?: number;
  /** Прибавка к доле парирований, пока работает щит-курсор. Нет поля — SHIELD_PARRY_BONUS. */
  shieldBonus?: number;
}

/** Учёт урона за много прогонов: по типам врагов, самоурон, лечение, здоровье на привалах. */
interface DamageTrack {
  byEnemy: Map<EnemyId, { fights: number; taken: number }>;
  self: number;
  healed: number;
  /** Здоровье (доля от максимума) на привале после заказа k: сумма и число замеров. */
  rest: { sum: number; n: number }[];
  days: number;
}

const newTrack = (): DamageTrack => ({ byEnemy: new Map(), self: 0, healed: 0, rest: [], days: 0 });

/** Стоимость одного заряда предмета: цена всех вложенных копий / заряды на этом уровне. */
const chargePrice = (id: ItemId, star: number) => (ITEM_STATS[id].price * 2 ** (star - 1)) / (maxCharges(id, star) ?? 1);

function playDay(
  items: OwnedItem[],
  plan: DayPlan,
  night: number,
  rng: Rng,
  rules?: BotRules,
  track?: DamageTrack,
  parryRng?: Rng,
  heroHp?: number,
  noFinal = false,
): DayResult {
  // Основное оружие бота: щит, если есть (щит-курсор), иначе стальной меч, иначе любое оружие с перком.
  const pickMain = (id: ItemId) => items.find((i) => i.inGrid && i.id === id)?.uid;
  const mainUid = pickMain('wooden_shield') ?? pickMain('steel_sword') ?? items.find((i) => i.inGrid && ITEMS[i.id].parryPerk)?.uid ?? null;
  const sim = new BattleSim({ items, chain: plan.chain, clients: plan.clients, night, rng, heroHp, mainUid });
  const parryRate = rules?.parryRate ?? BALANCE_PARRY_RATE; // баланс — на «среднего игрока»
  const shieldBonus = rules?.shieldBonus ?? SHIELD_PARRY_BONUS;
  let t = 0;
  let used = new Set<number>(); // какие небоевые расходники уже применены к текущему врагу
  let retreated = false;
  const countFight = () => {
    if (!track) return;
    const id = sim.enemy.id;
    const e = track.byEnemy.get(id) ?? { fights: 0, taken: 0 };
    e.fights++;
    track.byEnemy.set(id, e);
  };
  if (track) track.days++;
  countFight();
  while (sim.status === 'fight' || sim.status === 'enemyDown') {
    if (sim.status === 'enemyDown') {
      if (sim.nextIsNewContract) {
        const k = plan.chain[sim.index].contract;
        if (track) {
          const r = (track.rest[k] ??= { sum: 0, n: 0 });
          r.sum += sim.heroHp / sim.heroMaxHp;
          r.n++;
        }
        // Привал: отступить, если здоровья мало и заказчик (Упырь) не держит.
        if (rules?.retreatBelow != null && !sim.retreatBlockedBy && sim.heroHp < rules.retreatBelow * sim.heroMaxHp) {
          retreated = true;
          break;
        }
      }
      sim.advance();
      countFight();
      used = new Set();
      t = 0;
      continue;
    }
    for (const a of sim.actives) {
      if (a.disabled) continue;
      const heal = Math.round(a.stats.heal ?? 0);
      if (heal > 0) {
        if (sim.heroHp <= sim.heroMaxHp - heal) sim.useActive(a.item.uid);
        continue;
      }
      if (used.has(a.item.uid)) continue;
      const stunOnly = !!a.stats.stun && !a.stats.damage;
      if (stunOnly && sim.enemy.stun > 0) continue;
      used.add(a.item.uid);
      sim.useActive(a.item.uid);
    }
    sim.step(DT);
    for (const e of sim.drain()) {
      // Парирование: бот жмёт картинку сразу при замахе с вероятностью parryRate (своя случайность — бой не трогает).
      // Щит-курсор в рюкзаке — парирует чаще на shieldBonus.
      if (e.type === 'windup' && parryRate > 0 && parryRng) {
        // Без основного оружия парировать нельзя; щит основным — парирует чаще на shieldBonus.
        const main = sim.mainSlot;
        const rate = !main ? 0 : main.def.parryPerk === 'shield' ? Math.min(1, parryRate + shieldBonus) : parryRate;
        if (parryRng() < rate) sim.parry(e.id);
      }
      if (!track) continue;
      if (e.type === 'heroHit') {
        if (e.self) track.self += e.taken;
        else track.byEnemy.get(sim.enemy.id)!.taken += e.taken;
      } else if (e.type === 'heroHeal') track.healed += e.amount;
    }
    t += DT;
    if (t > MAX_SECONDS_PER_ENEMY) {
      sim.heroHp = 0;
      sim.status = 'lost';
    }
  }
  const won = sim.status === 'won';

  // Доход: как contractResults в state.ts — победа, смерть (полная неустойка) или отступление (доля неустойки).
  let income = 0;
  let done = 0;
  const defeated = sim.defeated;
  if (plan.contracts) {
    let start = 0;
    plan.contracts.forEach((c, i) => {
      const total = c.enemies.length;
      const killed = Math.min(total, Math.max(0, defeated - start));
      start += total;
      if (killed >= total) {
        const bonus = CLIENTS[c.client].condition.parryReward && sim.parryGoalMet(i) ? PARRY_REWARD_MULT : 1;
        income += Math.max(0, c.reward * bonus - sim.stolen[i]);
        done++;
      } else if (retreated) income -= Math.ceil((c.penalty * (total - killed)) / total);
      else income -= c.penalty;
    });
  }

  // Потраченные заряды: всё, чего не осталось в рюкзаке к концу дня (включая взорвавшиеся предметы).
  let replacement = 0;
  for (const it of items) {
    const max = maxCharges(it.id, it.star ?? 1);
    if (!max) continue;
    const left = sim.slots.find((s) => s.item.uid === it.uid)?.charges ?? 0;
    replacement += ((it.charges ?? max) - left) * chargePrice(it.id, it.star ?? 1);
  }
  // Последняя ночь: после дня — финальный босс (с тем, что осталось в рюкзаке). Со здоровьем после дня и с полным.
  let final: DayResult['final'];
  if (night === NIGHTS && !noFinal) {
    const left = sim.slots
      .filter((s) => s.charges > 0)
      .map((s) => ({ ...s.item, charges: Number.isFinite(s.charges) ? s.charges : s.item.charges }));
    const boss: DayPlan = { chain: [{ enemy: FINAL_BOSS, contract: 0, mod: null }], clients: [] };
    const fight = (hp?: number) => playDay(left.map((i) => ({ ...i })), boss, night, rng, { ...rules, retreatBelow: null }, undefined, parryRng, hp, true).won;
    const alive = won || retreated;
    final = { carried: alive ? fight(sim.heroHp) : null, full: fight() };
  }
  return { hp: won || retreated ? sim.heroHp : 0, won, income, replacement, retreated, done, final };
}

interface Stats {
  wins: number;
  medianHp: number;
  minHp: number;
  /** Средний доход за день и на один принятый заказ. */
  income: number;
  incomePerContract: number;
  replacement: number;
  /** Доля дней с отступлением, %, и выполненных заказов в среднем. */
  retreats: number;
  done: number;
  /**
   * Последняя ночь, финальный босс (%): dayDeath — днём погиб; finalCarried — победил босса со здоровьем после дня
   * (среди дней без смерти); finalFull — победил с полным здоровьем. wins последней ночи = день без смерти и победа над боссом.
   */
  dayDeath: number;
  finalCarried: number;
  finalFull: number;
}

/** RUNS прогонов дня. naive — сборка раскладывается случайно в каждом прогоне. */
function simulate(
  night: number,
  build: BuildEntry[],
  plan: (rng: Rng) => DayPlan,
  naive = false,
  seed = 1,
  rules?: BotRules,
  track?: DamageTrack,
): Stats {
  const rng = seeded(seed);
  const layoutRng = seeded(seed * 7919 + 17);
  const fixed = pack(build).items;
  const hps: number[] = [];
  let wins = 0;
  let income = 0;
  let contracts = 0;
  let replacement = 0;
  let retreats = 0;
  let done = 0;
  let dayDeaths = 0;
  let carriedWins = 0;
  let carriedTries = 0;
  let fullWins = 0;
  const parryRng = seeded(seed * 104729 + 3);
  for (let i = 0; i < RUNS; i++) {
    const p = plan(rng);
    // Свежие копии предметов: заряды в каждом прогоне свои.
    const items = naive ? packRandom(build, layoutRng) : fixed.map((it) => ({ ...it }));
    const r = playDay(items, p, night, rng, rules, track, parryRng);
    if (r.final) {
      if (r.final.carried === null) dayDeaths++;
      else {
        carriedTries++;
        if (r.final.carried) carriedWins++;
      }
      if (r.final.full) fullWins++;
      if (r.won && r.final.carried) wins++;
    } else if (r.won) wins++;
    hps.push((r.hp / HERO_HP_BY_NIGHT[night - 1]) * 100);
    income += r.income;
    contracts += p.contracts?.length ?? 0;
    replacement += r.replacement;
    if (r.retreated) retreats++;
    done += r.done;
  }
  hps.sort((a, b) => a - b);
  return {
    wins: (wins / RUNS) * 100,
    medianHp: hps[Math.floor(RUNS / 2)],
    minHp: hps[0],
    income: income / RUNS,
    incomePerContract: contracts ? income / contracts : 0,
    replacement: replacement / RUNS,
    retreats: (retreats / RUNS) * 100,
    done: done / RUNS,
    dayDeath: (dayDeaths / RUNS) * 100,
    finalCarried: carriedTries ? (carriedWins / carriedTries) * 100 : 0,
    finalFull: (fullWins / RUNS) * 100,
  };
}

/** Сколько предметов сборки отключит условие заказчика. */
const bannedIn = (build: BuildEntry[], client: ClientId) =>
  build.filter((e) => (CLIENTS[client].condition.ban ?? []).some((sel) => matches(sel, idOf(e)))).length;

/**
 * Обычный день: заказы из очереди (условия заказчиков, модификаторы, награды). Бот выбирает, как игрок:
 * заказ на босса — всегда; остальные — сначала те, где условие не отключает его предметы, в остальном в порядке очереди.
 */
const queueDay = (night: number, take = levelForNight(night), build: BuildEntry[] = []) => (rng: Rng): DayPlan => {
  const queue = generateQueue(night, rng);
  const isBoss = (c: Contract) => c.enemies.some((e) => ENEMIES[e].boss);
  // Сортировка устойчивая: среди заказов без запретов порядок очереди (случайный) сохраняется — как у среднего игрока.
  const ordered = [...queue.filter(isBoss), ...queue.filter((c) => !isBoss(c)).sort((x, y) => bannedIn(build, x.client) - bannedIn(build, y.client))];
  const contracts = ordered.slice(0, Math.max(1, take));
  const chain = contracts.flatMap((c, ci) => c.enemies.map((enemy, j) => ({ enemy, contract: ci, mod: c.mods[j] })));
  return { chain, clients: contracts.map((c) => c.client), contracts };
};

const fmt = (r: Stats) =>
  `побед ${r.wins.toFixed(1).padStart(5)}%   здоровье: медиана ${r.medianHp.toFixed(0).padStart(3)}%, минимум ${r.minHp.toFixed(0).padStart(3)}%`;
const names = (build: BuildEntry[]) =>
  build.map((e) => `${ITEMS[idOf(e)].name}${starOfEntry(e) > 1 ? ` ★${starOfEntry(e)}` : ''}`).join(' + ');
/** Цена сборки без стартовых предметов (★2 — две копии, ★3 — четыре). */
function cost(build: BuildEntry[]): number {
  const free = [...START_ITEMS];
  let sum = 0;
  for (const e of build) {
    const id = idOf(e);
    const copies = 2 ** (starOfEntry(e) - 1);
    const i = free.indexOf(id);
    const freeCopies = i >= 0 && starOfEntry(e) === 1 ? 1 : 0;
    if (freeCopies) free.splice(i, 1);
    sum += ITEM_STATS[id].price * (copies - freeCopies);
  }
  return sum;
}
const pad = (s: string | number, n: number) => String(s).padStart(n);

// ─── Ночь 1 ──────────────────────────────────────────────────────────────────

console.log(`\n=== Ночь 1: заказов ${levelForNight(1)}, прогонов на вариант ${RUNS} ===\n`);
const base: BuildEntry[] = [...START_ITEMS];
const a = simulate(1, base, queueDay(1, undefined, base));
console.log(`а) ${names(base).padEnd(44)} ${fmt(a)}`);

// Покупки, доступные в ночь 1: магазин предлагает только редкость 1, денег — стартовые монеты.
const night1Shop = ITEM_IDS.filter((id) => ITEMS[id].tier === 1 && ITEM_STATS[id].price <= START_COINS);
const withItem = night1Shop
  .map((id) => ({ id, r: simulate(1, [...base, id], queueDay(1, undefined, [...base, id])) }))
  .sort((x, y) => y.r.medianHp - x.r.medianHp || y.r.wins - x.r.wins);
const best = withItem[0];
console.log(`б) ${names([...base, best.id]).padEnd(44)} ${fmt(best.r)}   ← лучшая покупка ночи 1`);
console.log(`\nВсе покупки ночи 1 (редкость 1, не дороже ${START_COINS} монет; меч + предмет, первое свободное место):`);
for (const { id, r } of withItem) console.log(`   ${ITEMS[id].name.padEnd(22)} цена ${pad(ITEM_STATS[id].price, 2)}   ${fmt(r)}`);
const unaffordable = ITEM_IDS.filter((id) => ITEMS[id].tier === 1 && ITEM_STATS[id].price > START_COINS);
if (unaffordable.length) console.log(`   (не по карману в ночь 1: ${unaffordable.map((id) => ITEMS[id].name).join(', ')})`);

// ─── Эталонные сборки ────────────────────────────────────────────────────────
// Маска рюкзака:  ..XXXX..   строки 0–1: столбцы 2–5 (верхнее место)
//                 ..XXXX..
//                 XXX..XXX   строки 2–4: столбцы 0–2 (левая сумка) и 5–7 (правая)
// Клетка (2,1) верхнего места касается (2,2) левой сумки, (5,1) — (5,2) правой.
//
// Осмысленная раскладка; игрок может перекладывать вещи каждую ночь, поэтому позиции по ночам свои.
// Покупки по ночам (по 2 предмета, в пределах бюджета): ночь 1 — кинжал; 2 — второй кинжал и хлеб;
// 3 — подкова и эликсир; 4 — бомба и топор; 5 — факел и второй эликсир.
//   ночь 2: два кинжала рядом (Серебро к Серебру), хлеб отдельно
//   ночь 3+: верх — кинжал (2,0–1) · подкова (3,0) · кинжал (4,0–1) · хлеб (3,1) под подковой · эликсир (5,1)
//            → подкова усиливает оба кинжала, хлеб — подкову, эликсир (Алхимия) — правый кинжал
//   ночь 4+: левая — меч (1,2–4) · бомба (0,2) рядом с мечом; правая — топор 2×2 (6,2), подальше от Серебра
//   ночь 5:  факел (5,2–3) под эликсиром (Огонь к Алхимии: лечение +50%) · второй эликсир (2,2) — к мечу и кинжалу
// Порядок в списке — порядок покупок.
const P = {
  sword: { id: 'steel_sword', col: 1, row: 2 },
  daggerA: { id: 'silver_dagger', col: 2, row: 0 },
  daggerB2: { id: 'silver_dagger', col: 3, row: 0 }, // ночь 2: вплотную к первому
  breadLeft: { id: 'bread', col: 0, row: 2 }, // ночь 2: подальше от всего
  horseshoe: { id: 'silver_horseshoe', col: 3, row: 0 },
  bread: { id: 'bread', col: 3, row: 1 },
  daggerB: { id: 'silver_dagger', col: 4, row: 0 },
  elixirTop: { id: 'healing_elixir', col: 5, row: 1 },
  bomb: { id: 'bomb_grom', col: 0, row: 2 },
  axe: { id: 'cursed_axe', col: 6, row: 2 },
  torch: { id: 'torch', col: 5, row: 2 },
  elixirLeft: { id: 'healing_elixir', col: 2, row: 2 },
} satisfies Record<string, BuildEntry>;

const REF: Record<number, BuildEntry[]> = {
  1: [P.sword, P.daggerA],
  2: [P.sword, P.daggerA, P.daggerB2, P.breadLeft],
  3: [P.sword, P.daggerA, P.daggerB, P.bread, P.horseshoe, P.elixirTop],
  4: [P.sword, P.daggerA, P.daggerB, P.bread, P.horseshoe, P.elixirTop, P.bomb, P.axe],
  5: [P.sword, P.daggerA, P.daggerB, P.bread, P.horseshoe, P.elixirTop, P.bomb, P.axe, P.torch, P.elixirLeft],
};

console.log(`\n=== Эталонные сборки (осмысленная раскладка) ===\n`);
for (let n = 1; n <= NIGHTS; n++) {
  const { items, skipped } = pack(REF[n]);
  const g = gearSummary(items, computePower(items));
  console.log(`   Ночь ${n}: ${names(REF[n])} — цена ${cost(REF[n])}${skipped.length ? `   НЕ ВЛЕЗЛО: ${skipped.join(', ')}` : ''}`);
  console.log(
    `      урон/с ${g.dps.toFixed(1)}, блок/с ${g.blockPerSec.toFixed(1)}, лечение/с ${g.healPerSec.toFixed(1)}` +
      `${g.disabled.length ? `, отключено: ${g.disabled.map((id) => ITEMS[id].name).join(', ')}` : ''}`,
  );
}

// ─── Бой по ночам ────────────────────────────────────────────────────────────

const meaningful: Stats[] = [];
console.log(`\n=== Бой: полный набор заказов по уровню, случайные заказчики и модификаторы, ${RUNS} прогонов ===\n`);
console.log('Ночь  Заказов  Сборка          Результат                                              Проиграл заказ');
for (let n = 1; n <= NIGHTS; n++) {
  const m = simulate(n, REF[n], queueDay(n, undefined, REF[n]));
  const v = simulate(n, REF[n], queueDay(n, undefined, REF[n]), true);
  meaningful[n] = m;
  for (const [title, r] of [['осмысленная', m], ['наивная', v]] as const) {
    console.log(`  ${n}      ${levelForNight(n)}     ${title.padEnd(14)}  ${fmt(r)}      ${(100 - r.wins).toFixed(0).padStart(3)}%`);
  }
}

/**
 * Шанс пройти забег: смертей меньше START_LIVES. deaths[n] — доля дней ночи n, закончившихся смертью (0..1).
 * Ночи считаются независимыми; потеря предмета после смерти не учитывается.
 */
function runSurvival(deaths: number[], last?: Stats): number {
  // dist[k] — вероятность k смертей к этому моменту (k ≥ START_LIVES — забег уже проигран, отдельно не ведём).
  let dist = [1];
  for (const p of deaths) {
    const next = new Array(START_LIVES).fill(0);
    dist.forEach((q, k) => {
      next[k] += q * (1 - p);
      if (k + 1 < START_LIVES) next[k + 1] += q * p;
    });
    dist = next;
  }
  if (!last) return dist.reduce((s, q) => s + q, 0) * 100;
  // Последняя ночь — день и финальный босс: проиграл ему — −1 жизнь и попытка с полным здоровьем, пока есть жизни.
  const pd = last.dayDeath / 100;
  const wc = last.finalCarried / 100;
  const wf = last.finalFull / 100;
  const retry = (k: number) => (k >= START_LIVES ? 0 : 1 - Math.pow(1 - wf, START_LIVES - k));
  return dist.reduce((s, q, k) => s + q * ((1 - pd) * (wc + (1 - wc) * retry(k + 1)) + pd * retry(k + 1)), 0) * 100;
}

// ─── Экономика ───────────────────────────────────────────────────────────────

console.log(`\n=== Экономика по ночам (осмысленная сборка, средние по ${RUNS} прогонам) ===`);
console.log('    Доход — награды выполненных заказов минус неустойки и возврат авансов. Бюджет — сколько можно потратить на сборку к этой ночи.\n');
console.log('Ночь  Доход  Восполн.  Свободно  Сборка(накоп.)  Бюджет  В бюджете  Покупки след. ночи  Смерть');
let budget = START_COINS;
for (let n = 1; n <= NIGHTS; n++) {
  const s = meaningful[n];
  const free = s.income - s.replacement;
  const c = cost(REF[n]);
  const next = n < NIGHTS ? cost(REF[n + 1]) - c : 0;
  const nextItems = n < NIGHTS ? REF[n + 1].length - REF[n].length : 0;
  console.log(
    `  ${n}   ${pad(s.income.toFixed(0), 4)}  ${pad(s.replacement.toFixed(0), 8)}  ${pad(free.toFixed(0), 8)}  ${pad(c, 14)}  ${pad(budget.toFixed(0), 6)}` +
      `  ${(c <= budget ? 'да' : 'НЕТ').padStart(9)}  ${pad(n < NIGHTS ? `${next} (${nextItems} шт.)` : '—', 18)}  ${pad((100 - s.wins).toFixed(0), 5)}%`,
  );
  budget += free;
}
const survive = runSurvival([1, 2, 3, 4].map((n) => (100 - meaningful[n].wins) / 100), meaningful[NIGHTS]);
const fin = meaningful[NIGHTS];
console.log(
  `\n    Ночь ${NIGHTS} и финальный босс: днём погиб ${fin.dayDeath.toFixed(0)}%, босс побеждён со здоровьем после дня ${fin.finalCarried.toFixed(0)}%` +
    ` (среди выживших днём), с полным здоровьем ${fin.finalFull.toFixed(0)}%`,
);
console.log(`    Шанс пройти забег (победить босса, пока есть жизни; ночи независимы): ${survive.toFixed(0)}%   цель — 50–60%`);

// ─── Условия и модификаторы по отдельности ───────────────────────────────────
// День из заказов одного заказчика (враги без модификаторов) или из врагов с одним модификатором
// (заказчик без боевого условия — Водяной). Осмысленная эталонная сборка ночи.

const fixedDay = (night: number, client: ClientId, mod: ModifierId | null) => (rng: Rng): DayPlan => {
  const level = levelForNight(night);
  const contracts = Array.from({ length: level }, () => fixedContract(night, client, rollEnemies(night, rng), rng));
  const chain: ChainLink[] = contracts.flatMap((c, ci) => c.enemies.map((enemy) => ({ enemy, contract: ci, mod })));
  return { chain, clients: contracts.map((c) => c.client), contracts };
};
const short = (r: Stats) => `${r.wins.toFixed(0).padStart(3)}% / ${r.medianHp.toFixed(0).padStart(3)}%`;

console.log(`\n=== Условия заказчиков: все заказы дня — от одного заказчика, без модификаторов ===`);
console.log('    Ячейка: побед / медиана здоровья / доход за заказ (награда минус неустойки; у Кикиморы — в счёт долга).\n');
console.log(`  ${'Заказчик'.padEnd(36)}${[2, 3, 4].map((n) => `ночь ${n}`.padEnd(24)).join('')}`);
for (const client of CLIENT_IDS) {
  const cells = [2, 3, 4].map((n) => {
    const r = simulate(n, REF[n], fixedDay(n, client, null));
    return `${short(r)} / ${pad(r.incomePerContract.toFixed(0), 3)}`.padEnd(24);
  });
  console.log(`  ${`${CLIENTS[client].name} «${CLIENTS[client].condition.title}»`.padEnd(36)}${cells.join('')}`);
}

console.log(`\n=== Модификаторы: у всех врагов один модификатор, заказчик — Водяной (побед / медиана здоровья) ===\n`);
console.log(`  ${'Модификатор'.padEnd(36)}${'ночь 3'.padEnd(16)}${'ночь 4'.padEnd(16)}`);
for (const mod of [null, ...MODIFIER_IDS]) {
  const cells = [3, 4].map((n) => short(simulate(n, REF[n], fixedDay(n, 'vodyanoy', mod))).padEnd(16));
  console.log(`  ${(mod ? MODIFIERS[mod].name : 'без модификатора').padEnd(36)}${cells.join('')}`);
}

// ─── Альтернативные сборки ───────────────────────────────────────────────────
// Те же ночи и бюджет, что у эталона, но с предметами, которых в эталоне нет: щит, масло, мандрагора, проклятие.
// Раскладка — под соседство: Алхимия рядом с Оружием, Еда подальше от Алхимии и Огня, Проклятие подальше от Серебра.
// Сравнение — с эталоном той же ночи (полный набор заказов, случайные заказчики и модификаторы).

const A = {
  daggerB3: { id: 'silver_dagger', col: 3, row: 0 }, // второй кинжал вплотную к первому
  elixir40: { id: 'healing_elixir', col: 4, row: 0 }, // у второго кинжала (Алхимия к оружию)
  breadL: { id: 'bread', col: 0, row: 2 }, // у меча, подальше от Алхимии
  shieldR: { id: 'wooden_shield', col: 6, row: 2 },
  torchR: { id: 'torch', col: 5, row: 2 },
  torchLow: { id: 'torch', col: 6, row: 4, rotated: true },
  oilTop: { id: 'oil_vs_humans', col: 3, row: 0 }, // между кинжалами
  mandrakeTop: { id: 'mandrake', col: 3, row: 0 }, // между кинжалами
  oilL: { id: 'oil_vs_humans', col: 0, row: 2 }, // у меча, вместо бомбы
  mandrakeL: { id: 'mandrake', col: 0, row: 2 }, // у меча, вместо бомбы
  boneR: { id: 'bone_amulet', col: 5, row: 2 }, // у топора
  breadR: { id: 'bread', col: 5, row: 3 }, // у ладанки (Еда к амулету) и топора
  elixirLow: { id: 'healing_elixir', col: 6, row: 4 },
  torchTop: { id: 'torch', col: 5, row: 0 }, // у эликсира (Огонь к Алхимии)
  // Новые предметы (шаг 5): мечи вокруг точильного камня, серпы вокруг ладанки, окорок вместо хлеба.
  swordL0: { id: 'steel_sword', col: 0, row: 2 },
  stoneL: { id: 'whetstone', col: 1, row: 3 }, // между двумя мечами
  swordL2: { id: 'steel_sword', col: 2, row: 2 },
  breadStone: { id: 'bread', col: 1, row: 2 }, // над камнем (Еда к амулету)
  sickleA: { id: 'rusty_sickle', col: 2, row: 0 },
  boneTop: { id: 'bone_amulet', col: 3, row: 0 }, // между серпами
  sickleB: { id: 'rusty_sickle', col: 4, row: 0 },
  breadBone: { id: 'bread', col: 3, row: 1 }, // под ладанкой
  hamLow: { id: 'smoked_ham', col: 6, row: 4, rotated: true }, // под топором, подальше от Алхимии
} satisfies Record<string, BuildEntry>;

const ALT: Record<number, { name: string; build: BuildEntry[] }[]> = {
  3: [
    { name: 'щит вместо подковы', build: [P.sword, P.daggerA, A.daggerB3, A.elixir40, A.breadL, A.shieldR] },
    { name: 'щит + факел вместо подковы', build: [P.sword, P.daggerA, A.daggerB3, A.elixir40, A.breadL, A.shieldR, A.torchR] },
    { name: 'масло вместо подковы', build: [P.sword, P.daggerA, A.oilTop, P.daggerB, A.breadL, P.elixirTop] },
    { name: 'мандрагора вместо подковы', build: [P.sword, P.daggerA, A.mandrakeTop, P.daggerB, A.breadL, P.elixirTop] },
    { name: 'два меча без камня (для сравнения)', build: [A.swordL0, A.swordL2, A.breadStone, P.daggerA, A.daggerB3, A.elixir40] },
    { name: 'новое: два меча + точильный камень', build: [A.swordL0, A.stoneL, A.swordL2, A.breadStone, P.daggerA, A.daggerB3, A.elixir40] },
    { name: 'новое: серпы + ладанка', build: [P.sword, A.sickleA, A.boneTop, A.sickleB, A.breadBone, P.elixirTop] },
  ],
  4: [
    { name: 'щит + эликсир + факел вместо топора', build: [...REF[3], P.bomb, A.shieldR, P.elixirLeft, A.torchLow] },
    { name: 'масло вместо бомбы', build: [...REF[3], A.oilL, P.axe] },
    { name: 'мандрагора вместо бомбы', build: [...REF[3], A.mandrakeL, P.axe] },
    { name: 'проклятие: топор + ладанка', build: [P.sword, P.daggerA, A.daggerB3, A.elixir40, P.axe, A.boneR, A.breadR, P.elixirLeft] },
    { name: 'новое: окорок вместо хлеба', build: [...REF[4].filter((e) => e !== P.bread), A.hamLow] },
    { name: 'новое: серпы + ладанка + топор', build: [P.sword, A.sickleA, A.boneTop, A.sickleB, A.breadBone, P.elixirTop, P.bomb, P.axe] },
  ],
  5: [
    { name: 'щит + эликсир вместо топора', build: [...REF[5].filter((e) => e !== P.axe), A.shieldR, A.elixirLow] },
    { name: 'масло вместо бомбы', build: REF[5].map((e) => (e === P.bomb ? A.oilL : e)) },
    { name: 'проклятие + бомба + факел', build: [P.sword, P.daggerA, A.daggerB3, A.elixir40, P.axe, A.boneR, A.breadR, P.elixirLeft, P.bomb, A.torchTop] },
    { name: 'новое: окорок вместо хлеба', build: [...REF[5].filter((e) => e !== P.bread), A.hamLow] },
  ],
};

console.log(`\n=== Альтернативные сборки: полный набор заказов, ${RUNS} прогонов (побед / медиана здоровья, доход, восполнение) ===\n`);
for (const n of [3, 4, 5]) {
  const row = (name: string, build: BuildEntry[]) => {
    const { items, skipped } = pack(build);
    const g = gearSummary(items, computePower(items));
    const r = simulate(n, build, queueDay(n, undefined, build));
    console.log(
      `  ночь ${n}  ${name.padEnd(40)} цена ${pad(cost(build), 3)}  ${short(r)}  доход ${pad(r.income.toFixed(0), 4)}  восп. ${pad(r.replacement.toFixed(0), 3)}` +
        `  урон/с ${g.dps.toFixed(1).padStart(4)} блок/с ${g.blockPerSec.toFixed(1)}${skipped.length ? `  НЕ ВЛЕЗЛО: ${skipped.join(', ')}` : ''}` +
        `${g.disabled.length ? `  отключено: ${g.disabled.map((id) => ITEMS[id].name).join(', ')}` : ''}`,
    );
  };
  row('эталон', REF[n]);
  for (const v of ALT[n]) row(v.name, v.build);
  console.log('');
}

// ─── Бот-игрок: отступление и неполный набор ─────────────────────────────────
// Эталонная сборка ночи. Варианты: полный набор заказов без отступления (как выше); на один заказ меньше уровня;
// отступление на привале при здоровье ниже 25%; оба правила. Деньги — накопительно по забегу (как в «Экономике»).

const policies: { name: string; take: (n: number) => number; rules?: BotRules }[] = [
  { name: 'полный набор, без отступления', take: (n) => levelForNight(n) },
  { name: 'на 1 заказ меньше', take: (n) => levelForNight(n) - 1 },
  { name: 'полный набор, отступить при <25%', take: (n) => levelForNight(n), rules: { retreatBelow: 0.25 } },
  { name: 'на 1 меньше + отступить при <25%', take: (n) => levelForNight(n) - 1, rules: { retreatBelow: 0.25 } },
];
console.log(`=== Бот-игрок: эталонная сборка, разные правила (${RUNS} прогонов) ===`);
console.log('    Ячейка: заказов выполнено в среднем / доход / смерть% / отступил%. Ночь 5 — смерть днём; финальный босс — в шансе пройти забег (последний столбец).\n');
console.log(`  ${'Правило'.padEnd(36)}${[1, 2, 3, 4, 5].map((n) => `ночь ${n}`.padEnd(30)).join('')}Пройти забег`);
for (const p of policies) {
  const deaths: number[] = [];
  const cells: string[] = [];
  let last: Stats | undefined;
  for (let n = 1; n <= NIGHTS; n++) {
    const r = simulate(n, REF[n], queueDay(n, p.take(n), REF[n]), false, 1, p.rules);
    const died = n === NIGHTS ? r.dayDeath : 100 - r.wins - r.retreats;
    if (n === NIGHTS) last = r;
    else deaths.push(died / 100);
    cells.push(`${r.done.toFixed(1)} / ${pad(r.income.toFixed(0), 3)} / ${pad(died.toFixed(0), 2)}% / ${pad(r.retreats.toFixed(0), 2)}%`.padEnd(30));
  }
  console.log(`  ${p.name.padEnd(36)}${cells.join('')}${runSurvival(deaths, last).toFixed(0)}%`);
}

// ─── Парирование ─────────────────────────────────────────────────────────────
// Эталон, полный набор заказов. Бот парирует долю атак врага (сразу при замахе). Баланс ночей настроен на BALANCE_PARRY_RATE.

console.log(`\n=== Парирование: эталонная сборка, полный набор заказов, ${RUNS} прогонов (побед / медиана здоровья, доход) ===\n`);
console.log(`  ${'Парирует'.padEnd(12)}${[2, 3, 4, 5].map((n) => `ночь ${n}`.padEnd(24)).join('')}`);
for (const rate of [0, 0.3, BALANCE_PARRY_RATE, 1]) {
  const cells = [2, 3, 4, 5].map((n) => {
    const r = simulate(n, REF[n], queueDay(n, undefined, REF[n]), false, 1, { retreatBelow: null, parryRate: rate });
    return `${short(r)} / ${pad(r.income.toFixed(0), 3)}`.padEnd(24);
  });
  console.log(`  ${`${Math.round(rate * 100)}%`.padEnd(12)}${cells.join('')}`);
}

// ─── Щит-курсор ──────────────────────────────────────────────────────────────
// Сборки со щитом из «Альтернативных» при щите ★1 / ★2 / ★3 и разной прибавке к парированию (SHIELD_PARRY_BONUS —
// оценка: щит бьёт всей областью, но окно короче). Сравнение — с эталоном той же ночи.

const SHIELD_ALT: Record<number, BuildEntry[]> = { 3: ALT[3][0].build, 4: ALT[4][0].build, 5: ALT[5][0].build };
const SHIELD_BONUSES = [0, 0.1, 0.2];
console.log(`
=== Щит-курсор: сборки со щитом, полный набор заказов, ${RUNS} прогонов (побед / медиана здоровья) ===`);
console.log(`    Бот парирует ${Math.round(BALANCE_PARRY_RATE * 100)}% + прибавка, пока щит в рюкзаке; в игре сейчас прибавка ${SHIELD_PARRY_BONUS}.
`);
console.log(`  ${'Сборка'.padEnd(44)}${SHIELD_BONUSES.map((b) => `+${b}`.padEnd(16)).join('')}`);
for (const n of [3, 4, 5]) {
  console.log(`  ${`ночь ${n}  эталон`.padEnd(44)}${short(simulate(n, REF[n], queueDay(n, undefined, REF[n])))}`);
  for (const star of [1, 2, 3]) {
    const build = SHIELD_ALT[n].map((e) => (typeof e !== 'string' && e.id === 'wooden_shield' ? { ...e, star } : e));
    const cells = SHIELD_BONUSES.map((b) => short(simulate(n, build, queueDay(n, undefined, build), false, 1, { retreatBelow: null, shieldBonus: b })).padEnd(16));
    console.log(`  ${`ночь ${n}  ${ALT[n][0].name} ★${star}`.padEnd(44)}${cells.join('')}`);
  }
  console.log('');
}

// ─── Магазин: шанс увидеть нужное ────────────────────────────────────────────
// Один ассортимент ночи (без обновлений). «Без гарантии» — каждое место по весам редкости, как было до шага 8;
// «сейчас» — как в игре (с ночи SHOP_CONSUMABLE_FROM_NIGHT одно место — расходник).

const SHOP_ROLLS = 20000;
/** Ассортимент без гарантированного расходника: каждое место — редкость по весам, затем предмет равновероятно. */
function rollPlain(night: number, rng: Rng): ItemId[] {
  const w = SHOP_TIER_WEIGHTS_BY_NIGHT[night - 1];
  return Array.from({ length: SHOP_SIZE }, () => {
    let r = rng() * (w[0] + w[1] + w[2]);
    let tier = 3;
    for (let i = 0; i < 3; i++) {
      r -= w[i];
      if (r < 0) {
        tier = i + 1;
        break;
      }
    }
    const pool = ITEM_IDS.filter((id) => ITEMS[id].tier === tier);
    return pool[Math.floor(rng() * pool.length)];
  });
}
const HEALS: ItemId[] = ITEM_IDS.filter((id) => (ITEM_STATS[id].heal ?? 0) > 0);
const CONS: ItemId[] = ITEM_IDS.filter((id) => ITEMS[id].category === 'alchemy' || ITEMS[id].category === 'food');
console.log(`\n=== Магазин: шанс увидеть в ассортименте ночи (без обновлений), ${SHOP_ROLLS} раскладов ===`);
console.log('    Ячейка: без гарантии → сейчас. Лечение — эликсир, хлеб, окорок; расходник — Алхимия или Еда.\n');
console.log(`  ${'Ночь'.padEnd(6)}${'Лечебный эликсир'.padEnd(22)}${'Любое лечение'.padEnd(22)}${'Любой расходник'.padEnd(22)}`);
for (let n = 2; n <= NIGHTS; n++) {
  const rng = seeded(100 + n);
  const count = (roll: (r: Rng) => ItemId[]) => {
    let elixir = 0;
    let heal = 0;
    let cons = 0;
    for (let i = 0; i < SHOP_ROLLS; i++) {
      const o = roll(rng);
      if (o.includes('healing_elixir')) elixir++;
      if (o.some((id) => HEALS.includes(id))) heal++;
      if (o.some((id) => CONS.includes(id))) cons++;
    }
    return [elixir, heal, cons].map((x) => (x / SHOP_ROLLS) * 100);
  };
  const before = count((r) => rollPlain(n, r));
  const now = count((r) => rollShopOffers(n, r));
  const cells = before.map((b, i) => `${b.toFixed(0).padStart(3)}% → ${now[i].toFixed(0).padStart(3)}%`.padEnd(22));
  console.log(`  ${String(n).padEnd(6)}${cells.join('')}`);
}

// ─── Откуда урон ─────────────────────────────────────────────────────────────
// Эталон, полный набор заказов. Урон по герою (после блока) по типам врагов, самоурон, лечение,
// здоровье на привалах. Помогает понять, кто делает день тяжёлым.

console.log(`\n=== Откуда урон: эталонная сборка, полный набор заказов, ${RUNS} прогонов ===\n`);
for (let n = 1; n <= NIGHTS; n++) {
  const tr = newTrack();
  simulate(n, REF[n], queueDay(n, undefined, REF[n]), false, 1, undefined, tr);
  const total = [...tr.byEnemy.values()].reduce((s, e) => s + e.taken, 0) + tr.self;
  const parts = ENEMY_IDS.filter((id) => tr.byEnemy.has(id)).map((id) => {
    const e = tr.byEnemy.get(id)!;
    return `${ENEMIES[id].name}: ${(e.taken / e.fights).toFixed(0)} за бой (${((e.taken / total) * 100).toFixed(0)}%)`;
  });
  const rests = tr.rest.map((r, k) => `после ${k + 1}-го — ${((r.sum / r.n) * 100).toFixed(0)}%`).join(', ');
  console.log(`  Ночь ${n} (здоровье ${HERO_HP_BY_NIGHT[n - 1]}): урона за день ${(total / tr.days).toFixed(0)}, лечения ${(tr.healed / tr.days).toFixed(0)}, самоурон ${(tr.self / tr.days).toFixed(1)}`);
  console.log(`     ${parts.join(' · ')}`);
  if (rests) console.log(`     Здоровье на привалах (из дошедших): ${rests}`);
}
console.log('');
