// Расчёт соседства и уровня (★) предметов в рюкзаке героя. Без Phaser — используется рюкзаком, боем и симуляцией.
// Вход — предметы героя (учитываются только лежащие в сетке). Выход — итоговые характеристики каждого
// предмета и список применённых эффектов с источниками.
import { ITEM_STATS, STAR_MULT, type ItemStats } from '../config/balance';
import { ITEMS, type ItemId } from '../data/items';
import { SYNERGIES, type Selector, type SynergyRule } from '../data/synergies';
import { TAGS } from '../data/tags';
import { cellsOf, footprint, type OwnedItem } from './backpack';

/** Характеристики, которые растут от 'all' (и от уровня — кроме оглушения и длительности). */
const EFFECT_STATS = ['damage', 'heal', 'block', 'stun', 'buffDuration'] as const;
/** Что умножается уровнем ★. */
const STAR_STATS = ['damage', 'heal', 'block'] as const;

export interface AppliedEffect {
  rule: SynergyRule;
  source: number;
  target: number;
  /** Короткая подпись для метки: «+50% урон», «+50% урон, оглушение», «Сгорит». */
  label: string;
  /** Хорошо для цели или плохо. */
  good: boolean;
}

export interface ItemPower {
  uid: number;
  /** Характеристики с учётом уровня, без соседей. */
  base: ItemStats;
  /** Итог с соседями. */
  final: ItemStats;
  disabled: boolean;
  /** Отключён не соседом, а извне (условие заказчика, враг с факелом): причина для подсказки. */
  blockedBy: string | null;
  poisoned: boolean;
  /** Шанс взрыва в начале боя (0 — не взорвётся) и урон герою от взрыва. */
  explodeChance: number;
  explodeDamage: number;
  /** Сила ауры амулета: 1 + усиления от соседей. */
  aura: number;
  /** Эффекты, которые получил этот предмет. */
  received: AppliedEffect[];
}

export interface PowerResult {
  powers: Map<number, ItemPower>;
  effects: AppliedEffect[];
}

export const starOf = (it: { star?: number }) => it.star ?? 1;

/** Максимум зарядов предмета на этом уровне (undefined — у предмета нет зарядов). */
export function maxCharges(id: ItemId, star: number): number | undefined {
  const c = ITEM_STATS[id].charges;
  return c === undefined ? undefined : Math.ceil(c * STAR_MULT[star - 1]);
}

/** Характеристики предмета с учётом уровня ★ (урон, лечение, блок и заряды × множитель). */
export function starStats(id: ItemId, star: number): ItemStats {
  const s: ItemStats = { ...ITEM_STATS[id] };
  for (const k of STAR_STATS) if (s[k] !== undefined) s[k] = s[k]! * STAR_MULT[star - 1];
  s.charges = maxCharges(id, star);
  return s;
}

export function matches(sel: Selector, id: ItemId): boolean {
  const d = ITEMS[id];
  if (sel.item && sel.item !== id) return false;
  if (sel.tag && !d.tags.includes(sel.tag)) return false;
  if (sel.category && sel.category !== d.category) return false;
  return true;
}

/** Соседи по стороне клетки (без диагоналей). Каждая пара — один раз, даже если касается несколькими клетками. */
export function adjacency(items: OwnedItem[]): Map<number, number[]> {
  const owner = new Map<string, number>();
  for (const it of items) {
    const f = footprint(it.id, it.rotated);
    for (const [c, r] of cellsOf(it, f.w, f.h)) owner.set(`${c},${r}`, it.uid);
  }
  const adj = new Map<number, Set<number>>(items.map((it) => [it.uid, new Set<number>()]));
  for (const it of items) {
    const f = footprint(it.id, it.rotated);
    for (const [c, r] of cellsOf(it, f.w, f.h)) {
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const other = owner.get(`${c + dc},${r + dr}`);
        if (other !== undefined && other !== it.uid) adj.get(it.uid)!.add(other);
      }
    }
  }
  return new Map([...adj].map(([k, v]) => [k, [...v]]));
}

