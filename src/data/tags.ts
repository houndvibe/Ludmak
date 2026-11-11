// Теги предметов. Сегодня только данные и значки; эффекты соседства — в следующие дни.

export type TagId = 'fire' | 'silver' | 'alchemy' | 'food' | 'curse' | 'noisy';

export interface TagDef {
  id: TagId;
  name: string;
  /** 'tag' — участвует в связках соседства; 'property' — свойство (Шумное). */
  kind: 'tag' | 'property';
  /** Буква на заглушке значка. */
  letter: string;
  /** Цвет заглушек (значок тега и предметы с этим основным тегом). */
  color: number;
}

export const TAGS: Record<TagId, TagDef> = {
  fire: { id: 'fire', name: 'Огонь', kind: 'tag', letter: 'О', color: 0xd9622b },
  silver: { id: 'silver', name: 'Серебро', kind: 'tag', letter: 'С', color: 0x9fb0bc },
  alchemy: { id: 'alchemy', name: 'Алхимия', kind: 'tag', letter: 'А', color: 0x4f9a5a },
  food: { id: 'food', name: 'Еда', kind: 'tag', letter: 'Е', color: 0xc9a14a },
  curse: { id: 'curse', name: 'Проклятие', kind: 'tag', letter: 'П', color: 0x7d4fa3 },
  noisy: { id: 'noisy', name: 'Шумное', kind: 'property', letter: 'Ш', color: 0xc94a6b },
};

export const TAG_IDS = Object.keys(TAGS) as TagId[];

/** Цвет заглушки для предмета без тегов. */
export const UNTAGGED_COLOR = 0x6b6f78;
