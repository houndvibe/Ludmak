// Убирает из production-сборки исходные PNG, для которых есть WebP, и заведомо неиспользуемые файлы.
// Исходники в public/assets не удаляются.
import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const root = 'dist';
const unused = new Set([
  'assets/backgrounds/home_sketch_3.png',
  'assets/ui/home_window_mask.png',
  'assets/ui/menu/logo.png',
  'assets/ui/menu/seal_shards.png',
]);
let removed = 0;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const rel = path.replaceAll('\\', '/').replace(/^dist\//, '');
    if (statSync(path).isDirectory()) {
      walk(path);
      continue;
    }
    const hasWebp = path.endsWith('.png') && existsSync(path.slice(0, -4) + '.webp');
    if (hasWebp || unused.has(rel) || entry === '.DS_Store') {
      removed += statSync(path).size;
      unlinkSync(path);
    }
  }
}

if (existsSync(root)) walk(root);
console.log(`dist cleanup: removed ${(removed / 1048576).toFixed(2)} MiB of unused files`);
