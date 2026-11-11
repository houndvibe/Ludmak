// Враги: имя и сумка — маленькая сетка с фиксированной раскладкой.
// Здоровье и награда — в src/config/balance.ts (ENEMY_STATS), числа предметов — там же (ENEMY_ITEM_STATS).
// Порядок использования предметов задаёт их priority (src/data/enemyItems.ts), раскладка на него не влияет.
// Раскладку проверяет Boot: если предмет вылезает за сетку или налезает на другой — предупреждение в консоли.
import type { EnemyItemId } from './enemyItems';

export type EnemyId = 'krestyanin' | 'strazhnik' | 'razboynik' | 'monakh' | 'aristokrat' | 'vedmak';

export interface BagSlot {
  item: EnemyItemId;
  /** Левая верхняя клетка. */
  col: number;
  row: number;
  /** Повёрнут на 90°: ширина и высота меняются местами. */
  rotated?: boolean;
}

export interface EnemyDef {
  id: EnemyId;
  name: string;
  boss: boolean;
  /** Игнорирует первую бомбу героя: заряд тратится, но нет ни урона, ни оглушения (ведьмак). */
  dodgeFirstBomb?: boolean;
  /** Размер сетки сумки в клетках. */
  bagCols: number;
  bagRows: number;
  /** Раскладка. Один и тот же предмет можно положить несколько раз (две лепёшки). */
  bag: BagSlot[];
}

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  krestyanin: {
    id: 'krestyanin',
    name: 'Крестьянин с вилами',
    boss: false,
    bagCols: 2,
    bagRows: 3,
    bag: [
      { item: 'pitchfork', col: 0, row: 0 },
      { item: 'cow_pie', col: 1, row: 0 },
      { item: 'cow_pie', col: 1, row: 1 },
    ],
  },
  strazhnik: {
    id: 'strazhnik',
    name: 'Стражник',
    boss: false,
    bagCols: 3,
    bagRows: 4,
    bag: [
      { item: 'tower_shield', col: 0, row: 0 },
      { item: 'spear', col: 2, row: 0 },
    ],
  },
  razboynik: {
    id: 'razboynik',
    name: 'Разбойник',
    boss: false,
    bagCols: 3,
    bagRows: 2,
    bag: [
      { item: 'loot_sack', col: 0, row: 0 },
      { item: 'flail', col: 2, row: 0 },
    ],
  },
  monakh: {
    id: 'monakh',
    name: 'Монах-экзорцист',
    boss: false,
    bagCols: 2,
    bagRows: 4,
    bag: [
      { item: 'staff', col: 0, row: 0 },
      { item: 'holy_water', col: 1, row: 0 },
      { item: 'holy_water', col: 1, row: 1 },
    ],
  },
  aristokrat: {
    id: 'aristokrat',
    name: 'Аристократ-дуэлянт',
    boss: false,
    bagCols: 3,
    bagRows: 2,
    bag: [
      { item: 'silver_rapier', col: 0, row: 0, rotated: true },
      { item: 'pistol', col: 0, row: 1 },
    ],
  },
  vedmak: {
    id: 'vedmak',
    name: 'Ведьмак',
    boss: true,
    dodgeFirstBomb: true,
    bagCols: 3,
    bagRows: 3,
    bag: [
      { item: 'silver_sword', col: 0, row: 0 },
      { item: 'witcher_bomb', col: 1, row: 0 },
      { item: 'witcher_elixir', col: 1, row: 1 },
    ],
  },
};

export const ENEMY_IDS = Object.keys(ENEMIES) as EnemyId[];
