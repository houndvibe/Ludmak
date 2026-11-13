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
  | "parry";
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
export const BG_HOME_CLOSED_PATH = "backgrounds/home_closed.webp";
/** Маска проёма окошка в двери (HOME_LAYOUT.windowMask). */
export const HOME_WINDOW_MASK_KEY = "ui_home_window_mask";

export const enemyKey = (id: EnemyId) => `portrait_enemy_${id}`;
export const clientKey = (id: ClientId) => `portrait_client_${id}`;
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
    normal: { path: "ui/button.png", crop: { x: 22, y: 165, w: 2126, h: 394 } },
    hover: { path: "ui/button_hover.png", crop: { x: 31, y: 144, w: 2111, h: 434 } },
    disabled: { path: "ui/button_disabled.png", crop: { x: 26, y: 143, w: 2115, h: 437 } },
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
    steel_sword: { tip: { x: 0.49, y: 0.02 }, bladeEnd: { x: 0.5, y: 0.72 }, grip: { x: 0.5, y: 0.83 }, angle: -40, size: 150 },
    silver_dagger: { tip: { x: 0.5, y: 0.04 }, bladeEnd: { x: 0.5, y: 0.53 }, grip: { x: 0.5, y: 0.78 }, angle: -40, size: 110 },
    torch: { tip: { x: 0.4, y: 0.03 }, bladeEnd: { x: 0.47, y: 0.97 }, grip: { x: 0.47, y: 0.85 }, angle: -35, size: 140 },
    cursed_axe: { tip: { x: 0.06, y: 0.42 }, bladeEnd: { x: 0.5, y: 0.7 }, grip: { x: 0.86, y: 0.78 }, angle: 0, size: 150 },
    rusty_sickle: { tip: { x: 0.12, y: 0.04 }, bladeEnd: { x: 0.55, y: 0.6 }, grip: { x: 0.42, y: 0.86 }, angle: -20, size: 130 },
  } as Partial<Record<ItemId, CursorBlade>>,
  /**
   * Щит-курсор (предмет с parryShield в рюкзаке): картинка предмета, центр — на курсоре. Размер — FEEL.parry.shieldSize,
   * парирует круг радиусом shieldSize/2 × hitShare (атака засчитана, если её круг касается этого круга).
   */
  cursorShield: { hitShare: 0.9 },
  /** Значки: сердце (жизнь есть / потеряна) и монета. crop — без прозрачных полей; Boot уменьшает до iconHeight px. */
  icons: {
    heart_full: { path: "ui/heart_full.png", crop: { x: 100, y: 160, w: 1036, h: 986 } },
    heart_broken: { path: "ui/heart_broken.png", crop: { x: 64, y: 96, w: 1116, h: 1060 } },
    coin: { path: "ui/coin.png", crop: { x: 110, y: 104, w: 1020, h: 1028 } },
  } as Record<UiIconId, { path: string; crop: { x: number; y: number; w: number; h: number } }>,
  iconHeight: 96,
  /** Пергамент карточки заказа (дом); Boot уменьшает его ровно до HOME_LAYOUT.card. pad — поля текста от края (px карточки). */
  parchment: { path: "ui/contract_parchment.png", crop: { x: 8, y: 20, w: 1110, h: 1364 }, pad: { x: 40, top: 40, bottom: 34 } },
  /**
   * Карточка товара в магазине: plain — обычный предмет, rare — редкий и особый (вместо синей рамки). Boot уменьшает
   * картинку целиком до w×h. Раскладка внутри (px карточки) — под нарисованное: pad — поле значка типа и формы от угла,
   * iconY / iconSize — центр и размер картинки предмета, nameY — центр имени, pillsY — верх плашек тегов,
   * chipsY / chipH — первый ряд характеристик: ровно в двух нарисованных ячейках (там свой фон не рисуется), следующие ряды — ниже.
   * Нет картинки — карточка рисуется кодом с раскладкой fallback.
   */
  // Название, теги (pillsY) и характеристики (chipsY) у обычной и редкой карточки на одной высоте; картинка с клетками — над
  // названием. slotRows — сколько рядов характеристик лежат на нарисованных полосах и ячейках карточки (без своего фона):
  // у обычной — полоса 250–289 и ячейки 298–336, у редкой — ячейки 252–294.
  shopCard: {
    w: 320,
    h: 422,
    plain: { path: "ui/shop_card.webp", pad: 24, iconY: 112, iconSize: 136, nameY: 192, pillsY: 215, chipsY: 253, chipH: 40, slotRows: 2 },
    rare: { path: "ui/shop_card_rare.webp", pad: 30, iconY: 112, iconSize: 136, nameY: 192, pillsY: 215, chipsY: 253, chipH: 40, slotRows: 1 },
    fallback: { pad: 16, iconY: 100, iconSize: 150, nameY: 192, pillsY: 222, chipsY: 266, chipH: 44, slotRows: 0 },
  },
};
export type ShopCardStyle = "plain" | "rare";
export const uiShopCardKey = (s: ShopCardStyle) => `ui_shop_card_${s}`;
export type UiIconId = "heart_full" | "heart_broken" | "coin";
export const uiIconKey = (id: UiIconId) => `ui_icon_${id}`;
export const UI_PARCHMENT_KEY = "ui_parchment";
/** Исходные картинки оформления (как загружены) и готовые для игры (обрезанные и уменьшенные в Boot). */
export const uiSourceKey = (name: string) => `ui_src_${name}`;
export const uiButtonKey = (s: ButtonState) => `ui_button_${s}`;
export const UI_HEADER_KEY = "ui_header_band";

