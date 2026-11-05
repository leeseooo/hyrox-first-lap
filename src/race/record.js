import { RULES_VERSION } from './pacing.js';

const KEY = 'first-lap-best';

export function formatRaceTime(seconds) {
  const tenths = Math.max(0, Math.round(seconds * 10)),
    minutes = Math.floor(tenths / 600),
    rest = (tenths % 600) / 10;
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`;
}

function readAll(storage) {
  try {
    const data = JSON.parse(storage?.getItem(KEY) || '{}');
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

// Personal bests per division. Records from another rules version do not count.
export function loadBest(storage, division) {
  const best = readAll(storage)[division];
  return best?.rules === RULES_VERSION && Number.isFinite(best.time) ? best : null;
}

export function saveIfBest(storage, division, result) {
  const previous = loadBest(storage, division),
    isBest = !previous || result.time < previous.time;
  if (isBest) {
    const all = readAll(storage);
    all[division] = { rules: RULES_VERSION, ...result };
    try {
      storage?.setItem(KEY, JSON.stringify(all));
    } catch {}
  }
  return { isBest, previous };
}
