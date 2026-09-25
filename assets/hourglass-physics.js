// Continuous bulb and granular free surface, shared by rendering and simulation.
export const HEIGHT = 0.94;
export const RADIUS = 0.52;
export const NECK = 0.045;
export const DEPTH = 1.0;
export const REPOSE = 0.60; // tan(31 degrees)

export function radiusAt(y) {
  const t = Math.min(1, Math.max(0, Math.abs(y) / 0.73));
  const shoulder = NECK + (RADIUS - NECK) * t * t * (3 - 2 * t);
  // Rounded shoulders lead into the flat ends, as in the logo.
  const cap = Math.max(0, (Math.abs(y) - 0.86) / 0.08);
  return shoulder - 0.055 * cap * cap;
}

// Like real hourglasses, the neck is thick glass around a narrow bore: the
// outer outline keeps the logo's shape, the sand runs through the bore.
export const BORE = 0.010;
export const COLLAR = 0.2; // Half-height of the thickened neck.

export function channelAt(y) {
  const t = Math.min(1, Math.abs(y) / COLLAR);
  return radiusAt(y) - (NECK - BORE) * (1 - t * t * (3 - 2 * t));
}

function radicalInverse(n, base) {
  let value = 0, f = 1 / base;
  while (n > 0) { value += (n % base) * f; n = Math.floor(n / base); f /= base; }
  return value;
}

// Deterministic volume quadrature: no random changes to the visible level.
export function createBulbSamples(count = 1536) {
  const points = [];
  let volume = 0;
  for (let i = 0; i < count; i++) {
    const y = HEIGHT * (i + 0.5) / count;
    const radius = radiusAt(y);
    const r = radius * Math.sqrt(radicalInverse(i + 1, 2));
    const a = 2 * Math.PI * radicalInverse(i + 1, 3);
    const weight = Math.PI * radius * radius * DEPTH * HEIGHT / count;
    points.push({ x: r * Math.cos(a), y, z: r * Math.sin(a) * DEPTH, weight });
    volume += weight;
  }
  return { points, volume };
}

export function surfacePotential(x, y, z, up, slope) {
  const h = x * up.x + y * up.y + z * up.z;
  const radial = Math.sqrt(Math.max(0, x*x + y*y + z*z - h*h) + 0.0009);
  return h + slope * radial;
}

export function solveLevel(samples, sign, volume, up, slope, scratch) {
  if (volume <= 1e-8) return -2;
  const points = samples.points;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    scratch[i] = surfacePotential(p.x, sign * p.y, p.z, up, slope);
  }
  let lo = -1.6, hi = 1.6;
  for (let step = 0; step < 15; step++) {
    const level = (lo + hi) * 0.5;
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
      // Integrating a small continuous kernel prevents sample-sized level jumps.
      const cover = Math.min(1, Math.max(0, (level - scratch[i]) / 0.025 + 0.5));
      sum += cover * points[i].weight;
    }
    if (sum < volume) lo = level; else hi = level;
  }
  return (lo + hi) * 0.5;
}

export function flowRate(upY, neckCovered, totalVolume) {
  if (!neckCovered) return 0;
  // No flow through a horizontal neck. Beverloo-like constant upright rate.
  const axial = Math.max(0, (Math.abs(upY) - 0.16) / 0.84);
  return totalVolume / 18 * Math.pow(axial, 1.25);
}
