// Манифест ассетов: ключ текстуры → путь относительно public/assets/.
// Сцены обращаются к картинкам ТОЛЬКО по ключам отсюда. Если файла нет — Boot рисует заглушку под тем же ключом.
// Новый предмет/враг/заказчик в src/data автоматически попадает в манифест.
import { CLIENT_IDS, CLIENTS, type ClientId } from "../data/clients";
import { ENEMIES, ENEMY_IDS, type EnemyId } from "../data/enemies";
import { ENEMY_ITEM_IDS, ENEMY_ITEMS, type EnemyItemId } from "../data/enemyItems";
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

/**
 * Значки характеристик и пометок: урон, лечение, блок, оглушение, перезарядка, заряды, усиление оружия, длительность,
 * урон себе, аура; для заказов — враги заказа, очередь у двери, взятые заказы, нельзя отступать, аванс, «по монстру».
 */
export type StatIconId =
  | "damage"
  | "heal"
  | "block"
  | "stun"
  | "cooldown"
  | "charges"
  | "buff"
  | "duration"
  | "self"
  | "aura"
  | "enemies"
  | "queue"
  | "contracts"
  | "noRetreat"
  | "advance"
  | "monster"
   | "slow"
  | "parry"
  | "escape";
export const STAT_ICON_IDS: StatIconId[] = [
  "damage",
  "heal",
  "block",
  "stun",
  "cooldown",
  "charges",
  "buff",
  "duration",
  "self",
  "aura",
  "enemies",
  "queue",
  "contracts",
  "noRetreat",
  "advance",
  "monster",
  "slow",
  "parry",
  "escape",
];

export type StubSpec =
  | { kind: "portrait"; label: string }
  | { kind: "item"; itemId: ItemId }
  | { kind: "enemyItem"; itemId: EnemyItemId }
  | { kind: "tag"; tagId: TagId }
  | { kind: "statIcon"; iconId: StatIconId }
  | { kind: "category"; category: ItemCategory }
  | { kind: "link" }
  | { kind: "home" }
  | { kind: "shop" }
  | { kind: "background"; label: string; w: number; h: number; color: string };

export interface AssetEntry {
  key: string;
  /** Путь относительно public/assets/. */
  path: string;
  stub: StubSpec;
}

export const HERO_KEY = "portrait_hero";
export const BG_NIGHT_KEY = "bg_night";
/** Фон итогов ночи (лес у тропы). */
export const BG_RESULTS_KEY = "bg_results";
export const BG_BATTLE_KEY = "bg_battle";
export const BG_HORSE_KEY = "bg_horse";
export const BG_HOME_KEY = "bg_home";
/**
 * Тот же дом с закрытым окошком (backgrounds/home_closed.webp, тот же размер и раскладка, что home.webp). Из него берётся
 * задвижка окошка: кусок по HOME_LAYOUT.window. Необязательный: нет файла — задвижка рисуется кодом.
 */
export const BG_HOME_CLOSED_KEY = "bg_home_closed";
export const BG_HOME_CLOSED_PATH = "portraits/clients/bg_house_door_window.png";
export const HOME_FRAME_KEY = "home_window_frame";
export const HOME_FRAME_PATH = "portraits/clients/bg_house_door_frame.png";
/** Маска проёма окошка в двери (HOME_LAYOUT.windowMask). */
export const HOME_WINDOW_MASK_KEY = "ui_home_window_mask";

export const enemyKey = (id: EnemyId) => `portrait_enemy_${id}`;
export const clientKey = (id: ClientId) => `portrait_client_${id}`;
export const CLIENT_BG_KEY = "portrait_client_bg";
export const itemKey = (id: ItemId) => `item_${id}`;
export const enemyItemKey = (id: EnemyItemId) => `enemy_item_${id}`;
export const tagKey = (id: TagId) => `tag_${id}`;
export const statIconKey = (id: StatIconId) => `icon_stat_${id}`;
export const categoryKey = (id: ItemCategory) => `icon_category_${id}`;
/**
 * Оформление интерфейса художницы (необязательно: нет файла — кнопка или шапка рисуются кодом, как раньше).
 * Кнопка: три состояния; crop — плашка на картинке без прозрачных полей (px картинки). При растягивании углы
 * не тянутся: неподвижные края — slice от высоты плашки (по горизонтали и вертикали). Boot уменьшает плашку
 * до buttonHeight px (качественнее, чем сжимать в каждом кадре), кнопки тянут уже её.
 * Шапка: бесшовная по горизонтали картинка; band — полоса балки на ней (px картинки), повторяется по ширине экрана.
 */
export type ButtonState = "normal" | "hover" | "disabled";
/** Отбивающая часть курсора-оружия: точки на картинке (доли), наклон в покое и высота на экране. */
export interface CursorBlade {
  tip: { x: number; y: number };
  bladeEnd: { x: number; y: number };
  grip: { x: number; y: number };
  angle: number;
  size: number;
}

