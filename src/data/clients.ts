// Заказчики и их условия. Числа условий (множители награды и неустойки, двойной удар) — в src/config/balance.ts.
// Условие действует только в бою с врагами своего заказа; при переходе к врагам другого заказа оно снимается.
import { CLIENT_PENALTY_MULT, CLIENT_REWARD_MULT, GHOST_FIRST_HIT_MULT } from '../config/balance';
import type { Selector } from './synergies';

export type ClientId = 'vodyanoy' | 'kikimora' | 'leshy' | 'upyr' | 'prizrak' | 'gul';

export interface ClientCondition {
  /** Название условия: «Лес не жечь». */
  title: string;
  /** Предметы героя, которые не работают в бою с врагами этого заказа (как отключённые соседством). */
  ban?: Selector[];
  /** Как запрет звучит на карточке: «предметы с Огнём не работают». */
  banText?: string;
  /** Первый удар героя по каждому врагу заказа — × GHOST_FIRST_HIT_MULT. */
  firstHitBonus?: boolean;
  /** Пока заказ не выполнен, на привале нельзя отступить. */
  noRetreat?: boolean;
  /** Награда не выдаётся монетами, а уменьшает ближайший платёж по долгу; остаток — в монеты. */
  payDebt?: boolean;
}

export interface ClientDef {
  id: ClientId;
  name: string;
  /** Родительный падеж для плашки в бою: «Заказ лешего». */
  genitive: string;
  /** Реплика на карточке заказа. */
  line: string;
  condition: ClientCondition;
}

export const CLIENTS: Record<ClientId, ClientDef> = {
  vodyanoy: {
    id: 'vodyanoy',
    name: 'Водяной',
    genitive: 'водяного',
    line: 'Мельницу на моей запруде ставят. Колесом воду мутят, рыбу пугают. Разберись.',
    condition: { title: 'Торгуется жёстко' },
  },
  kikimora: {
    id: 'kikimora',
    name: 'Кикимора',
    genitive: 'кикиморы',
    line: 'Про должок помнишь? Вот и славно. А пока работёнка: соседи мне печь заложили.',
    condition: { title: 'Ростовщица', payDebt: true },
  },
  leshy: {
    id: 'leshy',
    name: 'Леший',
    genitive: 'лешего',
    line: 'Грибники совсем распоясались. Тропы топчут, костры жгут. Уйми.',
    condition: { title: 'Лес не жечь', ban: [{ tag: 'fire' }], banText: 'предметы с Огнём не работают' },
  },
  upyr: {
    id: 'upyr',
    name: 'Упырь',
    genitive: 'упыря',
    line: 'Чеснок на всех окнах. Третью неделю голодаю. Вот они, чесночники.',
    condition: { title: 'Без спешки', ban: [{ item: 'silver_horseshoe' }], banText: 'серебряная подкова не работает', noRetreat: true },
  },
  prizrak: {
    id: 'prizrak',
    name: 'Призрак',
    genitive: 'призрака',
    line: 'В моём доме теперь живут. Ремонт затеяли… Мне бы тишины.',
    condition: {
      title: 'Чтобы никто не услышал',
      ban: [{ tag: 'noisy' }],
      banText: 'шумные предметы не работают',
      firstHitBonus: true,
    },
  },
  gul: {
    id: 'gul',
    name: 'Гуль',
    genitive: 'гуля',
    line: 'Кладбище огородили, сторожа наняли. Ни поесть, ни полежать.',
    condition: { title: 'Мне нужны целые тела', ban: [{ item: 'bomb_grom' }], banText: 'бомбы не работают' },
  },
};

export const CLIENT_IDS = Object.keys(CLIENTS) as ClientId[];

const times = (x: number) => `×${String(x).replace('.', ',')}`;

/** Что условие делает, одной строкой: «Огонь в бою не работает». Числа берутся из balance.ts. */
export function conditionEffect(id: ClientId): string {
  const c = CLIENTS[id].condition;
  const parts: string[] = [];
  if (c.banText) parts.push(c.banText);
  if (c.firstHitBonus) parts.push(`первый удар по каждому врагу ${times(GHOST_FIRST_HIT_MULT)}`);
  if (c.noRetreat) parts.push('отступить нельзя, пока заказ не выполнен');
  if (c.payDebt) parts.push('награда идёт в счёт долга');
  const reward = CLIENT_REWARD_MULT[id];
  const penalty = CLIENT_PENALTY_MULT[id];
  if (reward) parts.push(`награда ${times(reward)}`);
  if (penalty) parts.push(`неустойка ${times(penalty)}`);
  return parts.join(', ');
}
