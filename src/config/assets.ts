// Манифест ассетов: ключ текстуры → путь относительно public/assets/.
// Сцены обращаются к картинкам ТОЛЬКО по ключам отсюда. Если файла нет — Boot рисует заглушку под тем же ключом.
// Новый предмет/враг/заказчик в src/data автоматически попадает в манифест.
import { CLIENT_IDS, CLIENTS, type ClientId } from "../data/clients";
import { ENEMIES, ENEMY_IDS, type EnemyId } from "../data/enemies";
import { ENEMY_ITEM_IDS, type EnemyItemId } from "../data/enemyItems";
import { CATEGORY_IDS, ITEM_IDS, type ItemCategory, type ItemId } from "../data/items";
import { TAG_IDS, type TagId } from "../data/tags";

/** Размер портрета, под который рисует художница (и размер заглушки). */
export const PORTRAIT_W = 512;
export const PORTRAIT_H = 640;
/** Пикселей на клетку у иконки предмета: 1×3 → 128×384. */
export const ITEM_CELL_PX = 128;
/** Размер значка тега. */
export const TAG_ICON_PX = 64;
/** Размер значков характеристик и категорий предметов (карточка магазина). */
export const ICON_PX = 64;

/** Значки характеристик на карточке: урон, лечение, блок, оглушение, перезарядка, заряды, усиление оружия, длительность, урон себе, аура. */
export type StatIconId = "damage" | "heal" | "block" | "stun" | "cooldown" | "charges" | "buff" | "duration" | "self" | "aura";
export const STAT_ICON_IDS: StatIconId[] = ["damage", "heal", "block", "stun", "cooldown", "charges", "buff", "duration", "self", "aura"];

export type StubSpec =
  | { kind: "portrait"; label: string }
  | { kind: "item"; itemId: ItemId }
  | { kind: "enemyItem"; itemId: EnemyItemId }
  | { kind: "tag"; tagId: TagId }
  | { kind: "statIcon"; iconId: StatIconId }
  | { kind: "category"; category: ItemCategory }
  | { kind: "home" }
  | { kind: "background"; label: string; w: number; h: number; color: string };

export interface AssetEntry {
  key: string;
  /** Путь относительно public/assets/. */
  path: string;
  stub: StubSpec;
}

export const HERO_KEY = "portrait_hero";
export const BG_NIGHT_KEY = "bg_night";
export const BG_BATTLE_KEY = "bg_battle";
export const BG_HORSE_KEY = "bg_horse";
export const BG_HOME_KEY = "bg_home";

export const enemyKey = (id: EnemyId) => `portrait_enemy_${id}`;
export const clientKey = (id: ClientId) => `portrait_client_${id}`;
export const itemKey = (id: ItemId) => `item_${id}`;
export const enemyItemKey = (id: EnemyItemId) => `enemy_item_${id}`;
export const tagKey = (id: TagId) => `tag_${id}`;
export const statIconKey = (id: StatIconId) => `icon_stat_${id}`;
export const categoryKey = (id: ItemCategory) => `icon_category_${id}`;

/**
 * Раскладка экрана дома в координатах 1920×1080 — под рисунок backgrounds/home.webp (1717×916, растягивается по высоте
 * на 1080 и обрезается по бокам на ~52 px: X = x·1,179 − 52, Y = y·1,179 в пикселях картинки).
 * Если художница нарисовала дверь/сундук/сумки в другом месте — поправьте числа здесь, код трогать не нужно.
 * Прямоугольники: x, y — левый верхний угол.
 */
export const HOME_LAYOUT = {
  /** Дверь целиком (зона клика «На охоту / Переждать день»). */
  door: { x: 753, y: 198, w: 368, h: 775 },
  /** Окошко-задвижка в двери. Портрет монстра обрезается этой фигурой (скруглённый прямоугольник). */
  window: { x: 867, y: 295, w: 214, h: 238, radius: 26 },
  /** Сдвиг портрета внутри окошка по вертикали (px): больше — портрет ниже, видно больше макушки. */
  portraitOffsetY: 0,
  /** Ширина портрета в окошке (px); высота — по пропорциям портрета 512×640. */
  portraitWidth: 268,
  /** Карточка заказа рядом с окошком. */
  card: { x: 1190, y: 240, w: 455, h: 560 },
  /** Прилавок/сундук — кнопка «Магазин». */
  shop: { x: 89, y: 637, w: 596, h: 389 },
  /** Седельные сумки на крюке — кнопка «Сумки». */
  bags: { x: 1705, y: 295, w: 167, h: 497 },
  /** Доска «Заказы на сегодня» — тёмная внутренняя часть доски на фоне (без рамки). */
  board: { x: 118, y: 200, w: 495, h: 404 },
};