export const UI_ART = {
  button: {
    normal: { path: "ui/button.png", crop: { x: 11, y: 82, w: 1063, h: 197 } },
    hover: { path: "ui/button_hover.png", crop: { x: 16, y: 72, w: 1056, h: 217 } },
    disabled: { path: "ui/button_disabled.png", crop: { x: 13, y: 72, w: 1058, h: 218 } },
  } as Record<ButtonState, { path: string; crop: { x: number; y: number; w: number; h: number } }>,
  buttonHeight: 128,
  slice: { x: 0.38, y: 0.32 },
  header: { path: "ui/header.png", band: { y: 571, h: 128 } },
  /**
   * Курсор основного оружия в зоне атак (бой) — картинка предмета героя. Доли ширины и высоты картинки:
   * tip — кончик (в покое ровно на курсоре), grip — рукоять (вокруг неё взмах), bladeEnd — до куда отбивает: отрезок
   * tip → bladeEnd (меч — весь клинок, кинжал — клинок, факел — вся длина, топор — лезвие-голова). angle — наклон в покое,
   * градусы; size — высота картинки на экране, px. Щит — отдельно (cursorShield): отбивает всей областью.
   */
  cursorWeapons: {
    steel_sword: { tip: { x: 0.52, y: 0.03 }, bladeEnd: { x: 0.53, y: 0.72 }, grip: { x: 0.53, y: 0.83 }, angle: -40, size: 150 },
    silver_dagger: { tip: { x: 0.50, y: 0.05 }, bladeEnd: { x: 0.50, y: 0.53 }, grip: { x: 0.50, y: 0.78 }, angle: -40, size: 110 },
    torch: { tip: { x: 0.27, y: 0.04 }, bladeEnd: { x: 0.43, y: 0.96 }, grip: { x: 0.43, y: 0.85 }, angle: -35, size: 140 },
    cursed_axe: { tip: { x: 0.06, y: 0.43 }, bladeEnd: { x: 0.50, y: 0.72 }, grip: { x: 0.87, y: 0.80 }, angle: 0, size: 150 },
    rusty_sickle: { tip: { x: 0.13, y: 0.05 }, bladeEnd: { x: 0.55, y: 0.60 }, grip: { x: 0.42, y: 0.86 }, angle: -20, size: 130 },
  } as Partial<Record<ItemId, CursorBlade>>,
  /**
   * Щит-курсор (предмет с parryShield в рюкзаке): картинка предмета, центр — на курсоре. Размер — FEEL.parry.shieldSize,
   * парирует круг радиусом shieldSize/2 × hitShare (атака засчитана, если её круг касается этого круга).
   */
  cursorShield: { hitShare: 0.9 },
  /** Значки: сердце (жизнь есть / потеряна) и монета. crop — без прозрачных полей; Boot уменьшает до iconHeight px. */
  icons: {
    heart_full: { path: "ui/heart_full.png", crop: { x: 25, y: 40, w: 259, h: 246 } },
    heart_broken: { path: "ui/heart_broken.png", crop: { x: 16, y: 24, w: 279, h: 265 } },
    coin: { path: "ui/coin.png", crop: { x: 0, y: 0, w: 60, h: 64 } },
  } as Record<UiIconId, { path: string; crop: { x: number; y: number; w: number; h: number } }>,
  iconHeight: 96,
  /** Пергамент карточки заказа (дом); Boot уменьшает его ровно до HOME_LAYOUT.card. pad — поля текста от края (px карточки). */
  parchment: { path: "ui/contract_parchment.png", crop: { x: 0, y: 0, w: 592, h: 741 }, pad: { x: 40, top: 40, bottom: 34 } },
  /**
   * Карточка товара в магазине: plain — обычный предмет, rare — редкий и особый (вместо синей рамки). Boot уменьшает
   * картинку целиком до w×h. Раскладка внутри (px карточки) — под нарисованное: pad — поле значка типа и формы от угла,
   * iconY / iconSize — центр и размер картинки предмета, nameY — центр имени, pillsY — верх плашек тегов,
   * chipsY / chipH — первый ряд характеристик и высота плашки (у каждой характеристики своя плашка: значок + число).
   * Нет картинки — карточка рисуется кодом с раскладкой fallback.
   */
  // Название, теги (pillsY) и характеристики (chipsY) у обычной и редкой карточки на одной высоте; картинка с клетками — над
  // названием. slotRows — сколько рядов характеристик лежат на нарисованных полосах и ячейках карточки (без своего фона):
  // у обычной — полоса 250–289 и ячейки 298–336, у редкой — ячейки 252–294.
  shopCard: {
    w: 320,
    h: 422,
    plain: { path: "ui/shop_card.webp", pad: 24, iconY: 110, iconSize: 150, nameY: 206, pillsY: 229, chipsY: 270, chipH: 36, slotRows: 0 },
    rare: { path: "ui/shop_card_rare.webp", pad: 30, iconY: 110, iconSize: 150, nameY: 206, pillsY: 229, chipsY: 270, chipH: 36, slotRows: 0 },
    fallback: { pad: 16, iconY: 100, iconSize: 150, nameY: 192, pillsY: 222, chipsY: 266, chipH: 44, slotRows: 0 },
  },
};
export type ShopCardStyle = "plain" | "rare";
export const uiShopCardKey = (s: ShopCardStyle) => `ui_shop_card_${s}`;
export type UiIconId = "heart_full" | "heart_broken" | "coin";
export const uiIconKey = (id: UiIconId) => `ui_icon_${id}`;
export const UI_PARCHMENT_KEY = "ui_parchment";
/** Отдельный пергамент итогов ночи: ui/results_parchment.png. */
export const RESULTS_PARCHMENT_KEY = "results_parchment";
/** Исходные картинки оформления (как загружены) и готовые для игры (обрезанные и уменьшенные в Boot). */
export const uiSourceKey = (name: string) => `ui_src_${name}`;
export const uiButtonKey = (s: ButtonState) => `ui_button_${s}`;
export const UI_HEADER_KEY = "ui_header_band";

