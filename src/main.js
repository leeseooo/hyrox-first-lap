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
  phaseTime: 0,
  route: null,
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  done: new Set(),
  profile: makeProfile('men-single'),
};
let attemptStarted = false,
  attemptAssisted = false,
  attemptFinished = false,
  attemptNumber = 1;
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
  input = source;
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
  $('completion').hidden = true;
  renderer?.setStage(p);
  lastDisplay = -1;
  update();
}
function beginTravel(mode, from, to, points) {
  state.mode = mode;
  state.progress = 0;
  state.phaseTime = 0;
  state.route = makeRoute(from, to, points);
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
    beginTravel('finish', from, to, [
      [from.eye[0], from.eye[2]],
      [from.eye[0] + 3, from.eye[2]],
      [40, from.eye[2]],
      [40, -24],
    ]);
  } else {
    const to = poseAt(state.phase + 1, 0, 0);
    beginTravel('exit', from, to, [
      [from.eye[0], from.eye[2]],
      [from.eye[0] - 2.5, from.eye[2]],
      [from.eye[0] - 2.5, 21],
      [-44, 21],
      [-44, 26],
    ]);
  }
}
function advance() {
  if (state.mode === 'run') {
    const from = participantPose({ ...state, progress: 1 }),
      next = state.phase + 1,
      to = poseAt(next, 0, 0),
      [x] = layout[index()];
    state.phase = next;
    renderer?.setStage(next);
    beginTravel('enter', from, to, [
      [from.eye[0], from.eye[2]],
      [x, 26],
      [x, 20],
      [to.eye[0], to.eye[2]],
    ]);
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
      beginTravel('handoff', from, to, [
        [from.eye[0], from.eye[2]],
        [from.eye[0] + 2, from.eye[2] + 1],
        [to.eye[0], to.eye[2]],
      ]);
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
    if (!attemptFinished) {
      attemptFinished = true;
      track('race_complete', metrics({ completed_stations: state.done.size }));
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
    state.complete
      ? 'Race complete'
      : state.active
        ? 'Release to pause'
        : mode === 'partner'
          ? 'Hold to watch teammate'
          : mode === 'handoff'
            ? 'Hold to swap'
            : mode === 'workout'
              ? `Hold to ${s.verb}`
              : mode === 'celebrate'
                ? 'Hold to celebrate'
                : 'Hold to move',
  );
  $('stateLabel').textContent = tr(
    state.complete ? 'FINISHED' : state.active ? 'IN MOTION' : state.started ? 'PAUSED' : 'READY',
  );
  $('stateDot').classList.toggle('moving', state.active);
  $('callout').style.opacity = state.active || state.complete ? '0' : '1';
  $('calloutTitle').textContent = tr(
    state.started ? 'Take a breath. Then keep going.' : 'Your race starts with a hold.',
  );
  $('calloutText').textContent = tr(
    state.started
      ? 'Hold again to pick up where you paused.'
      : touchScreen
        ? 'Press and hold the arena or the button. Release to pause.'
        : 'Hold the arena, the button, or Space. Release to pause.',
  );
  $('motionLabel').textContent = tr(
    state.active
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
      : 'HOLD TO MOVE',
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
  const pose = participantPose(state);
  $('mapDot').setAttribute('cx', Math.max(13, Math.min(127, 13 + ((pose.eye[0] + 44) / 88) * 114)));
  $('mapDot').setAttribute('cy', Math.max(13, Math.min(87, 13 + ((pose.eye[2] + 26) / 52) * 74)));
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
window.addEventListener('blur', stop);
window.addEventListener('pagehide', stop);
window.addEventListener('resize', () => {
  stop();
  last = 0;
  renderDirty = true;
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
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
  stop();
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
  renderer?.clearEquipment();
  selectPhase(0, true);
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
$('share').onclick = shareFinish;
function shareLink(medium) {
  const url = new URL(location.origin + location.pathname);
  url.searchParams.set('utm_source', 'share');
  url.searchParams.set('utm_medium', medium);
  url.searchParams.set('utm_campaign', 'finisher');
  return url.href;
}
async function shareFinish() {
  const text = tr(
    state.profile.doubles
      ? 'We finished our first HYROX race on FIRST LAP.'
      : 'I finished my first HYROX race on FIRST LAP.',
  );
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
    flashShareLabel(copied ? 'Link copied.' : 'Could not copy the link.');
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
let shareLabelTimer;
function flashShareLabel(message) {
  $('announcement').textContent = tr(message);
  // Swap the inner [data-i18n] label so a later language change still translates it.
  const label = $('share').firstElementChild;
  label.textContent = tr(message);
  clearTimeout(shareLabelTimer);
  shareLabelTimer = setTimeout(() => (label.textContent = tr('Share your finish')), 2000);
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
  $('motion').textContent = tr(state.reduced ? 'Motion: low' : 'Motion: full');
  renderDirty = true;
}
updateMotion();
function duration() {
  return state.mode === 'run'
    ? 9
    : ['workout', 'partner'].includes(state.mode)
      ? stations[index()].duration * (state.profile.doubles ? 0.5 : 1)
      : state.mode === 'handoff'
        ? 2.5
        : state.mode === 'enter'
          ? 4
          : state.mode === 'exit'
            ? 4
            : state.mode === 'finish'
              ? 6
              : 3;
}
function frame(t) {
  const dt = last ? Math.min((t - last) / 1000, 0.05) : 0;
  last = t;
  if (state.active) {
    state.time += dt;
    state.phaseTime += dt;
    const segmentProgress = Math.min(1, state.phaseTime / duration());
    state.progress =
      state.mode === 'partner'
        ? 0.5 + segmentProgress * 0.5
        : state.mode === 'workout' && state.profile.doubles
          ? segmentProgress * 0.5
          : segmentProgress;
    if (segmentProgress >= 1) advance();
    updateProgress();
  }
  if (renderer && !contextLost && (state.active || renderDirty || renderer.dirty)) {
    renderer.render(state);
    renderDirty = false;
    renderer.dirty = false;
  }
  requestAnimationFrame(frame);
}
renderer?.configureDivision(state.profile);
initAnalytics();
updateDivision();
selectPhase(0, true);
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
