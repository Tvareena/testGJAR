// Fixed game vocabulary. The order of COLORS is the bit order used by matching (red = bit 0 ... white = bit 5).
export const COLORS = ['red', 'blue', 'yellow', 'green', 'violet', 'white'];
export const SHAPES = ['pebble', 'stick', 'cylinder', 'ring', 'shard'];
export const SEGMENT_OPTIONS = [4, 6, 8, 12];
export const HINT_LEVELS = ['full', 'colors', 'partial', 'none'];

/**
 * Parse a crystal type string such as "red-pebble".
 * @param {unknown} s
 * @returns {{color: string, shape: string} | null}
 */
export function parseCrystalType(s) {
  if (typeof s !== 'string') return null;
  const i = s.indexOf('-');
  if (i < 0) return null;
  const color = s.slice(0, i);
  const shape = s.slice(i + 1);
  if (!COLORS.includes(color) || !SHAPES.includes(shape)) return null;
  return { color, shape };
}