/** Значок цепи на связи соседства в рюкзаке (белый — красится в цвет связи). */
export const ICON_LINK_KEY = "icon_link";

/**
 * Раскладка экрана дома в координатах 1920×1080 — под backgrounds/home_sketch_3.jpg (2560×1440, масштаб 0,75).
 * Если художница нарисовала дверь/сундук/сумки в другом месте — поправьте числа здесь, код трогать не нужно.
 * Прямоугольники: x, y — левый верхний угол.
 */
/**
 * Живые портреты (components/PortraitLife.ts): какие картинки оживают, где на них глаза (px исходной картинки)
 * и цвета свечения глаз и светлячков. Движение и тайминги — FEEL.portraitLife. Нет записи — портрет неподвижен.
 */
export interface PortraitLifeArt {
  eyes: { x: number; y: number }[];
  eyeColor: number;
  /** Яркость свечения глаз относительно FEEL.portraitLife.eyeAlpha (1 — как у лешего). */
  eyeStrength?: number;
  /** Частицы: светлячки (по умолчанию), капли (падают), туман (клубится снизу), блеск (звёздочки в точках sparkles). */
  particles?: "firefly" | "drip" | "mist" | "sparkle";
  /** Сколько частиц, если не как в FEEL.portraitLife. */
  particleCount?: number;
  /** Где вспыхивает блеск (px исходной картинки). */
  sparkles?: { x: number; y: number }[];
  /** Мерцание: по фигуре проходит светлая волна (призрак). */
  shimmer?: boolean;
  moteColor: number;
  /** Откуда срываются капли: доли ширины и высоты картинки (x от–до, y от–до). */
  dripZone?: { x: [number, number]; y: [number, number] };
}
export const PORTRAIT_LIFE: Record<string, PortraitLifeArt> = {
  // Координаты и зоны частиц — в пикселях текущих портретов, не старых исходников 1024×1280.
  [clientKey("leshy")]: {
    eyes: [{ x: 141, y: 119 }, { x: 198, y: 121 }],
    eyeColor: 0x8fdcff,
    eyeStrength: 0.55,
    moteColor: 0xb8e89a,
  },
  [clientKey("vodyanoy")]: {
    eyes: [{ x: 176, y: 151 }, { x: 267, y: 138 }],
    eyeColor: 0xffd860,
    eyeStrength: 0.35,
    particles: "drip",
    moteColor: 0xcfe8ff,
    dripZone: { x: [0.35, 0.65], y: [0.45, 0.48] },
  },
  // Гуль: тусклые глаза и могильный туман снизу.
  [clientKey("gul")]: {
    eyes: [{ x: 142, y: 89 }, { x: 198, y: 101 }],
    eyeColor: 0xffb060,
    eyeStrength: 0.35,
    particles: "mist",
    moteColor: 0xb4c4aa,
  },
  // Кикимора: короткие блики в глазах.
  [clientKey("kikimora")]: {
    eyes: [{ x: 180, y: 132 }, { x: 239, y: 142 }],
    eyeColor: 0xffb050,
    eyeStrength: 0.35,
    particles: "sparkle",
    sparkles: [{ x: 180, y: 132 }, { x: 239, y: 142 }],
    moteColor: 0xfff0b0,
  },
  // Призрак: холодные глаза, мерцание фигуры и туман.
  [clientKey("prizrak")]: {
    eyes: [{ x: 154, y: 127 }, { x: 208, y: 127 }],
    eyeColor: 0xbfe0ff,
    eyeStrength: 0.45,
    particles: "mist",
    moteColor: 0xc8dcff,
    shimmer: true,
  },
  // Упырь: тёмно-красные глаза и кровь с клыков.
  [clientKey("upyr")]: {
    eyes: [{ x: 111, y: 142 }, { x: 172, y: 142 }],
    eyeColor: 0xff3a2a,
    eyeStrength: 0.4,
    particles: "drip",
    particleCount: 2,
    moteColor: 0xa01010,
    dripZone: { x: [0.43, 0.61], y: [0.56, 0.59] },
  },
  // Безголовый: глаз нет — редкие голубые вспышки вдоль огня над шеей.
  [clientKey("headless")]: {
    eyes: [],
    eyeColor: 0x8fdcff,
    particles: "sparkle",
    sparkles: [{ x: 165, y: 30 }, { x: 155, y: 85 }, { x: 177, y: 125 }],
    moteColor: 0x8fdcff,
  },
};

