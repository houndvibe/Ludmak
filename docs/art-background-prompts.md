# Людьмак: фоны магазина и сумок (Midjourney)

## Какие файлы заменяем

| Экран | Файл в игре | Сейчас | Нужно |
|---|---|---|---|
| Магазин | `public/assets/backgrounds/shop.webp` | 1672×941 | 2560×1440 (16:9) |
| Сумки (укладка рюкзака) | `public/assets/backgrounds/backpack_room.webp` | 1920×1080 | 2560×1440 (16:9) |
| Лошадь с сумками (отдельный слой поверх фона сумок) | `public/assets/backgrounds/horse.webp` | 1421×1107, прозрачный фон | не трогаем |

Рисуй в 2560×1440 и присылай PNG. Я сожму в `.webp` и подставлю под то же имя, код трогать не нужно.

Шаблоны лежат рядом:
- `shop_template_2560.png` и `backpack_template_2560.png` — разметка поверх текущих фонов, чтобы видеть, что где;
- `shop_guides_2560.png` и `backpack_guides_2560.png` — та же разметка на прозрачном фоне. Кладёшь верхним слоем в фотошопе поверх своей генерации и проверяешь, что всё попало в рамки.

## Общий стиль (под «Дом Людьмака»)

Ориентир — фон дома (`home_sketch_3.jpg`): мягкая цифровая живопись, рисованная, а не фото. Тёмные тёплые коричневые тона, бревенчатые стены, лунный холодный голубой акцент и тёплый свет от огня или свечи. Крупные читаемые формы, мало мелкого мусора, спокойные тёмные поверхности там, где будет интерфейс. Славянская деревенская изба, лёгкая жуть.

**Совет:** загрузи фон дома в Midjourney и дай его как style reference (`--sref <ссылка на картинку>`). Так новые фоны будут в одной гамме и манере. `--sw 200–300` усиливает влияние стиля.

Общий хвост для обоих промтов:

```
--ar 16:9 --style raw --s 150 --sref <ссылка на home_sketch_3> --sw 250 --no text, letters, UI, frame, border, people in foreground, photorealism, harsh contrast, clutter
```

## Магазин — `shop.webp`

Что важно по шаблону:
- **Слева (примерно 45% ширины)** — широкий деревянный прилавок. На нём лежат 5 карточек товаров, поэтому столешница и стена за ней должны быть спокойными и тёмными, без ярких пятен и мелких предметов.
- **По центру, узкая полоса** — торговец. Его видно, интерфейса там нет.
- **Справа (примерно треть кадра)** — большой открытый мешок из мешковины. В его горловине лежат купленные вещи, поэтому внутри должно быть **тёмно, ровно и пусто**. Горловина: от 1795 до 2460 px по горизонтали, от 440 до 1265 px по вертикали.
- **Верхние ~110 px** закроет шапка игры, там спокойные балки потолка.
- **Нижние углы** — кнопки «Обновить ассортимент» (слева) и «ДОМОЙ →» (справа), фон под ними без деталей.

```
Painterly digital illustration of a dark Slavic folk monster's trading shack interior at night, front view, cozy and slightly eerie. Left half: a long wide rustic wooden counter with a clean empty tabletop, dark log wall behind it with a few hanging dried herb bundles high up. Center: a narrow figure of an old hooded forest merchant with small horns and a long grey beard, standing behind the counter, hands folded. Right third: a huge open burlap sack lying on the wooden floor, mouth wide open, deep dark empty interior. Low wooden ceiling beams, warm candle light from the left, cold moonlight accents, muted dark browns, soft brush strokes, simple readable shapes, calm uncluttered surfaces, game background --ar 16:9 --style raw --s 150 --sref <ссылка на home_sketch_3> --sw 250 --no text, letters, UI, frame, border, items on the counter, photorealism, clutter
```

Если мешок выходит маленьким или не там, допиши: `the open sack fills the right third of the image, its opening facing the viewer`.

## Сумки — `backpack_room.webp`

Что важно по шаблону:
- **Слева (примерно 60% ширины)** — стойло. Сверху игра кладёт **отдельную картинку лошади с сумками** и сетку, поэтому центр стойла пустой: тёмная стена, солома на полу, никаких животных и крупных предметов. По краям можно фонарь, сбрую на крюках, жерди.
- **Справа сверху** — тёмная панель «Сила снаряжения» (1543–2476 px по горизонтали, 133–816 px по вертикали). Её закроет плашка игры, так что тут просто стена. Можно полочку со свечой у правого края, она будет выглядывать.
- **Справа снизу** — большой **открытый деревянный сундук**, вид спереди. В нём сетка 11×5 клеток (по 80 px): от 1569 до 2449 px по горизонтали, от 917 до 1317 px по вертикали. Внутри сундука **ровное тёмное дно**. Крышка открыта назад и невысокая, примерно 100 px между панелью и сеткой, чтобы не уйти под панель.
- **Нижние ~110 px слева** — кнопка «ВЕРНУТЬСЯ» и строки подсказки, там спокойный пол.

```
Painterly digital illustration of a dark wooden stable inside a Slavic log cabin at night, front view, cozy and slightly eerie. Left two thirds: an empty horse stall with dark plank walls and straw on the floor, a hanging iron lantern with warm light on the left post, leather harness on hooks at the edges, the center of the stall empty and calm. Right side: a plain dark log wall with a small shelf and a lit candle near the right edge; below it a large old wooden chest with iron bands, seen from the front, lid open backwards, wide flat dark empty interior. Muted dark browns, warm lantern glow, cold moonlight through a small window, soft brush strokes, simple readable shapes, uncluttered, game background --ar 16:9 --style raw --s 150 --sref <ссылка на home_sketch_3> --sw 250 --no horse, animals, text, letters, UI, frame, parchment, photorealism, clutter
```

Если сундук выходит маленьким, допиши: `the open chest is wide and fills the lower right quarter of the image`.

## После генерации

1. Увеличь до 2560×1440, если Midjourney отдал меньше (Upscale ×2, затем подгони размер).
2. Положи слой `*_guides_2560.png` сверху и проверь: горловина мешка, дно сундука и столешница попадают в свои рамки.
3. Подправь руками то, что вылезло: свет, лишние детали в зонах интерфейса.
4. Пришли PNG. Я сожму, подставлю и при необходимости подвину зоны в коде под твой рисунок.
