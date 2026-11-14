// Расчёт соседства и уровня (★) предметов в рюкзаке героя. Без Phaser — используется рюкзаком, боем и симуляцией.
// Вход — предметы героя (учитываются только лежащие в сетке). Выход — итоговые характеристики каждого
// предмета и список применённых эффектов с источниками.
import { ITEM_STATS, SHIELD_SLOW_BY_STAR, STAR_LEVELS, STAR_MULT, type ItemStats, type StarLevel } from '../config/balance';
import { CATEGORY_NAMES, ITEMS, type ItemId } from '../data/items';
import { SYNERGIES, type Selector, type SynergyRule } from '../data/synergies';
import { TAGS, type TagId } from '../data/tags';
import { cellsOf, footprint, type OwnedItem } from './backpack';

/** Характеристики, которые растут от 'all'. */
const EFFECT_STATS = ['damage', 'heal', 'block', 'stun', 'buffDuration'] as const;
/** Что умножается уровнем ★ (ещё заряды, прибавка множителя масла и сила ауры амулета). Перезарядка, длительность и самоурон — нет. */
const STAR_STATS = ['damage', 'heal', 'block', 'stun'] as const;

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
  /** Шанс обойти запас блока врага при ударе оружием. */
  blockPierceChance: number;
  /** Сила ауры амулета: 1 + усиления от соседей. */
  aura: number;
  /** Эффекты, которые получил этот предмет. */
  received: AppliedEffect[];
}

export interface PowerResult {
  powers: Map<number, ItemPower>;
  effects: AppliedEffect[];
}

/** Связь соседства между двумя предметами: все эффекты пары полезные, все вредные или есть и то и другое. */
export interface PairLink {
  a: number;
  b: number;
  kind: 'good' | 'bad' | 'mixed';
}

/** Эффекты соседства, сгруппированные по парам предметов (в обе стороны): одна связь на пару. */
export function pairLinks(effects: AppliedEffect[]): PairLink[] {
  const pairs = new Map<string, { a: number; b: number; good: boolean; bad: boolean }>();
  for (const e of effects) {
    if (e.source === e.target) continue;
    const a = Math.min(e.source, e.target);
    const b = Math.max(e.source, e.target);
    const key = `${a}:${b}`;
    const p = pairs.get(key) ?? { a, b, good: false, bad: false };
    if (e.good) p.good = true;
    else p.bad = true;
    pairs.set(key, p);
  }
  return [...pairs.values()].map((p) => ({ a: p.a, b: p.b, kind: p.good && p.bad ? 'mixed' : p.good ? 'good' : 'bad' }));
}

export const starOf = (it: { star?: number }) => it.star ?? 1;

/** Явные числа уровня star из STAR_LEVELS (★1 — всегда пусто). */
const starLevel = (id: ItemId, star: number): StarLevel => (star > 1 ? STAR_LEVELS[id]?.[star - 2] : undefined) ?? {};

/** Максимум зарядов предмета на этом уровне (undefined — у предмета нет зарядов). */
export function maxCharges(id: ItemId, star: number): number | undefined {
  const c = ITEM_STATS[id].charges;
  if (c === undefined) return undefined;
  return starLevel(id, star).charges ?? Math.ceil(c * STAR_MULT[star - 1]);
}

/** Сила ауры амулета на уровне star: из STAR_LEVELS или база × STAR_MULT. */
export function starAura(id: ItemId, star: number, base: number): number {
  return starLevel(id, star).aura ?? base * STAR_MULT[star - 1];
}

/**
 * Характеристики предмета с учётом уровня ★: урон, лечение, блок, оглушение и заряды × множитель уровня;
 * у масла растёт прибавка к урону оружия (×1.5 → +50% × множитель). Явные числа из STAR_LEVELS важнее.
 */