export const HOME_LAYOUT = {
  /** Дверь целиком (зона клика «На охоту / Переждать день»). */
  door: { x: 753, y: 198, w: 368, h: 775 },
  /**
   * Окошко-задвижка в двери (рамка проёма на экране). Портрет монстра обрезается по форме проёма с картинки фона —
   * маске windowMask (белое — видно); нет маски — скруглённым прямоугольником с radius.
   */
  window: { x: 867, y: 295, w: 214, h: 238, radius: 26 },
  /**
   * Маска проёма окошка по картинке фона (белое — видно): x, y — левый верхний угол маски в пикселях картинки фона.
   * null — скруглённый прямоугольник window. Для фона home_v2.webp есть готовая: { path: "ui/home_window_mask.png", x: 906, y: 300 }.
   */
  windowMask: null as { path: string; x: number; y: number } | null,
  /** Есть рамка окошка (bg_house_door_frame.png): портрет обрезается по рамке, отступив внутрь на столько px. */
  windowInset: 8,
  /** Сдвиг портрета внутри окошка по вертикали (px): больше — портрет ниже, видно больше макушки. */
  portraitOffsetY: 0,
  /** Ширина портрета в окошке (px); высота — по пропорциям портрета 512×640. */
  portraitWidth: 268,
  /** Карточка заказа рядом с окошком. */
  card: { x: 1195, y: 240, w: 455, h: 560 },
  /**
   * Печать «Принято» на карточке заказа (ui/seal_stamp.png): центр — доля ширины и высоты карточки (правый нижний угол,
   * поверх «Награда / Неустойка»), размер — доля ширины карточки. imprint — оттиск: центр картинки оттиска в долях картинки воска
   * и ширина — доля ширины воска; подобрано по пикселям: внешнее кольцо оттиска (радиус ~126 px его картинки) ложится
   * на середину светлого кольца капли (центр 235, 255; радиусы 105–133 px картинки воска).
   */
  stamp: { x: 0.74, y: 0.8, size: 0.36, imprint: { x: 0.498, y: 0.536, size: 0.525 } },
  /**
   * Письмо о ведьмаке (ночь 1, поверх всего): центр и размер пергамента (UI_ART.parchment, растянут), поля текста,
   * размер шрифта, кнопка «Прочитано» — центр по вертикали от верха пергамента.
   */
  letter: { x: 960, y: 560, w: 640, h: 790, padX: 64, top: 70, size: 26, buttonY: 700 },
  /** Прилавок/сундук — кнопка «Магазин». */
  shop: { x: 89, y: 637, w: 596, h: 389 },
  /** Седельные сумки на крюке — кнопка «Сумки». */
  bags: { x: 1705, y: 295, w: 167, h: 497 },
  /**
   * Подписи «МАГАЗИН», «СУМКИ», «НА ОХОТУ» (макет художницы): центр надписи; без подложки, светлый текст с обводкой
   * и тенью. Нет записи — внизу зоны предмета.
   */
  labels: {
    shop: { x: 364, y: 929 },
    bags: { x: 1780, y: 842 },
    /** По центру полотна двери (вырезка ui/home_door.png), у нижнего края. */
    door: { x: 954, y: 945 },
  } as Partial<Record<"shop" | "bags" | "door", { x: number; y: number }>>,
  labelSize: 43,
  labelColor: "#b7a58a",
  /**
   * Вырезанные с фона предметы (художница): при наведении светятся по контуру (FEEL.homeGlow), клик — по силуэту.
   * x, y — левый верхний угол вырезки в пикселях картинки фона дома (2560×1440). Нет записи или файла — прямоугольная рамка.
   */
  cutouts: {
    shop: { path: "ui/home_chest.png", x: 147, y: 869 },
    bags: { path: "ui/home_bags.png", x: 2240, y: 431 },
    /** Полотно двери с петлями и засовом (вырезка художницы); depth 3 — под окошком и портретом. */
    door: { path: "ui/home_door.png", x: 1030, y: 263, depth: 3 },
  } as Partial<
    Record<"shop" | "bags" | "door", { path: string; x: number; y: number; depth?: number }>
  >,
  /** Доска «Заказы на сегодня» — тёмная внутренняя часть доски на фоне (без рамки). */
  board: { x: 137, y: 184, w: 508, h: 415 },
};

/**
 * Шапка экранов по макету художницы (addHeader): центр строки по вертикали, высота доски, кегли.
 * Слева «НОЧЬ 1/5» и «УРОВЕНЬ 1» (слово — цвет text, число — num), по центру заголовок капителью с ромбами,
 * справа монета и число монет.
 */
export const HEADER_ART = {
  y: 40,
  barH: 80,
  nightX: 39,
  levelX: 264,
  labelSize: 34,
  titleSize: 44,
  titleSmall: 33,
  /** Заголовок по центру выше строки y на столько px. */
  titleUp: 3,
  coinSize: 36,
  coinIcon: 44,
  coinRight: 1856,
  text: "#b7a58a",
  num: "#ce6a82",
  diamondGap: 22,
};

export const homeCutoutKey = (id: string) => `home_cutout_${id}`;

/** Верхняя панель (addHeader): кнопка «Без звука» — центр и размер. */
export const HEADER_LAYOUT = {
  mute: { x: 560, y: 40, w: 190, h: 50 },
};

/**
 * Главное меню (по макету художницы): фон — лес (backgrounds/menu.webp), по центру логотип (MENU_ART.logo), под ним
 * «НАЧАТЬ ОХОТУ» и меньше — «БЫСТРЫЙ БОЙ»; справа внизу громкость. Обучение предлагается во всплывающем окне.
 * Логотип — центр и ширина (высота по пропорции); кнопки — центр и размер; громкость — левый край дорожки, длина,
 * центр по вертикали, подпись — над дорожкой (labelY). Галочка Debug — слева внизу (только для разработки).
 */
