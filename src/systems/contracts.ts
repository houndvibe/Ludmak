// Генерация очереди монстров с заказами на ночь. Без Phaser — используется и в симуляции.
import {
  CLIENT_PENALTY_MULT,
  CLIENT_REWARD_MULT,
  CONTRACT_SIZE_MULT,
  ENEMY_COUNT_BY_NIGHT,
  ENEMY_POOL_BY_NIGHT,
  ENEMY_STATS,
  LEVEL_BY_NIGHT,
  MODIFIER_CHANCE_BY_NIGHT,
  PENALTY_RATIO,
  QUEUE_EXTRA,
  REWARD_MULT_BY_NIGHT,
  REWARD_SPREAD,
} from '../config/balance';
import { CLIENT_IDS, CLIENTS, type ClientId } from '../data/clients';
import { ENEMIES, type EnemyId } from '../data/enemies';
import { MODIFIER_IDS, type ModifierId } from '../data/modifiers';
import { pick, randInt, randReal, shuffle, type Rng } from './random';

export interface Contract {
  client: ClientId;
  /** Враги по порядку боя. */
  enemies: EnemyId[];
  /** Номер квеста заказчика (CLIENTS[client].quests): реплика у окошка и подходящие модификаторы. */
  quest: number;
  /** Модификатор каждого врага (тот же порядок, что enemies); null — без модификатора. */
  mods: (ModifierId | null)[];
  reward: number;
  penalty: number;
}

/** Модификатор врага: с шансом MODIFIER_CHANCE_BY_NIGHT — один из модификаторов квеста (нет — любой), у босса — никогда. */
function rollModifier(night: number, enemy: EnemyId, pool: ModifierId[], rng: Rng): ModifierId | null {
  if (ENEMIES[enemy].boss || rng() >= MODIFIER_CHANCE_BY_NIGHT[night - 1]) return null;
  return pick(rng, pool.length ? pool : MODIFIER_IDS);
}

/** Уже показанные квесты по заказчикам (номера в CLIENTS[client].quests) — чтобы за забег не повторялись. */
export type UsedQuests = Partial<Record<ClientId, number[]>>;

/** Случайный ещё не показанный квест заказчика; все показаны — любой. */
function pickQuest(client: ClientId, used: UsedQuests, rng: Rng): number {
  const all = CLIENTS[client].quests.map((_, i) => i);
  const fresh = all.filter((i) => !used[client]?.includes(i));
  return pick(rng, fresh.length ? fresh : all);
}

/** Уровень Людьмака в эту ночь = сколько заказов можно принять. */
export function levelForNight(night: number): number {
  return LEVEL_BY_NIGHT[night - 1];
}

/** Обычные враги одного заказа этой ночи. */
export function rollEnemies(night: number, rng: Rng, count?: number): EnemyId[] {
  const [min, max] = ENEMY_COUNT_BY_NIGHT[night - 1];
  const n = count ?? randInt(rng, min, max);
  return Array.from({ length: n }, () => pick(rng, ENEMY_POOL_BY_NIGHT[night - 1]));
}

/**
 * Множители заказчика считаются от обычных значений заказа: награда × CLIENT_REWARD_MULT,
 * неустойка = обычная неустойка (от награды без множителя заказчика) × CLIENT_PENALTY_MULT.
 */
function makeContract(night: number, client: ClientId, enemies: EnemyId[], quest: number, rng: Rng): Contract {
  const bounty = enemies.reduce((sum, e) => sum + ENEMY_STATS[e].bounty, 0);
  const size = CONTRACT_SIZE_MULT[enemies.length] ?? 1; // большой заказ выгоднее за голову
  const base = bounty * size * REWARD_MULT_BY_NIGHT[night - 1] * (1 + randReal(rng, -REWARD_SPREAD, REWARD_SPREAD));
  const reward = Math.round(base * (CLIENT_REWARD_MULT[client] ?? 1));
  const penalty = Math.round(base * PENALTY_RATIO * (CLIENT_PENALTY_MULT[client] ?? 1));
  const pool = CLIENTS[client].quests[quest]?.mods ?? [];
  const mods = enemies.map((e) => rollModifier(night, e, pool, rng));
  return { client, quest, enemies, mods, reward, penalty };
}

/** Заказ с заданными заказчиком и врагами, первый квест, без модификаторов (обучающая ночь). Награда — по обычной формуле. */
export function fixedContract(night: number, client: ClientId, enemies: EnemyId[], rng: Rng = Math.random): Contract {
  return { ...makeContract(night, client, enemies, 0, rng), mods: enemies.map(() => null) };
}

/**
 * Очередь монстров к двери: уровень + QUEUE_EXTRA, заказчики не повторяются.
 * Квест каждого — ещё не показанный за забег (used). Финальный босс — не заказ (FINAL_BOSS).
 */
export function generateQueue(night: number, rng: Rng = Math.random, used: UsedQuests = {}): Contract[] {
  const size = Math.min(levelForNight(night) + QUEUE_EXTRA, CLIENT_IDS.length);
  return shuffle(rng, CLIENT_IDS)
    .slice(0, size)
    .map((client) => makeContract(night, client, rollEnemies(night, rng), pickQuest(client, used, rng), rng));
}
