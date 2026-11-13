// Обучающая первая ночь: сценарий и подсказки. Отдельного экрана-туториала нет — это обычная ночь 1 с ограничениями.
// Обучение показывается, пока оно не пройдено (флаг в localStorage). Со второй ночи всё случайное и подсказок нет.
import type { ClientId } from "./clients";
import type { EnemyId } from "./enemies";
import type { ItemId } from "./items";

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
  client: "leshy",
  enemies: ["krestyanin", "krestyanin"],
  shop: ["torch", "bread", "wooden_shield", "silver_dagger"],
};

/** Сцена, в которой идёт шаг обучения. */
export type StepScene = "Home" | "Shop" | "Backpack" | "Battle" | "Results";

export type StepId =
  | "cardHead"
  | "cardCondition"
  | "cardEnemies"
  | "cardMoney"
  | "accept"
  | "board"
  | "chest"
  | "buy"
  | "shopHome"
  | "bags"
  | "drag"
  | "labels"
  | "mainWeapon"
  | "power"
  | "bagsHome"
  | "door"
  | "battleStart"
  | "fireBanned"
  | "useActive"
  | "parry"
  | "adapt"
  | "lives";

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
  /** Пояснение, в окне которого можно наводить мышь на значки и тексты и видеть подсказки (лист заказа). */
  hover?: boolean;
  /** Сдвинуть попап по вертикали / горизонтали на столько px (плюс — ниже / правее), если по умолчанию он стоит неудобно. */
  popupDY?: number;
  popupDX?: number;
  /** Экран не затемняется и не блокируется: элемент подсвечен рамкой со стрелкой и попапом, остальное работает. */
  free?: boolean;
}

/**
 * Шаги обучения строго по порядку. Пока шаг открыт, всё, кроме подсвеченного элемента, затемнено и не нажимается.
 * Шаг, который в этой ситуации не нужен (нет огня, нет активного предмета), пропускается.
 */
export const TUTORIAL_STEPS: StepDef[] = [
  // Лист заказа — по частям, потом «Принять».
  {
    id: "cardHead",
    scene: "Home",
    text: "Каждую ночь к тебе приходят чудища. На этом листе можно узнать очередь у двери, лимит заказов на текущую ночь и просьбу посетителя.",
    action: false,
    hover: true,
  },
  {
    id: "cardCondition",
    scene: "Home",
    text: "Условие заказчика: действует в бою с врагами только в этом заказе.",
    action: false,
    hover: true,
  },
  {
    id: "cardEnemies",
    scene: "Home",
    text: "Враги, которых нужно одолеть. Наведи на имя — увидишь, что у них в сумке.",
    action: false,
    hover: true,
  },
  {
    id: "cardMoney",
    scene: "Home",
    text: "Награда — за выполненный заказ. Неустойка — если погибнешь, не выполнив его.",
    action: false,
    hover: true,
  },
  {
    id: "accept",
    scene: "Home",
    text: "Прими этот заказ.",
    action: true,
  },
  {
    id: "board",
    scene: "Home",
    text: "Если вдруг забудешь, на что подписался, — здесь вся информация.",
    action: false,
    hover: true,
  },
  {
    id: "chest",
    scene: "Home",
    text: "На сегодня больше нет посетителей. Нужно подготовиться к охоте - загляни в магазин",
    action: true,
  },
  {
    id: "buy",
    scene: "Shop",
    text: "Оружие наносит урон, щиты его блокируют, а еда лечит. Купи что нибудь перетащив карточку предмета в свой мешок.",
    action: true,
    popupDY: 160,
  },
  { id: "shopHome", scene: "Shop", text: "Возвращайся домой", action: true },
  {
    id: "bags",
    scene: "Home",
    text: "Загляни в конюшню и разложи снаряжение по седельным сумкам",
    action: true,
  },
  {
    id: "drag",
    scene: "Backpack",
    text: "Зажми левую кнопку, чтобы перетащить предмет. Нажми при этом правую, чтобы развернуть его",
    action: true,
  },
  {
    id: "labels",
    scene: "Backpack",
    text: "Зелёные границы — соседи усиливают друг друга. Красные — ослабляют. Желтые - и усиливают и ослабляют",
    action: false,
  },
  {
    id: "mainWeapon",
    scene: "Backpack",
    text: "Основное оружие — это курсор в бою, им ты парируешь атаки. Двойной клик по оружию или щиту в сумках (или перетащи его в это поле) — сделать основным. У большенства предметов есть особый эффект при парировании. Щитами блокировать проще чем оружием.",
    action: false,
  },
  {
    id: "power",
    scene: "Backpack",
    text: "Панель «Сила снаряжения» показывает характеристики выбранного предмета, или всего инвентаря ",
    action: false,
  },
  {
    id: "bagsHome",
    scene: "Backpack",
    text: "Возвращайся, когда будешь готов",
    action: true,
    free: true,
    popupDX: -500, // левее панели «Сила снаряжения»
  },
  {
    id: "door",
    scene: "Home",
    text: "Отправляйся на охоту, когда закончишь подготовку",
    action: true,
    free: true,
  },
  {
    id: "battleStart",
    scene: "Battle",
    text: "Предметы срабатывают сами. Следи за перезарядкой на иконках",
    action: false,
  },
  {
    id: "fireBanned",
    scene: "Battle",
    text: "Леший запретил огонь — против его врагов факел не работает",
    action: false,
  },
  {
    id: "useActive",
    scene: "Battle",
    text: "Нажми на предмет в рюкзаке, чтобы применить его",
    action: true,
  },
  {
    id: "parry",
    scene: "Battle",
    text: "Враг замахнулся! Отбей основным оружием, пока кольцо не сошлось: наведи на летящий предмет клинок и нажми правую кнопку мыши. Рукоятью не отбить. Урон будет вдвое меньше",
    action: true,
  },
  {
    id: "adapt",
    scene: "Results",
    text: "Чем сильнее враг, тем сложнее логика его атак и тайминги. Если хочешь пережить эту неделю, тебе предстоит приспособиться.",
    action: false,
  },
  {
    id: "lives",
    scene: "Results",
    text: "У тебя 2 жизни. Смерть в бою отнимает жизнь и случайный предмет. Потеряешь обе — конец охоты",
    action: false,
  },
];
