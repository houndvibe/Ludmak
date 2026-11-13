// Звуки и музыка. Ключи и громкость — src/config/audio.ts. Файлы грузит Boot; если файла нет, звук молча пропускается.
// Звуковой менеджер Phaser общий на всю игру, поэтому звуки и музыка переживают смену сцен.
import * as Phaser from 'phaser';
import { AUDIO, type MusicKey, type SoundKey } from '../config/audio';
import { MUSIC_MASTER, MUSIC_VOLUME, SFX_MASTER, SOUND_VOLUME } from '../config/volume';

/** Звучащие сейчас копии каждого звука — чтобы одинаковый звук не накладывался сам на себя. */
const playing = new Map<SoundKey, Set<Phaser.Sound.BaseSound>>();

/** Сколько раз сыграл каждый звук — для отладки из консоли (import('/src/components/Sound.ts')). */
export const audioDebug = { played: {} as Partial<Record<SoundKey, number>> };

/** Сыграть звук. Нет файла — тишина. Уже звучит AUDIO.maxCopies копий — новая пропускается. */
export function sfx(scene: Phaser.Scene, key: SoundKey): void {
  if (!scene.cache.audio.exists(key)) return;
  const set = playing.get(key) ?? new Set();
  playing.set(key, set);
  if (set.size >= AUDIO.maxCopies) return;
  const volume = SFX_MASTER * SOUND_VOLUME[key];
  const s = scene.sound.add(key, { volume });
  set.add(s);
  const end = () => {
    set.delete(s);
    s.destroy();
  };
  s.once(Phaser.Sound.Events.COMPLETE, end);
  if (!s.play()) return end();
  fadeOutAtEnd(scene, s, volume);
  audioDebug.played[key] = (audioDebug.played[key] ?? 0) + 1;
}

/**
 * Плавное затухание в последние AUDIO.sfxFadeOutMs звука, по часам аудиодвижка — точно по сэмплам.
 * Работает в Web Audio (обычный случай); в запасном HTML5-режиме звук играет без затухания.
 */
function fadeOutAtEnd(scene: Phaser.Scene, s: Phaser.Sound.BaseSound, volume: number): void {
  const ctx = (scene.sound as Phaser.Sound.WebAudioSoundManager).context as AudioContext | undefined;
  const node = (s as unknown as { volumeNode?: GainNode }).volumeNode;
  const duration = s.duration;
  if (!ctx || !node || !(duration > 0) || AUDIO.sfxFadeOutMs <= 0) return;
  const fade = Math.min(AUDIO.sfxFadeOutMs / 1000, duration / 2);
  const end = ctx.currentTime + duration;
  node.gain.setValueAtTime(volume, end - fade);
  node.gain.linearRampToValueAtTime(0, end);
}

// ─── Музыка ──────────────────────────────────────────────────────────────────

let musicKey: MusicKey | null = null;
let musicSound: Phaser.Sound.BaseSound | null = null;

/** Плавно меняет громкость. Не зависит от сцен: смена сцены не обрывает затухание. */
function fadeVolume(s: Phaser.Sound.BaseSound, to: number, ms: number, done?: () => void): void {
  const snd = s as Phaser.Sound.WebAudioSound;
  const from = snd.volume;
  const start = performance.now();
  const id = window.setInterval(() => {
    const t = Math.min(1, (performance.now() - start) / Math.max(1, ms));
    snd.volume = from + (to - from) * t;
    if (t >= 1) {
      window.clearInterval(id);
      done?.();
    }
  }, 30);
}

/** Музыка по кругу с плавной сменой. Та же музыка уже играет — ничего не меняется. Нет файла — тишина. */
export function playMusic(scene: Phaser.Scene, key: MusicKey): void {
  if (musicKey === key) return;
  musicKey = key;
  const old = musicSound;
  musicSound = null;
  if (old) fadeVolume(old, 0, AUDIO.musicFadeMs, () => old.destroy());
  if (!scene.cache.audio.exists(key)) return;
  const manager = scene.sound;
  const start = () => {
    if (musicKey !== key || musicSound) return;
    const m = manager.add(key, { loop: true, volume: 0 });
    m.play();
    musicSound = m;
    fadeVolume(m, MUSIC_MASTER * MUSIC_VOLUME[key], AUDIO.musicFadeMs);
  };
  // Браузер разрешает звук только после первого действия игрока.
  if (manager.locked) manager.once(Phaser.Sound.Events.UNLOCKED, start);
  else start();
}

// ─── Без звука и общая громкость игрока ──────────────────────────────────────

const MUTE_KEY = 'ludmak.muted';
const VOLUME_KEY = 'ludmak.volume';

/**
 * Громкость с ползунка храним сами: пока браузер не разрешил звук, Phaser отдаёт старое значение громкости
 * (новое применится, когда аудио заработает).
 */
let playerVolume = 1;

/**
 * Восстановить «Без звука» и громкость с ползунка из прошлой сессии.
 * Хранилище может быть недоступно — тогда звук включён на полную громкость.
 */
export function restoreMute(game: Phaser.Game): void {
  try {
    // Кнопки «Без звука» в шапке больше нет — заглушённый в прошлой сессии звук не восстанавливаем (иначе не включить).
    game.sound.mute = false;
    window.localStorage.removeItem(MUTE_KEY);
    const v = window.localStorage.getItem(VOLUME_KEY);
    if (v !== null && Number.isFinite(Number(v))) playerVolume = Phaser.Math.Clamp(Number(v), 0, 1);
  } catch {
    // нет хранилища — значения по умолчанию
  }
  game.sound.volume = playerVolume;
}

/** Громкость с ползунка (0..1): общий множитель поверх src/config/volume.ts, для звуков и музыки сразу. */
export function getVolume(): number {
  return playerVolume;
}

export function setVolume(scene: Phaser.Scene, v: number): void {
  playerVolume = Phaser.Math.Clamp(v, 0, 1);
  scene.sound.volume = playerVolume;
  try {
    window.localStorage.setItem(VOLUME_KEY, String(playerVolume));
  } catch {
    // нет хранилища — запомнится до перезагрузки
  }
}

export function isMuted(scene: Phaser.Scene): boolean {
  return scene.sound.mute;
}

/** Переключить «Без звука» (музыка и звуки вместе). Возвращает новое состояние. */
export function toggleMute(scene: Phaser.Scene): boolean {
  scene.sound.mute = !scene.sound.mute;
  try {
    window.localStorage.setItem(MUTE_KEY, scene.sound.mute ? '1' : '0');
  } catch {
    // нет хранилища — запомнится до перезагрузки
  }
  return scene.sound.mute;
}
