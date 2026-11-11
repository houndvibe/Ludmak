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
  | 'mandrake'
  | 'whetstone'
  | 'rusty_sickle'
  | 'smoked_ham';

/** passive — срабатывает сам по перезарядке; active — кнопка с зарядами. */
export type ItemMode = 'passive' | 'active';

/**
 * Категория предмета — его основной тип: значок вверху карточки, первая плашка, связки соседства.
 * 'weapon' важна для масла (урон оружия ×2), 'alchemy' и 'food' — для соседства (Огонь к Алхимии, Огонь сжигает Еду…).
 */
export type ItemCategory = 'weapon' | 'armor' | 'amulet' | 'alchemy' | 'food';

export const CATEGORY_NAMES: Record<ItemCategory, string> = {
  weapon: 'Оружие',
  armor: 'Броня',
  amulet: 'Амулет',
  alchemy: 'Алхимия',
  food: 'Еда',
};

/** Цвет круга значка категории (заглушка иконки) и плашки категории на карточке магазина. */
export const CATEGORY_COLORS: Record<ItemCategory, number> = {
  weapon: 0x7d8794,
  armor: 0x8a6a45,
  amulet: 0xa8843a,
  alchemy: 0x4f9a5a,
  food: 0xc9a14a,
};

export const CATEGORY_IDS = Object.keys(CATEGORY_NAMES) as ItemCategory[];

export interface ItemDef {
  id: ItemId;
  name: string;
  mode: ItemMode;
  category: ItemCategory;
  /** Теги: Огонь, Серебро, Проклятие — для соседства; Шумное — свойство; Лечение, Бомба, Эликсир, Масло, Контроль — назначение. */
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
    torch: { id: 'torch', name: 'Факел', mode: 'passive', category: 'weapon', tags: ['fire'], w: 1, h: 2, tier: 1 },
    bread: { id: 'bread', name: 'Краюха хлеба', mode: 'passive', category: 'food', tags: ['heal'], w: 1, h: 1, tier: 1 },
    silver_horseshoe: { id: 'silver_horseshoe', name: 'Серебряная подкова', mode: 'passive', category: 'amulet', tags: ['silver'], w: 1, h: 1, tier: 2 },
    bone_amulet: { id: 'bone_amulet', name: 'Ладанка с костями', mode: 'passive', category: 'amulet', tags: ['curse'], w: 1, h: 1, tier: 2 },
    bomb_grom: { id: 'bomb_grom', name: 'Бомба «Гром»', mode: 'active', category: 'alchemy', tags: ['bomb', 'noisy'], w: 1, h: 1, tier: 2 },
    healing_elixir: { id: 'healing_elixir', name: 'Лечебный эликсир', mode: 'active', category: 'alchemy', tags: ['elixir'], w: 1, h: 1, tier: 2 },
    oil_vs_humans: { id: 'oil_vs_humans', name: 'Масло против людей', mode: 'active', category: 'alchemy', tags: ['oil'], w: 1, h: 1, tier: 2 },
    mandrake: { id: 'mandrake', name: 'Мандрагора', mode: 'active', category: 'alchemy', tags: ['stun', 'noisy'], w: 1, h: 2, tier: 3 },
  whetstone: { id: 'whetstone', name: 'Точильный камень', mode: 'passive', category: 'amulet', tags: [], w: 1, h: 1, tier: 1 },
  rusty_sickle: { id: 'rusty_sickle', name: 'Ржавый серп', mode: 'passive', category: 'weapon', tags: ['curse'], w: 1, h: 2, tier: 1 },
  smoked_ham: { id: 'smoked_ham', name: 'Копчёный окорок', mode: 'passive', category: 'food', tags: ['heal'], w: 1, h: 2, tier: 2 },
  };

/** Название редкости для подсказки в магазине. */
export const TIER_NAMES: Record<ItemTier, string> = { 1: 'обычный', 2: 'редкий', 3: 'особый' };

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
