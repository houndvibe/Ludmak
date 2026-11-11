// Симуляция боёв и экономики без графики: npm run sim
// Гоняет src/systems/battle.ts много раз и печатает процент побед, оставшееся здоровье героя и деньги по ночам.
//
// Бот: лечение — когда оно не уйдёт впустую; остальные расходники (бомба, масло, мандрагора) —
// по одному заряду каждого предмета на врага, в начале боя с ним (оглушение — только если враг не оглушён).
// Никогда не отступает. Расходники тратятся как в игре: заряды кончились — предмет пропал до конца дня.
//
// Эталонные сборки по ночам (REF): «осмысленная» — с позициями под соседство и с лечением;
// «наивная» — те же предметы, разложенные случайно (в каждом прогоне заново), без учёта соседства.
// Бюджет сборки к ночи n = стартовые монеты + Σ(доход − платёж − восполнение расходников) за прошлые ночи.
import {
  DEBT_PAYMENTS,
  HERO_MAX_HP,
  ITEM_STATS,
  LEVEL_BY_NIGHT,
  NIGHTS,
  START_COINS,
  START_ITEMS,
} from '../config/balance';
import { CLIENT_IDS, CLIENTS, type ClientId } from '../data/clients';
import { ITEM_IDS, ITEMS, type ItemId } from '../data/items';
import { MODIFIER_IDS, MODIFIERS, type ModifierId } from '../data/modifiers';
import { canPlace, findSpot, MASK, type OwnedItem } from '../systems/backpack';
import { BattleSim, type ChainLink } from '../systems/battle';
import { generateQueue, levelForNight, rollEnemies, type Contract } from '../systems/contracts';
import type { Rng } from '../systems/random';
import { computePower, gearSummary, maxCharges } from '../systems/synergy';

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
  /** Здоровье в конце дня (0 — смерть). */
  hp: number;
  won: boolean;
  /** Награды выполненных заказов (за вычетом украденного) минус неустойки за невыполненные. Кикимора — тоже доход: она гасит долг. */
  income: number;
  /** Сколько стоит купить заново потраченные за день заряды расходников. */
  replacement: number;
}

/** Стоимость одного заряда предмета: цена всех вложенных копий / заряды на этом уровне. */
const chargePrice = (id: ItemId, star: number) => (ITEM_STATS[id].price * 2 ** (star - 1)) / (maxCharges(id, star) ?? 1);