export const MENU_LAYOUT = {
  logo: { x: 960, y: 345, w: 966 },
  start: { x: 955, y: 661, w: 503, h: 101 },
  volume: { x: 1472, y: 1005, w: 360, labelY: 972 },
  /** Галочки внизу слева: «Debug-режим», через gap px — «Медленные кружки». */
  debug: { x: 40, y: 1046, size: 24, gap: 48 },
  /** Кнопка «Быстрый бой» и окно выбора: ночь (кнопки 1–5) и враг (портреты в ряд), кнопка «Закрыть». */
  quickFight: { x: 956, y: 780, w: 387, h: 70 },
  quickPanel: { x: 960, y: 560, w: 1240, h: 640, portrait: 170, nightBtn: 70 },
  /**
   * Окно «Быстрый бой» по макету художницы: рамка портрета (frameW×frameH, портрет под ней — portrait×1.25),
   * кегли и цвета надписей (заголовок — первая буква titleSize, остальное titleSmall, капителью).
   */
  quickArt: {
    frameW: 184,
    frameH: 227,
    titleSize: 46,
    titleSmall: 35,
    subSize: 22,
    nightSize: 32,
    nameSize: 20,
    subColor: "#a89a84",
    diamondGap: 22,
    /** Кнопка «Закрыть»: центр выше нижнего края окна на столько px. */
    closeFromBottom: 82,
    /** Имя врага: верх надписи ниже рамки портрета на столько px. */
    nameGap: 6,
    /** Центры по вертикали от верха окна: заголовок, подпись, ряд портретов. */
    titleY: 62,
    subY: 112,
    portraitsY: 345,
  },
};

/**
 * Оформление меню: кнопка (рамка растягивается с неподвижными углами: slice — ширина угла в px картинки), логотип,
 * ползунок громкости — дорожка, заливка (обрезается по громкости) и ромбы на концах — всё в одном масштабе по обеим осям
 * (дорожка вписывается в длину ползунка). textColor — цвет надписей меню. Нет картинки — обычная кнопка и ползунок, логотип — текстом.
 */
export const MENU_ART = {
  button: { path: "ui/menu/button.png", slice: 54 },
  /** Логотип без осколков (их вырезали из ui/menu/logo.png — осколки летают отдельно, shards). */
  logo: { path: "ui/menu/logo_clean.png" },
  sliderTrack: { path: "ui/menu/slider_track.png" },
  sliderFill: { path: "ui/menu/slider_fill.png" },
  sliderEnds: { path: "ui/menu/slider_ends.png" },
  /** Окно «Быстрый бой» (макет художницы): фон окна (растягивается на MENU_LAYOUT.quickPanel), рамка портрета
   * (середина прозрачная, портрет под ней), ромбы слева и справа от заголовка. */
  quickPanel: { path: "ui/quick_panel.png" },
  portraitFrame: { path: "ui/portrait_frame.png" },
  diamondLeft: { path: "ui/diamond_left.png" },
  diamondRight: { path: "ui/diamond_right.png" },
  /** Шапка экранов (макет художницы): доска на всю ширину экрана, без текста. Нет картинки — старая балка ui/header.png. */
  headerBar: { path: "ui/header_bar.png" },
  /** Траурная лента на портрет (экран поражения); нет файла — лента рисуется кодом. */
  mourningRibbon: { path: "ui/mourning_ribbon.png" },
  /**
   * Глаза в лесу (вырезаны из варианта фона художницы): картинка и центр в пикселях исходного фона (2000×1125) —
   * в игре масштабируются вместе с фоном. Моргают и иногда пропадают (FEEL.menuLife.eyes).
   */
  eyes: [
    { path: "ui/menu/eyes_0.png", x: 82, y: 384 },
    { path: "ui/menu/eyes_1.png", x: 692, y: 227 },
    { path: "ui/menu/eyes_2.png", x: 1552, y: 468 },
    { path: "ui/menu/eyes_3.png", x: 1918, y: 240 },
  ],
  /** Печать на логотипе (доля ширины и высоты картинки логотипа) — за ней светит свечение. */
  seal: { x: 0.497, y: 0.62 },
  /**
   * Осколки печати (ui/menu/seal_shards.png художницы, разрезан на shard_N.png): центр каждого в пикселях картинки
   * логотипа (1289×689) — там, где он нарисован; в меню парят вокруг этого места (FEEL.menuLife.shards).
   */
  shards: [
    { x: 619, y: 13.5 },
    { x: 605.5, y: 144 },
    { x: 583.5, y: 223.5 },
    { x: 534.5, y: 258 },
    { x: 867.5, y: 616 },
    { x: 743.5, y: 638.5 },
    { x: 422.5, y: 636.5 },
    { x: 773, y: 669 },
  ],
  textColor: "#e8354f",
  buttonTextColor: "#b7a58a",
  buttonRefuseTextColor: "#ce6a82",
  /** Кегль надписи «НАЧАТЬ ОХОТУ», px экрана 1920×1080 (в макете 2560 px шириной это 72). */
  startFont: 54,
  /** Кегль надписи «БЫСТРЫЙ БОЙ», px экрана 1920×1080. */
  quickFightFont: 36,
};
export type MenuArtId =
  | "button"
  | "logo"
  | "sliderTrack"
  | "sliderFill"
  | "sliderEnds"
  | "quickPanel"
  | "portraitFrame"
  | "diamondLeft"
  | "diamondRight"
  | "headerBar"
  | "mourningRibbon";