const pct = (x: number) => `${x > 0 ? '+' : '−'}${Math.round(Math.abs(x) * 100)}%`;

/** Как называется характеристика в метке соседства. */
const STAT_NAMES: Record<(typeof EFFECT_STATS)[number], string> = {
  damage: 'урон',
  heal: 'лечение',
  block: 'блок',
  stun: 'оглушение',
  buffDuration: 'длительность',
};

/** Что именно усиливает прибавка у этого предмета: «урон» или все его характеристики («урон, оглушение»). */
function boostWhat(base: ItemStats, stat: 'damage' | 'all'): string {
  if (stat === 'damage') return STAT_NAMES.damage;
  return EFFECT_STATS.filter((k) => !!base[k]).map((k) => STAT_NAMES[k]).join(', ');
}

/** Есть ли у характеристик цели то, на что действует прибавка. */
function hasStat(s: ItemStats, stat: 'damage' | 'all'): boolean {
  return stat === 'damage' ? !!s.damage : EFFECT_STATS.some((k) => !!s[k]);
}

/** Внешний запрет предмета: причина (её видно в подсказке) или null — предмет работает. */
export type BlockRule = (id: ItemId) => string | null;

/**
 * Итоговые характеристики всех предметов в сетке с учётом уровня и соседей.
 * blocked — внешние запреты (условие заказчика, враг с факелом): такой предмет отключён и ни на кого не влияет.
 */
export function computePower(allItems: OwnedItem[], blocked?: BlockRule): PowerResult {
  const items = allItems.filter((i) => i.inGrid);
  const byUid = new Map(items.map((i) => [i.uid, i]));
  const adj = adjacency(items);
  const powers = new Map<number, ItemPower>();
  for (const it of items) {
    const base = starStats(it.id, starOf(it));
    const blockedBy = blocked?.(it.id) ?? null;
    powers.set(it.uid, {
      uid: it.uid,
      base,
      final: { ...base },
      disabled: blockedBy !== null,
      blockedBy,
      poisoned: false,
      explodeChance: 0,
      explodeDamage: 0,
      aura: 1,
      received: [],
    });
  }
  const effects: AppliedEffect[] = [];
  const add = (rule: SynergyRule, source: number, target: number, label: string, good: boolean) => {
    const e = { rule, source, target, label, good };
    effects.push(e);
    powers.get(target)!.received.push(e);
  };
  /** Все пары (источник, цель) по правилу; disabledOk — могут ли действовать отключённые источники. */
  const pairs = (rule: SynergyRule, disabledOk: boolean): [OwnedItem, OwnedItem][] => {
    const out: [OwnedItem, OwnedItem][] = [];
    for (const s of items) {
      const sp = powers.get(s.uid)!;
      // Запрещённый извне предмет не влияет ни на кого, даже отключениями.
      if (!matches(rule.source, s.id) || sp.blockedBy !== null || (!disabledOk && sp.disabled)) continue;
      for (const t of adj.get(s.uid)!) {
        const target = byUid.get(t)!;
        if (matches(rule.target, target.id)) out.push([s, target]);
      }
    }
    return out;
  };

  // 1. Отключения: отключённый предмет дальше ни на кого не влияет.
  for (const rule of SYNERGIES) {
    if (rule.effect.kind !== 'disable') continue;
    for (const [s, t] of pairs(rule, true)) {
      powers.get(t.uid)!.disabled = true;
      add(rule, s.uid, t.uid, rule.effect.label, false);
    }
  }
  // 2. Отравление, взрыв, усиление ауры.
  for (const rule of SYNERGIES) {
    const ef = rule.effect;
    if (ef.kind !== 'poison' && ef.kind !== 'explode' && ef.kind !== 'auraBoost') continue;
    for (const [s, t] of pairs(rule, false)) {
      const p = powers.get(t.uid)!;
      if (ef.kind === 'poison') {
        if (!p.base.heal) continue;
        p.poisoned = true;
        add(rule, s.uid, t.uid, 'Отравлена', false);
      } else if (ef.kind === 'explode') {
        p.explodeChance = Math.max(p.explodeChance, ef.chance);
        p.explodeDamage = Math.max(p.explodeDamage, ef.damage);
        add(rule, s.uid, t.uid, `Может взорваться (${Math.round(ef.chance * 100)}%)`, false);
      } else {
        p.aura += ef.amount;
        add(rule, s.uid, t.uid, `${pct(ef.amount)} к ауре`, true);
      }
    }
  }
  // 3. Прибавки к характеристикам: складываются, применяются к базе.
  const sums = new Map<number, { damage: number; all: number }>(items.map((i) => [i.uid, { damage: 0, all: 0 }]));
  for (const rule of SYNERGIES) {
    const ef = rule.effect;
    if (ef.kind !== 'boost') continue;
    for (const [s, t] of pairs(rule, false)) {
      const p = powers.get(t.uid)!;
      if (!hasStat(p.base, ef.stat)) continue;
      const amount = ef.amount * (ef.aura ? powers.get(s.uid)!.aura : 1);
      sums.get(t.uid)![ef.stat] += amount;
      add(rule, s.uid, t.uid, `${pct(amount)} ${boostWhat(p.base, ef.stat)}`, amount > 0);
    }
  }
  for (const p of powers.values()) {
    const sum = sums.get(p.uid)!;
    for (const k of EFFECT_STATS) {
      if (p.base[k] === undefined) continue;
      const bonus = sum.all + (k === 'damage' ? sum.damage : 0);
      p.final[k] = Math.max(0, p.base[k]! * (1 + bonus));
    }
  }
  return { powers, effects };
}