function playDay(items: OwnedItem[], plan: DayPlan, night: number, rng: Rng): DayResult {
  const sim = new BattleSim({ items, chain: plan.chain, clients: plan.clients, night, rng });
  let t = 0;
  let used = new Set<number>(); // какие небоевые расходники уже применены к текущему врагу
  while (sim.status === 'fight' || sim.status === 'enemyDown') {
    if (sim.status === 'enemyDown') {
      sim.advance();
      used = new Set();
      t = 0;
      continue;
    }
    for (const a of sim.actives) {
      if (a.disabled) continue;
      const heal = Math.round(a.stats.heal ?? 0);
      if (heal > 0) {
        if (sim.heroHp <= HERO_MAX_HP - heal) sim.useActive(a.item.uid);
        continue;
      }
      if (used.has(a.item.uid)) continue;
      const stunOnly = !!a.stats.stun && !a.stats.damage;
      if (stunOnly && sim.enemy.stun > 0) continue;
      used.add(a.item.uid);
      sim.useActive(a.item.uid);
    }
    sim.step(DT);
    sim.drain();
    t += DT;
    if (t > MAX_SECONDS_PER_ENEMY) {
      sim.heroHp = 0;
      sim.status = 'lost';
    }
  }
  const won = sim.status === 'won';

  // Доход: как contractResults в state.ts при победе или смерти (бот не отступает).
  let income = 0;
  if (plan.contracts) {
    const defeated = sim.defeated;
    let start = 0;
    plan.contracts.forEach((c, i) => {
      const total = c.enemies.length;
      const done = defeated - start >= total;
      start += total;
      income += done ? Math.max(0, c.reward - sim.stolen[i]) : -c.penalty;
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
  return { hp: won ? sim.heroHp : 0, won, income, replacement };
}

interface Stats {
  wins: number;
  medianHp: number;
  minHp: number;
  /** Средний доход за день и на один принятый заказ. */
  income: number;
  incomePerContract: number;
  replacement: number;
}

/** RUNS прогонов дня. naive — сборка раскладывается случайно в каждом прогоне. */
function simulate(night: number, build: BuildEntry[], plan: (rng: Rng) => DayPlan, naive = false, seed = 1): Stats {
  const rng = seeded(seed);
  const layoutRng = seeded(seed * 7919 + 17);
  const fixed = pack(build).items;
  const hps: number[] = [];
  let wins = 0;
  let income = 0;
  let contracts = 0;
  let replacement = 0;
  for (let i = 0; i < RUNS; i++) {
    const p = plan(rng);
    // Свежие копии предметов: заряды в каждом прогоне свои.
    const items = naive ? packRandom(build, layoutRng) : fixed.map((it) => ({ ...it }));
    const r = playDay(items, p, night, rng);
    if (r.won) wins++;
    hps.push((r.hp / HERO_MAX_HP) * 100);
    income += r.income;
    contracts += p.contracts?.length ?? 0;
    replacement += r.replacement;
  }
  hps.sort((a, b) => a - b);
  return {
    wins: (wins / RUNS) * 100,
    medianHp: hps[Math.floor(RUNS / 2)],
    minHp: hps[0],
    income: income / RUNS,
    incomePerContract: contracts ? income / contracts : 0,
    replacement: replacement / RUNS,
  };
}

/** Обычный день: полный набор заказов из очереди (условия заказчиков, модификаторы, награды). */
const queueDay = (night: number) => (rng: Rng): DayPlan => {
  const contracts = generateQueue(night, rng).slice(0, levelForNight(night));
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
const a = simulate(1, base, queueDay(1));
console.log(`а) ${names(base).padEnd(44)} ${fmt(a)}`);

// Покупки, доступные в ночь 1: магазин предлагает только редкость 1, денег — стартовые монеты.
const night1Shop = ITEM_IDS.filter((id) => ITEMS[id].tier === 1 && ITEM_STATS[id].price <= START_COINS);
const withItem = night1Shop
  .map((id) => ({ id, r: simulate(1, [...base, id], queueDay(1)) }))
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
  const m = simulate(n, REF[n], queueDay(n));
  const v = simulate(n, REF[n], queueDay(n), true);
  meaningful[n] = m;
  for (const [title, r] of [['осмысленная', m], ['наивная', v]] as const) {
    console.log(`  ${n}      ${levelForNight(n)}     ${title.padEnd(14)}  ${fmt(r)}      ${(100 - r.wins).toFixed(0).padStart(3)}%`);
  }
}

// ─── Экономика ───────────────────────────────────────────────────────────────

console.log(`\n=== Экономика по ночам (осмысленная сборка, средние по ${RUNS} прогонам) ===`);
console.log('    Доход — награды выполненных заказов минус неустойки (Кикимора — тоже доход: она гасит долг).');
console.log('    Половина заказов — доход на один заказ × уровень / 2. Бюджет — сколько можно потратить на сборку к этой ночи.\n');
console.log(
  'Ночь  Доход  Половина  Платёж  Остаток  Восполн.  Свободно  Сборка(накоп.)  Бюджет  В бюджете  Покупки след. ночи  Половина: накоплено',
);
let budget = START_COINS;
let halfBank = START_COINS;
let halfBankRepl = START_COINS;
let halfBroke: number | null = null;
let halfBrokeRepl: number | null = null;
for (let n = 1; n <= NIGHTS; n++) {
  const s = meaningful[n];
  const pay = DEBT_PAYMENTS[n - 1];
  const half = (s.incomePerContract * LEVEL_BY_NIGHT[n - 1]) / 2;
  const after = s.income - pay;
  const free = after - s.replacement;
  const c = cost(REF[n]);
  const next = n < NIGHTS ? cost(REF[n + 1]) - c : 0;
  const nextItems = n < NIGHTS ? REF[n + 1].length - REF[n].length : 0;
  halfBank += half - pay;
  halfBankRepl += half - pay - s.replacement / 2;
  if (halfBank < 0 && halfBroke === null) halfBroke = n;
  if (halfBankRepl < 0 && halfBrokeRepl === null) halfBrokeRepl = n;
  console.log(
    `  ${n}   ${pad(s.income.toFixed(0), 4)}  ${pad(half.toFixed(0), 7)}  ${pad(pay, 6)}  ${pad(after.toFixed(0), 7)}  ${pad(s.replacement.toFixed(0), 8)}` +
      `  ${pad(free.toFixed(0), 8)}  ${pad(c, 14)}  ${pad(budget.toFixed(0), 6)}  ${(c <= budget ? 'да' : 'НЕТ').padStart(9)}` +
      `  ${pad(n < NIGHTS ? `${next} (${nextItems} шт.)` : '—', 18)}  ${pad(halfBank.toFixed(0), 8)} / ${pad(halfBankRepl.toFixed(0), 4)}`,
  );
  budget += free;
}
console.log('\n    «Половина: накоплено» — монеты после платежа при половине заказов без покупок / с восполнением половины расходников.');
console.log(
  `    Половина заказов: долг не оплачен впервые в ночь ${halfBroke ?? '— (оплачивается все ночи)'} без покупок, ` +
    `в ночь ${halfBrokeRepl ?? '— (оплачивается все ночи)'} с восполнением расходников.`,
);

// ─── Условия и модификаторы по отдельности ───────────────────────────────────
// День из заказов одного заказчика (враги без модификаторов) или из врагов с одним модификатором
// (заказчик без боевого условия — Водяной). Осмысленная эталонная сборка ночи.

const fixedDay = (night: number, client: ClientId, mod: ModifierId | null) => (rng: Rng): DayPlan => {
  const level = levelForNight(night);
  const chain: ChainLink[] = [];
  for (let c = 0; c < level; c++) for (const enemy of rollEnemies(night, rng, 2)) chain.push({ enemy, contract: c, mod });
  return { chain, clients: Array.from({ length: level }, () => client) };
};
const short = (r: Stats) => `${r.wins.toFixed(0).padStart(3)}% / ${r.medianHp.toFixed(0).padStart(3)}%`;

console.log(`\n=== Условия заказчиков: ${levelForNight(3)} заказа одного заказчика, без модификаторов (побед / медиана здоровья) ===\n`);
console.log(`  ${'Заказчик'.padEnd(36)}${'ночь 2'.padEnd(16)}${'ночь 3'.padEnd(16)}`);
for (const client of CLIENT_IDS) {
  const cells = [2, 3].map((n) => short(simulate(n, REF[n], fixedDay(n, client, null))).padEnd(16));
  console.log(`  ${`${CLIENTS[client].name} «${CLIENTS[client].condition.title}»`.padEnd(36)}${cells.join('')}`);
}

console.log(`\n=== Модификаторы: у всех врагов один модификатор, заказчик — Водяной (побед / медиана здоровья) ===\n`);
console.log(`  ${'Модификатор'.padEnd(36)}${'ночь 3'.padEnd(16)}${'ночь 4'.padEnd(16)}`);
for (const mod of [null, ...MODIFIER_IDS]) {
  const cells = [3, 4].map((n) => short(simulate(n, REF[n], fixedDay(n, 'vodyanoy', mod))).padEnd(16));
  console.log(`  ${(mod ? MODIFIERS[mod].name : 'без модификатора').padEnd(36)}${cells.join('')}`);
}
console.log('');
