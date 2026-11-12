// Обучающая первая ночь: сценарий и подсказки. Отдельного экрана-туториала нет — это обычная ночь 1 с ограничениями.
// Обучение показывается, пока оно не пройдено (флаг в localStorage). Со второй ночи всё случайное и подсказок нет.
import type { ClientId } from './clients';
import type { EnemyId } from './enemies';
import type { ItemId } from './items';

/**
 * На время разработки: «Новый забег» всегда начинается с обучения, «Пропустить обучение» видна всегда —
 * флаг «пройдено» в localStorage не учитывается. ПЕРЕД РЕЛИЗОМ поставить false.
 */
export const TUTORIAL_ALWAYS = true;

export interface TutorialScenario {
  /** Единственный монстр у окошка. Кнопки «Отказать» у него нет. */
  client: ClientId;
  /** Враги его заказа (без модификаторов). */
  enemies: EnemyId[];
  /** Фиксированный магазин; обновлять ассортимент нельзя. */
  shop: ItemId[];
}

export const TUTORIAL: TutorialScenario = {
  client: 'leshy',
  enemies: ['krestyanin', 'krestyanin'],
  shop: ['torch', 'bread', 'wooden_shield', 'silver_dagger'],
};

/** Сцена, в которой идёт шаг обучения. */
export type StepScene = 'Home' | 'Shop' | 'Backpack' | 'Battle' | 'Results';

export type StepId =
  | 'accept'
  | 'chest'
  | 'buy'
  | 'shopHome'
  | 'bags'
  | 'drag'
  | 'labels'
  | 'mainWeapon'
  | 'power'
  | 'bagsHome'
  | 'door'
  | 'battleStart'
  | 'fireBanned'
  | 'useActive'
  | 'parry'
  | 'lives';

export interface StepDef {
  id: StepId;
  scene: StepScene;
  /** Текст в попапе рядом с подсвеченным элементом. */
  text: string;
  /**
   * true — шаг ждёт действия с подсвеченным элементом (всё остальное заблокировано);
   * false — пояснение: попап с кнопкой «Понятно», всё остальное заблокировано, бой на паузе.
   */
  action: boolean;
}

/**
 * Шаги обучения строго по порядку. Пока шаг открыт, всё, кроме подсвеченного элемента, затемнено и не нажимается.
 * Шаг, который в этой ситуации не нужен (нет огня, нет активного предмета), пропускается.
 */
export const TUTORIAL_STEPS: StepDef[] = [
  { id: 'accept', scene: 'Home', text: 'Монстр пришёл с заказом. Прочитай условие и прими заказ', action: true },
  { id: 'chest', scene: 'Home', text: 'На сегодня больше нет посетителей. Нужно подготовиться к охоте - загляни в магазин', action: true },
  { id: 'buy', scene: 'Shop', text: 'Купи что-нибудь: перетащи товар вниз, в «Твои вещи». Покупка сама ляжет в сумки', action: true },
  { id: 'shopHome', scene: 'Shop', text: 'Покупка уже в сумках. Возвращайся домой', action: true },
  { id: 'bags', scene: 'Home', text: 'Загляни в сумки — разложи снаряжение', action: true },
  { id: 'drag', scene: 'Backpack', text: 'Перетащи предмет мышью. Правая кнопка — поворот', action: true },
  { id: 'labels', scene: 'Backpack', text: 'Зелёные метки — соседи усиливают друг друга. Красные — портят', action: false },
  { id: 'mainWeapon', scene: 'Backpack', text: 'Основное оружие — твой курсор в бою, им отбиваешь атаки. Двойной клик по оружию или щиту в сумках — сделать основным', action: false },
  { id: 'power', scene: 'Backpack', text: 'Панель «Сила снаряжения» показывает, что ты унесёшь в бой', action: false },
  { id: 'bagsHome', scene: 'Backpack', text: 'Готово? Возвращайся домой', action: true },
  { id: 'door', scene: 'Home', text: 'Готов? Дверь — на охоту', action: true },
  { id: 'battleStart', scene: 'Battle', text: 'Предметы срабатывают сами. Следи за перезарядкой на иконках', action: false },
  { id: 'fireBanned', scene: 'Battle', text: 'Леший запретил огонь — против его врагов факел не работает', action: false },
  { id: 'useActive', scene: 'Battle', text: 'Нажми на предмет в рюкзаке, чтобы применить его', action: true },
  { id: 'parry', scene: 'Battle', text: 'Враг замахнулся! Отбей основным оружием, пока кольцо не сошлось: наведи на летящий предмет клинок и нажми. Рукоятью не отбить. Урон будет вдвое меньше', action: true },
  { id: 'lives', scene: 'Results', text: 'У тебя 2 жизни. Смерть в бою отнимает жизнь и случайный предмет. Потеряешь обе — конец охоты', action: false },
];