/** Значок цепи на связи соседства в рюкзаке (белый — красится в цвет связи). */
export const ICON_LINK_KEY = "icon_link";

/**
 * Раскладка экрана дома в координатах 1920×1080 — под рисунок backgrounds/home.webp (1717×916, растягивается по высоте
 * на 1080 и обрезается по бокам на ~52 px: X = x·1,179 − 52, Y = y·1,179 в пикселях картинки).
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
  [clientKey("leshy")]: { eyes: [{ x: 451, y: 568 }, { x: 687, y: 566 }], eyeColor: 0xb8ff3a, moteColor: 0xd8ff7a },
  [clientKey("vodyanoy")]: {
    eyes: [{ x: 425, y: 413 }, { x: 728, y: 418 }],
    eyeColor: 0xffd860,
    eyeStrength: 0.45,
    particles: "drip",
    moteColor: 0xcfe8ff,
    dripZone: { x: [0.22, 0.78], y: [0.55, 0.72] },
  },
  // Гуль: тусклые янтарные глаза, могильный туман снизу.
  [clientKey("gul")]: {
    eyes: [{ x: 450, y: 424 }, { x: 686, y: 424 }],
    eyeColor: 0xffa040,
    eyeStrength: 0.5,
    particles: "mist",
    moteColor: 0xb4c4aa,
  },
  // Кикимора: жадный блеск — звёздочки вспыхивают в глазах.
  [clientKey("kikimora")]: {
    eyes: [{ x: 440, y: 452 }, { x: 706, y: 452 }],
    eyeColor: 0xffb050,
    eyeStrength: 0.5,
    particles: "sparkle",
    sparkles: [{ x: 452, y: 444 }, { x: 714, y: 444 }],
    moteColor: 0xfff0b0,
  },
  // Призрак: бледные глаза, по фигуре проходит мерцание, вокруг — бледный туман.
  [clientKey("prizrak")]: {
    eyes: [{ x: 455, y: 460 }, { x: 660, y: 458 }],
    eyeColor: 0xbfe0ff,
    eyeStrength: 0.6,
    particles: "mist",
    moteColor: 0xc8dcff,
    shimmer: true,
  },
  // Упырь: красноватые глаза, с клыков капает кровь.
  [clientKey("upyr")]: {
    eyes: [{ x: 403, y: 420 }, { x: 694, y: 376 }],
    eyeColor: 0xff3a2a,
    eyeStrength: 0.6,
    particles: "drip",
    particleCount: 2,
    moteColor: 0xa01010,
    dripZone: { x: [0.49, 0.62], y: [0.5, 0.52] },
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
  /** Сдвиг портрета внутри окошка по вертикали (px): больше — портрет ниже, видно больше макушки. */
  portraitOffsetY: 0,
  /** Ширина портрета в окошке (px); высота — по пропорциям портрета 512×640. */
  portraitWidth: 268,
  /** Карточка заказа рядом с окошком. */
  card: { x: 1190, y: 240, w: 455, h: 560 },
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
  /** Доска «Заказы на сегодня» — тёмная внутренняя часть доски на фоне (без рамки). */
  board: { x: 118, y: 200, w: 495, h: 404 },
};

