// Обучение: всё, кроме нужного элемента, затемнено и не нажимается; на элемент показывает стрелка, рядом — попап.
// Шаги и тексты — src/data/tutorial.ts (TUTORIAL_STEPS), строго по порядку; номер шага — run.tutorialStep.
// Каждая сцена в create() вызывает tutorialAttach(scene, resolve): resolve(шаг) отвечает, где на экране нужный элемент
// (прямоугольник), что шаг здесь не нужен ('skip') или что элемента пока нет (null — например, монстр ещё не подошёл).
// У шага с перетаскиванием может быть второе окно drop — куда тащить: оно тоже не затемнено и обведено рамкой.
// Когда нужное действие сделано — tutorialDone(scene, шаг). Если состояние сцены поменялось — tutorialRefresh(scene).
import * as Phaser from 'phaser';
import { FEEL } from '../config/feel';
import { TUTORIAL_STEPS, type StepDef, type StepId } from '../data/tutorial';
import { run } from '../state';
import { addText, Button, C, H, W } from '../ui';

export type Rect = { x: number; y: number; w: number; h: number };
/** Нужный элемент; drop — куда его перетащить (второе светлое окно). */
export type TargetRect = Rect & { drop?: Rect };
export type StepTarget = TargetRect | 'skip' | null;

const F = FEEL.tutorial;

/** Затемнение с «окном» над элементом, рамка, стрелка и попап одного шага. */
class Overlay {
  readonly cont: Phaser.GameObjects.Container;

