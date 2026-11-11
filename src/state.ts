// Состояние забега — один объект на всю игру. Сцены читают и меняют его через функции ниже.
import * as Phaser from 'phaser';
import {
  DEBT_PAYMENTS,
  ENEMY_STAT_MULT_BY_NIGHT,
  ITEM_STATS,
  MAX_STAR,
  NIGHTS,
  SELL_RATIO,
  SHOP_REROLL_BASE,
  SHOP_REROLL_STEP,
  START_COINS,
  START_ITEMS,
  STAR_MULT,
} from './config/balance';
import { CLIENTS } from './data/clients';
import type { ItemId } from './data/items';
import type { ChainLink } from './systems/battle';
import { findSpot, type OwnedItem } from './systems/backpack';
import { TUTORIAL } from './data/tutorial';
import { fixedContract, generateQueue, levelForNight, type Contract } from './systems/contracts';
import { rollShopOffers } from './systems/shop';
import { maxCharges, starOf } from './systems/synergy';

/** Итог дня. defeated — сколько врагов цепочки побеждено; stolen — украдено из награды каждого заказа. */
export interface DayOutcome {
  kind: 'win' | 'retreat' | 'death' | 'skip';
  defeated: number;
  stolen: number[];
}

export interface ContractResult {
  contract: Contract;
  /** Побеждено врагов этого заказа. */
  defeated: number;
  done: boolean;
  reward: number;
  penalty: number;
  stolen: number;
}

export interface NightSummary {
  night: number;
  outcome: DayOutcome;
  results: ContractResult[];
  reward: number;
  penalty: number;
  lostItem: ItemId | null;
  coinsBefore: number;
  /** После наград и неустоек, не ниже 0. */
  coinsAfterContracts: number;
  /** Платёж по долгу этой ночи по графику (DEBT_PAYMENTS). */
  paymentBase: number;
  /** Награды заказов кикиморы: идут в счёт долга, а не монетами. */
  debtCredit: number;
  /** Часть награды кикиморы сверх платежа — она перешла в монеты (уже учтена в coinsAfterContracts). */
  creditToCoins: number;
  /** Сколько реально нужно заплатить: paymentBase − debtCredit, не ниже 0. */
  payment: number;
  paid: boolean;
  coinsAfter: number;
  /** null — забег продолжается. */
  gameOver: 'win' | 'lose' | null;
}

export interface RunState {
  night: number;
  coins: number;
  items: OwnedItem[];
  nextUid: number;
  /** Монстры у двери этой ночью, по порядку. */
  queue: Contract[];
  /** Индекс монстра, который сейчас у окошка; queue.length — очередь закончилась. */
  queuePos: number;
  /** Принятые заказы — днём идут подряд. */
  accepted: Contract[];
  /** null — уже куплено. */
  shopOffers: (ItemId | null)[];
  rerolls: number;
  summary: NightSummary | null;
  /** Идёт обучающая ночь 1 (фиксированный заказ лешего, фиксированный магазин, подсказки). */
  tutorial: boolean;
  /** Номер текущего шага обучения в TUTORIAL_STEPS (шаги идут строго по порядку; дошли до конца — шагов больше нет). */
  tutorialStep: number;
}

export let run: RunState = emptyRun();

function emptyRun(): RunState {
  return {
    night: 1,
    coins: START_COINS,
    items: [],
    nextUid: 1,
    queue: [],
    queuePos: 0,
    accepted: [],
    shopOffers: [],
    rerolls: 0,
    summary: null,
    tutorial: false,
    tutorialStep: 0,
  };
}

/** tutorial — первая ночь пойдёт по сценарию обучения (src/data/tutorial.ts). */
export function newRun(tutorial = false): void {
  run = emptyRun();
  run.tutorial = tutorial;
  for (const id of START_ITEMS) addItem(id);
  startNight();
}

function startNight(): void {
  if (run.tutorial && run.night === 1) {
    // Обучение: к окошку подходит только леший, магазин фиксированный.
    run.queue = [fixedContract(1, TUTORIAL.client, TUTORIAL.enemies)];
    run.shopOffers = [...TUTORIAL.shop];
  } else {
    run.tutorial = false;
    run.queue = generateQueue(run.night);
    rollShop();
  }
  run.queuePos = 0;
  run.accepted = [];
  run.rerolls = 0;
  run.summary = null;
}

export function advanceNight(): void {
  run.night++;
  startNight();
}

// ─── Обучение пройдено (localStorage) ────────────────────────────────────────
// Хранилище может быть недоступно (приватный режим, запрет сайта) — тогда обучение просто показывается.

const TUTORIAL_KEY = 'ludmak.tutorialDone';

export function isTutorialDone(): boolean {
  try {
    return window.localStorage.getItem(TUTORIAL_KEY) === '1';
  } catch {
    return false;
  }
}

