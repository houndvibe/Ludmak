// Заказчики и их условия. Числа условий (множители награды и неустойки, двойной удар) — в src/config/balance.ts.
// Условие действует только в бою с врагами своего заказа; при переходе к врагам другого заказа оно снимается.
import { CLIENT_PENALTY_MULT, CLIENT_REWARD_MULT, GHOST_FIRST_HIT_MULT, PARRY_REWARD_MULT, PARRY_REWARD_SHARE } from '../config/balance';
import type { ModifierId } from './modifiers';
import type { Selector } from './synergies';

export type ClientId = 'vodyanoy' | 'kikimora' | 'leshy' | 'upyr' | 'prizrak' | 'gul' | 'headless';

export interface ClientCondition {
  /** Название условия: «Лес не жечь». */
  title: string;
  /** Предметы героя, которые не работают в бою с врагами этого заказа (как отключённые соседством). */
  ban?: Selector[];
  /** Как запрет звучит на карточке: «предметы с Огнём не работают». */
  banText?: string;
  /** Первый удар героя по каждому врагу заказа — × GHOST_FIRST_HIT_MULT. */
  firstHitBonus?: boolean;
  /** Пока заказ не выполнен, на привале нельзя отступить. */
  noRetreat?: boolean;
  /** Аванс: награда выплачивается сразу при принятии заказа; провал — аванс возвращается и неустойка (CLIENT_PENALTY_MULT). */
  advance?: boolean;
  /** Отбил не меньше PARRY_REWARD_SHARE атак врагов заказа — награда × PARRY_REWARD_MULT. */
  parryReward?: boolean;
}

/**
 * Заказ (квест) заказчика: реплика у окошка и модификаторы врагов, подходящие к истории. Модификатор выпадает
 * с обычным шансом ночи (MODIFIER_CHANCE_BY_NIGHT), но берётся из mods квеста. За забег квест не повторяется:
 * заказчик приходит не чаще раза за ночь, поэтому квестов у каждого — столько же, сколько ночей (5).
 */
export interface ClientQuest {
  line: string;
  mods: ModifierId[];
}

export interface ClientDef {
  id: ClientId;
  name: string;
  /** Родительный падеж для плашки в бою: «Заказ лешего». */
  genitive: string;
  /** Квесты: реплика на карточке заказа и модификаторы врагов. Первый — и для обучающей ночи. */
  quests: ClientQuest[];
  condition: ClientCondition;
}

