import { defineConfig } from 'vite';

export default defineConfig({
  // Относительные пути: билд работает из любой папки (itch.io отдаёт игру из подкаталога).
  base: './',
  // Без SPA-фолбэка: отсутствующий PNG в public/assets/ даёт 404, и Boot рисует заглушку.
  appType: 'mpa',
  build: {
    // JS-бандл кладём отдельно от public/assets/, чтобы не смешивать с артом.
    assetsDir: 'bundle',
    chunkSizeWarningLimit: 2000,
  },
});