export function starStats(id: ItemId, star: number): ItemStats {
  const s: ItemStats = { ...ITEM_STATS[id] };
  const m = STAR_MULT[star - 1];
  const lv = starLevel(id, star);
  for (const k of STAR_STATS) if (s[k] !== undefined) s[k] = s[k]! * m;
  if (s.weaponMult !== undefined) s.weaponMult = 1 + (s.weaponMult - 1) * m;
  if (s.stun !== undefined && lv.stun !== undefined) s.stun = lv.stun;
  // Щит: на ★1 нет перезарядки и блока, они появляются с ★2.
  if (lv.cooldown !== undefined) s.cooldown = lv.cooldown;
  if (lv.block !== undefined) s.block = lv.block;
  if (s.weaponMult !== undefined && lv.weaponMult !== undefined) s.weaponMult = lv.weaponMult;
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
      blockPierceChance: 0,
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
      // Аура амулета: × усиления от соседей × множитель уровня ★ самого амулета.
      const amount = ef.aura ? starAura(s.id, starOf(s), ef.amount) * powers.get(s.uid)!.aura : ef.amount;
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
  // 4а. Пробой блока: шанс оружия растёт на долю за каждого соседа-оружие, максимум 100%.
  for (const rule of SYNERGIES) {
    const ef = rule.effect;
    if (ef.kind !== 'blockPierce') continue;
    for (const [s, t] of pairs(rule, false)) {
      const p = powers.get(t.uid)!;
      if (!p.base.damage) continue;
      p.blockPierceChance = Math.min(1, p.blockPierceChance + ef.chance);
      add(rule, s.uid, t.uid, `+${Math.round(ef.chance * 100)}% шанс пробить блок`, true);
    }
  }
  // 4. Замедление от соседей (клинки мешают друг другу): к перезарядке цели — сумма от каждого соседа.
  const slowBy = new Map<number, number>();
  for (const rule of SYNERGIES) {
    const ef = rule.effect;
    if (ef.kind !== 'slow') continue;
    for (const [s, t] of pairs(rule, false)) {
      const p = powers.get(t.uid)!;
      if (!p.base.cooldown) continue;
      slowBy.set(t.uid, (slowBy.get(t.uid) ?? 0) + ef.seconds);
      add(rule, s.uid, t.uid, `+${ef.seconds} с к перезарядке`, false);
    }
  }
  // 5. Медлительность от щитов: пассивные предметы с уроном бьют реже — сумма по работающим щитам; оружие, касающееся
  //    щита, получает от него только долю (правило cover «Щит прикрывает»).
  const cover = new Map<string, number>(); // `${щит}:${оружие}` → доля медлительности
  for (const rule of SYNERGIES) {
    const ef = rule.effect;
    if (ef.kind !== 'cover') continue;
    for (const [s, t] of pairs(rule, false)) {
      if (!ITEMS[s.id].parryShield) continue;
      cover.set(`${s.uid}:${t.uid}`, ef.share);
      add(rule, s.uid, t.uid, `Щит прикрывает: медлительность ${Math.round(ef.share * 100)}%`, true);
    }
  }
  const shields = items.filter((s) => ITEMS[s.id].parryShield && !powers.get(s.uid)!.disabled);
  for (const it of items) {
    const p = powers.get(it.uid)!;
    if (!p.base.cooldown) continue;
    let shield = 0;
    if (ITEMS[it.id].mode === 'passive' && p.base.damage) {
      for (const s of shields) shield += SHIELD_SLOW_BY_STAR[starOf(s) - 1] * (cover.get(`${s.uid}:${it.uid}`) ?? 1);
    }
    const extra = shield + (slowBy.get(it.uid) ?? 0);
    if (extra > 0) p.final.cooldown = Math.round((p.base.cooldown + extra) * 100) / 100;
  }
  return { powers, effects };
}

/** Медлительность от щитов-курсоров в сетке: сумма SHIELD_SLOW_BY_STAR по работающим (не отключённым) щитам, сек. */
export function shieldSlow(items: OwnedItem[], powers: Map<number, ItemPower>): number {
  let slow = 0;
  for (const it of items) {
    if (!it.inGrid || !ITEMS[it.id].parryShield || powers.get(it.uid)?.disabled) continue;
    slow += SHIELD_SLOW_BY_STAR[starOf(it) - 1];
  }
  return slow;
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

/** Название цели правила для подсказки: тег, категория или предмет — по-русски. */
function targetName(sel: Selector): string {
  if (sel.tag) return TAGS[sel.tag].name;
  if (sel.category) return CATEGORY_NAMES[sel.category];
  return sel.item ? ITEMS[sel.item].name : '';
}

/** Аура предмета-источника на уровне star: на какой тег действует (или название цели), насколько (доля) и к чему — урону или эффекту. */
export function auraInfo(id: ItemId, star = 1): { tag: TagId | null; target: string; amount: number; damage: boolean } | null {
  const rule = SYNERGIES.find((r) => r.source.item === id && r.effect.kind === 'boost');
  if (!rule || rule.effect.kind !== 'boost') return null;
  const tag = rule.target.tag ?? null;
  const target = targetName(rule.target);
  return { tag, target, amount: starAura(id, star, rule.effect.amount), damage: rule.effect.stat === 'damage' };
}

/** Описание ауры предмета-источника для подсказки: «соседнее Серебро +40% к эффекту». */
export function auraText(id: ItemId, star = 1): string | null {
  const rule = SYNERGIES.find((r) => r.source.item === id && r.effect.kind === 'boost');
  if (!rule || rule.effect.kind !== 'boost') return null;
  const target = targetName(rule.target);
  return `аура: соседнее ${target} ${pct(starAura(id, star, rule.effect.amount))} к ${rule.effect.stat === 'damage' ? 'урону' : 'эффекту'}`;
}
