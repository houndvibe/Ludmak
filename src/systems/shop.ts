// Ассортимент магазина по ночам. Без Phaser — можно гонять в симуляции.
// Для каждого места: редкость по весам ночи (SHOP_TIER_WEIGHTS_BY_NIGHT), затем предмет этой редкости равновероятно.
import { SHOP_SIZE, SHOP_TIER_WEIGHTS_BY_NIGHT } from '../config/balance';
import { ITEM_IDS, ITEMS, type ItemId, type ItemTier } from '../data/items';
import { pick, type Rng } from './random';

/** Редкость по весам; редкости без предметов пропускаются. */
function rollTier(night: number, rng: Rng): ItemTier {
  const tiers = ([1, 2, 3] as ItemTier[]).filter((t) => ITEM_IDS.some((id) => ITEMS[id].tier === t));
  const weights = tiers.map((t) => SHOP_TIER_WEIGHTS_BY_NIGHT[night - 1][t - 1]);
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < tiers.length; i++) {
    r -= weights[i];
    if (r < 0) return tiers[i];
  }
  return tiers[tiers.length - 1];
}

export function rollShopOffers(night: number, rng: Rng = Math.random): ItemId[] {
  return Array.from({ length: SHOP_SIZE }, () => {
    const tier = rollTier(night, rng);
    return pick(rng, ITEM_IDS.filter((id) => ITEMS[id].tier === tier));
  });
}
