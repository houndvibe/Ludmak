# Людьмак — список звуков для генерации

Все звуки, которые игра уже умеет проигрывать: 34 звука и 2 мелодии. Имя файла должно совпадать с ключом.
Файл кладётся в `public/assets/audio/` — и звук сразу играет, код трогать не нужно.

## Технические требования

- **Формат:** `.ogg` (можно `.mp3`, если `.ogg` нет). Имя — ключ из таблицы, например `hit_enemy.ogg`.
- **Звуки:** моно, 44,1 кГц, без тишины в начале — звук должен начинаться сразу. Громкость выровнять между собой (нормализация около −3 дБ).
- **Музыка:** стерео, бесшовная петля — конец должен переходить в начало без щелчка.
- **Длительность:** как в таблице. Интерфейсные звуки короткие: они звучат часто, длинные надоедают.
- **Частота срабатываний.** Звуки с пометкой «очень часто» в бою звучат каждую секунду, иногда несколько раз подряд. Делайте их мягкими и короткими. Одновременно звучат не больше 3 копий одного звука.
- **Стиль:** славянское фэнтези, изба, лес, деревенская драка. Без синтетических «игровых» бипов: дерево, металл, ткань, монеты, стекло, кожа. Тон ироничный и усталый — без пафоса.

Колонка «Промпт» — готовая подсказка для генератора звуков (ElevenLabs Sound Effects, Stable Audio и похожие).

## 1. Интерфейс

| Ключ | Когда звучит | Длит. | Как должно звучать | Промпт |
| --- | --- | --- | --- | --- |
| `ui_click` | нажатие любой кнопки, сундука, сумок, двери | 0,05–0,1 с | очень тихий сухой щелчок по дереву; звучит вместе с другими звуками, поэтому почти незаметный | `soft dry wooden click, short tap on a wooden button, subtle, no reverb` |
| `ui_hover` | наведение на кнопку | 0,03–0,08 с | едва слышный шорох, тише клика | `very soft quiet tick, light paper rustle, extremely short and subtle` |

## 2. Дом Людьмака (ночь)

| Ключ | Когда звучит | Длит. | Как должно звучать | Промпт |
| --- | --- | --- | --- | --- |
| `monster_arrive` | монстр появился в окошке двери | 0,6–1,0 с | стук костяшками в деревянную дверь, 2–3 удара; можно с утробным ворчанием | `knocking on an old wooden door, three slow knocks, rustic cabin, slight eerie tone` |
| `contract_accept` | «Принять» | 0,4–0,7 с | удар печати по бумаге или скрип пера — сделка заключена | `wax seal stamp pressed onto parchment, firm thump, quill scratch, satisfying` |
| `contract_decline` | «Отказать» | 0,3–0,6 с | смятый лист бумаги или резкий хлопок задвижки | `crumpling a sheet of old paper, short dismissive rustle` |
| `window_close` | очередь закончилась, задвижка окошка закрылась | 0,4–0,8 с | деревянная задвижка съезжает и щёлкает | `wooden window shutter sliding closed, latch clack, old cabin` |
| `door_open` | дверь: «На охоту» / «Переждать день» | 0,8–1,5 с | скрип тяжёлой деревянной двери на старых петлях | `heavy wooden door creaking open, old iron hinges, rustic` |

## 3. Магазин (сундук)

| Ключ | Когда звучит | Длит. | Как должно звучать | Промпт |
| --- | --- | --- | --- | --- |
| `shop_buy` | покупка | 0,4–0,7 с | монеты высыпаются на прилавок плюс вещь кладётся в сумку | `few coins dropped on a wooden counter, then leather pouch thud, medieval shop` |
| `shop_sell` | продажа | 0,4–0,7 с | монеты сгребают в ладонь — обратное покупке | `coins scooped up from a wooden table into a hand, jingle, short` |
| `shop_reroll` | обновить ассортимент | 0,5–0,9 с | крышку сундука захлопнули и открыли, вещи перетряхнули | `rummaging through a wooden chest, items shuffling, lid thump` |

## 4. Рюкзак (укладка)

Звучат часто, пока игрок перекладывает вещи. Мягкие и короткие.

| Ключ | Когда звучит | Длит. | Как должно звучать | Промпт |
| --- | --- | --- | --- | --- |
| `item_pickup` | взял предмет мышью | 0,1–0,25 с | лёгкий шорох кожи, предмет подняли | `picking up an item from a leather bag, soft leather rustle, short` |
| `item_place` | положил предмет | 0,1–0,25 с | мягкий глухой стук в седельную сумку | `placing an object into a leather saddlebag, soft muffled thud` |
| `item_rotate` | повернул предмет (правая кнопка) | 0,08–0,15 с | короткий поворот, шорох ткани | `quick cloth swish, small object turned over, very short` |
| `item_invalid` | не помещается: вернулся на место или не повернулся | 0,15–0,3 с | глухой «бум» — нельзя; не резкий, без раздражения | `dull wooden bonk, soft negative thud, gentle error sound` |
| `item_merge` | слияние ★ (два одинаковых предмета в один) | 0,5–0,9 с | металлический звон плюс короткое мерцание — предмет стал сильнее | `metal items clinking together then a short magical shimmer, upgrade sound, folk fantasy` |

