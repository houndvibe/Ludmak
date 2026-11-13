// «Оживление» портрета без новых ассетов: картинка натянута на вертикальную ленту точек (Phaser Rope) —
// низ стоит, верх чуть поднимается на вдохе и покачивается; глаза светятся и пульсируют; вокруг летают светлячки.
// Какие портреты оживают и где у них глаза — PORTRAIT_LIFE в config/assets.ts, движение — FEEL.portraitLife.
import * as Phaser from 'phaser';
import { PORTRAIT_LIFE } from '../config/assets';
import { FEEL } from '../config/feel';

export const GLOW_KEY = 'fx_portrait_glow';

/** Мягкое круглое пятно света (рисуется один раз), красится tint'ом. Им же светятся частицы курсора в бою. */
export function ensureGlowTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(GLOW_KEY)) return;
  const s = 64;
  const tex = scene.textures.createCanvas(GLOW_KEY, s, s)!;
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  tex.refresh();
}

type Portrait = Phaser.GameObjects.Image | Phaser.GameObjects.Rope;

/**
 * Портрет шириной width с центром (x, y). Если для картинки есть PORTRAIT_LIFE и игра на WebGL — живой (Rope),
 * иначе обычная картинка. Свечение и светлячки следуют за портретом (его x, y, alpha) и удаляются вместе с ним.
 */
