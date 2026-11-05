import { bindRaceKeyboard } from './race/keyboard.js';
import { initAnalytics, refreshAnalyticsLanguage, track } from './analytics/index.js';
import {
  tr,
  unit,
  initialLanguage,
  getLanguage,
  setLocale,
  applyStaticLanguage,
} from './i18n/index.js';
import {
  ArenaRenderer,
  participantPose,
  workerPose,
  watchPose,
  makeRoute,
  layout,
} from './race/arena.js';
import { divisions, makeProfile, stationLoad } from './data/divisions.js';
import { stations } from './data/stations.js';
import { registerWebMcpTools } from './webmcp.js';
import { segmentFor } from './race/course.js';
import { createPacing, stepPacing } from './race/pacing.js';
import { formatRaceClock, formatRaceTime, loadBest, saveIfBest } from './race/record.js';
import {
  alongPath,
  clockedPlan,
  decodeGhost,
  encodeGhost,
  formatDelta,
  ghostAt,
  ghostTimeAt,
} from './race/ghost.js';
import { CARD, cardRows, drawCard } from './race/card.js';
import { heartRate, strainLevel } from './race/strain.js';
const $ = (id) => document.getElementById(id);
setLocale(initialLanguage());
applyStaticLanguage();
$('language').value = getLanguage();
const state = {
  phase: 0,
  mode: 'run',
  progress: 0,
  active: false,
  started: false,
  complete: false,
  time: 0,
  // Race clock: starts on the first hold, stops at the finish line, keeps running on release.
  raceTime: 0,
  phaseTime: 0,
  paused: false,
  sim: createPacing(),
  // { phase, mode, t } at the end of every clocked segment — the ghost race replays these.
  splits: [],
  // { source: 'friend' | 'best', times } — the run to race against, or null.
  ghost: null,
  route: null,
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  done: new Set(),
  profile: makeProfile('men-single'),
};
// A friend's record link (?ghost=…) races their ghost in their division.
const friendGhost = decodeGhost(new URLSearchParams(location.search).get('ghost'));
let attemptStarted = false,
  attemptAssisted = false,
  attemptFinished = false,
  attemptNumber = 1,
  lastResult = null;
const measuredStations = new Set();
function metrics(extra = {}) {
  return {
    division: state.profile.id,
    language: getLanguage(),
    attempt_number: attemptNumber,
    assisted: attemptAssisted ? 1 : 0,
    active_seconds: Math.round(state.time),
    ...extra,
  };
}
let input = null,
  last = 0,
  lastDisplay = -1,
  heldPointer = null,
  renderDirty = true,
  focusMode = false,
  contextLost = false;
