// Теги предметов. Сегодня только данные и значки; эффекты соседства — в следующие дни.

export type TagId = 'fire' | 'silver' | 'curse' | 'noisy' | 'heal' | 'bomb' | 'elixir' | 'oil' | 'stun';

export interface TagDef {
  id: TagId;
  name: string;
  /** 'tag' — участвует в связках соседства; 'property' — свойство или назначение (Шумное, Лечение, Бомба…). */
  kind: 'tag' | 'property';
  /** Буква на заглушке значка. */
  letter: string;
  /** Цвет заглушек (значок тега и предметы с этим основным тегом). */
  color: number;
}

export const TAGS: Record<TagId, TagDef> = {
  fire: { id: 'fire', name: 'Огонь', kind: 'tag', letter: 'О', color: 0xd9622b },
  silver: { id: 'silver', name: 'Серебро', kind: 'tag', letter: 'С', color: 0x9fb0bc },
  curse: { id: 'curse', name: 'Проклятие', kind: 'tag', letter: 'П', color: 0x7d4fa3 },
  noisy: { id: 'noisy', name: 'Шумное', kind: 'property', letter: 'Ш', color: 0xc94a6b },
  heal: { id: 'heal', name: 'Лечение', kind: 'property', letter: 'Л', color: 0x5aa05a },
  bomb: { id: 'bomb', name: 'Бомба', kind: 'property', letter: 'Б', color: 0x5a6470 },
  elixir: { id: 'elixir', name: 'Эликсир', kind: 'property', letter: 'Э', color: 0x3f8f7a },
  oil: { id: 'oil', name: 'Масло', kind: 'property', letter: 'М', color: 0x9a7a3a },
  stun: { id: 'stun', name: 'Стан', kind: 'property', letter: 'Т', color: 0x7a62b0 },
};

export const TAG_IDS = Object.keys(TAGS) as TagId[];