export function markTutorialDone(): void {
  try {
    window.localStorage.setItem(TUTORIAL_KEY, '1');
  } catch {
    // нет хранилища — в следующий раз обучение покажется снова
  }
}

// ─── Очередь у двери ─────────────────────────────────────────────────────────

export function currentVisitor(): Contract | null {
  return run.queue[run.queuePos] ?? null;
}

export function queueDone(): boolean {
  return run.queuePos >= run.queue.length;
}

/** Уровень Людьмака этой ночью = сколько заказов можно принять. */
export function heroLevel(): number {
  return levelForNight(run.night);
}

/** Решение по монстру у окошка. Как только набран лимит заказов, очередь сразу заканчивается. */
export function decideVisitor(accept: boolean): void {
  const c = currentVisitor();
  if (!c) return;
  if (accept && run.accepted.length < heroLevel()) run.accepted.push(c);
  run.queuePos = run.accepted.length >= heroLevel() ? run.queue.length : run.queuePos + 1;
}

/** Каким будет уровень следующей ночью (null — последняя ночь). */
export function nextLevel(): number | null {
  return run.night < NIGHTS ? levelForNight(run.night + 1) : null;
}

/** Множитель силы врагов этой ночи (здоровье, урон, лечение, блок). */
export function enemyPowerMult(): number {
  return ENEMY_STAT_MULT_BY_NIGHT[run.night - 1];
}

/** Враги дня одной цепочкой: все принятые заказы подряд. */
export function dayChain(): ChainLink[] {
  return run.accepted.flatMap((c, i) => c.enemies.map((enemy, j) => ({ enemy, contract: i, mod: c.mods[j] })));
}

// ─── Магазин ─────────────────────────────────────────────────────────────────

function rollShop(): void {
  run.shopOffers = rollShopOffers(run.night);
}

export function rerollCost(): number {
  return SHOP_REROLL_BASE + SHOP_REROLL_STEP * run.rerolls;
}

/** В обучающую ночь ассортимент фиксированный — обновлять нельзя. */
export function canReroll(): boolean {
  return !run.tutorial;
}

export function reroll(): boolean {
  const cost = rerollCost();
  if (!canReroll() || run.coins < cost) return false;
  run.coins -= cost;
  run.rerolls++;
  rollShop();
  return true;
}

/** Сколько базовых предметов вложено в предмет этого уровня: ★1 — 1, ★2 — 2, ★3 — 4. */
const copiesInStar = (star: number) => 2 ** (star - 1);

/** Половина суммарной стоимости × доля оставшихся зарядов (для расходников). */
export function sellPrice(item: OwnedItem): number {
  const star = starOf(item);
  const max = maxCharges(item.id, star);
  const share = max ? Math.min(1, (item.charges ?? 0) / max) : 1;
  return Math.floor(ITEM_STATS[item.id].price * copiesInStar(star) * SELL_RATIO * share);
}

/** Можно ли слить предмет a с предметом b: тот же предмет, тот же уровень, уровень ниже максимума. */
export function canMerge(a: OwnedItem, b: OwnedItem): boolean {
  return a.uid !== b.uid && a.id === b.id && starOf(a) === starOf(b) && starOf(a) < MAX_STAR;
}

/**
 * Заряды после слияния: сумма оставшихся × (множитель нового уровня / множитель прежнего) / 2, вверх.
 * Для ★1+★1 это ровно «сумма × множитель ★2 / 2».
 */
function mergedCharges(a: number | undefined, b: number | undefined, fromStar: number): number | undefined {
  if (a === undefined && b === undefined) return undefined;
  return Math.ceil((((a ?? 0) + (b ?? 0)) * (STAR_MULT[fromStar] / STAR_MULT[fromStar - 1])) / 2);
}

/** Слить dragged в target: target повышает уровень, dragged исчезает. Список меняется на месте. */
export function mergeItems(draggedUid: number, targetUid: number): boolean {
  const a = run.items.find((i) => i.uid === draggedUid);
  const b = run.items.find((i) => i.uid === targetUid);
  if (!a || !b || !canMerge(a, b)) return false;
  const star = starOf(b);
  b.charges = mergedCharges(a.charges, b.charges, star);
  b.star = star + 1;
  run.items.splice(run.items.indexOf(a), 1);
  return true;
}

/** Купить предмет из ассортимента и сразу слить с таким же предметом ★1. */
export function buyAndMerge(slot: number, targetUid: number): boolean {
  const id = run.shopOffers[slot];
  const target = run.items.find((i) => i.uid === targetUid);
  if (!id || !target || target.id !== id || starOf(target) !== 1 || run.coins < ITEM_STATS[id].price) return false;
  run.coins -= ITEM_STATS[id].price;
  run.shopOffers[slot] = null;
  target.charges = mergedCharges(ITEM_STATS[id].charges, target.charges, 1);
  target.star = 2;
  return true;
}