  constructor(
    scene: Phaser.Scene,
    readonly step: StepDef,
    target: TargetRect,
    onOk: () => void,
  ) {
    const pad = (r: Rect) => clampRect({ x: r.x - F.holePad, y: r.y - F.holePad, w: r.w + 2 * F.holePad, h: r.h + 2 * F.holePad });
    const hole = pad(target);
    const holes = target.drop ? [hole, pad(target.drop)] : [hole];
    this.cont = scene.add.container(0, 0).setDepth(2000).setAlpha(0);

    // Тёмные прямоугольники вокруг окон: они ловят клики и наведение, поэтому всё вне окон заблокировано.
    for (const r of darkRects(holes)) {
      this.cont.add(scene.add.rectangle(r.x, r.y, r.w, r.h, 0x000000, F.dimAlpha).setOrigin(0).setInteractive());
    }
    // Пояснение: окно тоже не нажимается — только «Понятно».
    if (!step.action) this.cont.add(scene.add.rectangle(hole.x, hole.y, hole.w, hole.h, 0xffffff, 0.001).setOrigin(0).setInteractive());
    for (const h of holes) this.cont.add(scene.add.rectangle(h.x, h.y, h.w, h.h).setOrigin(0).setStrokeStyle(F.frameWidth, F.frameColor));

    // Попап с текстом (у пояснений — кнопка «Понятно»). Нет места на обычной ширине — попап уже (текст в больше строк).
    const text = addText(scene, 0, 0, step.text, F.fontSize, C.text, { lineSpacing: 4 });
    const btnH = step.action ? 0 : 60;
    let pw = F.popupW;
    let ph = 0;
    let place: ReturnType<typeof placePopup> = null;
    for (const w of [F.popupW, ...F.popupNarrowW]) {
      pw = w;
      text.setWordWrapWidth(pw - 2 * F.popupPad);
      ph = F.popupPad * 2 + text.height + (btnH ? btnH + F.popupPad : 0);
      place = placePopup(hole, pw, ph, holes.slice(1));
      if (place) break;
    }
    if (!place) {
      // Нигде не влез — по центру экрана, без стрелки.
      pw = F.popupW;
      text.setWordWrapWidth(pw - 2 * F.popupPad);
      ph = F.popupPad * 2 + text.height + (btnH ? btnH + F.popupPad : 0);
      const p = { x: (W - pw) / 2, y: (H - ph) / 2 };
      place = { ...p, side: null, tail: p, tip: p };
    }
    const popup = scene.add.container(place.x, place.y);
    popup.add(scene.add.rectangle(0, 0, pw, ph, 0x15121b, 0.97).setOrigin(0).setStrokeStyle(3, F.frameColor));
    text.setPosition(F.popupPad, F.popupPad);
    popup.add(text);
    if (!step.action) popup.add(new Button(scene, pw / 2, ph - F.popupPad - btnH / 2, 220, btnH, 'Понятно', onOk, 26));
    this.cont.add(popup);

    // Стрелка от попапа к окну; «кивает» в сторону элемента.
    if (place.side) {
      const arrow = drawArrow(scene, place.tail, place.tip);
      this.cont.add(arrow);
      const len = Math.hypot(place.tip.x - place.tail.x, place.tip.y - place.tail.y) || 1;
      const dx = ((place.tip.x - place.tail.x) / len) * F.arrowBob;
      const dy = ((place.tip.y - place.tail.y) / len) * F.arrowBob;
      scene.tweens.add({ targets: arrow, x: dx, y: dy, duration: F.arrowBobMs, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    scene.tweens.add({ targets: this.cont, alpha: 1, duration: F.fadeMs });
  }

  destroy(): void {
    this.cont.destroy();
  }
}

/** Прямоугольник в пределах экрана. */
function clampRect(r: Rect): Rect {
  const x = Math.max(0, r.x);
  const y = Math.max(0, r.y);
  return { x, y, w: Math.min(W, r.x + r.w) - x, h: Math.min(H, r.y + r.h) - y };
}

/** Экран минус окна — набор тёмных прямоугольников (полосы по вертикальным столбцам между краями окон). */
function darkRects(holes: Rect[]): Rect[] {
  const xs = [...new Set([0, W, ...holes.flatMap((h) => [h.x, h.x + h.w])])].sort((a, b) => a - b);
  const out: Rect[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i];
    const x1 = xs[i + 1];
    if (x1 <= x0) continue;
    const cover = holes.filter((h) => h.x <= x0 && h.x + h.w >= x1).sort((a, b) => a.y - b.y);
    let y = 0;
    for (const h of cover) {
      if (h.y > y) out.push({ x: x0, y, w: x1 - x0, h: h.y - y });
      y = Math.max(y, h.y + h.h);
    }
    if (y < H) out.push({ x: x0, y, w: x1 - x0, h: H - y });
  }
  return out;
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

type Point = { x: number; y: number };

/**
 * Где поставить попап: под элементом, над ним, справа или слева — где влезает и не закрывает окна avoid.
 * Не влезает нигде — null. tail — начало стрелки у попапа, tip — остриё у элемента.
 */
function placePopup(hole: Rect, pw: number, ph: number, avoid: Rect[] = []): { x: number; y: number; side: string | null; tail: Point; tip: Point } | null {
  const m = 10;
  const cx = hole.x + hole.w / 2;
  const cy = hole.y + hole.h / 2;
  const clampX = (x: number) => Phaser.Math.Clamp(x, m, W - pw - m);
  const clampY = (y: number) => Phaser.Math.Clamp(y, m, H - ph - m);
  /** Точка стрелки на общем отрезке двух диапазонов (попап и окно), ближе к центру окна. */
  const shared = (a0: number, a1: number, b0: number, b1: number, c: number) => {
    const lo = Math.max(a0, b0) + 20;
    const hi = Math.min(a1, b1) - 20;
    return lo <= hi ? Phaser.Math.Clamp(c, lo, hi) : c;
  };
  const free = (x: number, y: number) => !avoid.some((a) => overlaps(a, { x, y, w: pw, h: ph }));
  if (hole.y + hole.h + F.gap + ph <= H - m) {
    const x = clampX(cx - pw / 2);
    const y = hole.y + hole.h + F.gap;
    const ax = shared(x, x + pw, hole.x, hole.x + hole.w, cx);
    if (free(x, y)) return { x, y, side: 'below', tail: { x: ax, y: y - 8 }, tip: { x: ax, y: hole.y + hole.h + 8 } };
  }
  if (hole.y - F.gap - ph >= m) {
    const x = clampX(cx - pw / 2);
    const y = hole.y - F.gap - ph;
    const ax = shared(x, x + pw, hole.x, hole.x + hole.w, cx);
    if (free(x, y)) return { x, y, side: 'above', tail: { x: ax, y: y + ph + 8 }, tip: { x: ax, y: hole.y - 8 } };
  }
  if (hole.x + hole.w + F.gap + pw <= W - m) {
    const x = hole.x + hole.w + F.gap;
    const y = clampY(cy - ph / 2);
    const ay = shared(y, y + ph, hole.y, hole.y + hole.h, cy);
    if (free(x, y)) return { x, y, side: 'right', tail: { x: x - 8, y: ay }, tip: { x: hole.x + hole.w + 8, y: ay } };
  }
  if (hole.x - F.gap - pw >= m) {
    const x = hole.x - F.gap - pw;
    const y = clampY(cy - ph / 2);
    const ay = shared(y, y + ph, hole.y, hole.y + hole.h, cy);
    if (free(x, y)) return { x, y, side: 'left', tail: { x: x + pw + 8, y: ay }, tip: { x: hole.x - 8, y: ay } };
  }
  return null;
}

/** Толстая стрелка от tail к tip с наконечником. */
function drawArrow(scene: Phaser.Scene, tail: Point, tip: Point): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const ang = Math.atan2(tip.y - tail.y, tip.x - tail.x);
  const head = F.arrowWidth * 2.6;
  const base = { x: tip.x - Math.cos(ang) * head, y: tip.y - Math.sin(ang) * head };
  g.lineStyle(F.arrowWidth, F.frameColor, 1).lineBetween(tail.x, tail.y, base.x, base.y);
  const side = (a: number) => ({ x: base.x + Math.cos(a) * head * 0.6, y: base.y + Math.sin(a) * head * 0.6 });
  const l = side(ang + Math.PI / 2);
  const r = side(ang - Math.PI / 2);
  g.fillStyle(F.frameColor, 1).fillTriangle(tip.x, tip.y, l.x, l.y, r.x, r.y);
  return g;
}

// ─── Управление шагами ───────────────────────────────────────────────────────

type Entry = { resolve: (id: StepId) => StepTarget; overlay: Overlay | null };
const scenes = new Map<Phaser.Scene, Entry>();

/** Текущий шаг обучения (null — обучения нет или шаги кончились). */
function currentStep(): StepDef | null {
  if (!run.tutorial) return null;
  return TUTORIAL_STEPS[run.tutorialStep] ?? null;
}

/** Подключить сцену к обучению (в create): показать текущий шаг, если он в этой сцене. */
export function tutorialAttach(scene: Phaser.Scene, resolve: (id: StepId) => StepTarget): void {
  scenes.set(scene, { resolve, overlay: null });
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scenes.get(scene)?.overlay?.destroy();
    scenes.delete(scene);
  });
  tutorialRefresh(scene);
}

