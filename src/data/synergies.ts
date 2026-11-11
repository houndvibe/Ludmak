// Правила соседства предметов в рюкзаке героя. Числа — в src/config/balance.ts (SYNERGY).
// Новое правило добавляется одной записью, логику (src/systems/synergy.ts) трогать не нужно.
//
// Правило: «источник» действует на соседа-«цель». Пара соседей проверяется в обе стороны:
// если оба предмета подходят и как источник, и как цель (Серебро ↔ Серебро), эффект получают оба.
import { SYNERGY } from '../config/balance';
import type { ItemCategory, ItemId } from './items';
import type { TagId } from './tags';

/** Кому подходит правило: по тегу (включая свойство noisy), категории или конкретному предмету. */
export interface Selector {
  tag?: TagId;
  category?: ItemCategory;
  item?: ItemId;
}

/**
 * boost     — прибавка к характеристике цели (доля: 0.5 = +50%, −0.5 = −50%).
 *             stat 'damage' — только урон; 'all' — урон, лечение, блок, оглушение, длительность эффекта.
 *             aura: true — прибавка умножается на силу ауры источника (её усиливает auraBoost).
 * auraBoost — усиливает ауру цели-амулета.
 * disable   — цель отключена (сильнее любых бонусов), label — подпись на метке («Сгорит»).
 * poison    — лечение цели превращается в урон по герою.
 * explode   — с шансом chance цель взрывается в начале боя: урон damage герою, все заряды теряются.
 */
export type SynergyEffect =
  | { kind: 'boost'; stat: 'damage' | 'all'; amount: number; aura?: boolean }
  | { kind: 'auraBoost'; amount: number }
  | { kind: 'disable'; label: string }
  | { kind: 'poison' }
  | { kind: 'explode'; chance: number; damage: number };

export interface SynergyRule {
  id: string;
  /** Короткое название для подсказки: «Серебро к Серебру». */
  title: string;
  source: Selector;
  target: Selector;
  effect: SynergyEffect;
}

export const SYNERGIES: SynergyRule[] = [
  { id: 'fire_alchemy', title: 'Огонь к Алхимии', source: { tag: 'fire' }, target: { category: 'alchemy' }, effect: { kind: 'boost', stat: 'all', amount: SYNERGY.fireAlchemy } },
  { id: 'fire_food', title: 'Огонь сжигает Еду', source: { tag: 'fire' }, target: { category: 'food' }, effect: { kind: 'disable', label: 'Сгорит' } },
  {
    id: 'fire_noisy', title: 'Огонь у шумного',
    source: { tag: 'fire' },
    target: { tag: 'noisy' },
    effect: { kind: 'explode', chance: SYNERGY.noisyExplodeChance, damage: SYNERGY.noisyExplodeDamage },
  },
  { id: 'silver_silver', title: 'Серебро к Серебру', source: { tag: 'silver' }, target: { tag: 'silver' }, effect: { kind: 'boost', stat: 'all', amount: SYNERGY.silverSilver } },
  { id: 'silver_curse', title: 'Серебро против Проклятия', source: { tag: 'silver' }, target: { tag: 'curse' }, effect: { kind: 'boost', stat: 'damage', amount: SYNERGY.silverVsCurse } },
  { id: 'curse_silver', title: 'Проклятие против Серебра', source: { tag: 'curse' }, target: { tag: 'silver' }, effect: { kind: 'boost', stat: 'damage', amount: SYNERGY.curseVsSilver } },
  { id: 'alchemy_weapon', title: 'Алхимия к оружию', source: { category: 'alchemy' }, target: { category: 'weapon' }, effect: { kind: 'boost', stat: 'damage', amount: SYNERGY.alchemyWeapon } },
  { id: 'alchemy_food', title: 'Алхимия травит Еду', source: { category: 'alchemy' }, target: { category: 'food' }, effect: { kind: 'poison' } },
  { id: 'food_amulet', title: 'Еда к амулету', source: { category: 'food' }, target: { category: 'amulet' }, effect: { kind: 'auraBoost', amount: SYNERGY.foodAmulet } },
  // Личные ауры амулетов.
  {
    id: 'horseshoe_aura', title: 'аура подковы',
    source: { item: 'silver_horseshoe' },
    target: { tag: 'silver' },
    effect: { kind: 'boost', stat: 'all', amount: SYNERGY.horseshoeAura, aura: true },
  },
  {
    id: 'whetstone_aura', title: 'аура точильного камня',
    source: { item: 'whetstone' },
    target: { category: 'weapon' },
    effect: { kind: 'boost', stat: 'damage', amount: SYNERGY.whetstoneAura, aura: true },
  },
  {
    id: 'bone_aura', title: 'аура ладанки',
    source: { item: 'bone_amulet' },
    target: { tag: 'curse' },
    effect: { kind: 'boost', stat: 'all', amount: SYNERGY.boneAura, aura: true },
  },
];
