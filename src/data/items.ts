// Предметы: имена, формы, теги. Все числа (цены, урон, перезарядки, заряды) — в src/config/balance.ts.
import type { TagId } from './tags';

export type ItemId =
  | 'steel_sword'
  | 'silver_dagger'
  | 'cursed_axe'
  | 'wooden_shield'
  | 'torch'
  | 'bread'
  | 'silver_horseshoe'
  | 'bone_amulet'
  | 'bomb_grom'
  | 'healing_elixir'
  | 'oil_vs_humans'
  | 'mandrake';

/** passive — срабатывает сам по перезарядке; active — кнопка с зарядами. */
export type ItemMode = 'passive' | 'active';

/** Категория для подписи. 'weapon' важна для масла (урон оружия ×2). */
export type ItemCategory = 'weapon' | 'armor' | 'damage' | 'heal' | 'amulet' | 'bomb' | 'elixir' | 'oil' | 'stun';

export const CATEGORY_NAMES: Record<ItemCategory, string> = {
  weapon: 'Оружие',
  armor: 'Броня',
  damage: 'Урон',
  heal: 'Лечение',
  amulet: 'Амулет',
  bomb: 'Бомба',
  elixir: 'Эликсир',
  oil: 'Масло',
  stun: 'Контроль',
};

export interface ItemDef {
  id: ItemId;
  name: string;
  mode: ItemMode;
  category: ItemCategory;
  /** Первый тег вида 'tag' — основной (цвет заглушки). 'noisy' — свойство. */
  tags: TagId[];
  /** Форма в клетках без поворота: ширина × высота. */
  w: number;
  h: number;
  /** Редкость 1–3: как часто предмет встречается в магазине по ночам (веса — SHOP_TIER_WEIGHTS_BY_NIGHT). */
  tier: ItemTier;
}

export type ItemTier = 1 | 2 | 3;

export const ITEMS: Record<ItemId, ItemDef> = {
  steel_sword: { id: 'steel_sword', name: 'Стальной меч', mode: 'passive', category: 'weapon', tags: [], w: 1, h: 3, tier: 1 },
  silver_dagger: { id: 'silver_dagger', name: 'Серебряный кинжал', mode: 'passive', category: 'weapon', tags: ['silver'], w: 1, h: 2, tier: 1 },
  cursed_axe: { id: 'cursed_axe', name: 'Проклятый топор', mode: 'passive', category: 'weapon', tags: ['curse'], w: 2, h: 2, tier: 3 },
  wooden_shield: { id: 'wooden_shield', name: 'Деревянный щит', mode: 'passive', category: 'armor', tags: [], w: 2, h: 2, tier: 1 },
  torch: { id: 'torch', name: 'Факел', mode: 'passive', category: 'damage', tags: ['fire'], w: 1, h: 2, tier: 1 },
  bread: { id: 'bread', name: 'Краюха хлеба', mode: 'passive', category: 'heal', tags: ['food'], w: 1, h: 1, tier: 1 },
  silver_horseshoe: { id: 'silver_horseshoe', name: 'Серебряная подкова', mode: 'passive', category: 'amulet', tags: ['silver'], w: 1, h: 1, tier: 2 },
  bone_amulet: { id: 'bone_amulet', name: 'Ладанка с костями', mode: 'passive', category: 'amulet', tags: ['curse'], w: 1, h: 1, tier: 2 },
  bomb_grom: { id: 'bomb_grom', name: 'Бомба «Гром»', mode: 'active', category: 'bomb', tags: ['alchemy', 'noisy'], w: 1, h: 1, tier: 2 },
  healing_elixir: { id: 'healing_elixir', name: 'Лечебный эликсир', mode: 'active', category: 'elixir', tags: ['alchemy'], w: 1, h: 1, tier: 2 },
  oil_vs_humans: { id: 'oil_vs_humans', name: 'Масло против людей', mode: 'active', category: 'oil', tags: ['alchemy'], w: 1, h: 1, tier: 2 },
  mandrake: { id: 'mandrake', name: 'Мандрагора', mode: 'active', category: 'stun', tags: ['alchemy', 'noisy'], w: 1, h: 2, tier: 3 },
};

/** Название редкости для подсказки в магазине. */
export const TIER_NAMES: Record<ItemTier, string> = { 1: 'обычный', 2: 'редкий', 3: 'особый' };

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