/** Верхняя панель (addHeader): кнопка «Без звука» — центр и размер. */
export const HEADER_LAYOUT = {
  mute: { x: 560, y: 40, w: 190, h: 50 },
};

/** Меню: кнопки «Новый забег» и «Пропустить обучение» — центр и размер. */
export const MENU_LAYOUT = {
  /** Ползунок громкости вверху: левый край дорожки, её длина, центр по вертикали; подпись — над дорожкой. */
  volume: { x: 160, y: 110, w: 420 },
  newRun: { x: 360, y: 640, w: 400, h: 90 },
  skipTutorial: { x: 360, y: 750, w: 400, h: 70 },
  mute: { x: 360, y: 850, w: 400, h: 60 },
};

/**
 * Всплывающее окно врага (наведение на врага в заказе): ширина, поля, ширина портрета (высота — по пропорции 4:5),
 * промежуток между колонками, клетка сумки, высота полоски здоровья, высота строки описания предмета внизу.
 */
export const ENEMY_TOOLTIP_LAYOUT = {
  w: 560,
  pad: 20,
  portraitW: 180,
  colGap: 28,
  cell: 60,
  hpH: 30,
  infoH: 72,
};

/**
 * Подложка рюкзака — лошадь с седельными сумками (backgrounds/horse.webp, прозрачный фон).
 * Ставится под сетку героя в рюкзаке и в бою и масштабируется под размер клетки.
 * cellPx — сколько пикселей картинки занимает одна клетка сетки; gridX, gridY — где на картинке левый верхний угол сетки.
 * Если художница перерисует картинку — поправьте эти числа, код трогать не нужно.
 */
export const HORSE_ART = {
  path: "backgrounds/horse.webp",
  w: 1421,
  h: 1107,
  cellPx: 147,
  gridX: 119.5,
  gridY: 204.5,
  /** Клетки поверх подложки: цвет и прозрачность заливки, цвет и прозрачность линий (0 — не видно, 1 — сплошные). */
  /** Заливка — основной фиолетово-серый, как у панелей (C.panel). */
  cellFillColor: 0x231f2b,
  cellFillAlpha: 0.8,
  cellLineColor: 0xf0dcb4,
  cellLineAlpha: 0.5,
};

/** Раскладка экрана рюкзака (редактирование). */
export const BACKPACK_LAYOUT = {
  /** Размер клетки сетки, px. */
  cell: 110,
  /** Левый верхний угол сетки. */
  grid: { x: 150, y: 260 },
  /**
   * Зона «вне сумок» — внутренность сундука на фоне backgrounds/backpack_room.webp — и размер клетки в ней.
   * Не влезло — вещи листаются страницами.
   */
  stash: { x: 1257, y: 677, w: 529, h: 152, cell: 64 },
  /** Подпись «Вне сумок…» — по центру внутренней доски крышки сундука. */
  stashTitle: { x: 1521, y: 545 },
  /** Стрелки страниц «вне сумок» и номер страницы (по центру) — на крышке сундука под подписью. */
  stashNav: { prevX: 1330, nextX: 1712, pageX: 1521, y: 600, w: 70, h: 40 },
  /** Галочка «Скрыть эффекты соседства»: центр квадратика (подпись — справа от него) и размер квадратика. */
  hideLabels: { x: 620, y: 216, size: 28 },
  /**
   * Пергамент: «Сила снаряжения», а при наведении на предмет — его описание. Текст тёмный (чернила).
   * Прямоугольник — чистая область пергамента на фоне.
   */
  power: { x: 1234, y: 183, w: 546, h: 270 },
  /** Кнопка «← Домой»: центр и размер — на полу под сундуком. */
  home: { x: 1521, y: 1042, w: 400, h: 56 },
};

/** Фон экрана рюкзака: стойло слева (под лошадь), пергамент и сундук справа. Зоны — в BACKPACK_LAYOUT. */
export const BG_BACKPACK_KEY = "bg_backpack";

/**
 * Раскладка экрана боя. Рюкзак героя (маска 8×5) и самая большая сумка врага должны помещаться без наложений:
 * при cell 90 рюкзак героя — 720×450 (x 100…820), сумка 3×4 — 270×360 (x 1550…1820).
 */