export function addPortrait(
  scene: Phaser.Scene,
  x: number,
  y: number,
  key: string,
  width: number,
  mask: Phaser.Display.Masks.GeometryMask | Phaser.Display.Masks.BitmapMask | null,
): Portrait {
  const life = PORTRAIT_LIFE[key];
  const webgl = scene.game.renderer.type === Phaser.WEBGL;
  if (!life || !webgl || !scene.textures.exists(key)) {
    const img = scene.add.image(x, y, key);
    img.setScale(width / img.width);
    if (mask) img.setMask(mask);
    return img;
  }

  const F = FEEL.portraitLife;
  const frame = scene.textures.getFrame(key);
  const fw = frame.width;
  const fh = frame.height;
  const k = width / fw;
  const n = F.segments;
  // Вертикальная лента: n точек по центру картинки сверху вниз.
  const initial = Array.from({ length: n }, (_, i) => ({ x: 0, y: -fh / 2 + (i * fh) / (n - 1) }));
  const rope = scene.add.rope(x, y, key, undefined, initial, false);
  rope.setScale(k);
  if (mask) rope.setMask(mask);
  // Rope не знает свой размер для displayHeight — задаём, чтобы сцена могла считать от него, как от картинки.
  rope.setSize(fw, fh);

  // Сдвиг ленты в точке v (0 — верх картинки, 1 — низ) в пикселях исходной картинки.
  const offset = (v: number, t: number) => {
    const up = 1 - v;
    const breath = (1 - Math.cos((2 * Math.PI * t) / F.breathMs)) / 2; // 0..1: только вверх, низ на месте
    const sway = Math.sin((2 * Math.PI * t) / F.swayMs);
    return { dx: F.swayPx * sway * up * up, dy: -F.breathAmp * fh * breath * up };
  };

  ensureGlowTexture(scene);
  const extras: Phaser.GameObjects.Image[] = [];
  const glow = (color: number) => {
    const g = scene.add.image(x, y, GLOW_KEY).setTint(color).setBlendMode(Phaser.BlendModes.ADD);
    if (mask) g.setMask(mask);
    g.setDepth(rope.depth);
    extras.push(g);
    return g;
  };
  const eyes = life.eyes.map((e) => ({ ...e, img: glow(life.eyeColor) }));
  // Частицы по PORTRAIT_LIFE.particles: светлячки (поднимаются), капли (падают), туман (клубится снизу),
  // блеск (звёздочки вспыхивают в заданных точках).
  const kind = life.particles ?? 'firefly';
  const M = kind === 'drip' ? F.drips : kind === 'mist' ? F.mist : kind === 'sparkle' ? F.sparkle : F.motes;
  const count = kind === 'sparkle' ? (life.sparkles ?? []).length : (life.particleCount ?? M.count);
  const motes = Array.from({ length: count }, (_, i) => ({
    img: glow(life.moteColor),
    // Блеск — звёздочка из двух вытянутых пятен (второе — поперёк).
    ray: kind === 'sparkle' ? glow(life.moteColor) : null,
    phase: (i / Math.max(1, count)) * M.lifeMs + Math.random() * 500,
    cycle: -1,
    x0: 0,
    y0: 0,
    wobble: Math.random() * Math.PI * 2,
  }));
  const eyeMult = life.eyeStrength ?? 1;
  // Мерцание (призрак): по фигуре сверху вниз проходит светлая волна, остальное чуть притушено.
  const shimmer = life.shimmer ? F.shimmer : null;
  const colors = new Array<number>(n).fill(0xffffff);

  const points = rope.points as Phaser.Types.Math.Vector2Like[];
  const baseY = points.map((p) => p.y);
  const start = scene.time.now;
  const update = () => {
    // Портрет удаляют посреди кадра (анимация ухода): Phaser в этом же кадре ещё раз зовёт подписчиков,
    // хотя отписка уже была. У удалённой ленты нет точек — setColors (мерцание призрака) падал и останавливал игру.
    if (!rope.scene) return;
    // Текущий масштаб: портрет уменьшают при уходе в тень — свет глаз и частицы идут следом.
    const k = rope.scaleX;
    const t = scene.time.now - start;
    for (let i = 0; i < n; i++) {
      const o = offset(i / (n - 1), t);
      points[i].x = o.dx;
      points[i].y = baseY[i] + o.dy;
    }
    rope.dirty = true;
    if (shimmer) {
      const band = ((t % shimmer.periodMs) / shimmer.periodMs) * (1 + 2 * shimmer.width) - shimmer.width;
      for (let i = 0; i < n; i++) {
        const near = Math.max(0, 1 - Math.abs(i / (n - 1) - band) / shimmer.width);
        const v = Math.round(255 * Phaser.Math.Linear(shimmer.dim, 1, near));
        colors[i] = (v << 16) | (v << 8) | Math.min(255, v + 12);
      }
      rope.setColors(colors);
    }
    const a = rope.alpha;
    // Точка на картинке (px исходника) → мир, с тем же сдвигом ленты.
    const at = (x: number, y: number) => {
      const o = offset(y / fh, t);
      return { x: rope.x + (x - fw / 2 + o.dx) * k, y: rope.y + (y - fh / 2 + o.dy) * k };
    };
    // Глаза: свет пульсирует.
    const pulse = (1 - Math.cos((2 * Math.PI * t) / F.eyePulseMs)) / 2;
    for (const e of eyes) {
      const p = at(e.x, e.y);
      e.img
        .setPosition(p.x, p.y)
        .setScale((F.eyeRadius * 2 * k) / 64)
        .setAlpha(a * eyeMult * Phaser.Math.Linear(F.eyeAlpha[0], F.eyeAlpha[1], pulse));
    }
    motes.forEach((m, i) => {
      const cycle = Math.floor((t + m.phase) / M.lifeMs);
      const life01 = ((t + m.phase) % M.lifeMs) / M.lifeMs;
      if (cycle !== m.cycle) {
        // Новый круг — новое место (зона из PORTRAIT_LIFE.dripZone, иначе по ширине картинки).
        m.cycle = cycle;
        const zone = life.dripZone ?? { x: [0.15, 0.85], y: [0.6, 0.6] };
        m.x0 = Phaser.Math.FloatBetween(zone.x[0], zone.x[1]);
        m.y0 = Phaser.Math.FloatBetween(zone.y[0], zone.y[1]);
      }
      if (kind === 'drip') {
        // Капля: висит, набухает и срывается вниз с ускорением.
        const hang = F.drips.hangShare;
        const fall = life01 < hang ? 0 : (life01 - hang) / (1 - hang);
        const p = at(m.x0 * fw, m.y0 * fh);
        const grow = life01 < hang ? 0.5 + (0.5 * life01) / hang : 1;
        m.img
          .setPosition(p.x, p.y + fall * fall * F.drips.fallPx)
          .setScale((F.drips.size * grow) / 64, (F.drips.size * grow * F.drips.stretch) / 64)
          .setAlpha(a * F.drips.alpha * (1 - fall));
      } else if (kind === 'mist') {
        // Туман: большое мягкое пятно поднимается снизу, растёт и тает, сносится вбок.
        const px = (m.x0 - 0.5) * fw * k + Math.sin(life01 * 3 + m.wobble) * F.mist.driftPx;
        const py = (fh / 2) * k * 0.7 - life01 * F.mist.risePx;
        m.img
          .setPosition(rope.x + px, rope.y + py)
          .setScale((F.mist.size * (0.6 + 0.6 * life01)) / 64)
          .setAlpha(a * F.mist.alpha * Math.sin(life01 * Math.PI));
      } else if (kind === 'sparkle') {
        // Блеск: короткая вспышка звёздочкой в начале круга, потом пауза.
        const s = life.sparkles![i];
        const p = at(s.x, s.y);
        const flash = life01 < F.sparkle.flashShare ? Math.sin((life01 / F.sparkle.flashShare) * Math.PI) : 0;
        const len = (F.sparkle.size * flash) / 64;
        const thin = (F.sparkle.size * 0.18 * flash) / 64;
        m.img.setPosition(p.x, p.y).setScale(len, thin).setAlpha(a * flash);
        m.ray!.setPosition(p.x, p.y).setScale(thin, len).setAlpha(a * flash);
      } else {
        // Светлячок: поднимается снизу вверх с покачиванием, появляется и гаснет.
        const px = (m.x0 - 0.5) * fw * k + Math.sin(life01 * 6 + m.wobble) * F.motes.wobblePx;
        const py = (fh / 2) * k * (0.6 - life01 * 1.2);
        m.img
          .setPosition(rope.x + px, rope.y + py)
          .setScale(F.motes.size / 64)
          .setAlpha(a * F.motes.alpha * Math.sin(life01 * Math.PI));
      }
    });
  };
  update();
  scene.events.on(Phaser.Scenes.Events.UPDATE, update);
  rope.once(Phaser.GameObjects.Events.DESTROY, () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, update);
    for (const g of extras) g.destroy();
  });
  // Глубину портрета меняют после создания — свет идёт следом.
  const setDepth = rope.setDepth.bind(rope);
  rope.setDepth = (d: number) => {
    setDepth(d);
    for (const g of extras) g.setDepth(d);
    return rope;
  };
  return rope;
}