export const menuArtKey = (id: MenuArtId) => `ui_menu_${id}`;
export const menuEyesKey = (n: number) => `ui_menu_eyes_${n}`;
export const menuShardKey = (n: number) => `ui_menu_shard_${n}`;

/** Печать «Принято» на заказе (дом): сначала капля воска, потом на неё оттиск с «Ъ» (картинки художницы). */
export const SEAL_STAMP_KEY = "ui_seal_wax";
export const SEAL_STAMP_PATH = "ui/seal_wax.png";
export const SEAL_IMPRINT_KEY = "ui_seal_imprint";
export const SEAL_IMPRINT_PATH = "ui/seal_imprint.png";

/** Фон меню: логотип «Людьмак» на тёмной доске. */
/**
 * Шрифты (public/assets/fonts, Google Fonts, лицензия OFL): Kurale — заголовки, имена, кнопки; PT Serif — остальной текст.
 * Каждый начертание — два файла: кириллица и латиница (range — какие символы в файле). Грузятся до запуска игры (main.ts);
 * не загрузились — запасные шрифты из списка в ui.ts.
 */
export type FontFile = { family: string; style: "normal" | "italic"; weight: "400" | "700"; file: string; range: string };
const FONT_RANGES = {
  cyrillic: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116",
  latin: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
};
const fontFiles = (family: string, slug: string, style: FontFile["style"], weight: FontFile["weight"]): FontFile[] =>
  (["cyrillic", "latin"] as const).map((sub) => ({
    family,
    style,
    weight,
    file: `assets/fonts/${slug}-${weight}-${style}-${sub}.woff2`,
    range: FONT_RANGES[sub],
  }));
export const FONT_FILES: FontFile[] = [
  ...fontFiles("Kurale", "kurale", "normal", "400"),
  ...fontFiles("PT Serif", "ptserif", "normal", "400"),
  ...fontFiles("PT Serif", "ptserif", "normal", "700"),
  ...fontFiles("PT Serif", "ptserif", "italic", "400"),
];

export const BG_MENU_KEY = "bg_menu";

/**
 * Всплывающее окно врага (наведение на врага в заказе): поля, ширина портрета (высота — по пропорции 4:5), промежуток
 * между колонками, клетка сумки, высота полоски здоровья, наименьшая ширина колонки сумки. Ширина окна — по содержимому.
 * card — карточка предмета врага при наведении на него в сумке: картинка обычной карточки магазина (UI_ART.shopCard.plain)
 * в масштабе scale, сбоку от окна с зазором gap.
 */
export const ENEMY_TOOLTIP_LAYOUT = {
  /** Отступ содержимого от края окна — чтобы не наезжать на светлую рамку плашки. */
  pad: 34,
  portraitW: 180,
  colGap: 28,
  cell: 60,
  hpH: 30,
  minBagW: 150,
  card: { scale: 0.75, gap: 10 },
};

/**
 * Подложка рюкзака — лошадь с седельными сумками (backgrounds/horse.webp, прозрачный фон).
 * Ставится под сетку героя в рюкзаке и в бою и масштабируется под размер клетки.
 * cellPx — сколько пикселей картинки занимает одна клетка сетки; gridX, gridY — где на картинке левый верхний угол сетки.
 * Если художница перерисует картинку — поправьте эти числа, код трогать не нужно.
 */
export const HORSE_ART = {
  path: "backgrounds/horse.webp",
  w: 1232,
  h: 1103,
  cellPx: 145,
  gridX: 40,
  gridY: 42,
  /** Клетки поверх подложки: цвет и прозрачность заливки, цвет и прозрачность линий (0 — не видно, 1 — сплошные). */
  /** Заливка — основной фиолетово-серый, как у панелей (C.panel). */
  cellFillColor: 0x231f2b,
  cellFillAlpha: 0.8,
  cellLineColor: 0xf0dcb4,
  cellLineAlpha: 0.5,
};

/**
 * Итоги ночи: ширина панели; левая колонка — строки итогов (x и ширина переноса); правая — поверженные враги и журнал боя
 * (x, ширина, нижний край журнала, шрифт строк журнала).
 */
/**
 * Экран конца игры: фон итогов дня притушен на dim; справа — портрет Людьмака в рамке (центр и размер портрета),
 * при поражении чёрно-белый с траурной лентой (offset — от угла до ленты, width — ширина ленты, overhang — насколько
 * выходит за рамку; scale — масштаб картинки ленты художницы); слева — заголовок, текст и кнопка по центру колонки x.
 */
export const GAME_OVER_LAYOUT = {
  dim: 0.5,
  portrait: { x: 1340, y: 510, w: 480, h: 600 },
  ribbon: { offset: 90, width: 46, overhang: 6, scale: 0.75 },
  text: { x: 600, titleY: 375, titleBig: 104, titleSmall: 78, bodyY: 452, bodySize: 34, width: 760, buttonY: 645 },
};

