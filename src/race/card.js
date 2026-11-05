// Finish card: a 4:5 image of the race time and the eight station splits, drawn on a 2D canvas.
import { clockedPlan } from './ghost.js';
import { formatRaceClock } from './record.js';

export const CARD = { width: 1080, height: 1350 };

const INK = '#ffffff',
  ACCENT = '#ffed00',
  MUTED = '#999999',
  LINE = '#333333',
  FONT = '"Helvetica Neue", Arial, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

// Time per station in game seconds: the run before it, then everything in its roxzone
// (walk in, workout, teammate, walk out). Null when the splits do not fit the course.
export function cardRows(times, doubles) {
  const plan = clockedPlan(doubles);
  if (times.length !== plan.length) return null;
  const rows = Array.from({ length: 8 }, () => ({ run: 0, station: 0 }));
  plan.forEach((segment, k) => {
    const spent = times[k] - (k ? times[k - 1] : 0),
      row = rows[Math.floor(segment.phase / 2)];
    if (segment.mode === 'run') row.run += spent;
    else row.station += spent;
  });
  return rows;
}

// data: { time, blowups, division, date, rows, stations (names), site, tr }
export function drawCard(ctx, { time, blowups, division, date, rows, stations, site, tr }) {
  const { width, height } = CARD,
    left = 72,
    right = width - 72,
    font = (size, weight = 700) => (ctx.font = `${weight} ${size}px ${FONT}`),
    text = (value, x, y, color, align = 'left') => {
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.fillText(value, x, y);
    },
    rule = (y) => {
      ctx.fillStyle = LINE;
      ctx.fillRect(left, y, right - left, 2);
    };
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = 'alphabetic';

  // Wordmark, as in the page header.
  ctx.fillStyle = ACCENT;
  ctx.fillRect(left, 72, 72, 72);
  font(56, 900);
  text('F', left + 36, 130, '#000000', 'center');
  font(52, 800);
  text('FIRST LAP', left + 100, 127, INK);
  font(24, 400);
  text(tr('Unofficial HYROX experience'), right, 120, MUTED, 'right');
  rule(196);

  font(32);
  text(tr('RACE TIME'), left, 290, ACCENT);
  font(210, 800);
  text(formatRaceClock(time), left - 8, 480, ACCENT);

  const stats = [
    [tr('DIVISION'), division],
    [tr('BLOW-UPS'), String(blowups)],
    [tr('DATE'), date],
  ];
  stats.forEach(([label, value], i) => {
    const x = left + i * 330;
    font(24, 400);
    text(label, x, 570, MUTED);
    font(40);
    text(value, x, 622, INK);
  });
  rule(680);

  // One bar per station: the run in white, the roxzone and workout in yellow.
  const longest = Math.max(...rows.map((row) => row.run + row.station)),
    barLeft = 500,
    barWidth = 300;
  rows.forEach((row, i) => {
    const y = 760 + i * 58;
    font(30);
    text(String(i + 1).padStart(2, '0'), left, y, ACCENT);
    font(30, 500);
    text(stations[i], left + 64, y, INK);
    const run = (row.run / longest) * barWidth,
      station = (row.station / longest) * barWidth;
    ctx.fillStyle = INK;
    ctx.fillRect(barLeft, y - 22, run, 20);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(barLeft + run, y - 22, station, 20);
    font(30, 500);
    text(formatRaceClock(row.run + row.station), right, y, INK, 'right');
  });
  font(22, 400);
  ctx.fillStyle = INK;
  ctx.fillRect(barLeft, 1222, 20, 20);
  text(tr('RUN'), barLeft + 30, 1240, MUTED);
  ctx.fillStyle = ACCENT;
  ctx.fillRect(barLeft + 130, 1222, 20, 20);
  text(tr('ROXZONE + WORKOUT'), barLeft + 160, 1240, MUTED);

  rule(1270);
  font(30);
  text(site, left, 1318, INK);
  font(26, 400);
  text(tr('Can you pace it better?'), right, 1318, MUTED, 'right');
}
