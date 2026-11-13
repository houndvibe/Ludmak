// Предметы врагов: имена, формы, теги, режим и приоритет. Числа (урон, перезарядка, заряды) — в src/config/balance.ts.
// Сумка врага — маленькая сетка с фиксированной раскладкой (src/data/enemies.ts). Соседство считается только для
// аур (подкова ведьмака): предмет с auraBoost усиливает касающиеся его предметы.
// Порядок использования задаёт priority, раскладка на него не влияет.
import type { ItemId } from './items';
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
  | 'silver_sword'
  | 'witcher_steel_sword'
  | 'witcher_dagger'
  | 'witcher_horseshoe';

/**
 * action  — действие: враг делает одно за раз, берёт первый доступный предмет по priority.
 * passive — срабатывает сам по своей перезарядке (щит).
 * onHit   — мешок разбойника: с каждым ударом оружия на поле появляется кружок мешка (кража из кошелька, если не отбить).
 * aura    — само не действует: усиливает соседние предметы в сумке (подкова ведьмака, auraBoost).
 * У врага с parallelWeapons (ведьмак) оружие-действия бьют каждое по своей перезарядке, одновременно.
 */
export type EnemyItemMode = 'action' | 'passive' | 'onHit' | 'aura';

export type EnemyItemCategory = 'weapon' | 'throw' | 'shield' | 'steal' | 'potion' | 'amulet';

export const ENEMY_CATEGORY_NAMES: Record<EnemyItemCategory, string> = {
  weapon: 'Оружие',
  throw: 'Снаряд',
  shield: 'Щит',
  steal: 'Кража',
  potion: 'Зелье',
  amulet: 'Амулет',
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
  /** Это предмет героя в руках врага (ведьмак): картинка — items/{art}.png героя, имя — как у героя. Числа — вражеские. */
  art?: ItemId;
  /** Рисунок атаки на поле парирования (нет — обычный кружок на месте). Числа серий и прицела — в balance.ts. */
  pattern?: AttackPattern;
  /** Бросается только после креста монаха (ритуал прошёл — освящённая, урон ×ENEMY_PATTERN.blessMult). */
  afterRitual?: boolean;
}

/**
 * thrust  — выпад: кружок едет по прямой справа налево (стальной меч ведьмака);
 * double  — двойной удар копья: жёлтый отрезок, удар на левом его конце, сразу второй — на правом; отбиты оба —
 *           щит стражника в случайной точке отрезка (стражник);
 * cross   — серия ударов крестом: верх, низ, лево, право; центр каждый раз новый (монах, серебряный меч ведьмака);
 * burst   — очередь уколов внахлёст, каждый в новой точке (аристократ, кинжалы ведьмака);
 * aim     — сначала прицел, потом выстрел с коротким окном (пистоль);
 * reflect — отбитый снаряд летит обратно во врага, пропущенный оглушает героя (бомба ведьмака).
 */
export type AttackPattern = 'thrust' | 'double' | 'cross' | 'burst' | 'aim' | 'reflect';

export const ENEMY_ITEMS: Record<EnemyItemId, EnemyItemDef> = {
  cow_pie: { id: 'cow_pie', name: 'Коровья лепёшка', mode: 'action', category: 'throw', tags: [], w: 1, h: 1, priority: 1 },
  pitchfork: { id: 'pitchfork', name: 'Вилы', mode: 'action', category: 'weapon', tags: [], w: 1, h: 3, priority: 9 },
  tower_shield: { id: 'tower_shield', name: 'Ростовой щит', mode: 'passive', category: 'shield', tags: [], w: 2, h: 3, priority: 0 },
  spear: { id: 'spear', name: 'Копьё', mode: 'action', category: 'weapon', tags: [], w: 1, h: 4, priority: 9, pattern: 'double' },
  loot_sack: { id: 'loot_sack', name: 'Мешок', mode: 'onHit', category: 'steal', tags: [], w: 2, h: 2, priority: 0 },
  flail: { id: 'flail', name: 'Кистень', mode: 'action', category: 'weapon', tags: [], w: 1, h: 2, priority: 9 },
  holy_water: { id: 'holy_water', name: 'Святая вода', mode: 'action', category: 'throw', tags: [], w: 1, h: 1, priority: 1, afterRitual: true },
  staff: { id: 'staff', name: 'Посох', mode: 'action', category: 'weapon', tags: [], w: 1, h: 4, priority: 9, pattern: 'cross' },
  pistol: { id: 'pistol', name: 'Пистоль', mode: 'action', category: 'throw', tags: ['fire', 'noisy'], w: 2, h: 1, priority: 1, pattern: 'aim' },
  silver_rapier: { id: 'silver_rapier', name: 'Серебряная шпага', mode: 'action', category: 'weapon', tags: ['silver'], w: 1, h: 3, priority: 9, pattern: 'burst' },
  witcher_elixir: { id: 'witcher_elixir', name: 'Лечебный эликсир', mode: 'action', category: 'potion', tags: [], w: 1, h: 1, priority: 1, art: 'healing_elixir' },
  witcher_bomb: { id: 'witcher_bomb', name: 'Бомба «Гром»', mode: 'action', category: 'throw', tags: ['noisy'], w: 1, h: 1, priority: 2, art: 'bomb_grom', pattern: 'reflect' },
  silver_sword: { id: 'silver_sword', name: 'Серебряный меч', mode: 'action', category: 'weapon', tags: ['silver'], w: 1, h: 3, priority: 9, pattern: 'cross' },
  witcher_steel_sword: { id: 'witcher_steel_sword', name: 'Стальной меч', mode: 'action', category: 'weapon', tags: [], w: 1, h: 3, priority: 9, art: 'steel_sword', pattern: 'thrust' },
  witcher_dagger: { id: 'witcher_dagger', name: 'Серебряный кинжал', mode: 'action', category: 'weapon', tags: ['silver'], w: 1, h: 2, priority: 9, art: 'silver_dagger', pattern: 'burst' },
  witcher_horseshoe: { id: 'witcher_horseshoe', name: 'Серебряная подкова', mode: 'aura', category: 'amulet', tags: ['silver'], w: 1, h: 1, priority: 0, art: 'silver_horseshoe' },
};

export const ENEMY_ITEM_IDS = Object.keys(ENEMY_ITEMS) as EnemyItemId[];
