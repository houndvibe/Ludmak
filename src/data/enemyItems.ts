// Предметы врагов: имена, формы, теги, режим и приоритет. Числа (урон, перезарядка, заряды) — в src/config/balance.ts.
// Сумка врага — маленькая сетка с фиксированной раскладкой (src/data/enemies.ts), соседство не считается.
// Порядок использования задаёт priority, раскладка на него не влияет.
import type { TagId } from './tags';

export type EnemyItemId =
  | 'cow_pie'
  | 'pitchfork'
  | 'tower_shield'
  | 'spear'
  | 'loot_sack'
  | 'flail'
  | 'holy_water'
  | 'staff'
  | 'pistol'
  | 'silver_rapier'
  | 'witcher_bomb'
  | 'witcher_elixir'
  | 'silver_sword';

/**
 * action  — действие: враг делает одно за раз, берёт первый доступный предмет по priority.
 * passive — срабатывает сам по своей перезарядке (щит).
 * onHit   — срабатывает, когда действие врага ранит героя (мешок).
 */
export type EnemyItemMode = 'action' | 'passive' | 'onHit';

export type EnemyItemCategory = 'weapon' | 'throw' | 'shield' | 'steal' | 'potion';

export const ENEMY_CATEGORY_NAMES: Record<EnemyItemCategory, string> = {
  weapon: 'Оружие',
  throw: 'Снаряд',
  shield: 'Щит',
  steal: 'Кража',
  potion: 'Зелье',
};

export interface EnemyItemDef {
  id: EnemyItemId;
  name: string;
  mode: EnemyItemMode;
  category: EnemyItemCategory;
  tags: TagId[];
  /** Форма в клетках без поворота (сетка сумки врага, иконка — 128 px на клетку). */
  w: number;
  h: number;
  /** Порядок в сумке: меньше — раньше. Снаряды с зарядами — раньше основного оружия. */
  priority: number;
}

export const ENEMY_ITEMS: Record<EnemyItemId, EnemyItemDef> = {
  cow_pie: { id: 'cow_pie', name: 'Коровья лепёшка', mode: 'action', category: 'throw', tags: [], w: 1, h: 1, priority: 1 },
  pitchfork: { id: 'pitchfork', name: 'Вилы', mode: 'action', category: 'weapon', tags: [], w: 1, h: 3, priority: 9 },
  tower_shield: { id: 'tower_shield', name: 'Ростовой щит', mode: 'passive', category: 'shield', tags: [], w: 2, h: 3, priority: 0 },
  spear: { id: 'spear', name: 'Копьё', mode: 'action', category: 'weapon', tags: [], w: 1, h: 4, priority: 9 },
  loot_sack: { id: 'loot_sack', name: 'Мешок', mode: 'onHit', category: 'steal', tags: [], w: 2, h: 2, priority: 0 },
  flail: { id: 'flail', name: 'Кистень', mode: 'action', category: 'weapon', tags: [], w: 1, h: 2, priority: 9 },
  holy_water: { id: 'holy_water', name: 'Святая вода', mode: 'action', category: 'throw', tags: [], w: 1, h: 1, priority: 1 },
  staff: { id: 'staff', name: 'Посох', mode: 'action', category: 'weapon', tags: [], w: 1, h: 4, priority: 9 },
  pistol: { id: 'pistol', name: 'Пистоль', mode: 'action', category: 'throw', tags: ['fire', 'noisy'], w: 2, h: 1, priority: 1 },
  silver_rapier: { id: 'silver_rapier', name: 'Серебряная шпага', mode: 'action', category: 'weapon', tags: ['silver'], w: 1, h: 3, priority: 9 },
  witcher_elixir: { id: 'witcher_elixir', name: 'Эликсир ведьмака', mode: 'action', category: 'potion', tags: [], w: 1, h: 1, priority: 1 },
  witcher_bomb: { id: 'witcher_bomb', name: 'Бомба ведьмака', mode: 'action', category: 'throw', tags: ['noisy'], w: 1, h: 1, priority: 2 },
  silver_sword: { id: 'silver_sword', name: 'Серебряный меч', mode: 'action', category: 'weapon', tags: ['silver'], w: 1, h: 3, priority: 9 },
};

export const ENEMY_ITEM_IDS = Object.keys(ENEMY_ITEMS) as EnemyItemId[];