export const RESULTS_LAYOUT = {
  /**
   * Лист (пергамент карточки заказа, растянут): ширина; высота — по содержимому, не меньше minH и не больше maxH;
   * bottomH — место внизу под журнал и печать; кнопка — ниже листа на buttonGap (центр). Лист с кнопкой — по центру экрана.
   */
  sheetW: 760,
  minH: 640,
  maxH: 900,
  bottomH: 290,
  buttonGap: 75,
  padX: 72,
  /** От верха листа: центр заголовка, центр строки исхода, верх списка заказов. */
  titleY: 82,
  titleSize: 52,
  outcomeY: 142,
  outcomeSize: 26,
  listY: 185,
  /** Высота строки заказа (без пометок). */
  rowH: 82,
  /** Добавка к строке, если под заказом есть пометки (кража, возврат аванса, бонус). */
  noteH: 22,
  /** Монеты: отступ от списка, кегль. */
  moneyGap: 22,
  moneySize: 32,
  /** Ссылка «Журнал боя» — центр выше низа листа на столько px. */
  journalFromBottom: 70,
  /** Окно журнала: размер, поля. */
  journal: { w: 1000, h: 760, pad: 70 },
  /** Анимированная печать: размер и центр — левее и выше правого нижнего угла листа на dx, dy. */
  stamp: { dx: 130, dy: 125, size: 200 },
};

/** Раскладка экрана рюкзака (редактирование). */
export const BACKPACK_LAYOUT = {
  /** Размер клетки сетки, px. */
  cell: 110,
  /** Левый верхний угол сетки. */
  grid: { x: 150, y: 260 },
  /**
   * Зона «вне сумок» — клетки поверх сундука на фоне backgrounds/backpack_room.webp — и размер клетки в ней
   * (12 × 5 = 60 клеток на странице; сетка сама встаёт по центру зоны). Не влезло — вещи листаются страницами.
   */
  stash: { x: 1190, y: 608, w: 664, h: 282, cell: 54 },
  /** Поле «Основное оружие» — слева от верхнего ряда сумок (над левой сумкой): левый верхний угол, размер, подпись над ним. */
  mainSlot: { x: 190, y: 292, size: 150, labelY: 272 },
  /**
   * Стрелки страниц «вне сумок» — слева и справа от сетки сундука, по середине её высоты, с зазором gap;
   * номер страницы «1/2» — под сеткой (pageGap px от её низа). Места считаются от сетки сами.
   */
  stashNav: { w: 46, h: 96, gap: 12, pageGap: 18 },
  /** Галочка «Скрыть эффекты соседства» — внизу панели «Сила снаряжения»: x — левый край квадратика, y — середина строки. */
  hideLabels: { x: 1227, y: 494, size: 28 },
  /**
   * Пергамент: «Сила снаряжения», а при наведении на предмет — его описание. Текст тёмный (чернила).
   * Прямоугольник — чистая область пергамента на фоне.
   */
  power: { x: 1211, y: 140, w: 622, h: 400 },
  /** Панель (ui/quick_panel.png) под «Силой снаряжения» — поверх нарисованного на фоне пергамента. */
  panel: { x: 1172, y: 100, w: 700, h: 462 },
  /** Подсказка управления — справа от кнопки «Вернуться», под сеткой сумок. */
  hint: { x: 400, y: 950 },
  /**
   * Кнопка «Вернуться» — на той же высоте и того же размера, что «ДОМОЙ →» в магазине (SHOP_LAYOUT.home),
   * левый край — как у «Обновить ассортимент» (44 px): кнопки не прыгают между экранами.
   */
  home: { x: 204, y: 1016, w: 320, h: 70 },
};

/** Фон экрана рюкзака: стойло слева (под лошадь), пергамент и сундук справа. Зоны — в BACKPACK_LAYOUT. */
export const BG_BACKPACK_KEY = "bg_backpack";

/**
 * Раскладка магазина в координатах 1920×1080 — под рисунок backgrounds/shop.webp (лавка нечисти под сундуком).
 * Слева прилавок с товарами, посередине торговец (только на рисунке), справа мешок с твоими вещами.
 * Нет картинки — заглушка рисует эти же зоны. Перерисовали фон — поправьте числа, код трогать не нужно.
 */
export const SHOP_LAYOUT = {
  /** Прилавок: сюда отпускают свою вещь, чтобы продать (подсвечивается при перетаскивании). */
  counter: { x: 16, y: 134, w: 880, h: 860 },
  /**
   * Карточки товаров на прилавке: левый верхний угол первой, масштаб картинки карточки (UI_ART.shopCard),
   * промежутки, сколько в ряду (неполный последний ряд — по центру).
   */
  cards: { x: 61, y: 172, scale: 0.85, gapX: 12, gapY: 16, perRow: 3 },
  /** Кнопка «Обновить ассортимент» (в дебаге — листание товаров): центр и размер. */
  reroll: { x: 304, y: 1016, w: 520, h: 70 },
  /**
   * Торговец, вырезанный из фона отдельным слоем (ui/shop_merchant.png) — «дышит» поверх фона (FEEL.shop.merchant).
   * x, y — левый верхний угол вырезки в пикселях фона 2560×1440 (на экране ×0,75). Нет файла — торговец просто на фоне.
   */
  merchantArt: { path: "ui/shop_merchant.png", x: 1071, y: 726 },
  /** Торговец — только на рисунке (заглушка рисует силуэт). */
  merchant: { x: 806, y: 540, w: 312, h: 540 },
  /** Мешок с твоими вещами: сюда отпускают товар, чтобы купить. */
  bag: { x: 1217, y: 280, w: 678, h: 752 },
  /** Горловина мешка: внутри неё вещи лежат там, где их отпустили (покупка и перекладывание). */
  bagArea: { x: 1285, y: 320, w: 510, h: 550 },
  /** Вещи в мешке («стикеры»), места по умолчанию для вещей без своего места: левый верхний угол первого места, размер места, промежуток, в ряду, рядов на странице. */
  tiles: { x: 1300, y: 330, w: 150, h: 130, gap: 0, perRow: 3, rows: 4 },
  /** Стрелки страниц вещей и номер страницы (по центру) — внизу мешка. */
  bagNav: { prevX: 1420, nextX: 1760, pageX: 1590, y: 960, w: 90, h: 44 },
  /** Кнопка «Домой →» — под мешком: центр и размер. */
  home: { x: 1738, y: 1016, w: 320, h: 70 },
};

