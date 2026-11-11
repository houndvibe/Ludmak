// Случайность без Phaser — чтобы логику заказов и боя можно было гонять в симуляции (npm run sim).

/** Генератор чисел 0..1. В игре — Math.random, в симуляции можно подставить свой. */
export type Rng = () => number;

export const randInt = (rng: Rng, min: number, max: number): number => min + Math.floor(rng() * (max - min + 1));

export const randReal = (rng: Rng, min: number, max: number): number => min + rng() * (max - min);

export const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)];

export function shuffle<T>(rng: Rng, list: readonly T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
