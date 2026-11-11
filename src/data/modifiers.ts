// Модификаторы врагов: приставка к имени и значок на портрете. Числа — в src/config/balance.ts (MODIFIER_STATS),
// шанс по ночам — MODIFIER_CHANCE_BY_NIGHT. У врага не больше одного модификатора, у босса их нет.
// Как модификатор действует в бою — src/systems/battle.ts.
import { MODIFIER_STATS as M } from '../config/balance';
import { ENEMIES, type EnemyId } from './enemies';

export type ModifierId = 'drunk' | 'chainmail' | 'torchbearer' | 'pious' | 'lightSleeper' | 'veteran';

export interface ModifierDef {
  id: ModifierId;
  /** Название для подсказки: «Пьяный», «Чуткий сон». */
  name: string;
  /** Приставка перед именем врага («Пьяный стражник») или окончание после него («Стражник в кольчуге»). */
  prefix?: string;
  suffix?: string;
  /** Буква на значке, нарисованном кодом. */
  letter: string;
  /** Цвет значка. */
  color: number;
}

export const MODIFIERS: Record<ModifierId, ModifierDef> = {
  drunk: { id: 'drunk', name: 'Пьяный', prefix: 'Пьяный', letter: 'П', color: 0xb5651d },
  chainmail: { id: 'chainmail', name: 'В кольчуге', suffix: 'в кольчуге', letter: 'К', color: 0x8a9099 },
  torchbearer: { id: 'torchbearer', name: 'С факелом', suffix: 'с факелом', letter: 'Ф', color: 0xd9622b },
  pious: { id: 'pious', name: 'Набожный', prefix: 'Набожный', letter: 'Н', color: 0xe0d27a },
  lightSleeper: { id: 'lightSleeper', name: 'Чуткий сон', prefix: 'Чуткий', letter: 'Ч', color: 0x6a8fd0 },
  veteran: { id: 'veteran', name: 'Ветеран', prefix: 'Бывалый', letter: 'В', color: 0xa03030 },
};

export const MODIFIER_IDS = Object.keys(MODIFIERS) as ModifierId[];

/** Имя врага с модификатором: «Пьяный стражник», «Разбойник в кольчуге». */
export function enemyName(id: EnemyId, mod: ModifierId | null): string {
  const base = ENEMIES[id].name;
  if (!mod) return base;
  const m = MODIFIERS[mod];
  if (m.prefix) return `${m.prefix} ${base[0].toLowerCase()}${base.slice(1)}`;
  return `${base} ${m.suffix}`;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Что модификатор делает, одной строкой. Числа берутся из balance.ts. */
export function modifierEffect(mod: ModifierId): string {
  switch (mod) {
    case 'drunk':
      return `урон его предметов +${pct(M.drunkDamage)}, каждый удар с шансом ${pct(M.drunkMiss)} промахивается`;
    case 'chainmail':
      return `оружие героя без Огня и Алхимии наносит ему ${pct(M.chainmailMult)} урона`;
    case 'torchbearer':
      return 'пока идёт бой с ним, вся Еда героя сгорает';
    case 'pious':
      return `Проклятые предметы героя наносят ему ${pct(M.piousMult)} урона`;
    case 'lightSleeper':
      return `после шумного предмета героя ${M.lightSleeperSeconds} с атакует в ${M.lightSleeperSpeed} раза быстрее`;
    case 'veteran':
      return `здоровье и сила предметов +${pct(M.veteran)}`;
  }
}
