# Людьмак — промты для предметов

Промты на английском: генераторы понимают его лучше. Каждый промт = **общий стиль** + **описание предмета** + **формат**.
Готовый результат — основа для перерисовки, финальные мазки и контур — руками.

## Как пользоваться

1. Скопируй **общий стиль** (один раз в начало промта).
2. Добавь строку предмета из таблицы ниже.
3. Поставь соотношение сторон из колонки «Формат» (в Midjourney — `--ar 1:3`, в других — выбором пропорций).
4. Добавь **негатив**, если генератор его поддерживает.

**Ориентация:** вертикальные предметы (1×2, 1×3, 1×4) — стоят остриём или навершием вверх. Пистоль (2×1) — лежит горизонтально.
**Размер в игре:** 128 px на клетку. Рисуй крупнее в тех же пропорциях, например 512 px на клетку: 1×1 → 512×512, 1×3 → 512×1536, 2×2 → 1024×1024.
**Куда класть:** предметы героя — `public/assets/items/{id}.png`, предметы врагов — `public/assets/items/enemy/{id}.png`. PNG с прозрачным фоном.

---

## Общий стиль

```
hand-painted game item icon, painterly oil painting with large visible brushstrokes, Disco Elysium inspired, slavic dark folk fantasy, worn and well-used object, muted desaturated earthy palette with one restrained accent color, soft warm light from the top left, bold clean dark outline around the silhouette, readable silhouette at small size, single object centered, isolated on a plain flat background, no text, no frame, no cast shadow
```

## Негатив

```
photorealistic, 3D render, glossy, plastic, smooth digital gradient, busy background, scenery, hands, people, text, letters, watermark, logo, frame, border, multiple objects, cropped, cut off, tilted perspective, blurry
```

---

## Предметы героя

| Предмет | id (имя файла) | Формат | Описание (добавить к стилю) |
| --- | --- | --- | --- |
| Стальной меч | `steel_sword` | 1×3, вертикально | `a plain steel longsword standing upright, point up, simple crossguard, leather-wrapped grip, scratched and nicked blade, practical mercenary weapon` |
| Серебряный кинжал | `silver_dagger` | 1×2, вертикально | `a slim silver dagger standing upright, point up, bright cold silver blade with faint engraved runes, dark wooden handle bound with wire, small silver pommel` |
| Проклятый топор | `cursed_axe` | 2×2 | `a heavy cursed battle axe, blackened iron head with a jagged edge, faint sickly green glow in carved runes, cracked wooden haft wrapped in rotting cloth, ominous` |
| Деревянный щит | `wooden_shield` | 2×2 | `a round wooden shield seen from the front, planks held by an iron rim and a central iron boss, dents and arrow scratches, faded painted pattern` |
| Факел | `torch` | 1×2, вертикально | `a burning torch standing upright, wooden stick wrapped in tarred rags, bright orange flame at the top as the only warm accent, a few sparks` |
| Краюха хлеба | `bread` | 1×1 | `a rustic loaf of rye bread, half broken, dark crust and soft crumb showing, a few crumbs, simple peasant food` |
| Серебряная подкова | `silver_horseshoe` | 1×1 | `a silver horseshoe with nail holes, opening facing up, polished but worn, tied with a thin red thread as a charm` |
| Ладанка с костями | `bone_amulet` | 1×1 | `a small leather pouch amulet on a cord, stuffed with tiny animal bones and teeth sticking out, stitched with coarse thread, pagan charm, slightly sinister` |
| Бомба «Гром» | `bomb_grom` | 1×1 | `a round alchemical bomb in a clay or iron shell, short burning fuse on top, crude rune scratched on the side, bound with rope` |
| Лечебный эликсир | `healing_elixir` | 1×1 | `a small round glass potion bottle with a cork stopper, glowing deep red healing liquid inside, paper label tied with string` |
| Масло против людей | `oil_vs_humans` | 1×1 | `a small flat glass vial of blade oil, thick amber liquid, wax-sealed cork, a drip running down the side, label with a crossed-out human silhouette` |
| Мандрагора | `mandrake` | 1×2, вертикально | `a mandrake root standing upright, gnarled pale root shaped like a tiny screaming human figure, leafy green top, bits of soil, creepy and alive` |
| Точильный камень | `whetstone` | 1×1 | `a rectangular grey whetstone, worn smooth in the middle from sharpening, a few metal shavings, tied with a leather strap` |
| Ржавый серп | `rusty_sickle` | 1×2, вертикально | `a rusty peasant sickle standing upright, curved blade pointing up, heavy rust and dark stains, cracked wooden handle, faint cursed aura` |
| Копчёный окорок | `smoked_ham` | 1×2, вертикально | `a smoked pork ham hanging vertically on a rope loop, dark glossy smoked skin, string netting, rustic cured meat` |

---

## Предметы врагов

Те же стиль и негатив. Эти предметы держат люди, поэтому они грубее и беднее, чем снаряжение героя (кроме аристократа и ведьмака).

| Предмет | id (имя файла) | Формат | Описание (добавить к стилю) |
| --- | --- | --- | --- |
| Коровья лепёшка | `cow_pie` | 1×1 | `a lump of dried cow dung, cracked and lumpy, a few straws stuck in it, comically gross` |
| Вилы | `pitchfork` | 1×3, вертикально | `a peasant pitchfork standing upright, three iron tines pointing up, long rough wooden handle, mud on the tines` |
| Ростовой щит | `tower_shield` | 2×3, вертикально | `a tall rectangular tower shield seen from the front, thick planks with iron bands and rivets, painted town guard emblem half worn off` |
| Копьё | `spear` | 1×4, вертикально | `a long guard spear standing upright, leaf-shaped iron spearhead pointing up, long straight wooden shaft, small red cloth tied below the head` |
| Мешок | `loot_sack` | 2×2 | `a fat burlap loot sack tied at the top with rope, lumpy with stolen goods, a coin peeking out of a hole` |
| Кистень | `flail` | 1×2, вертикально | `a bandit flail standing upright, short wooden handle at the bottom, iron chain with a spiked iron ball at the top` |
| Святая вода | `holy_water` | 1×1 | `a small glass flask of holy water, clear liquid with a faint pale blue glow, a tiny wooden cross tied to the neck, wax seal` |
| Посох | `staff` | 1×4, вертикально | `a monk's tall wooden staff standing upright, carved cross at the top, worn leather grip, prayer beads wound around it` |
| Пистоль | `pistol` | 2×1, горизонтально | `an ornate flintlock pistol lying horizontally, barrel pointing right, engraved brass fittings, polished walnut grip, aristocratic` |
| Серебряная шпага | `silver_rapier` | 1×3, вертикально | `an elegant silver rapier standing upright, point up, thin long blade, ornate swept-hilt guard with silver curls, noble and expensive` |
| Серебряный меч ведьмака | `silver_sword` | 1×3, вертикально | `a witcher's silver sword standing upright, point up, long silver blade with engraved runes along the fuller, dark leather grip, wolf head pommel` |

Бомба и эликсир ведьмака берут картинки бомбы «Гром» и лечебного эликсира героя, отдельно их рисовать не нужно.