/** Предмет уничтожен (взрыв в начале боя): исчезает из рюкзака навсегда. */
export function destroyItem(uid: number): void {
  const i = run.items.findIndex((it) => it.uid === uid);
  if (i >= 0) run.items.splice(i, 1);
}

export function buy(slot: number): boolean {
  const id = run.shopOffers[slot];
  if (!id || run.coins < ITEM_STATS[id].price) return false;
  run.coins -= ITEM_STATS[id].price;
  run.shopOffers[slot] = null;
  addItem(id);
  return true;
}

export function sell(uid: number): void {
  const item = run.items.find((i) => i.uid === uid);
  if (!item) return;
  run.coins += sellPrice(item);
  run.items.splice(run.items.indexOf(item), 1);
}

/** Новый предмет сразу кладётся в первое свободное место сетки, иначе — вне сумок. */
function addItem(id: ItemId): void {
  const spot = findSpot(run.items, id);
  run.items.push({
    uid: run.nextUid++,
    id,
    inGrid: spot !== null,
    col: spot?.col ?? 0,
    row: spot?.row ?? 0,
    rotated: spot?.rotated ?? false,
    charges: ITEM_STATS[id].charges,
  });
}

/** Тратит заряд предмета (активного или хлеба). Последний заряд — предмет исчезает навсегда. Возвращает остаток. */
export function spendCharge(uid: number): number {
  const item = run.items.find((i) => i.uid === uid);
  if (!item || !item.charges) return 0;
  item.charges--;
  if (item.charges <= 0) run.items.splice(run.items.indexOf(item), 1);
  return item.charges;
}

// ─── Итоги дня ───────────────────────────────────────────────────────────────

/** Награды и неустойки по каждому принятому заказу при данном исходе дня. */
export function contractResults(outcome: DayOutcome): ContractResult[] {
  let start = 0;
  return run.accepted.map((contract, i) => {
    const total = contract.enemies.length;
    const defeated = Math.min(total, Math.max(0, outcome.defeated - start));
    start += total;
    const stolen = outcome.stolen[i] ?? 0;
    const done = defeated >= total;
    let reward = 0;
    let penalty = 0;
    if (done) reward = Math.max(0, contract.reward - stolen);
    else if (outcome.kind === 'death') penalty = contract.penalty;
    else penalty = Math.ceil((contract.penalty * (total - defeated)) / total);
    return { contract, defeated, done, reward, penalty, stolen };
  });
}

/** Сколько неустоек придётся заплатить, если отступить сейчас. */
export function retreatPenalty(defeated: number, stolen: number[]): number {
  return contractResults({ kind: 'retreat', defeated, stolen }).reduce((s, r) => s + r.penalty, 0);
}

/** Применяет итог дня и платёж по долгу. Вызывается один раз в конце дня. */
export function resolveNight(outcome: DayOutcome): NightSummary {
  const coinsBefore = run.coins;
  const results = contractResults(outcome);
  const reward = results.reduce((s, r) => s + r.reward, 0);
  const penalty = results.reduce((s, r) => s + r.penalty, 0);

  let lostItem: ItemId | null = null;
  if (outcome.kind === 'death') {
    const inGrid = run.items.filter((i) => i.inGrid);
    const pool = inGrid.length > 0 ? inGrid : run.items;
    if (pool.length > 0) {
      const lost = Phaser.Math.RND.pick(pool);
      lostItem = lost.id;
      run.items.splice(run.items.indexOf(lost), 1);
    }
  }

  // Кикимора платит списанием долга: её награда уменьшает платёж этой ночи, остаток — в монеты.
  const debtCredit = results.filter((r) => CLIENTS[r.contract.client].condition.payDebt).reduce((s, r) => s + r.reward, 0);
  const paymentBase = DEBT_PAYMENTS[run.night - 1];
  const payment = Math.max(0, paymentBase - debtCredit);
  const creditToCoins = Math.max(0, debtCredit - paymentBase);

  // Монеты не уходят в минус: неустойка забирает максимум всё, что есть.
  run.coins = Math.max(0, run.coins + (reward - debtCredit) + creditToCoins - penalty);
  const coinsAfterContracts = run.coins;
  const paid = run.coins >= payment;
  let gameOver: NightSummary['gameOver'] = null;
  if (paid) {
    run.coins -= payment;
    if (run.night >= NIGHTS) gameOver = 'win';
  } else {
    run.coins = 0; // отдал всё, что было, — долг не оплачен
    gameOver = 'lose';
  }

  run.summary = {
    night: run.night,
    outcome,
    results,
    reward,
    penalty,
    lostItem,
    coinsBefore,
    coinsAfterContracts,
    paymentBase,
    debtCredit,
    creditToCoins,
    payment,
    paid,
    coinsAfter: run.coins,
    gameOver,
  };
  return run.summary;
}