/** Верхняя панель (addHeader): кнопка «Без звука» — центр и размер. */
export const HEADER_LAYOUT = {
  mute: { x: 560, y: 40, w: 190, h: 50 },
};

/**
 * Главное меню (по макету художницы): фон — лес (backgrounds/menu.webp), по центру логотип (MENU_ART.logo), под ним
 * «НАЧАТЬ ОХОТУ» и меньше — «ПРОПУСТИТЬ ОБУЧЕНИЕ» (видна, пока обучение не пройдено); справа внизу громкость.
 * Логотип — центр и ширина (высота по пропорции); кнопки — центр и размер; громкость — левый край дорожки, длина,
 * центр по вертикали, подпись — над дорожкой (labelY). Галочка Debug — слева внизу (только для разработки).
 */
export const MENU_LAYOUT = {
  logo: { x: 960, y: 345, w: 966 },
  start: { x: 955, y: 661, w: 503, h: 101 },
  skipTutorial: { x: 956, y: 780, w: 387, h: 75 },
  volume: { x: 1472, y: 1005, w: 360, labelY: 972 },
  /** Галочки внизу слева: «Debug-режим», через gap px — «Медленные кружки». */
  debug: { x: 40, y: 1046, size: 24, gap: 48 },
  /** Кнопка «Быстрый бой» и окно выбора: ночь (кнопки 1–5) и враг (портреты в ряд), кнопка «Закрыть». */
  quickFight: { x: 956, y: 885, w: 387, h: 70 },
  quickPanel: { x: 960, y: 560, w: 1240, h: 640, portrait: 170, nightBtn: 70 },
};

/**
 * Оформление меню: кнопка (рамка растягивается с неподвижными углами: slice — ширина угла в px картинки), логотип,
 * ползунок громкости — дорожка, заливка (обрезается по громкости) и ромбы на концах — всё в одном масштабе по обеим осям
 * (дорожка вписывается в длину ползунка). textColor — цвет надписей меню. Нет картинки — обычная кнопка и ползунок, логотип — текстом.
 */
export const MENU_ART = {
  button: { path: "ui/menu/button.png", slice: 46 },
  /** Логотип без осколков (их вырезали из ui/menu/logo.png — осколки летают отдельно, shards). */
  logo: { path: "ui/menu/logo_clean.png" },
  sliderTrack: { path: "ui/menu/slider_track.png" },
  sliderFill: { path: "ui/menu/slider_fill.png" },
  sliderEnds: { path: "ui/menu/slider_ends.png" },
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
  /** Кегль надписи «НАЧАТЬ ОХОТУ», px экрана 1920×1080 (в макете 2560 px шириной это 72). */
  startFont: 54,
};
export type MenuArtId = "button" | "logo" | "sliderTrack" | "sliderFill" | "sliderEnds";
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
  pad: 20,
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

/**
 * Итоги ночи: ширина панели; левая колонка — строки итогов (x и ширина переноса); правая — поверженные враги и журнал боя
 * (x, ширина, нижний край журнала, шрифт строк журнала).
 */
