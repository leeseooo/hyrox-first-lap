import { RULES_VERSION } from './pacing.js';

const KEY = 'first-lap-best';

// One game second stands for RACE_SCALE seconds of a real race, so a well-paced
// 5:38 game reads as 1:24:30, about a first-timer's HYROX finish. Stored times stay in game seconds.
export const RACE_SCALE = 15;

export function formatRaceClock(seconds) {
  const total = Math.max(0, Math.floor(seconds * RACE_SCALE)),
    hours = Math.floor(total / 3600),
    minutes = Math.floor((total % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

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
