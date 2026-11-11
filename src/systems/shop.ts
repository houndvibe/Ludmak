// Ассортимент магазина по ночам. Без Phaser — можно гонять в симуляции.
// Для каждого места: редкость по весам ночи (SHOP_TIER_WEIGHTS_BY_NIGHT), затем предмет этой редкости равновероятно.
// С ночи SHOP_CONSUMABLE_FROM_NIGHT одно случайное место — всегда расходник (категория Алхимия или Еда):
// лечение и бомбы нужны каждую ночь, и пустой на них магазин не должен решать исход забега.
import { SHOP_CONSUMABLE_FROM_NIGHT, SHOP_SIZE, SHOP_TIER_WEIGHTS_BY_NIGHT } from '../config/balance';
import { ITEM_IDS, ITEMS, type ItemId, type ItemTier } from '../data/items';
import { pick, randInt, type Rng } from './random';

/** Расходники для гарантированного места: Алхимия и Еда. */
const CONSUMABLES = ITEM_IDS.filter((id) => ITEMS[id].category === 'alchemy' || ITEMS[id].category === 'food');

/** Редкость по весам среди предметов pool; редкости без предметов (или с нулевым весом) пропускаются. */
function rollTier(night: number, rng: Rng, pool: ItemId[]): ItemTier {
  const tiers = ([1, 2, 3] as ItemTier[]).filter((t) => pool.some((id) => ITEMS[id].tier === t));
  const weights = tiers.map((t) => SHOP_TIER_WEIGHTS_BY_NIGHT[night - 1][t - 1]);
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return tiers[0];
  let r = rng() * total;
  for (let i = 0; i < tiers.length; i++) {
    r -= weights[i];
    if (r < 0) return tiers[i];
  }
  return tiers[tiers.length - 1];
}

/** Предмет из pool: сначала редкость по весам ночи, затем предмет этой редкости равновероятно. */
function rollItem(night: number, rng: Rng, pool: ItemId[]): ItemId {
  const tier = rollTier(night, rng, pool);
  return pick(rng, pool.filter((id) => ITEMS[id].tier === tier));
}

export function rollShopOffers(night: number, rng: Rng = Math.random): ItemId[] {
  const offers = Array.from({ length: SHOP_SIZE }, () => rollItem(night, rng, ITEM_IDS));
  if (night >= SHOP_CONSUMABLE_FROM_NIGHT) offers[randInt(rng, 0, SHOP_SIZE - 1)] = rollItem(night, rng, CONSUMABLES);
  return offers;
}
