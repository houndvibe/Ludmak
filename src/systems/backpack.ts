// Логика сеток: маска, формы с поворотом, проверка размещения.
// Общая для рюкзака героя и сумок врагов.
import { BACKPACK_MASK } from '../config/balance';
import { ITEMS, type ItemId } from '../data/items';

/** Положение предмета на сетке. */
export interface Placement {
  uid: number;
  /** true — лежит в сетке; false — вне сумок (только у героя). */
  inGrid: boolean;
  /** Левая верхняя клетка, если inGrid. */
  col: number;
  row: number;
  /** Повёрнут на 90°: ширина и высота меняются местами. */
  rotated: boolean;
}

export interface OwnedItem extends Placement {
  id: ItemId;
  /** Оставшиеся заряды активного предмета. Кончились — предмет исчезает навсегда. */
  charges?: number;
  /** Уровень после слияния: 1 (по умолчанию), 2 или 3. */
  star?: number;
}

/** Клетки, которые занимает предмет на сетке. */
export function cellsOf(p: { col: number; row: number }, w: number, h: number): [number, number][] {
  const out: [number, number][] = [];
  for (let r = p.row; r < p.row + h; r++) for (let c = p.col; c < p.col + w; c++) out.push([c, r]);
  return out;
}

export interface Mask {
  cols: number;
  rows: number;
  /** open[row][col] — есть ли клетка. */
  open: boolean[][];
}

/** Маска из строк: X — клетка, . — пусто. */
export function parseMask(lines: string[]): Mask {
  const rows = lines.length;
  const cols = Math.max(...lines.map((l) => l.length));
  const open = lines.map((l) => Array.from({ length: cols }, (_, c) => l[c] === 'X'));
  return { cols, rows, open };
}

/** Прямоугольная маска cols×rows без дыр (сумки врагов). */
export function rectMask(cols: number, rows: number): Mask {
  return { cols, rows, open: Array.from({ length: rows }, () => Array<boolean>(cols).fill(true)) };
}

export const MASK = parseMask(BACKPACK_MASK);

/** Занимаемый размер с учётом поворота. */
export function rotatedSize(w: number, h: number, rotated: boolean): { w: number; h: number } {
  return rotated ? { w: h, h: w } : { w, h };
}

export function footprint(id: ItemId, rotated: boolean): { w: number; h: number } {
  return rotatedSize(ITEMS[id].w, ITEMS[id].h, rotated);
}

/** Прямоугольник w×h в (col,row) целиком на открытых клетках и не пересекает занятые прямоугольники. */
export function fits(
  mask: Mask,
  occupied: { col: number; row: number; w: number; h: number }[],
  w: number,
  h: number,
  col: number,
  row: number,
): boolean {
  for (let r = row; r < row + h; r++) {
    for (let c = col; c < col + w; c++) {
      if (r < 0 || c < 0 || r >= mask.rows || c >= mask.cols || !mask.open[r][c]) return false;
    }
  }
  return occupied.every((o) => !(col < o.col + o.w && o.col < col + w && row < o.row + o.h && o.row < row + h));
}

/** Помещается ли предмет героя в (col,row) рюкзака. */
export function canPlace(
  items: OwnedItem[],
  id: ItemId,
  rotated: boolean,
  col: number,
  row: number,
  ignoreUid = -1,
): boolean {
  const f = footprint(id, rotated);
  const occupied = items
    .filter((o) => o.inGrid && o.uid !== ignoreUid)
    .map((o) => ({ col: o.col, row: o.row, ...footprint(o.id, o.rotated) }));
  return fits(MASK, occupied, f.w, f.h, col, row);
}

/** Первое свободное место (сначала без поворота). null — некуда. */
export function findSpot(items: OwnedItem[], id: ItemId): { col: number; row: number; rotated: boolean } | null {
  for (const rotated of [false, true]) {
    for (let row = 0; row < MASK.rows; row++) {
      for (let col = 0; col < MASK.cols; col++) {
        if (canPlace(items, id, rotated, col, row)) return { col, row, rotated };
      }
    }
  }
  return null;
}