const touchScreen = matchMedia('(pointer: coarse)').matches;
const index = () => Math.min(7, Math.floor(state.phase / 2));
const segment = () => segmentFor(state.mode, index(), state.profile.doubles);
// After the first hold the race keeps moving until the finish, unless the tab is out of sight.
const running = () => state.started && !state.paused && !state.complete;
const nav = $('stations');
stations.forEach((s, i) => {
  const b = document.createElement('button');
  b.className = 'station';
  b.innerHTML = `<span class="station-num">${String(i + 1).padStart(2, '0')}</span><span><span class="station-name">${tr(s.name)}</span><span class="station-meta">${s.target.toLocaleString()} ${unit(s.unit, true)}</span></span><span class="station-status"></span>`;
  b.addEventListener('click', () => selectPhase(i * 2));
  nav.append(b);
});
let renderer;
try {
  renderer = new ArenaRenderer($('scene'));
} catch (error) {
  $('calloutTitle').textContent = tr('This browser could not open the 3D arena.');
  $('calloutText').textContent = tr('Please try a browser with WebGL enabled.');
  $('hold').disabled = true;
  console.error(error);
}
function stop() {
  state.active = false;
  input = null;
  heldPointer = null;
  updateControl();
}
function start(source) {
  if (state.complete || !renderer || contextLost) return;
  if (!attemptStarted) {
    attemptStarted = true;
    track('race_start', metrics({ input_method: source }));
  }
  state.active = true;
  state.started = true;
  state.paused = false;
  input = source;
  updateControl();
}
// Freeze the clock, heart rate and pace while the race is out of sight.
function pause() {
  stop();
  if (!running()) return;
  state.paused = true;
  updateControl();
}
function selectPhase(p, internal = false) {
  if (!Number.isInteger(p) || p < 0 || p > 15)
    throw new Error('Choose an integer phase from 0 to 15.');
  if (!internal) {
    attemptAssisted = true;
    track('station_select', metrics({ station_number: Math.floor(p / 2) + 1 }));
  }
  stop();
  state.phase = p;
  state.mode = p % 2 ? 'workout' : 'run';
  state.progress = 0;
  state.phaseTime = 0;
  state.route = null;
  state.complete = false;
  state.started = false;
  state.paused = false;
  $('completion').hidden = true;
  renderer?.setStage(p);
  lastDisplay = -1;
  update();
}
// The path a travel segment follows on the floor, as [x, z] points between two eyes.
function travelKnots(mode, from, to, i) {
  const [fx, , fz] = from;
  if (mode === 'enter') {
    const [x] = layout[i];
    return [
      [fx, fz],
      [x, 26],
      [x, 20],
      [to[0], to[2]],
    ];
  }
  if (mode === 'handoff')
    return [
      [fx, fz],
      [fx + 2, fz + 1],
      [to[0], to[2]],
    ];
  if (mode === 'finish')
    return [
      [fx, fz],
      [fx + 3, fz],
      [40, fz],
      [40, -24],
    ];
  return [
    [fx, fz],
    [fx - 2.5, fz],
    [fx - 2.5, 21],
    [-44, 21],
    [-44, 26],
  ];
}
function beginTravel(mode, from, to) {
  state.mode = mode;
  state.progress = 0;
  state.phaseTime = 0;
  state.route = makeRoute(from, to, travelKnots(mode, from.eye, to.eye, index()));
  lastDisplay = -1;
  update();
}
function poseAt(phase, progress, phaseTime) {
  return participantPose({
    ...state,
    phase,
    mode: phase % 2 ? 'workout' : 'run',
    progress,
    phaseTime,
    route: null,
  });
}
function finishStation() {
  if (!measuredStations.has(index())) {
    measuredStations.add(index());
    track(
      'station_complete',
      metrics({ station_number: index() + 1, station_name: stations[index()].en }),
    );
  }
  state.done.add(index());
  const from = participantPose(state);
  renderer?.settleEquipment(index(), workerPose(state));
  if (state.phase === 15) {
    const to = poseAt(0, 0, 0);
    to.eye = [40, 1.68, -24];
    to.root = [40, 0, -24];
    to.yaw = 0;
    to.pitch = -0.05;
    beginTravel('finish', from, to);
  } else beginTravel('exit', from, poseAt(state.phase + 1, 0, 0));
}
function browserStorage() {
  try {
    return localStorage;
  } catch {
    return null;
  }
}
// Practice runs (any skip or station jump) finish without a time or a personal best.
function finishRace() {
  const storage = browserStorage(),
    { id } = state.profile,
    practice = attemptAssisted,
    time = state.raceTime,
    blowups = state.sim.blowups,
    date = new Date().toISOString().slice(0, 10),
    times = state.splits.map((split) => split.t);
  let isBest = false,
    best = loadBest(storage, id)?.time ?? null;
  if (!practice) {
    isBest = saveIfBest(storage, id, { time, blowups, splits: state.splits, date }).isBest;
    if (isBest) best = time;
  }
  // Positive when the friend's ghost was faster.
  const friendGap =
    !practice && state.ghost?.source === 'friend' ? time - state.ghost.times.at(-1) : null;
  lastResult = { practice, time, blowups, isBest, best, date, times, friendGap };
  renderResult();
  return lastResult;
}
function renderResult() {
  if (!lastResult) return;
  const { practice, time, blowups, isBest, best, friendGap } = lastResult;
  $('finishTime').textContent = practice ? tr('PRACTICE') : formatRaceClock(time);
  $('finishPlay').hidden = practice;
  $('finishPlay').textContent = `${tr('Played in')} ${formatRaceTime(time)}`;
  $('finishBlowups').textContent = String(blowups);
  $('finishBest').textContent = best === null ? '—' : formatRaceClock(best);
  $('finishRecord').hidden = !practice && !isBest;
  $('finishRecord').textContent = tr(
    practice
      ? 'Practice finish — skips do not count. Race again without skipping to set a time.'
      : 'New personal best!',
  );
  $('finishGhost').hidden = friendGap === null;
  if (friendGap !== null) {
    const gap = formatDelta(Math.abs(friendGap), false);
    $('finishGhost').textContent = tr(
      gap === '0:00'
        ? 'Dead heat with your friend.'
        : friendGap < 0
          ? `You beat your friend by ${gap}.`
          : `Your friend was ${gap} faster.`,
    );
  }
}
// Your friend's link first (same division), else your personal best. Splits from another
// course shape (an old save) do not count.
function pickGhost() {
  const { id, doubles } = state.profile;
  if (friendGhost?.division === id) return { source: 'friend', times: friendGhost.times };
  const times = loadBest(browserStorage(), id)?.splits?.map((split) => split.t);
  return times?.length === clockedPlan(doubles).length ? { source: 'best', times } : null;
}
// Where the ghost stands on the floor, as [x, z], at a clocked segment and progress.
function ghostPoint({ index: k, progress: p }) {
  const { doubles } = state.profile,
    { mode, phase } = clockedPlan(doubles)[k],
    i = Math.floor(phase / 2),
    floor = (eye) => [eye[0], eye[2]];
  if (mode === 'run') return floor(poseAt(phase, p, 0).eye);
  // Doubles split each station in two halves of progress, like the race itself.
  const half = (q) => (doubles ? q * 0.5 : q),
    station = (q) => poseAt(i * 2 + 1, q, 0).eye;
  if (mode === 'workout') return floor(station(half(p)));
  if (mode === 'partner') return floor(station(0.5));
  const from = mode === 'enter' ? poseAt(i * 2, 1, 0).eye : station(doubles ? 0.5 : 1),
    to = mode === 'enter' ? station(0) : mode === 'exit' ? poseAt(i * 2 + 2, 0, 0).eye : from;
  return alongPath(travelKnots(mode, from, to, i), p);
}
const mapPoint = ([x, z]) => [
  Math.max(13, Math.min(127, 13 + ((x + 44) / 88) * 114)),
  Math.max(13, Math.min(87, 13 + ((z + 26) / 52) * 74)),
];
// Game seconds behind (+) or ahead (-) of the ghost at this point of the course,
// or null while there is nothing to race (no ghost, a practice run, not started, finished).
function ghostGap() {
  const ghost = state.ghost;
  if (!ghost || attemptAssisted || !state.started || !segment().clock) return null;
  const p = Math.min(1, state.phaseTime / segment().length);
  return state.raceTime - ghostTimeAt(ghost.times, state.splits.length, p);
}
let shownGhost = '';
// The live gap chip and the ghost's dot on the map.
function updateGhost() {
  const ghost = state.ghost,
    delta = ghostGap();
  $('ghostChip').hidden = delta === null;
  $('ghostDot').style.display = delta === null ? 'none' : 'inline';
  if (delta === null) return;
  const text = formatDelta(delta),
    shown = `${ghost.source}${text}${getLanguage()}`;
  if (shown !== shownGhost) {
    shownGhost = shown;
    $('ghostLabel').textContent = tr(ghost.source === 'friend' ? 'FRIEND' : 'YOUR BEST');
    $('ghostDelta').textContent = text;
    $('ghostChip').dataset.ahead = String(delta < 0);
  }
  const [cx, cy] = mapPoint(ghostPoint(ghostAt(ghost.times, state.raceTime)));
  $('ghostDot').setAttribute('cx', cx);
  $('ghostDot').setAttribute('cy', cy);
}
function advance() {
  if (state.mode === 'run') {
    const from = participantPose({ ...state, progress: 1 }),
      next = state.phase + 1,
      to = poseAt(next, 0, 0);
    state.phase = next;
    renderer?.setStage(next);
    beginTravel('enter', from, to);
  } else if (state.mode === 'enter') {
    state.mode = 'workout';
    state.progress = 0;
    state.phaseTime = 0;
    state.route = null;
    lastDisplay = -1;
    update();
  } else if (state.mode === 'workout') {
    if (state.profile.doubles) {
      state.progress = 0.5;
      state.phaseTime = stations[index()].duration / 2;
      const from = participantPose(state),
        to = watchPose({ ...state, mode: 'partner', phaseTime: 0 });
      beginTravel('handoff', from, to);
    } else finishStation();
  } else if (state.mode === 'handoff') {
    state.mode = 'partner';
    state.progress = 0.5;
    state.phaseTime = 0;
    state.route = null;
    lastDisplay = -1;
    update();
  } else if (state.mode === 'partner') finishStation();
  else if (state.mode === 'exit') {
    state.phase++;
    state.mode = 'run';
    state.progress = 0;
    state.phaseTime = 0;
    state.route = null;
    renderer?.setStage(state.phase);
    lastDisplay = -1;
    update();
  } else if (state.mode === 'finish') {
    state.mode = 'celebrate';
    state.progress = 0;
    state.phaseTime = 0;
    state.route = null;
    lastDisplay = -1;
    update();
  } else if (state.mode === 'celebrate') {
    state.progress = 1;
    state.mode = 'complete';
    state.complete = true;
    const result = finishRace();
    if (!attemptFinished) {
      attemptFinished = true;
      track(
        'race_complete',
        metrics({
          completed_stations: state.done.size,
          blowups: result.blowups,
          ...(result.practice
            ? {}
            : {
                race_time_s: Math.round(result.time * 10) / 10,
                personal_best: result.isBest ? 1 : 0,
              }),
        }),
      );
      if (!attemptAssisted && state.done.size === 8) track('race_complete_full', metrics());
    }
    stop();
    $('completion').hidden = false;
    $('announcement').textContent = tr('You crossed the finish line. All eight stations complete!');
    update();
  }
  $('announcement').textContent = tr(
    state.complete
      ? 'You crossed the finish line. All eight stations complete!'
      : `${state.mode.toUpperCase()}: ${stations[index()].name}`,
  );
}
function updateControl() {
  renderDirty = true;
  const mode = state.mode,
    s = stations[index()];
  $('hold').classList.toggle('held', state.active);
  $('holdText').textContent = tr(
    state.complete || mode === 'celebrate'
      ? 'Race complete'
      : state.sim.blown
        ? 'Blown up — breathe'
        : mode === 'partner'
          ? 'Teammate is working'
          : state.active
            ? 'Release to breathe'
            : mode === 'workout'
              ? `Hold to ${s.verb}`
              : 'Hold to speed up',
  );
  $('stateLabel').textContent = tr(
    state.complete
      ? 'FINISHED'
      : state.paused
        ? 'PAUSED'
        : !state.started
          ? 'READY'
          : state.sim.blown
            ? 'BLOWN UP'
            : state.active
              ? 'PUSHING'
              : 'EASING',
  );
  $('stateDot').classList.toggle('moving', running());
  const waiting = !state.complete && (!state.started || state.paused);
  $('callout').style.opacity = waiting ? '1' : '0';
  $('calloutTitle').textContent = tr(
    state.paused
      ? 'Race paused.'
      : attemptStarted
        ? 'Take a breath. Then keep going.'
        : state.ghost?.source === 'friend'
          ? `Race your friend's ${formatRaceClock(state.ghost.times.at(-1))}.`
          : 'Your race starts with a hold.',
  );
  $('calloutText').textContent = tr(
    state.paused || attemptStarted
      ? 'Hold again to pick up where you paused.'
      : touchScreen
        ? 'Hold to speed up, release to breathe. Keep your heart rate out of the red.'
        : 'Hold the arena, the button, or Space to speed up. Release to breathe. Keep your heart rate out of the red.',
  );
  $('motionLabel').textContent = tr(
    state.sim.blown
      ? 'BLOWN UP · BREATHE UNTIL YOUR HEART RATE DROPS'
      : running()
        ? mode === 'partner'
          ? 'YOUR TEAMMATE IS WORKING · STAY TOGETHER'
          : mode === 'handoff'
            ? 'YOUR HALF IS DONE · SWAP WITH YOUR TEAMMATE'
            : mode === 'workout'
              ? s.cue
              : mode === 'celebrate'
                ? 'ARMS UP. YOU DID IT.'
                : mode === 'enter'
                  ? 'FOLLOW THE ROUTE INTO THE ROXZONE'
                  : mode === 'exit'
                    ? 'BACK TO THE RUNNING TRACK'
                    : mode === 'finish'
                      ? 'THROUGH THE FINISH ARCH'
                      : 'FIND YOUR RUNNING RHYTHM'
        : 'HOLD TO SPEED UP',
  );
  $('hold').disabled = state.complete || !renderer;
  $('skip').disabled = state.complete;
  $('skipRun').hidden = mode !== 'run';
  $('skipRun').disabled = mode !== 'run' || state.complete;
  if (!renderer || contextLost) {
    $('hold').disabled = true;
    $('callout').style.opacity = '1';
    $('calloutTitle').textContent = tr(
      contextLost ? 'The arena is paused.' : 'The 3D arena could not start.',
    );
    $('calloutText').textContent = tr(
      contextLost
        ? 'Restoring the scene. Your progress is saved in this tab.'
        : 'Try a browser with WebGL enabled.',
    );
    $('skip').disabled = true;
    $('skipRun').disabled = true;
  }
}
function update() {
  const i = index(),
    s = stations[i],
    mode = state.mode,
    n = String(i + 1).padStart(2, '0');
  const titles = {
    run: `Run ${n}`,
    enter: `Into ${s.name}`,
    workout: s.name,
    partner: `Teammate: ${s.name}`,
    handoff: 'Your teammate takes over',
    exit: 'Back to the track',
    finish: 'The finish straight',
    celebrate: 'You did it!',
    complete: 'You did it!',
  };
  $('phaseLabel').textContent = tr(
    `${mode === 'enter' ? 'ROXZONE IN' : mode === 'exit' ? 'ROXZONE OUT' : mode === 'celebrate' || mode === 'complete' ? 'FINISHER' : mode.toUpperCase()} ${n} / 08`,
  );
  $('sceneTitle').textContent = tr(titles[mode]);
  $('sceneCaption').textContent = tr(
    mode === 'partner'
      ? 'Stay in the workout area. Cheer your teammate on.'
      : mode === 'handoff'
        ? 'Step aside. Hand over the remaining half.'
        : mode === 'run'
          ? `Next: ${s.name}`
          : mode === 'enter'
            ? 'Follow the marked route. Approach your equipment.'
            : mode === 'exit'
              ? 'Leave the workout lane and rejoin the track.'
              : mode === 'finish'
                ? 'One last run. The finish arch is ahead.'
                : mode === 'celebrate' || mode === 'complete'
                  ? 'Eight runs. Eight workouts. One finish.'
                  : s.cue,
  );
  $('stageNumber').textContent = tr(n);
  $('currentLabel').textContent = tr(
    mode === 'run'
      ? 'RUN · 1,000 m'
      : mode === 'workout' || mode === 'partner'
        ? `${s.en} · ${s.target.toLocaleString()} ${s.unit}`
        : mode === 'enter'
          ? 'ROXZONE · APPROACH'
          : mode === 'exit'
            ? 'ROXZONE · EXIT'
            : mode === 'handoff'
              ? 'TEAM · HANDOFF'
              : mode === 'finish'
                ? 'FINAL APPROACH'
                : 'FINISHER',
  );
  $('currentTitle').textContent = tr(titles[mode]);
  $('currentTip').textContent = tr(
    mode === 'partner'
      ? `${s.tip} Your teammate completes the second half while you stay with them.`
      : mode === 'handoff'
        ? 'You have completed half the station. Move to the resting position and let your teammate take over.'
        : mode === 'run'
          ? state.profile.doubles
            ? 'Both athletes run the full 1 km together, then enter the workout zone together.'
            : 'Run 1 km, then follow the entrance into the workout zone. You run before every station.'
          : mode === 'enter'
            ? 'Keep holding to jog into your lane. The workout starts only after you reach the equipment.'
            : mode === 'exit'
              ? 'Your station is done. Follow the exit route back to the running track.'
              : mode === 'finish'
                ? 'All eight workouts are complete. Keep moving and cross the finish line.'
                : mode === 'celebrate' || mode === 'complete'
                  ? 'Raise your hands. Take in the crowd. You have finished your first race.'
                  : s.tip,
  );
  $('currentLoad').textContent = tr(stationLoad(state.profile, i, mode === 'partner'));
  $('currentLoad').hidden =
    !['workout', 'partner', 'handoff', 'enter'].includes(mode) || !$('currentLoad').textContent;
  $('teamBadge').hidden = !state.profile.doubles;
  $('teamBadge').textContent = tr(
    mode === 'partner'
      ? 'TEAMMATE WORKING · YOU ARE WATCHING'
      : mode === 'handoff'
        ? 'SWAP ATHLETES · DEMO 50/50 SPLIT'
        : mode === 'workout'
          ? 'YOUR TURN · FIRST 50%'
          : mode === 'celebrate' || mode === 'complete'
            ? 'TEAM FINISHERS'
            : 'RUN & MOVE TOGETHER',
  );
  nav.querySelectorAll('button').forEach((b, j) => {
    b.classList.toggle('active', i === j);
    b.setAttribute('aria-current', i === j ? 'step' : 'false');
    b.querySelector('.station-status').textContent = tr(
      state.done.has(j) ? '✓' : i === j ? '·' : '',
    );
  });
  $('courseCount').textContent = tr(`${state.done.size} / 8 COMPLETE`);
  const next = mode === 'run' || mode === 'enter' ? s : stations[i + 1];
  $('nextText').innerHTML =
    mode === 'finish' || mode === 'celebrate' || mode === 'complete'
      ? `${tr('UP NEXT')} <strong>${tr('FINISHER')}</strong>`
      : next
        ? `${tr('UP NEXT')} <strong>${mode === 'run' || mode === 'enter' ? tr(next.name) : tr('1 km run')}</strong> <span>${mode === 'run' || mode === 'enter' ? `${next.target.toLocaleString()} ${unit(next.unit)}` : tr(next.name)}</span>`
        : `${tr('UP NEXT')} <strong>${tr('FINISH LINE')}</strong>`;
  updateControl();
  updateProgress();
}
let shownPercent = -1,
  shownBeat = 0;