## 5. Бой (день)

Самые частые звуки игры — делайте их короткими и не утомляющими.

| Ключ | Когда звучит | Частота | Длит. | Как должно звучать | Промпт |
| --- | --- | --- | --- | --- | --- |
| `hit_enemy` | герой ранил врага не клинком (факел, бомба и т.п.) | очень часто | 0,1–0,25 с | удар клинка по телу и одежде, глухой и плотный | `sword hit on a person, cloth and flesh impact, short punchy, no scream` |
| `sword_hit` | герой ранил врага клинком (меч, кинжал, топор, серп) | очень часто | 0,1–0,25 с | звон и удар клинка | (файл уже есть: sword_hit.mp3) |
| `parry` | герой парировал удар врага (нажал картинку атаки вовремя) | часто | 0,2–0,4 с | звонкий металлический лязг с искрами, короткий и яркий | `sword parry, bright metallic clang with sparks, short ringing` |
| `hit_hero` | враг ранил героя (вилы, копьё, шпага, лепёшка, пуля) | очень часто | 0,15–0,3 с | тупой удар по шкуре плюс короткий звериный выдох или рык | `blunt hit on a furry beast, short grunt of a wolf creature, impact` |
| `block` | блок поглотил урон или добавился | часто | 0,1–0,25 с | удар по деревянному щиту | `hit on a wooden shield, solid wooden thunk, short` |
| `heal` | лечение героя (хлеб, эликсир) или врага | часто | 0,3–0,6 с | глоток из склянки или тёплое мерцание | `drinking from a small glass potion bottle, gulp, soft warm chime` |
| `self_damage` | герой ранил сам себя (топор, ладанка, отравленная еда) | иногда | 0,2–0,4 с | шипение и болезненный звериный скулёж — не как обычный удар | `pained wolf whimper with a dark magical hiss, short, cursed` |
| `bomb` | герой бросил бомбу или шумный предмет взорвался | редко | 0,6–1,2 с | взрыв глиняного горшка с порохом: хлопок, осколки | `clay pot bomb explosion, gunpowder pop, debris, medieval, punchy` |
| `stun` | враг оглушён (бомба, мандрагора) | редко | 0,4–0,7 с | звон в ушах или вскрик мандрагоры, «птички» | `stun ringing sound, dizzy tinnitus whine, short comedic daze` |
| `item_burn` | предмет отключился: сгорел, запрещён условием заказчика | редко | 0,3–0,6 с | пшик огня и тления, предмет «погас» | `small fire whoosh then sizzle, item burning out, short` |
| `item_vanish` | предмет исчез: кончились заряды или взорвался | редко | 0,3–0,6 с | хлопок рассыпающегося в пыль, лёгкий «пуф» | `small magical poof, item crumbling to dust, soft puff` |
| `enemy_death` | враг повержен | часто | 0,4–0,8 с | тело падает на землю, короткий выдох человека | `person collapsing onto dirt ground, body fall thud, last breath, short` |
| `hero_death` | Людьмак пал в бою | редко | 1,0–2,0 с | тяжёлое падение зверя и протяжный затухающий вой | `large wolf creature falling heavily, fading mournful howl, defeat` |
| `contract_done` | заказ выполнен (последний враг заказа) | часто | 0,6–1,0 с | короткий удовлетворённый аккорд на гуслях или домре | `short satisfying folk string chord, gusli pluck, task complete, slavic` |
| `rest` | привал между заказами | иногда | 0,8–1,5 с | треск костра и выдох — передышка | `crackling campfire, tired sigh, short calm moment in the woods` |
| `retreat` | отступление | редко | 0,6–1,2 с | торопливые шаги по лесу, отход | `hurried footsteps running away through forest undergrowth, short` |

## 6. Итоги ночи и конец забега