/** Состояние сцены поменялось (монстр подошёл, очередь закрылась): показать текущий шаг, если для него всё готово. */
export function tutorialRefresh(scene: Phaser.Scene): void {
  const entry = scenes.get(scene);
  if (!entry) return;
  for (;;) {
    const step = currentStep();
    const target = step && step.scene === scene.scene.key ? entry.resolve(step.id) : null;
    if (step && target === 'skip') {
      run.tutorialStep++; // шаг здесь не нужен (нет огня, нет активного предмета)
      continue;
    }
    if (!step || !target || target === 'skip') {
      entry.overlay?.destroy();
      entry.overlay = null;
      return;
    }
    if (entry.overlay?.step.id === step.id) return; // уже показан
    entry.overlay?.destroy();
    entry.overlay = new Overlay(scene, step, target, () => tutorialDone(scene, step.id));
    return;
  }
}

/** Нужное действие сделано: шаг закрывается, следующий показывается, если он в этой же сцене. */
export function tutorialDone(scene: Phaser.Scene, id: StepId): void {
  if (currentStep()?.id !== id) return;
  run.tutorialStep++;
  const entry = scenes.get(scene);
  if (entry) {
    entry.overlay?.destroy();
    entry.overlay = null;
  }
  tutorialRefresh(scene);
}

/** Сейчас на экране шаг обучения (бой стоит на паузе). */
export function tutorialBlocking(scene: Phaser.Scene): boolean {
  return !!scenes.get(scene)?.overlay;
}

/** Текущий шаг — этот (чтобы сцена знала, что засчитывать). */
export function tutorialStepIs(id: StepId): boolean {
  return currentStep()?.id === id;
}