export const RESULTS_LAYOUT = { panelW: 1720, leftX: 140, leftW: 860, rightX: 1060, rightW: 720, logBottom: 900, logSize: 18 };

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
  /** Поле «Основное оружие» — слева от верхнего ряда сумок (над левой сумкой): левый верхний угол, размер, подпись над ним. */
  mainSlot: { x: 205, y: 300, size: 110, labelY: 282 },
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
  /** Кнопка «Вернуться» (домой) — в шапке, левее монет и жизней. */
  home: { x: 1500, y: 40, w: 220, h: 50 },
};

/** Фон экрана рюкзака: стойло слева (под лошадь), пергамент и сундук справа. Зоны — в BACKPACK_LAYOUT. */
export const BG_BACKPACK_KEY = "bg_backpack";

/**
 * Раскладка магазина в координатах 1920×1080 — под рисунок backgrounds/shop.webp (лавка нечисти под сундуком).
 * Слева прилавок с товарами, посередине торговец (только на рисунке), справа мешок с твоими вещами.
 * Нет картинки — заглушка рисует эти же зоны. Перерисовали фон — поправьте числа, код трогать не нужно.
 */
export const SHOP_LAYOUT = {
  /** Строка «Заказы на день»: левый край и верх. */
  orders: { x: 44, y: 96 },
  /** Прилавок: сюда отпускают свою вещь, чтобы продать (подсвечивается при перетаскивании). */
  counter: { x: 16, y: 134, w: 880, h: 860 },
  /**
   * Карточки товаров на прилавке: левый верхний угол первой, масштаб картинки карточки (UI_ART.shopCard),
   * промежутки, сколько в ряду (неполный последний ряд — по центру).
   */
  cards: { x: 44, y: 148, scale: 0.85, gapX: 20, gapY: 16, perRow: 3 },
  /** Кнопка «Обновить ассортимент» (в дебаге — листание товаров): центр и размер. Подсказка «как купить» — правее неё. */
  reroll: { x: 304, y: 1036, w: 520, h: 70 },
  hint: { x: 742, y: 1036 },
  /** Торговец — только на рисунке (заглушка рисует силуэт). */
  merchant: { x: 900, y: 134, w: 316, h: 860 },
  /** Мешок с твоими вещами: сюда отпускают товар, чтобы купить. Подпись — у верхнего края. */
  bag: { x: 1217, y: 280, w: 678, h: 752 },
  bagTitleY: 236,
  /** Плитки вещей в мешке (2 в ряд — по ширине горловины): левый верхний угол первой, размер, промежуток, в ряду, рядов на странице. */
  tiles: { x: 1364, y: 360, w: 220, h: 104, gap: 10, perRow: 2, rows: 5 },
  /** Стрелки страниц вещей и номер страницы (по центру) — внизу мешка. */
  bagNav: { prevX: 1420, nextX: 1760, pageX: 1590, y: 960, w: 90, h: 44 },
  /** Кнопка «Домой →» — под мешком: центр и размер. */
  home: { x: 1590, y: 1036, w: 520, h: 70 },
};

/** Фон магазина: прилавок, торговец, мешок. Зоны — в SHOP_LAYOUT. */
export const BG_SHOP_KEY = "bg_shop";

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
  conditionMaxW: 380,
  /** Значок модификатора врага — центр, относительно правого верхнего угла портрета врага. */
  modifierBadge: { dx: -26, dy: 26, r: 24 },
  /** Кнопка «Без звука» в верхней полосе боя. */
  mute: { x: 300, y: 40, w: 190, h: 50 },
  /** Кнопка «Ускорение ×1 / ×N» в верхней полосе боя, правее «Без звука». */
  speed: { x: 520, y: 40, w: 220, h: 50 },
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
  { key: BG_HOME_KEY, path: "backgrounds/home.webp", stub: { kind: "home" } }, // вариант фона — backgrounds/home_v2.webp (раскладка не подогнана)
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