function updateStrain() {
  const { effort, blown } = state.sim,
    percent = Math.round(effort * 100),
    bpm = heartRate(effort),
    arena = $('arena');
  $('raceClock').textContent = formatRaceClock(state.raceTime);
  arena.style.setProperty('--strain', strainLevel(effort).toFixed(3));
  arena.classList.toggle('blown', blown);
  // Restarting the pulse animation every frame would stutter; step it every 5 bpm.
  const beat = Math.round(bpm / 5) * 5;
  if (beat !== shownBeat) {
    shownBeat = beat;
    arena.style.setProperty('--beat', `${(60 / beat).toFixed(3)}s`);
  }
  if (percent === shownPercent) return;
  shownPercent = percent;
  const zone = effort >= 0.9 ? 'Red line' : effort >= 0.7 ? 'Near the limit' : 'Steady',
    meter = $('effort');
  meter.dataset.zone = effort >= 0.9 ? 'danger' : effort >= 0.7 ? 'edge' : 'steady';
  meter.setAttribute('aria-valuenow', String(percent));
  meter.setAttribute('aria-valuetext', `${tr('Heart rate')} ${percent}% · ${tr(zone)}`);
  $('effortFill').style.width = `${percent}%`;
  $('effortBpm').textContent = String(bpm);
  $('effortZone').textContent = tr(zone);
}
function updateProgress() {
  const s = stations[index()],
    travel = ['enter', 'exit', 'finish', 'handoff'].includes(state.mode),
    target =
      state.mode === 'run' ? 1000 : ['workout', 'partner'].includes(state.mode) ? s.target : 100;
  const value = Math.floor(state.progress * target);
  if (value !== lastDisplay) {
    $('distance').textContent = tr(state.complete ? '100' : value.toLocaleString());
    lastDisplay = value;
  }
  $('distanceUnit').textContent = tr(
    state.complete
      ? '% COMPLETE'
      : travel
        ? '% OF ROUTE'
        : state.mode === 'celebrate'
          ? '% CELEBRATION'
          : `/ ${target.toLocaleString()} ${['workout', 'partner'].includes(state.mode) ? s.unit : 'm'}`,
  );
  $('progressFill').style.width = `${state.progress * 100}%`;
  const { eye } = participantPose(state),
    [cx, cy] = mapPoint([eye[0], eye[2]]);
  $('mapDot').setAttribute('cx', cx);
  $('mapDot').setAttribute('cy', cy);
  updateGhost();
}
function pointerMatches(e) {
  return !e || heldPointer?.id === e.pointerId;
}
for (const id of ['arena', 'hold']) {
  const el = $(id);
  el.addEventListener('pointerdown', (e) => {
    if (
      e.target.closest('.completion') ||
      e.isPrimary === false ||
      (e.pointerType !== 'touch' && e.button !== 0) ||
      input ||
      state.complete ||
      !renderer ||
      contextLost
    )
      return;
    e.preventDefault();
    heldPointer = { id: e.pointerId, element: el };
    try {
      el.setPointerCapture(e.pointerId);
    } catch {}
    start('pointer');
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
    el.addEventListener(event, (e) => {
      if (input === 'pointer' && pointerMatches(e)) stop();
    });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
window.addEventListener('pointerup', (e) => {
  if (input === 'pointer' && pointerMatches(e)) stop();
});
bindRaceKeyboard({
  document,
  start,
  stop,
  getInput: () => input,
  escape: () => {
    if (focusMode) toggleFocus();
  },
});
window.addEventListener('blur', pause);
window.addEventListener('pagehide', pause);
window.addEventListener('resize', () => {
  stop();
  last = 0;
  renderDirty = true;
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
  last = 0;
  renderDirty = true;
});
function toggleFocus() {
  stop();
  focusMode = !focusMode;
  document.body.classList.toggle('focus-view', focusMode);
  $('experience').classList.toggle('immersive', focusMode);
  $('focus').setAttribute('aria-pressed', String(focusMode));
  $('focus').textContent = tr(focusMode ? 'Exit view' : 'Focus view');
  renderDirty = true;
}
$('focus').onclick = toggleFocus;
$('scene').addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  contextLost = true;
  pause();
});
$('scene').addEventListener('webglcontextrestored', () => {
  const savedEquipment = renderer?.settled ? new Map(renderer.settled) : new Map();
  renderer?.resizeObserver?.disconnect();
  try {
    renderer = new ArenaRenderer($('scene'));
    renderer.configureDivision(state.profile);
    for (const [i, pose] of savedEquipment) renderer.settleEquipment(i, pose);
    renderer.setStage(state.phase);
    contextLost = false;
  } catch {
    renderer = null;
    contextLost = false;
  }
  updateControl();
  renderDirty = true;
  last = 0;
});
function reset() {
  attemptStarted = false;
  attemptAssisted = false;
  attemptFinished = false;
  attemptNumber++;
  measuredStations.clear();
  state.done.clear();
  state.time = 0;
  state.raceTime = 0;
  state.sim = createPacing();
  state.splits = [];
  state.ghost = pickGhost();
  lastResult = null;
  renderer?.clearEquipment();
  selectPhase(0, true);
  updateStrain();
}
function setDivision(id, role = $('role').value) {
  state.profile = makeProfile(id, role);
  $('division').value = id;
  $('role').value = state.profile.playerSex;
  renderer?.configureDivision(state.profile);
  updateDivision();
  reset();
  track('division_select', metrics());
  return window.hyrox?.getState();
}
function updateDivision() {
  const p = state.profile;
  $('roleChoice').hidden = p.id !== 'mixed-doubles';
  $('finishKicker').textContent = tr(p.doubles ? 'ALL EIGHT. ONE TEAM.' : 'ALL EIGHT. ALL YOU.');
  $('finishTitle').textContent = tr(p.doubles ? 'You are team finishers.' : 'You are a finisher.');
  $('divisionNote').textContent = tr(
    p.doubles
      ? 'Run together. Split work 50/50 in this demo. Hold to watch your teammate.'
      : 'Solo: every run and workout is yours.',
  );
  const entries = [
    ['SLED PUSH', `${p.push} kg`, 'including sled'],
    ['SLED PULL', `${p.pull} kg`, 'including sled'],
    ['FARMERS CARRY', `2 × ${p.carry} kg`, 'one kettlebell per hand'],
    ['SANDBAG', `${p.bag} kg`, 'lunges'],
    [
      'WALL BALL',
      `${p.ball} kg`,
      p.id === 'mixed-doubles'
        ? '2.70 m women / 3.00 m men'
        : `${p.targetHeight.toFixed(2)} m target`,
    ],
  ];
  $('loadStrip').innerHTML = entries
    .map(
      ([title, load, note]) =>
        `<div class="load-item"><span>${tr(title)}</span><strong>${load}</strong><small>${tr(note)}</small></div>`,
    )
    .join('');
  $('loadTable').innerHTML = divisions
    .map(
      (d) =>
        `<tr class="${d.id === p.id ? 'selected' : ''}"><td>${tr(d.label)}</td><td>${d.push} kg</td><td>${d.pull} kg</td><td>2 × ${d.carry} kg</td><td>${d.bag} kg</td><td>${d.ball} kg</td></tr>`,
    )
    .join('');
  nav.querySelectorAll('button').forEach((b, j) => {
    b.querySelector('.station-name').textContent = tr(stations[j].name);
    b.querySelector('.station-meta').textContent = tr(
      `${stations[j].target.toLocaleString()} ${unit(stations[j].unit, true)}${stationLoad(p, j) ? ' · ' + stationLoad(p, j) : ''}`,
    );
  });
}
function setLanguage(value) {
  setLocale(value);
  track('language_change', metrics());
  stop();
  applyStaticLanguage();
  refreshAnalyticsLanguage();
  $('language').value = getLanguage();
  $('focus').textContent = tr(focusMode ? 'Exit view' : 'Focus view');
  updateMotion();
  updateDivision();
  lastDisplay = -1;
  update();
  shownPercent = -1;
  updateStrain();
  renderResult();
  return getLanguage();
}
$('language').onchange = () => setLanguage($('language').value);
function skipRun() {
  if (state.mode !== 'run' || state.complete) return false;
  attemptAssisted = true;
  track('run_skip', metrics({ station_number: index() + 1 }));
  stop();
  state.progress = 1;
  state.phaseTime = 9;
  advance();
  state.started = false;
  updateControl();
  return true;
}
$('division').onchange = () => setDivision($('division').value);
$('role').onchange = () => setDivision($('division').value, $('role').value);
$('skipRun').onclick = skipRun;
$('reset').onclick = reset;
$('again').onclick = reset;
// A timed finish opens its card first; a practice finish shares the link straight away.
$('share').onclick = () =>
  lastResult && !lastResult.practice ? openCard() : shareFinish($('share'));
// A timed finish carries its splits, so whoever opens the link races its ghost.
function shareLink(medium) {
  const url = new URL(location.origin + location.pathname);
  url.searchParams.set('utm_source', 'share');
  url.searchParams.set('utm_medium', medium);
  url.searchParams.set('utm_campaign', 'finisher');
  if (lastResult && !lastResult.practice)
    url.searchParams.set(
      'ghost',
      encodeGhost({ division: state.profile.id, times: lastResult.times }),
    );
  return url.href;
}
function shareText() {
  return tr(
    lastResult && !lastResult.practice
      ? `${state.profile.doubles ? 'We' : 'I'} finished FIRST LAP with a race time of ${formatRaceClock(lastResult.time)}. Can you pace it better?`
      : state.profile.doubles
        ? 'We finished our first HYROX race on FIRST LAP.'
        : 'I finished my first HYROX race on FIRST LAP.',
  );
}
async function shareFinish(button) {
  const text = shareText();
  let method;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'FIRST LAP', text, url: shareLink('web_share') });
      method = 'web_share';
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
  }
  if (!method) {
    const copied = await copyText(`${text} ${shareLink('copy_link')}`);
    flashShareLabel(button, copied ? 'Link copied.' : 'Could not copy the link.');
    if (!copied) return;
    method = 'copy_link';
  }
  track('share', metrics({ method, content_type: 'race_result', item_id: state.profile.id }));
}
// The async Clipboard API needs a secure context and, in some browsers, a permission;
// fall back to the legacy selection copy before giving up.
async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {}
  const field = document.createElement('textarea');
  field.value = value;
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
  const previousFocus = document.activeElement;
  document.body.append(field);
  field.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {}
  field.remove();
  previousFocus?.focus?.();
  return copied;
}
let cardFile = null;
$('cardClose').onclick = () => $('cardDialog').close();
$('cardLink').onclick = () => shareFinish($('cardLink'));
$('cardShare').onclick = shareCard;
$('cardSave').onclick = saveCard;
// Draws the finish card, then offers file sharing where the browser supports it.
async function openCard() {
  if (!lastResult || lastResult.practice) return;
  await document.fonts?.ready;
  const canvas = $('cardCanvas');
  canvas.width = CARD.width;
  canvas.height = CARD.height;
  drawCard(canvas.getContext('2d'), {
    time: lastResult.time,
    blowups: lastResult.blowups,
    division: tr(state.profile.label),
    date: lastResult.date,
    rows: cardRows(lastResult.times, state.profile.doubles),
    stations: stations.map((s) => tr(s.name)),
    site: location.host,
    tr,
  });
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  cardFile = blob
    ? new File([blob], `first-lap-${formatRaceClock(lastResult.time).replaceAll(':', '-')}.png`, {
        type: 'image/png',
      })
    : null;
  $('cardShare').hidden = !cardFile || !navigator.canShare?.({ files: [cardFile] });
  $('cardSave').disabled = !cardFile;
  $('cardDialog').showModal();
}
async function shareCard() {
  if (!cardFile) return;
  try {
    await navigator.share({ files: [cardFile], text: `${shareText()} ${shareLink('card_share')}` });
  } catch {
    return;
  }
  track(
    'share',
    metrics({ method: 'card_share', content_type: 'race_card', item_id: state.profile.id }),
  );
}
function saveCard() {
  if (!cardFile) return;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(cardFile);
  link.download = cardFile.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  track(
    'share',
    metrics({ method: 'card_save', content_type: 'race_card', item_id: state.profile.id }),
  );
}
let shareLabelTimer;
function flashShareLabel(button, message) {
  $('announcement').textContent = tr(message);
  // Swap the inner [data-i18n] label so a later language change still translates it.
  const label = button.firstElementChild;
  label.textContent = tr(message);
  clearTimeout(shareLabelTimer);
  shareLabelTimer = setTimeout(() => (label.textContent = tr(label.dataset.i18n)), 2000);
}
$('skip').onclick = () => {
  if (state.complete) return;
  attemptAssisted = true;
  track('segment_skip', metrics({ station_number: index() + 1, segment: state.mode }));
  stop();
  state.progress = 1;
  state.phaseTime = duration();
  advance();
  state.started = false;
  updateControl();
};
$('motion').onclick = () => {
  state.reduced = !state.reduced;
  updateMotion();
};
function updateMotion() {
  $('motion').setAttribute('aria-pressed', String(state.reduced));
  $('arena').classList.toggle('reduced-motion', state.reduced);
  $('motion').textContent = tr(state.reduced ? 'Motion: low' : 'Motion: full');
  renderDirty = true;
}
updateMotion();
function duration() {
  return segment().length;
}
function frame(t) {
  const dt = last ? Math.min((t - last) / 1000, 0.05) : 0;
  last = t;
  const moving = running();
  if (moving) {
    const seg = segment(),
      wasBlown = state.sim.blown;
    state.sim = stepPacing(state.sim, { holding: state.active, segment: seg, dt });
    state.time += dt;
    if (seg.clock) state.raceTime += dt;
    state.phaseTime += dt * state.sim.pace;
    const segmentProgress = Math.min(1, state.phaseTime / seg.length);
    state.progress =
      state.mode === 'partner'
        ? 0.5 + segmentProgress * 0.5
        : state.mode === 'workout' && state.profile.doubles
          ? segmentProgress * 0.5
          : segmentProgress;
    if (state.sim.blown !== wasBlown) {
      if (state.sim.blown)
        $('announcement').textContent = tr('You blew up. Ease off until your heart rate drops.');
      updateControl();
    }
    if (segmentProgress >= 1) {
      if (seg.clock) state.splits.push({ phase: state.phase, mode: state.mode, t: state.raceTime });
      advance();
    }
    updateProgress();
    updateStrain();
  }
  if (renderer && !contextLost && (moving || renderDirty || renderer.dirty)) {
    renderer.render(state);
    renderDirty = false;
    renderer.dirty = false;
  }
  requestAnimationFrame(frame);
}
if (friendGhost) {
  state.profile = makeProfile(friendGhost.division);
  $('division').value = friendGhost.division;
  $('role').value = state.profile.playerSex;
}
state.ghost = pickGhost();
renderer?.configureDivision(state.profile);
initAnalytics();
updateDivision();
selectPhase(0, true);
updateStrain();
requestAnimationFrame(frame);
window.hyrox = {
  getState: () => ({
    phase: state.phase,
    station: stations[index()].name,
    kind: state.mode,
    progress: state.progress,
    active: state.active,
    complete: state.complete,
    completedStations: state.done.size,
    raceTime: state.raceTime,
    raceClock: formatRaceClock(state.raceTime),
    ghost: state.ghost && {
      source: state.ghost.source,
      finish: formatRaceClock(state.ghost.times.at(-1)),
      delta: ghostGap() === null ? null : formatDelta(ghostGap()),
    },
    paused: state.paused,
    effort: state.sim.effort,
    pace: state.sim.pace,
    blown: state.sim.blown,
    blowups: state.sim.blowups,
    division: state.profile.id,
    language: getLanguage(),
    role: state.profile.playerSex,
    actor: state.mode === 'partner' ? 'teammate' : 'you',
    loads: {
      push: state.profile.push,
      pull: state.profile.pull,
      carryEach: state.profile.carry,
      sandbag: state.profile.bag,
      wallBall: state.profile.ball,
      target:
        state.mode === 'partner' ? state.profile.partnerTargetHeight : state.profile.targetHeight,
    },
    eye: participantPose(state).eye,
  }),
  selectPhase,
  reset,
  setDivision,
  skipRun,
  setLanguage,
};
registerWebMcpTools(window.hyrox);