/** Фон магазина: прилавок, торговец, мешок. Зоны — в SHOP_LAYOUT. */
export const BG_SHOP_KEY = "bg_shop";
export const SHOP_MERCHANT_KEY = "shop_merchant";

/**
 * Раскладка экрана боя. Рюкзак героя (маска 8×5) и самая большая сумка врага должны помещаться без наложений:
 * при cell 90 рюкзак героя — 720×450 (x 100…820), сумка ведьмака 3×5 — 270×450 (x 1550…1820, y 470…920).
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
  /** Максимальная ширина имени врага (px): длиннее — шрифт уменьшается, чтобы не залезть в середину экрана. */
  enemyNameMaxW: 440,
  /** Плашка условия заказчика («Заказ лешего: лес не жечь») — между полосками здоровья. */
  conditionBanner: { x: 960, y: 205 },
  /** Максимальная ширина плашки условия (px), чтобы не заезжать на полоски здоровья и значки блока рядом с ними; длиннее — шрифт меньше. */
  conditionMaxW: 400,
  /** Значок модификатора врага — центр, относительно правого верхнего угла портрета врага. */
  modifierBadge: { dx: -26, dy: 26, r: 24 },
  /** Кнопка «Без звука» в верхней полосе боя. */
  mute: { x: 300, y: 40, w: 190, h: 50 },
  /** Кнопка «Ускорение ×1 / ×N» в верхней полосе боя, правее «Без звука». */
  speed: { x: 520, y: 40, w: 220, h: 50 },
  /** Дебаг-кнопка «Победить» — только в debug-режиме, правее «Ускорения». */
  debugWin: { x: 960, y: 125, w: 190, h: 50 },
  /** Баннеры «Победа над …» и «Заказ выполнен» (центр по вертикали). */
  bannerY: 380,
  /** Нижний край подсказки о предмете (растёт вверх). */
  infoBottom: 1032,
  /**
   * Журнал боя — полоса под сумкой врага: левый верхний угол, размер, прозрачность фона, отступ, строк, шрифт,
   * насколько тусклее каждая строка выше нижней.
   */
  log: { x: 1300, y: 925, w: 520, h: 140, alpha: 0.55, pad: 8, lines: 6, size: 17, fade: 0.12 },
  /** Зона, где появляются картинки атак врага для парирования (левый верхний угол и размер): между сетками. */
  parryZone: { x: 880, y: 360, w: 560, h: 500 },
  /** Картинка всех летящих атак врага вместо предмета врага (для тестов); null — картинка самого предмета врага. */
  parryIconOverride: null as string | null,
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
  {
    key: CLIENT_BG_KEY,
    path: "portraits/clients/client_bg.png",
    stub: { kind: "background", label: "Фон заказчика", w: PORTRAIT_W, h: PORTRAIT_H, color: "#201a24" },
  },
  ...ITEM_IDS.map((id) => ({
    key: itemKey(id),
    path: `items/${id}.png`,
    stub: { kind: "item", itemId: id } as StubSpec,
  })),
  // Предмет героя в руках врага (art) — та же картинка, что у героя.
  ...ENEMY_ITEM_IDS.map((id) => ({
    key: enemyItemKey(id),
    path: ENEMY_ITEMS[id].art ? `items/${ENEMY_ITEMS[id].art}.png` : `items/enemy/${id}.png`,
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
  { key: ICON_LINK_KEY, path: "icons/link.png", stub: { kind: "link" } },
  { key: BG_HOME_KEY, path: "backgrounds/home_sketch_3.jpg", stub: { kind: "home" } },
  {
    key: BG_RESULTS_KEY,
    path: "backgrounds/results.webp",
    stub: { kind: "background", label: "results", w: 1920, h: 1080, color: "#15131c" },
  },
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
    key: BG_MENU_KEY,
    path: "backgrounds/menu.webp",
    stub: { kind: "background", label: "menu", w: 1920, h: 1080, color: "#14121a" },
  },
  {
    key: BG_BACKPACK_KEY,
    path: "backgrounds/backpack_room.webp",
    stub: { kind: "background", label: "backpack_room", w: 1920, h: 1080, color: "#1e1813" },
  },
  { key: BG_SHOP_KEY, path: "backgrounds/shop.webp", stub: { kind: "shop" } },
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