| Ключ | Когда звучит | Длит. | Как должно звучать | Промпт |
| --- | --- | --- | --- | --- |
| `coins` | итоги: заработаны монеты | 0,6–1,0 с | кошель монет высыпается на стол | `pouch of coins poured onto a wooden table, rich jingle` |
| `level_up` | итоги: новый уровень (больше заказов за ночь) | 0,8–1,5 с | короткая восходящая фраза на дудке или гуслях | `short rising folk melody on a wooden flute, level up, slavic fantasy` |
| `game_over` | конец игры: долг не оплачен | 1,5–3,0 с | мрачная нисходящая фраза, скрип и тихий смешок кикиморы | `sad descending folk tune on low strings, creaky, ominous witch chuckle at the end` |
| `victory` | победа: пережил 5 ночей | 2,0–4,0 с | торжественно, но иронично: бодрая плясовая на гуслях и бубне | `triumphant short slavic folk fanfare, gusli and tambourine, cheerful victory` |

## 7. Музыка (по кругу)

| Ключ | Где играет | Длит. петли | Как должно звучать | Промпт |
| --- | --- | --- | --- | --- |
| `music_night` | меню, дом, магазин, рюкзак, итоги, конец игры | 1,5–3 мин | тихая ночная изба: медленные гусли или домра, сверчки, треск печи; меланхолично и уютно, не мешает думать над рюкзаком | `slow calm slavic folk ambient, gusli and soft drone, night in a wooden cabin, crickets, melancholic and cozy, seamless loop` |
| `music_day` | бой | 1–2 мин | бодрая, но не героическая: ритмичный бубен, балалайка, напряжение драки; слегка комичная | `upbeat tense slavic folk battle music, tambourine and balalaika, rhythmic, slightly humorous, seamless loop` |

## Промпты для ElevenLabs целиком

ElevenLabs Sound Effects делает один звук за запрос. Чтобы все звуки были в одном стиле, к каждому описанию добавляется общий блок стиля.

**Общий блок стиля** (уже вставлен в каждый промпт ниже):

```
Slavic folk fantasy game, rustic medieval village, organic foley: wood, leather, iron, cloth, glass, coins. Dry and clean, close-miked, no music, no voices or speech, no long reverb.
```

**Настройки:**
- **Duration** — как в таблицах выше. Если сервис не даёт задать очень короткую длительность (меньше 0,5 с), сгенерируй коротко и обрежь начало и хвост в аудиоредакторе.
- **Prompt influence** — высокое (около 0,7), чтобы стиль держался.
- Сгенерируй 3–4 варианта каждого звука и выбери лучший. Для частых звуков (удары, блок) можно оставить 2–3 разных варианта на будущее.
- **Музыку** лучше делать в Eleven Music, а не в Sound Effects. Если используешь Sound Effects — включи зацикливание, если оно доступно, и проверь стык петли.

### Интерфейс

```
ui_click: Slavic folk fantasy game, rustic medieval village, organic foley. Dry and clean, no music, no voices. Very soft dry wooden click, a light tap on a small wooden button, subtle and short.
ui_hover: Slavic folk fantasy game, rustic medieval village, organic foley. Dry and clean, no music, no voices. Extremely soft quiet tick, faint paper rustle, barely audible, very short.
```

### Дом

```
monster_arrive: Slavic folk fantasy game, rustic medieval village, organic foley. Dry and clean, no music, no voices. Three slow knocks on an old wooden cabin door at night, with a low creature growl after.
contract_accept: Slavic folk fantasy game, rustic medieval village, organic foley. Dry and clean, no music, no voices. Wax seal stamp pressed firmly onto parchment, solid thump with a quick quill scratch, satisfying deal made.
contract_decline: Slavic folk fantasy game, rustic medieval village, organic foley. Dry and clean, no music, no voices. A sheet of old paper crumpled in a hand, short dismissive rustle.
window_close: Slavic folk fantasy game, rustic medieval village, organic foley. Dry and clean, no music, no voices. Small wooden shutter in a cabin door sliding shut, latch clacks.
door_open: Slavic folk fantasy game, rustic medieval village, organic foley. Dry and clean, no music, no voices. Heavy wooden door creaking open on old iron hinges.
```

### Магазин

```
shop_buy: Slavic folk fantasy game, rustic medieval village, organic foley. Dry and clean, no music, no voices. A few coins dropped on a wooden counter, then an item thuds into a leather pouch.
shop_sell: Slavic folk fantasy game, rustic medieval village, organic foley. Dry and clean, no music, no voices. Coins scooped from a wooden table into a hand, short jingle.
shop_reroll: Slavic folk fantasy game, rustic medieval village, organic foley. Dry and clean, no music, no voices. Rummaging through a wooden chest, items shuffled around, lid thumps shut.
```

### Рюкзак

