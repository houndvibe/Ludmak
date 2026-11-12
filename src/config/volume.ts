// ГРОМКОСТЬ ВСЕХ ЗВУКОВ И МУЗЫКИ — ЗДЕСЬ.
// Итоговая громкость звука = SFX_MASTER × громкость этого звука; музыки = MUSIC_MASTER × громкость мелодии.
// Шкала 0..1: 1 — как в файле, 0.5 — вдвое тише, 0 — выключен. Больше 1 не ставить (файл громче не станет).
// Кнопка «Без звука» в игре глушит всё сразу, эти числа не меняет.
import type { MusicKey, SoundKey } from './audio';

/** Общая громкость всех звуков (не музыки). */
export const SFX_MASTER = 0.8;

/** Общая громкость музыки. */
export const MUSIC_MASTER = 0.5;

/** Громкость каждого звука отдельно. Все ключи — из src/config/audio.ts. */
export const SOUND_VOLUME: Record<SoundKey, number> = {
  // Интерфейс — звучат постоянно, лучше потише
  ui_click: 1,
  ui_hover: 1,

  // Дом
  contract_accept: 1,
  seal_stamp: 1,
  contract_decline: 1,
  monster_arrive: 1,
  window_close: 1,
  door_open: 1,

  // Магазин
  shop_buy: 1,
  shop_sell: 1,
  shop_reroll: 1,

  // Рюкзак
  item_pickup: 1,
  item_place: 1,
  item_rotate: 1,
  item_invalid: 1,
  item_merge: 1,

  // Бой — удары и блок звучат каждую секунду
  hit_hero: 1,
  hit_enemy: 1,
  /** Удар клинком героя (меч, кинжал, топор, серп) — вместо hit_enemy. */
  sword_hit: 1,
  parry: 1,
  block: 1,
  heal: 1,
  self_damage: 1,
  bomb: 1,
  stun: 1,
  item_burn: 1,
  item_vanish: 1,
  enemy_death: 1,
  hero_death: 1,
  contract_done: 1,
  rest: 1,
  retreat: 1,

  // Итоги и конец забега
  coins: 1,
  level_up: 1,
  game_over: 1,
  victory: 1,
};

/** Громкость каждой мелодии отдельно. */
export const MUSIC_VOLUME: Record<MusicKey, number> = {
  music_night: 1,
  music_day: 1,
};