export const BATTLE_LAYOUT = {
  /** Размер клетки обеих сеток в бою, px. */
  cell: 90,
  /** Портреты (центр и размер, в который вписывается картинка). */
  heroPortrait: { x: 200, y: 265, w: 240, h: 300 },
  enemyPortrait: { x: 1720, y: 265, w: 240, h: 300 },
  /** Рюкзак героя: левый верхний угол. */
  heroGrid: { x: 100, y: 470 },
  /** Сумка врага: правый верхний угол (сетка прижата к правому краю). */
  enemyGrid: { right: 1820, y: 470 },
  /** Центр экрана между сетками: кнопки, всплывающие цифры и названия предметов. */
  centerX: 1160,
  /** Всплывающие цифры: по герою — левее центра, по врагу — правее. */
  floatHeroX: 960,
  floatEnemyX: 1360,
  floatY: 420,
  /** Название сработавшего предмета. */
  itemNameY: 300,
  /** Максимальная ширина имени врага (px): длиннее — шрифт уменьшается, чтобы не залезть под кнопку ускорения. */
  enemyNameMaxW: 440,
  /** Плашка условия заказчика («Заказ лешего: лес не жечь») — между полосками здоровья. */
  conditionBanner: { x: 960, y: 205 },
  /** Максимальная ширина плашки условия (px), чтобы не заезжать на полоски здоровья; длиннее — шрифт меньше. */
  conditionMaxW: 470,
  /** Значок модификатора врага — центр, относительно правого верхнего угла портрета врага. */
  modifierBadge: { dx: -26, dy: 26, r: 24 },
  /** Кнопка «Без звука» в верхней полосе боя. */
  mute: { x: 300, y: 40, w: 190, h: 50 },
  /** Баннеры «Победа над …» и «Заказ выполнен» (центр по вертикали). */
  bannerY: 380,
  /** Нижний край подсказки о предмете (растёт вверх). */
  infoBottom: 1032,
};

export const ASSET_MANIFEST: AssetEntry[] = [
  {
    key: HERO_KEY,
    path: "portraits/hero/ludmak.png",
    stub: { kind: "portrait", label: "Людьмак" },
  },
  ...ENEMY_IDS.map((id) => ({
    key: enemyKey(id),
    path: `portraits/enemies/${id}.png`,
    stub: { kind: "portrait", label: ENEMIES[id].name } as StubSpec,
  })),
  ...CLIENT_IDS.map((id) => ({
    key: clientKey(id),
    path: `portraits/clients/${id}.png`,
    stub: { kind: "portrait", label: CLIENTS[id].name } as StubSpec,
  })),
  ...ITEM_IDS.map((id) => ({
    key: itemKey(id),
    path: `items/${id}.png`,
    stub: { kind: "item", itemId: id } as StubSpec,
  })),
  ...ENEMY_ITEM_IDS.map((id) => ({
    key: enemyItemKey(id),
    path: `items/enemy/${id}.png`,
    stub: { kind: "enemyItem", itemId: id } as StubSpec,
  })),
  ...TAG_IDS.map((id) => ({
    key: tagKey(id),
    path: `tags/${id}.png`,
    stub: { kind: "tag", tagId: id } as StubSpec,
  })),
  ...STAT_ICON_IDS.map((id) => ({
    key: statIconKey(id),
    path: `icons/stats/${id}.png`,
    stub: { kind: "statIcon", iconId: id } as StubSpec,
  })),
  ...CATEGORY_IDS.map((id) => ({
    key: categoryKey(id),
    path: `icons/categories/${id}.png`,
    stub: { kind: "category", category: id } as StubSpec,
  })),
  { key: BG_HOME_KEY, path: "backgrounds/home.webp", stub: { kind: "home" } },
  {
    key: BG_NIGHT_KEY,
    path: "backgrounds/bg_night.png",
    stub: {
      kind: "background",
      label: "bg_night",
      w: 1920,
      h: 1080,
      color: "#15131c",
    },
  },
  {
    key: BG_BATTLE_KEY,
    path: "backgrounds/bg_battle.png",
    stub: {
      kind: "background",
      label: "bg_battle",
      w: 1920,
      h: 1080,
      color: "#1c1614",
    },
  },
  {
    key: BG_BACKPACK_KEY,
    path: "backgrounds/backpack_room.webp",
    stub: { kind: "background", label: "backpack_room", w: 1920, h: 1080, color: "#1e1813" },
  },
  {
    key: BG_HORSE_KEY,
    path: HORSE_ART.path,
    stub: {
      kind: "background",
      label: "horse",
      w: HORSE_ART.w,
      h: HORSE_ART.h,
      color: "#241e1a",
    },
  },
];
