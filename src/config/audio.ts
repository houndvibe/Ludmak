// Манифест звуков и музыки: ключ → файл public/assets/audio/{key}.ogg (запасной вариант — {key}.mp3).
// Если файла нет, звук молча пропускается, а список недостающих выводится в консоль при загрузке — как для арта.
// Звуки привязаны к событиям боя (BattleEvent) и к действиям интерфейса в сценах.

export const SOUND_KEYS = [
  // Интерфейс
  'ui_click',
  'ui_hover',
  // Дом
  'contract_accept',
  'contract_decline',
  'monster_arrive',
  'window_close',
  'door_open',
  // Магазин
  'shop_buy',
  'shop_sell',
  'shop_reroll',
  // Рюкзак
  'item_pickup',
  'item_place',
  'item_rotate',
  'item_invalid',
  'item_merge',
  // Бой
  'hit_hero',
  'hit_enemy',
  'sword_hit',
  'parry',
  'block',
  'heal',
  'self_damage',
  'bomb',
  'stun',
  'item_burn',
  'item_vanish',
  'enemy_death',
  'hero_death',
  'contract_done',
  'rest',
  'retreat',
  // Итоги и конец забега
  'coins',
  'level_up',
  'game_over',
  'victory',
] as const;

export type SoundKey = (typeof SOUND_KEYS)[number];

/** Музыка по кругу: ночь — дом, магазин, рюкзак (и меню, итоги); день — бой. */
export const MUSIC_KEYS = ['music_night', 'music_day'] as const;
export type MusicKey = (typeof MUSIC_KEYS)[number];

/** Папка звуков относительно public/assets/ и форматы по порядку попыток. */
export const AUDIO_DIR = 'audio/';
export const AUDIO_FORMATS = ['ogg', 'mp3'] as const;

// Громкость — в src/config/volume.ts (общая и для каждого звука отдельно).
export const AUDIO = {
  /** Сколько копий одного и того же звука может звучать одновременно; лишние пропускаются. */
  maxCopies: 3,
  /**
   * Затухание в конце каждого звука (не музыки), мс: громкость плавно уходит в ноль, чтобы звук не обрывался.
   * У коротких звуков затухание не длиннее половины звука. 0 — без затухания.
   */
  sfxFadeOutMs: 120,
  /** Плавная смена музыки между сценами, мс. */
  musicFadeMs: 900,
};