export const CLIENTS: Record<ClientId, ClientDef> = {
  vodyanoy: {
    id: 'vodyanoy',
    name: 'Водяной',
    genitive: 'водяного',
    quests: [
      { line: 'Мельницу на моей запруде ставят. Колесом воду мутят, рыбу пугают. Разберись.', mods: ['drunk'] },
      { line: 'Бабы бельё в моём омуте полощут, вальками стучат — голова гудит. Уйми их. Плачу по совести, то есть мало.', mods: ['lightSleeper'] },
      { line: 'Рыбаки сети поперёк реки поставили, мои русалки путаются. Люди тёртые, своё дело знают. Цену не набавлю.', mods: ['veteran'] },
      { line: 'Плотину ставят. Солдат пригнали, все в железе. Плачу как за обычных — торговаться не буду, сам знаешь.', mods: ['chainmail'] },
      { line: 'Поп реку освятить надумал. Мне — в моей же воде — святая? Отвадь. И не проси вперёд, не дам.', mods: ['pious'] },
    ],
    condition: { title: 'Торгуется жёстко' },
  },
  kikimora: {
    id: 'kikimora',
    name: 'Кикимора',
    genitive: 'кикиморы',
    quests: [
      { line: 'Деньги вперёд, мне не жалко. Только не подведи: соседи мне печь заложили.', mods: ['torchbearer'] },
      { line: 'Хозяйка за печкой крестиков навесила. Держи монеты сразу — к утру чтоб ни одного креста.', mods: ['pious'] },
      { line: 'Мужики третий день гуляют, пляшут прямо над моим подпольем. Вот задаток. Протрезви их… навсегда.', mods: ['drunk'] },
      { line: 'Кота завели — здоровенного, драного. И хозяин под стать: в каждой драке бывал. Плачу вперёд, не обмани.', mods: ['veteran'] },
      { line: 'Новые жильцы спят чутко: шорох — и сразу за кочергу. Бери деньги, только сделай тихо.', mods: ['lightSleeper'] },
    ],
    condition: { title: 'Ростовщица', advance: true },
  },
  leshy: {
    id: 'leshy',
    name: 'Леший',
    genitive: 'лешего',
    quests: [
      { line: 'Грибники совсем распоясались. Тропы топчут, костры жгут. Уйми.', mods: ['torchbearer'] },
      { line: 'Лесорубы мои дубы валят, на каждом пне по чарке пьют. Гони их. Только без огня.', mods: ['drunk'] },
      { line: 'Охотники капканов наставили. Старые, битые, каждую тропу знают лучше меня. Проучи.', mods: ['veteran'] },
      { line: 'Монахи на моей поляне часовню ставят. Звонят, кадят — лес задыхается.', mods: ['pious'] },
      { line: 'Барин дорогу через бор тянет, стража при нём в кольчугах. Огнём не трожь — мой лес.', mods: ['chainmail'] },
    ],
    condition: { title: 'Лес не жечь', ban: [{ tag: 'fire' }], banText: 'предметы с Огнём не работают' },
  },
  upyr: {
    id: 'upyr',
    name: 'Упырь',
    genitive: 'упыря',
    quests: [
      { line: 'Чеснок на всех окнах. Третью неделю голодаю. Вот они, чесночники.', mods: ['pious'] },
      { line: 'Сторож на погосте спит вполглаза: чуть шевельнусь — бьёт в колотушку. Не торопись, сделай как следует.', mods: ['lightSleeper'] },
      { line: 'Корчмарь всю деревню споил. Кровь у всех кислая, сивушная. Разберись — а я подожду, мне спешить некуда.', mods: ['drunk'] },
      { line: 'Осиновых кольев настрогали, по ночам с факелами ходят. Я посижу в гробу, а ты не спеши.', mods: ['torchbearer'] },
      { line: 'Отставные солдаты в деревне осели. Жилистые, кровь как дёготь. Мне бы соседей помоложе.', mods: ['veteran'] },
    ],
    condition: { title: 'Без спешки', ban: [{ item: 'silver_horseshoe' }], banText: 'серебряная подкова не работает', noRetreat: true },
  },
  prizrak: {
    id: 'prizrak',
    name: 'Призрак',
    genitive: 'призрака',
    quests: [
      { line: 'В моём доме теперь живут. Ремонт затеяли… Мне бы тишины.', mods: ['lightSleeper'] },
      { line: 'Наследники приехали дом делить. Орут, бьют посуду, пьют за упокой — мой, между прочим. Тишины хочу.', mods: ['drunk'] },
      { line: 'Батюшку позвали меня изгонять. Ходит, кадит, бормочет. Пусть сам уйдёт — и потише.', mods: ['pious'] },
      { line: 'Жильцы на ночь свечи не гасят — боятся. Свет в каждом углу, мне и спрятаться негде.', mods: ['torchbearer'] },
      { line: 'Новый хозяин — старый вояка. Спит с саблей, от скрипа половицы вскакивает. А я весь — один скрип.', mods: ['veteran'] },
    ],
    condition: {
      title: 'Чтобы никто не услышал',
      ban: [{ tag: 'noisy' }],
      banText: 'шумные предметы не работают',
      firstHitBonus: true,
    },
  },
  gul: {
    id: 'gul',
    name: 'Гуль',
    genitive: 'гуля',
    quests: [
      { line: 'Кладбище огородили, сторожа наняли. Ни поесть, ни полежать.', mods: ['chainmail'] },
      { line: 'Могильщики прямо на погосте пьют: закопают — и сразу поминки. Мне ничего не достаётся.', mods: ['drunk'] },
      { line: 'Монахи всех покойников отпевают да солью посыпают. Невкусно. Совсем невкусно.', mods: ['pious'] },
      { line: 'У ворот всю ночь костёр жгут, караулят. Я свежего хочу, а не копчёного.', mods: ['torchbearer'] },
      { line: 'Старый гробовщик каждую ночь ловушки ставит. Сорок лет на кладбище — хитрый. Принеси его целым.', mods: ['veteran'] },
    ],
    condition: { title: 'Мне нужны целые тела', ban: [{ item: 'bomb_grom' }], banText: 'бомбы не работают' },
  },
  headless: {
    id: 'headless',
    name: 'Безголовый',
    genitive: 'безголового',
    quests: [
      { line: 'Эй, хозяин! Ниже смотри, ниже… Да, в окошке меня плохо видно — головы-то нет. Затем и пришёл.', mods: ['veteran'] },
      { line: 'Чего? Громче говори — ушей-то нет. ГОВОРЮ: стражники мою голову на пике у ворот держат!', mods: ['chainmail'] },
      { line: 'Шапку мне продали. Хорошую, с мехом. Носить не на что, а деньги купцы пропивают. Обидно.', mods: ['drunk'] },
      { line: 'Палач, что меня укоротил, в церкви за меня свечку ставит. Издевается. Пусть помолится как следует.', mods: ['pious'] },
      { line: 'Слышь… ну, то есть, слушай: моя голова у кого-то в сарае. Глазеет, хозяева спать перестали. Тихо там разберись.', mods: ['lightSleeper'] },
    ],
    condition: { title: 'Принеси мне их голову', parryReward: true },
  },
};

export const CLIENT_IDS = Object.keys(CLIENTS) as ClientId[];

const times = (x: number) => `×${String(x).replace('.', ',')}`;

/** Что условие делает, одной строкой: «Огонь в бою не работает». Числа берутся из balance.ts. */
export function conditionEffect(id: ClientId): string {
  const c = CLIENTS[id].condition;
  const parts: string[] = [];
  if (c.banText) parts.push(c.banText);
  if (c.firstHitBonus) parts.push(`первый удар по каждому врагу ${times(GHOST_FIRST_HIT_MULT)}`);
  if (c.noRetreat) parts.push('отступить нельзя, пока заказ не выполнен');
  if (c.advance) parts.push('награда сразу, авансом; провал — вернуть аванс');
  if (c.parryReward) parts.push(`отбей ${Math.round(PARRY_REWARD_SHARE * 100)}% атак и больше — награда ${times(PARRY_REWARD_MULT)}`);
  const reward = CLIENT_REWARD_MULT[id];
  const penalty = CLIENT_PENALTY_MULT[id];
  if (reward) parts.push(`награда ${times(reward)}`);
  if (penalty) parts.push(`неустойка ${times(penalty)}`);
  return parts.join(', ');
}