```
item_pickup: Slavic folk fantasy game, rustic medieval village, organic foley. Dry and clean, no music, no voices. Picking an item up out of a leather saddlebag, soft leather rustle, very short.
item_place: Slavic folk fantasy game, rustic medieval village, organic foley. Dry and clean, no music, no voices. Placing an object into a leather saddlebag, soft muffled thud, very short.
item_rotate: Slavic folk fantasy game, rustic medieval village, organic foley. Dry and clean, no music, no voices. Quick cloth swish as a small object is turned over, very short.
item_invalid: Slavic folk fantasy game, rustic medieval village, organic foley. Dry and clean, no music, no voices. Dull soft wooden bonk, gentle "doesn't fit" thud, not harsh.
item_merge: Slavic folk fantasy game, rustic medieval village, organic foley. Dry and clean, no music, no voices. Two metal items clink together, followed by a short warm magical shimmer, an upgrade.
```

### Бой

```
hit_enemy: Slavic folk fantasy game, rustic medieval village, organic foley. Dry and clean, no music, no voices. Sword strike hitting a person, cloth and flesh impact, short and punchy, no scream.
hit_hero: Slavic folk fantasy game, rustic medieval village, organic foley. Dry and clean, no music, no human voices. Blunt blow landing on a big furry beast, short pained wolf grunt, impact.
block: Slavic folk fantasy game, rustic medieval village, organic foley. Dry and clean, no music, no voices. Weapon hitting a wooden shield, solid wooden thunk, short.
heal: Slavic folk fantasy game, rustic medieval village, organic foley. Dry and clean, no music, no voices. A gulp from a small glass potion bottle, followed by a soft warm chime.
self_damage: Slavic folk fantasy game, rustic medieval village, organic foley. Dry and clean, no music, no human voices. Pained wolf whimper with a dark cursed magical hiss, short.
bomb: Slavic folk fantasy game, rustic medieval village, organic foley. Dry and clean, no music, no voices. Clay pot gunpowder bomb exploding, sharp pop with scattering debris, punchy, short tail.
stun: Slavic folk fantasy game, rustic medieval village, organic foley. Dry and clean, no music, no voices. Dizzy ringing in the ears after a blow, short comedic daze whine.
item_burn: Slavic folk fantasy game, rustic medieval village, organic foley. Dry and clean, no music, no voices. Small fire whoosh then a sizzle as an object burns out.
item_vanish: Slavic folk fantasy game, rustic medieval village, organic foley. Dry and clean, no music, no voices. Small soft magical poof, an object crumbling into dust.
enemy_death: Slavic folk fantasy game, rustic medieval village, organic foley. Dry and clean, no music, no words. A man collapsing onto dirt ground, body fall thud with a last exhale.
hero_death: Slavic folk fantasy game, rustic medieval village, organic foley. Dry and clean, no music, no human voices. A large wolf creature falls heavily, then a fading mournful howl.
contract_done: Slavic folk fantasy game, rustic medieval village. No voices. A short satisfying folk string chord on a gusli, task completed.
rest: Slavic folk fantasy game, rustic medieval village, organic foley. Dry and clean, no music, no words. Crackling campfire in the woods with a tired creature sigh, a calm short pause.
retreat: Slavic folk fantasy game, rustic medieval village, organic foley. Dry and clean, no music, no voices. Hurried footsteps running away through forest undergrowth, short.
```

### Итоги и конец забега

```
coins: Slavic folk fantasy game, rustic medieval village, organic foley. Dry and clean, no music, no voices. A pouch of coins poured onto a wooden table, rich jingle.
level_up: Slavic folk fantasy game, rustic medieval village. No voices. A short rising folk phrase on a wooden flute, level up.
game_over: Slavic folk fantasy game, rustic medieval village. No words. A sad descending folk tune on low strings, a creak, and a quiet old witch chuckle at the end.
victory: Slavic folk fantasy game, rustic medieval village. No voices. A short triumphant but playful Slavic folk fanfare on gusli and tambourine.
```

### Музыка

```
music_night: Slow calm Slavic folk ambient for a game, gusli and a soft drone, night inside a wooden cabin, crickets and a crackling stove, melancholic and cozy, no vocals, seamless loop, 2 minutes.
music_day: Upbeat tense Slavic folk battle music for a game, tambourine and balalaika, driving rhythm, slightly humorous, no vocals, seamless loop, 90 seconds.
```

## Сводка

**34 звука + 2 мелодии = 36 файлов.** Можно добавлять постепенно: без файла звук просто не играет.

Если генерировать по частям, вот порядок по важности для ощущений:
1. `hit_enemy`, `hit_hero`, `block`, `heal`, `enemy_death`, `ui_click` — звучат постоянно.
2. `music_night`, `music_day`.
3. `item_pickup`, `item_place`, `item_invalid`, `shop_buy`, `contract_accept`, `monster_arrive`.
4. Всё остальное.

Громкость — общая и для каждого звука отдельно — в `src/config/volume.ts`. Лимит одновременных копий и плавность смены музыки — в `src/config/audio.ts` (`AUDIO`).
