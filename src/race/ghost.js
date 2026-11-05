// Ghost race: a past run (your best or a friend's link) replayed against the race clock.
// A ghost is the cumulative race time at the end of every clocked segment, in game seconds.
import { divisions } from '../data/divisions.js';
import { coursePlan } from './course.js';
import { RULES_VERSION } from './pacing.js';
import { RACE_SCALE } from './record.js';

export function clockedPlan(doubles) {
  return coursePlan(doubles).filter((segment) => segment.clock);
}

// "<division>_<rules>_<tenths per segment in base 36, dot separated>". Rounding the
// cumulative times first keeps the error under a twentieth of a second at every split.
export function encodeGhost({ division, times }) {
  let previous = 0;
  const steps = times.map((t) => {
    const tenths = Math.round(t * 10),
      step = tenths - previous;
    previous = tenths;
    return step.toString(36);
  });
  return `${division}_${RULES_VERSION}_${steps.join('.')}`;
}

// Returns { division, times } or null when the text does not fit this course and these rules.
export function decodeGhost(text) {
  const parts = typeof text === 'string' ? text.split('_') : [];
  if (parts.length !== 3) return null;
  const [id, rules, steps] = parts,
    division = divisions.find((d) => d.id === id);
  if (!division || rules !== String(RULES_VERSION)) return null;
  const values = steps.split('.');
  if (values.length !== clockedPlan(division.doubles).length) return null;
  let tenths = 0;
  const times = [];
  for (const value of values) {
    if (!/^[0-9a-z]{1,4}$/.test(value)) return null;
    const step = parseInt(value, 36);
    if (step < 1) return null;
    tenths += step;
    times.push(tenths / 10);
  }
  return { division: id, times };
}

// When the ghost passed the point you are at: segment k, progress p (0..1) through it.
export function ghostTimeAt(times, k, p) {
  if (k >= times.length) return times.at(-1);
  const start = k ? times[k - 1] : 0;
  return start + p * (times[k] - start);
}

// Where the ghost was at race time t: { index (segment), progress, done }.
export function ghostAt(times, t) {
  const index = times.findIndex((end) => end > t);
  if (index < 0) return { index: times.length - 1, progress: 1, done: true };
  const start = index ? times[index - 1] : 0;
  return { index, progress: (t - start) / (times[index] - start), done: false };
}

// A gap in game seconds shown as race time: -0:12 ahead, +0:45 behind (or 0:45 unsigned).
export function formatDelta(seconds, signed = true) {
  const total = Math.round(Math.abs(seconds) * RACE_SCALE),
    hours = Math.floor(total / 3600),
    minutes = Math.floor((total % 3600) / 60),
    rest = String(total % 60).padStart(2, '0'),
    sign = !signed || total === 0 ? '' : seconds < 0 ? '-' : '+';
  return hours
    ? `${sign}${hours}:${String(minutes).padStart(2, '0')}:${rest}`
    : `${sign}${minutes}:${rest}`;
}

// The point a fraction p of the way along a polyline of [x, z] points.
export function alongPath(points, p) {
  const lengths = points
      .slice(1)
      .map((b, i) => Math.hypot(b[0] - points[i][0], b[1] - points[i][1])),
    total = lengths.reduce((sum, length) => sum + length, 0);
  let left = Math.max(0, Math.min(1, p)) * total;
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i] && lengths[i] > 0) {
      const q = left / lengths[i],
        [a, b] = [points[i], points[i + 1]];
      return [a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q];
    }
    left -= lengths[i];
  }
  return [...points.at(-1)];
}