/** «Сила снаряжения»: то же, что увидит бой. Активные предметы (бомбы, эликсиры) в «в секунду» не входят. */
export interface GearSummary {
  dps: number;
  blockPerSec: number;
  healPerSec: number;
  /** Урон себе в секунду: топор (с учётом шанса), ладанка, отравленная еда. */
  selfPerSec: number;
  disabled: ItemId[];
  explosive: { id: ItemId; chance: number }[];
}

export function gearSummary(allItems: OwnedItem[], result: PowerResult): GearSummary {
  const sum: GearSummary = { dps: 0, blockPerSec: 0, healPerSec: 0, selfPerSec: 0, disabled: [], explosive: [] };
  for (const it of allItems.filter((i) => i.inGrid)) {
    const p = result.powers.get(it.uid)!;
    if (p.disabled) {
      sum.disabled.push(it.id);
      continue;
    }
    if (p.explodeChance > 0) sum.explosive.push({ id: it.id, chance: p.explodeChance });
    const s = p.final;
    if (ITEMS[it.id].mode !== 'passive' || !s.cooldown) continue;
    if (s.damage) sum.dps += s.damage / s.cooldown;
    if (s.block) sum.blockPerSec += s.block / s.cooldown;
    if (s.heal) {
      if (p.poisoned) sum.selfPerSec += s.heal / s.cooldown;
      else sum.healPerSec += s.heal / s.cooldown;
    }
    if (s.selfDamage) sum.selfPerSec += (s.selfDamage * (s.selfDamageChance ?? 1)) / s.cooldown;
  }
  return sum;
}

/** Описание ауры предмета-источника для подсказки: «соседнее Серебро +40% к эффекту». */
export function auraText(id: ItemId): string | null {
  const rule = SYNERGIES.find((r) => r.source.item === id && r.effect.kind === 'boost');
  if (!rule || rule.effect.kind !== 'boost') return null;
  const target = rule.target.tag ? TAGS[rule.target.tag].name : rule.target.category ?? rule.target.item ?? '';
  return `аура: соседнее ${target} ${pct(rule.effect.amount)} к ${rule.effect.stat === 'damage' ? 'урону' : 'эффекту'}`;
}
