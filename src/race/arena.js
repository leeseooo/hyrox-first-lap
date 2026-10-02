// Perspective 3D geometry with white occluding surfaces, black edges and point landmarks.
const vertex = `attribute vec3 position;uniform mat4 matrix;uniform mat4 model;uniform float pointSize;void main(){gl_Position=matrix*model*vec4(position,1.);gl_PointSize=pointSize;}`;
const fragment = `precision mediump float;uniform vec3 color;uniform float isPoint;void main(){if(isPoint>.5&&length(gl_PointCoord-vec2(.5))>.5)discard;gl_FragColor=vec4(color,1.);}`;
const WHITE = [1, 1, 1],
  INK = [0.055, 0.055, 0.055];
const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
function multiply(a, b) {
  const c = new Float32Array(16);
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 4; i++)
      for (let k = 0; k < 4; k++) c[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k];
  return c;
}
function model(x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0) {
  let a = identity();
  a[12] = x;
  a[13] = y;
  a[14] = z;
  const c = Math.cos(ry),
    s = Math.sin(ry),
    cx = Math.cos(rx),
    ss = Math.sin(rx),
    cz = Math.cos(rz),
    szn = Math.sin(rz);
  a = multiply(a, new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]));
  a = multiply(a, new Float32Array([1, 0, 0, 0, 0, cx, ss, 0, 0, -ss, cx, 0, 0, 0, 0, 1]));
  a = multiply(a, new Float32Array([cz, szn, 0, 0, -szn, cz, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
  for (let i = 0; i < 3; i++) {
    a[i] *= sx;
    a[i + 4] *= sy;
    a[i + 8] *= sz;
  }
  return a;
}
export function cameraFov(aspect, fov) {
  return aspect >= 1
    ? fov
    : Math.min(112, (2 * Math.atan(Math.tan((fov * Math.PI) / 360) / aspect) * 180) / Math.PI);
}
function perspective(aspect, fov) {
  fov = cameraFov(aspect, fov);
  const f = 1 / Math.tan((fov * Math.PI) / 360),
    near = 0.055,
    far = 170;
  return new Float32Array([
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (far + near) / (near - far),
    -1,
    0,
    0,
    (2 * far * near) / (near - far),
    0,
  ]);
}
function view(eye, yaw, pitch, roll) {
  const r = model(0, 0, 0, 1, 1, 1, yaw, pitch, roll),
    v = identity();
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) v[i * 4 + j] = r[j * 4 + i];
  for (let i = 0; i < 3; i++) v[12 + i] = -(v[i] * eye[0] + v[4 + i] * eye[1] + v[8 + i] * eye[2]);
  return v;
}
const clamp = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => {
  x = clamp(x);
  return x * x * (3 - 2 * x);
};
const lerp = (a, b, x) => a + (b - a) * x;
const blend = (a, b, q) => a.map((v, i) => lerp(v, b[i], q));
function curve(c, keys) {
  for (let i = 1; i < keys.length; i++)
    if (c <= keys[i][0])
      return lerp(
        keys[i - 1][1],
        keys[i][1],
        ease((c - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0])),
      );
  return keys.at(-1)[1];
}
function cycle(t, period) {
  return (t % period) / period;
}

export const layout = Array.from({ length: 8 }, (_, i) => [-28 + i * 8, 12]);
export function makeRoute(from, to, points) {
  const knots = points.filter(
      (p, i) => i === 0 || Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) > 0.01,
    ),
    samples = [knots[0]];
  const straight = (target) => {
    const start = samples.at(-1),
      n = Math.max(1, Math.ceil(Math.hypot(target[0] - start[0], target[1] - start[1]) / 0.5));
    for (let k = 1; k <= n; k++) samples.push(blend(start, target, k / n));
  };
  for (let j = 1; j < knots.length - 1; j++) {
    const a = knots[j - 1],
      b = knots[j],
      c = knots[j + 1],
      ab = Math.hypot(a[0] - b[0], a[1] - b[1]),
      bc = Math.hypot(c[0] - b[0], c[1] - b[1]),
      radius = Math.min(2.5, ab * 0.32, bc * 0.32),
      entry = blend(b, a, radius / ab),
      exit = blend(b, c, radius / bc);
    straight(entry);
    for (let k = 1; k <= 16; k++) {
      const q = k / 16;
      samples.push(
        entry.map((v, i) => (1 - q) * (1 - q) * v + 2 * (1 - q) * q * b[i] + q * q * exit[i]),
      );
    }
  }
  straight(knots.at(-1));
  const lengths = [0];
  for (let i = 1; i < samples.length; i++)
    lengths.push(
      lengths[i - 1] +
        Math.hypot(samples[i][0] - samples[i - 1][0], samples[i][1] - samples[i - 1][1]),
    );
  const headings = [];
  let previous = from.yaw;
  for (let i = 0; i < samples.length; i++) {
    const a = samples[Math.max(0, i - 1)],
      b = samples[Math.min(samples.length - 1, i + 1)];
    let heading = Math.atan2(-(b[0] - a[0]), -(b[1] - a[1]));
    while (heading - previous > Math.PI) heading -= Math.PI * 2;
    while (heading - previous < -Math.PI) heading += Math.PI * 2;
    headings.push(heading);
    previous = heading;
  }
  let toYaw = to.yaw;
  while (toYaw - previous > Math.PI) toYaw -= Math.PI * 2;
  while (toYaw - previous < -Math.PI) toYaw += Math.PI * 2;
  return { from, to, samples, lengths, headings, toYaw, length: lengths.at(-1) };
}
export function sampleRoute(route, p) {
  const distance = clamp(p) * route.length;
  let i = 1;
  while (i < route.lengths.length - 1 && route.lengths[i] < distance) i++;
  const a = route.samples[i - 1],
    b = route.samples[i],
    q = (distance - route.lengths[i - 1]) / (route.lengths[i] - route.lengths[i - 1] || 1);
  return blend(a, b, q);
}
function routeHeading(route, p) {
  const d = clamp(p) * route.length;
  let i = 1;
  while (i < route.lengths.length - 1 && route.lengths[i] < d) i++;
  const q = (d - route.lengths[i - 1]) / (route.lengths[i] - route.lengths[i - 1] || 1);
  return lerp(route.headings[i - 1], route.headings[i], q);
}
export function participantPose(s) {
  if (s.route && ['enter', 'exit', 'finish', 'handoff'].includes(s.mode)) {
    const p = clamp(s.progress),
      route = s.route,
      [x, z] = sampleRoute(route, p),
      m = s.reduced ? 0.22 : 1,
      envelope = Math.sin(Math.PI * p),
      step = s.phaseTime * 10.8;
    let yaw = lerp(route.from.yaw, routeHeading(route, p), ease(p / 0.13));
    yaw = lerp(yaw, route.toYaw, ease((p - 0.87) / 0.13));
    const y =
      lerp(route.from.eye[1], 1.68, ease(p / 0.15)) +
      (route.to.eye[1] - 1.68) * ease((p - 0.85) / 0.15) +
      Math.abs(Math.sin(step)) * 0.08 * m * envelope;
    const hands = [-1, 1].map((side, j) => {
      const running = [
        side * 0.29,
        y - 0.46 + Math.sin(step * 0.5 + side * Math.PI) * 0.1,
        -0.63 + Math.sin(step * 0.5 + side * Math.PI) * 0.15,
      ];
      return blend(
        blend(route.from.hands[j], running, ease(p / 0.15)),
        route.to.hands[j],
        ease((p - 0.85) / 0.15),
      );
    });
    const pitch =
      lerp(route.from.pitch, -0.07, ease(p / 0.12)) +
      (route.to.pitch + 0.07) * ease((p - 0.87) / 0.13) +
      Math.sin(step) * 0.02 * m * envelope;
    return {
      root: [x, 0, z],
      eye: [x, y, z],
      yaw,
      pitch,
      roll:
        lerp(route.from.roll, 0, ease(p / 0.12)) +
        route.to.roll * ease((p - 0.87) / 0.13) +
        Math.sin(step * 0.5) * 0.027 * m * envelope,
      fov: lerp(route.from.fov, 74, ease(p / 0.15)) + (route.to.fov - 74) * ease((p - 0.85) / 0.15),
      hands,
      shoulderY: y - 0.27,
      run: true,
      travel: true,
      index: Math.min(7, Math.floor(s.phase / 2)),
      offset: [0, 0],
    };
  }
  if (s.mode === 'celebrate' || s.mode === 'complete') {
    const p = clamp(s.progress),
      m = s.reduced ? 0.22 : 1,
      lift = ease(p / 0.42),
      wave = Math.sin(s.phaseTime * 7) * 0.075 * Math.sin(Math.PI * p);
    const y = 1.68 + Math.sin(p * Math.PI * 4) * 0.055 * m;
    return {
      root: [40, 0, -24],
      eye: [40, y, -24],
      yaw: Math.sin(p * Math.PI * 2) * 0.12 * m,
      pitch: -0.05 + lift * 0.25,
      roll: wave * 0.2 * m,
      fov: 74,
      hands: [-1, 1].map((side) => [
        side * lerp(0.29, 0.46, lift) + wave,
        lerp(1.22, 2.38, lift),
        -0.63,
      ]),
      shoulderY: y - 0.27,
      run: false,
      celebrating: true,
      index: 7,
      offset: [0, 0],
    };
  }
  if (s.mode === 'partner') return watchPose(s);
  return exercisePose(s);
}

const workoutDurations = [12, 11, 11, 14, 12, 10, 12, 15];
export function workerPose(s) {
  const half = workoutDurations[Math.floor(s.phase / 2)] / 2;
  const workTime =
    s.mode === 'partner' ? half + s.phaseTime : s.mode === 'handoff' ? half : s.phaseTime;
  const profile =
    s.mode === 'partner'
      ? { ...s.profile, targetHeight: s.profile?.partnerTargetHeight }
      : s.profile;
  return exercisePose({
    ...s,
    mode: 'workout',
    phase: s.phase | 1,
    phaseTime: workTime,
    progress: s.mode === 'handoff' ? 0.5 : s.progress,
    profile,
  });
}
export function watchPose(s) {
  const worker = s.mode === 'workout' ? exercisePose(s) : workerPose(s),
    i = worker.index,
    m = s.reduced ? 0.22 : 1,
    moving = [1, 3, 5, 6].includes(i),
    dx = moving ? 0.65 : 1.8,
    dz = i === 7 ? -0.25 : 3;
  const x = worker.root[0] + dx,
    z = worker.root[2] + dz,
    step = s.phaseTime * 8;
  const y = 1.68 + (moving ? Math.abs(Math.sin(step)) * 0.04 : 0.008 * Math.sin(step * 0.3)) * m;
  const yaw = Math.atan2(dx, dz),
    pitch = Math.atan2(worker.shoulderY + 0.12 - y, Math.hypot(dx, dz)) * 0.55;
  return {
    root: [x, 0, z],
    eye: [x, y, z],
    yaw,
    pitch,
    roll: moving ? Math.sin(step * 0.5) * 0.012 * m : 0,
    fov: 76,
    hands: [
      [-0.29, y - 0.47, -0.47],
      [0.29, y - 0.47, -0.47],
    ],
    shoulderY: y - 0.27,
    run: false,
    watching: true,
    following: moving,
    index: i,
    offset: [0, 0],
  };
}

function exercisePose(s) {
  const p = s.progress,
    t = s.phaseTime * 1.04 * (1 - 0.055 * p),
    i = Math.floor(s.phase / 2),
    run = s.phase % 2 === 0,
    m = s.reduced ? 0.22 : 1;
  const pose = {
    root: [0, 0, 28],
    eye: [0, 1.68, 28],
    yaw: 0,
    pitch: 0,
    roll: 0,
    fov: 72,
    hands: [],
    run,
    index: i,
  };
  let y = 1.68,
    x = 0,
    z = 28,
    hip = 0;
  if (run) {
    const points = [
        [-44, 26],
        [44, 26],
        [44, -26],
        [-44, -26],
        [-44, 26],
      ],
      lengths = [88, 52, 88, 52],
      distance = p * 280;
    let total = 0,
      j = 0;
    for (; j < 3; j++) {
      if (distance < total + lengths[j]) break;
      total += lengths[j];
    }
    const q = (distance - total) / lengths[j],
      a = points[j],
      b = points[j + 1];
    x = lerp(a[0], b[0], q);
    z = lerp(a[1], b[1], q);
    pose.yaw = Math.atan2(-(b[0] - a[0]), -(b[1] - a[1]));
    const n = points[(j + 2) % 4];
    let da = Math.atan2(-(n[0] - b[0]), -(n[1] - b[1])) - pose.yaw;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    pose.yaw += da * ease((q - 0.91) / 0.09);
    const step = t * 10.8;
    y += Math.abs(Math.sin(step)) * 0.11 * m;
    pose.roll = Math.sin(step * 0.5) * 0.035 * m;
    pose.pitch = (Math.sin(step) * 0.026 - 0.1) * m;
    pose.fov = 74;
    for (const side of [-1, 1])
      pose.hands.push([
        side * 0.29,
        1.22 + Math.sin(step * 0.5 + side * Math.PI) * 0.13,
        -0.63 + Math.sin(step * 0.5 + side * Math.PI) * 0.16,
      ]);
  } else if (i === 0) {
    const c = cycle(t, 0.98),
      pull = curve(c, [
        [0, 0],
        [0.08, 0],
        [0.47, 1],
        [0.52, 1],
        [1, 0],
      ]);
    y = 1.78 - 0.71 * pull * m;
    z = 27.95 - 0.42 * pull * m;
    pose.pitch = (0.26 - 0.82 * pull) * m;
    pose.roll = Math.sin(c * Math.PI * 2) * 0.023 * m;
    pose.fov = 72 + 3 * pull * m;
    pose.action = pull;
    for (const side of [-1, 1])
      pose.hands.push([side * 0.36, lerp(2.27, 0.83, pull), lerp(-0.47, -0.73, pull)]);
  } else if (i === 1) {
    const step = t * 9;
    x = Math.sin(step * 0.5) * 0.055 * m;
    z = 28.5 - p * 20;
    y = 1.3 + Math.abs(Math.sin(step)) * 0.12 * m;
    pose.pitch = (-0.23 + Math.sin(step) * 0.055) * m;
    pose.roll = Math.sin(step * 0.5) * 0.033 * m;
    pose.fov = 76;
    pose.sledZ = z - 1.02;
    for (const side of [-1, 1]) pose.hands.push([side * 0.43, 1.12, -0.57]);
  } else if (i === 2) {
    const c = cycle(t, 1.25),
      force = curve(c, [
        [0, 0],
        [0.35, 1],
        [0.58, 1],
        [1, 0],
      ]);
    z = 28.1 + force * 0.65 * m;
    y = 1.67 - force * 0.24 * m;
    x = Math.sin(t * 3.9) * 0.05 * m;
    pose.pitch = (-0.17 + force * 0.14) * m;
    pose.roll = Math.sin(t * 3.9) * 0.045 * m;
    pose.fov = 73 + force * 2 * m;
    pose.sledZ = 7 + p * 17;
    for (const side of [-1, 1]) {
      const w = 0.5 + 0.5 * Math.sin(c * Math.PI * 2 + side * Math.PI);
      pose.hands.push([side * 0.2, 0.95 + w * 0.23, lerp(-0.85, -0.31, w)]);
    }
  } else if (i === 3) {
    const c = cycle(t, 1.8),
      low = curve(c, [
        [0, 0],
        [0.18, 1],
        [0.38, 1],
        [0.59, 0],
        [1, 0],
      ]),
      jump = curve(c, [
        [0, 0],
        [0.61, 0],
        [0.76, 1],
        [0.95, 0],
        [1, 0],
      ]);
    z = 29 - (Math.floor(t / 1.8) + ease((c - 0.6) / 0.35)) * 2.35;
    y = 1.68 - 1.34 * low * m + 0.52 * jump * m;
    pose.pitch = (-0.9 * low + 0.13 * jump) * m;
    pose.roll = Math.sin(c * Math.PI * 2) * 0.045 * m;
    pose.fov = 73 + low * 5 * m;
    for (const side of [-1, 1])
      pose.hands.push([side * 0.34, lerp(1.05, 0.12, low), lerp(-0.47, -0.49, low)]);
    pose.action = low;
  } else if (i === 4) {
    const c = cycle(t, 1.9),
      drive = curve(c, [
        [0, 0],
        [0.43, 1],
        [0.53, 1],
        [1, 0],
      ]);
    z = 27.25 + drive * 0.85;
    y = 1.12 + Math.sin(c * Math.PI) * 0.06 * m;
    pose.pitch = (-0.2 + drive * 0.34) * m;
    pose.roll = Math.sin(c * Math.PI * 2) * 0.018 * m;
    pose.fov = 70 + 2 * drive * m;
    for (const side of [-1, 1]) pose.hands.push([side * 0.22, 0.85, lerp(-0.78, -0.36, drive)]);
    pose.action = drive;
  } else if (i === 5) {
    const step = t * 8;
    z = 29 - p * 20;
    x = Math.sin(step * 0.5) * 0.09 * m;
    y = 1.68 + Math.abs(Math.sin(step)) * 0.09 * m;
    pose.roll = Math.sin(step * 0.5) * 0.045 * m;
    pose.pitch = (-0.3 + Math.sin(step) * 0.022) * m;
    pose.fov = 74;
    for (const side of [-1, 1])
      pose.hands.push([side * 0.47, 1.0 + Math.sin(step * 0.5 + side * Math.PI) * 0.035, -0.62]);
  } else if (i === 6) {
    const c = cycle(t, 1.6),
      low = curve(c, [
        [0, 0],
        [0.42, 1],
        [0.58, 1],
        [0.91, 0],
        [1, 0],
      ]);
    z = 29 - (Math.floor(t / 1.6) + ease(c / 0.88)) * 2.4;
    y = 1.68 - 0.68 * low * m;
    x = Math.sin((t * Math.PI) / 1.6) * 0.035 * m;
    pose.pitch = (-0.08 - 0.14 * low) * m;
    pose.roll = Math.sin((t * Math.PI) / 1.6) * 0.055 * m;
    pose.fov = 72 + 2 * low * m;
    for (const side of [-1, 1]) pose.hands.push([side * 0.43, y - 0.08, 0.04]);
    pose.action = low;
  } else if (i === 7) {
    const c = cycle(t, 1.45),
      squat = curve(c, [
        [0, 0],
        [0.25, 1],
        [0.43, 0],
        [1, 0],
      ]);
    y = 1.68 - 0.76 * squat * m;
    z = 27.95 + 0.2 * squat * m;
    const release = 0.44,
      catchAt = 0.95;
    let ball;
    if (c < release) {
      const lift = curve(c, [
        [0, 0],
        [0.26, 0],
        [0.44, 1],
      ]);
      ball = [0, y - 0.49 + lift * 0.94, z - 0.67];
    } else {
      const q = (c - release) / (catchAt - release);
      const target = s.profile?.targetHeight || 3;
      ball = [
        0,
        lerp(q <= 0.5 ? 2.13 : 1.18, target, Math.sin(Math.PI * q)),
        27.28 - 2.74 * Math.sin(Math.PI * q),
      ];
    }
    if (c >= catchAt) ball = [0, 1.18, z - 0.67];
    pose.ball = ball;
    pose.pitch =
      c < release
        ? (-0.15 * squat +
            curve(c, [
              [0, 0],
              [0.29, 0],
              [0.44, 0.3],
            ])) *
          m
        : Math.atan2(ball[1] - y, z - ball[2]) * 0.86 * m;
    if (c >= catchAt) pose.pitch *= 1 - ease((c - catchAt) / (1 - catchAt));
    pose.roll = Math.sin(c * Math.PI * 2) * 0.02 * m;
    pose.fov =
      72 +
      curve(c, [
        [0, 0],
        [0.35, 0],
        [0.48, 3],
        [0.95, 0],
        [1, 0],
      ]) *
        m;
    const handsUp =
      c < release
        ? ball[1]
        : curve(c, [
            [0, 1.2],
            [0.44, 2.05],
            [0.6, 1.8],
            [0.8, 1.35],
            [1, 1.18],
          ]);
    for (const side of [-1, 1]) pose.hands.push([side * 0.24, handsUp - 0.08, -0.63]);
    pose.action = squat;
  }
  // Head, shoulders, hands and carried objects all use this same participant pose.
  const offset = run ? [0, 0] : [layout[i][0], layout[i][1] - 25];
  pose.offset = offset;
  pose.root = [x + offset[0], hip, z + offset[1]];
  pose.eye = [x + offset[0], y, z + offset[1]];
  pose.shoulderY = y - 0.27;
  if (pose.sledZ !== undefined) pose.sledZ += offset[1];
  if (pose.ball) {
    pose.ball[0] += offset[0];
    pose.ball[2] += offset[1];
  }
  return pose;
}
function cube() {
  const vertices = [
      [-0.5, -0.5, -0.5],
      [0.5, -0.5, -0.5],
      [0.5, 0.5, -0.5],
      [-0.5, 0.5, -0.5],
      [-0.5, -0.5, 0.5],
      [0.5, -0.5, 0.5],
      [0.5, 0.5, 0.5],
      [-0.5, 0.5, 0.5],
    ],
    tri = [],
    lines = [];
  for (const f of [
    [0, 1, 2, 3],
    [5, 4, 7, 6],
    [4, 0, 3, 7],
    [1, 5, 6, 2],
    [3, 2, 6, 7],
    [4, 5, 1, 0],
  ])
    for (const j of [0, 1, 2, 0, 2, 3]) tri.push(...vertices[f[j]]);
  for (const [a, b] of [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ])
    lines.push(...vertices[a], ...vertices[b]);
  return { tri, lines };
}
function sphere() {
  const tri = [],
    lines = [],
    N = 20,
    M = 14,
    point = (j, i) => [
      0.5 * Math.sin((j * Math.PI) / M) * Math.cos((i * Math.PI * 2) / N),
      0.5 * Math.cos((j * Math.PI) / M),
      0.5 * Math.sin((j * Math.PI) / M) * Math.sin((i * Math.PI * 2) / N),
    ];
  for (let j = 0; j < M; j++)
    for (let i = 0; i < N; i++) {
      const a = point(j, i),
        b = point(j + 1, i),
        c = point(j + 1, i + 1),
        d = point(j, i + 1);
      for (const v of [a, b, c, a, c, d]) tri.push(...v);
      if (j % 3 === 0 && j > 0) lines.push(...a, ...d);
      if (i % 4 === 0) lines.push(...a, ...b);
    }
  return { tri, lines };
}
function cylinder() {
  const tri = [],
    lines = [],
    N = 16,
    p = (i, y) => [0.5 * Math.cos((i * 2 * Math.PI) / N), y, 0.5 * Math.sin((i * 2 * Math.PI) / N)];
  for (let i = 0; i < N; i++) {
    const a = p(i, -0.5),
      b = p(i + 1, -0.5),
      c = p(i + 1, 0.5),
      d = p(i, 0.5);
    for (const v of [a, b, c, a, c, d, [0, -0.5, 0], b, a, [0, 0.5, 0], d, c]) tri.push(...v);
    lines.push(...a, ...b, ...c, ...d);
    if (i % 4 === 0) lines.push(...a, ...d);
  }
  return { tri, lines };
}
function segmentMatrix(a, b, width) {
  const d = b.map((v, i) => v - a[i]),
    len = Math.hypot(...d),
    axis = d.map((v) => v / len),
    helper = Math.abs(axis[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
  const cross = (u, v) => [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ],
    r = cross(helper, axis),
    norm = Math.hypot(...r),
    right = r.map((v) => v / norm),
    back = cross(right, axis);
  return new Float32Array([
    ...right.map((v) => v * width),
    0,
    ...axis.map((v) => v * len),
    0,
    ...back.map((v) => v * width),
    0,
    ...a.map((v, i) => (v + b[i]) * 0.5),
    1,
  ]);
}
export class ArenaRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = (this.gl = canvas.getContext('webgl', { antialias: true, alpha: false }));
    if (!gl) throw new Error('WebGL unavailable');
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    this.program = gl.createProgram();
    gl.attachShader(this.program, compile(gl.VERTEX_SHADER, vertex));
    gl.attachShader(this.program, compile(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
      throw new Error('Shader link failed');
    gl.useProgram(this.program);
    this.u = {};
    for (const name of ['matrix', 'model', 'color', 'pointSize', 'isPoint'])
      this.u[name] = gl.getUniformLocation(this.program, name);
    this.position = gl.getAttribLocation(this.program, 'position');
    this.meshes = {};
    this.geometry = {};
    this.stationBatches = new Map();
    this.idlePoses = new Map();
    for (const [name, mesh] of [
      ['cube', cube()],
      ['sphere', sphere()],
      ['cylinder', cylinder()],
    ]) {
      this.geometry[name] = mesh;
      this.meshes[name] = {};
      for (const type of ['tri', 'lines']) {
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh[type]), gl.STATIC_DRAW);
        this.meshes[name][type] = { buffer, count: mesh[type].length / 3 };
      }
    }
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1, 1);
    this.stage = 0;
    this.world = [];
    this.settled = new Map();
    this.labelCache = new Map();
    this.buildWorld();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }
  resize() {
    const c = this.canvas;
    this.dpr = Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.35 : 1.7);
    this.dirty = true;
    c.width = Math.max(1, Math.floor(c.clientWidth * this.dpr));
    c.height = Math.max(1, Math.floor(c.clientHeight * this.dpr));
    this.gl.viewport(0, 0, c.width, c.height);
  }
  add(x, y, z, sx, sy, sz, mesh = 'cube', rx = 0, ry = 0) {
    this.world.push({ matrix: model(x, y, z, sx, sy, sz, ry, rx), mesh });
  }
  buildWorld() {
    this.world = [];
    this.labels = [];
    this.add(0, -0.08, 0, 106, 0.16, 68);
    this.add(0, 2.6, -34, 106, 5.2, 0.04);
    this.add(0, 2.6, 34, 106, 5.2, 0.04);
    this.add(-53, 2.6, 0, 0.04, 5.2, 68);
    this.add(53, 2.6, 0, 0.04, 5.2, 68);
    for (let x = -48; x <= 48; x += 12) {
      this.add(x, 2.6, -34, 0.025, 5.2, 0.025);
      this.add(x, 2.6, 34, 0.025, 5.2, 0.025);
      this.add(x, 5.2, 0, 0.025, 0.025, 68);
    }
    for (const x of [-36, 36]) this.add(x, 0.018, 0, 0.025, 0.025, 40);
    for (const z of [-20, 20]) this.add(0, 0.018, z, 72, 0.025, 0.025);
    for (const x of [-50, 50]) this.add(x, 0.018, 0, 0.025, 0.025, 62);
    for (const z of [-31, 31]) this.add(0, 0.018, z, 100, 0.025, 0.025);
    for (let j = 0; j < 8; j++) {
      const [x, z] = layout[j];
      for (const dx of [-1.7, 1.7]) this.add(x + dx, 0.02, 3, 0.022, 0.025, 30);
      for (let k = 0; k < 18; k++) this.add(x, 0.03, 17 - k * 1.5, 3.4, 0.02, 0.018);
      this.equipment(j, x, z + (j === 0 ? 2.2 : j === 4 ? 0.8 : 0));
      this.add(x + 2.25, 1.25, 18.5, 0.75, 1.25, 0.035);
      this.labels.push([String(j + 1).padStart(2, '0'), x + 2.25, 1.1, 18.53, 0.35]);
    }
    this.labels.push(['ROXZONE IN', 0, 2.5, 21, 0.35], ['OUT', -40, 1.6, 23, 0.35]);
    this.add(0, 2.75, 21, 4.5, 0.75, 0.025);
    // The final straight has a real arch, timing strip and barriers.
    for (const x of [36.8, 43.2]) this.add(x, 1.8, -20, 0.15, 3.6, 0.15);
    this.add(40, 3.25, -20, 6.5, 0.7, 0.12);
    this.labels.push(['FINISH', 40, 3.07, -19.93, 0.39]);
    this.add(40, 0.03, -20, 6.2, 0.02, 0.45);
    for (const side of [-1, 1])
      for (let k = 0; k < 6; k++) {
        const x = 40 + side * 3.5,
          z = -10 - k * 3.5;
        this.add(x, 0.5, z, 0.04, 1, 0.04);
        this.add(x, 0.8, z - 1.3, 0.04, 0.04, 2.6);
      }
    const points = [];
    for (let x = -51; x <= 51; x += 1.5)
      for (let z = -33; z <= 33; z += 1.5) points.push(x, 0.018, z);
    this.pointsCount = points.length / 3;
    if (!this.pointsBuffer) this.pointsBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.pointsBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(points), this.gl.STATIC_DRAW);
    this.deleteBatch(this.staticBatch);
    this.staticBatch = this.captureBatch(() => {
      for (const item of this.world) this.draw(item.matrix, item.mesh);
      for (const label of this.labels) this.drawLabel(...label);
    });
    if (!this.crowdBatch) this.crowdBatch = this.captureBatch(() => this.crowd(0, false));
  }
  equipment(type, x, z) {
    const add = (dx, y, dz, sx, sy, sz, mesh = 'cube', rx = 0) =>
      this.add(x + dx, y, z + dz, sx, sy, sz, mesh, rx);
    if (type === 0) {
      add(0, 0.06, 0, 1.25, 0.1, 1.25);
      for (const side of [-1, 1]) {
        add(side * 0.48, 1.55, -0.27, 0.06, 3.1, 0.06);
        add(side * 0.48, 2.85, -0.13, 0.18, 0.09, 0.25);
        add(side * 0.43, 0.5, -0.5, 0.04, 1, 0.04);
      }
      add(0, 3.05, -0.27, 1.05, 0.065, 0.06);
      add(0, 1.62, -0.15, 0.34, 0.42, 0.14);
      add(0, 1.62, -0.064, 0.29, 0.34, 0.02);
      add(0, 0.5, -0.27, 0.7, 0.25, 0.7, 'cylinder', Math.PI / 2);
      add(0, 0.5, -0.1, 0.52, 0.09, 0.52, 'cylinder', Math.PI / 2);
    }
    if (type === 4) {
      add(0, 0.24, 0.35, 0.12, 0.12, 4.9);
      add(0, 0.63, -1.25, 0.77, 0.25, 0.77, 'cylinder', Math.PI / 2);
      add(0, 0.63, -1.09, 0.57, 0.08, 0.57, 'cylinder', Math.PI / 2);
      for (const side of [-1, 1]) {
        add(side * 0.21, 0.34, -0.6, 0.18, 0.065, 0.37, 'cube', -0.4);
        add(side * 0.21, 0.44, -0.6, 0.2, 0.025, 0.035);
      }
      add(0, 0.89, -1.2, 0.035, 0.6, 0.035, 'cube', -0.2);
      add(0, 1.22, -1.13, 0.34, 0.29, 0.12);
      add(0, 1.22, -1.06, 0.28, 0.24, 0.02);
    }
    if (type === 7) {
      add(0, 2.25, -0.7, 4.4, 4.5, 0.065);
      const targets =
        this.profile?.id === 'mixed-doubles'
          ? [
              [0, 3],
              [0, 2.7],
            ]
          : [[0, this.profile?.targetHeight || 3]];
      for (const [dx, h] of targets) {
        const size = this.profile?.id === 'mixed-doubles' ? 0.26 : 0.75;
        add(dx, h, -0.66, size, size, 0.04);
        add(dx, h, -0.63, size * 0.4, size * 0.4, 0.025);
        this.labels.push([h.toFixed(2) + ' M', x + dx + 1.1, h - 0.05, z - 0.62, 0.13]);
      }
      this.labels.push(['TARGET', x, 4.1, z - 0.62, 0.18]);
      add(1.8, 0.024, 2.5, 1, 0.02, 1.5);
    }
  }
  setStage(p) {
    this.stage = p;
  }
  settleEquipment(i, pose) {
    this.settled.set(i, pose);
  }
  clearEquipment() {
    this.settled.clear();
    this.idlePoses.clear();
    for (const cache of this.stationBatches.values()) this.deleteBatch(cache.batch);
    this.stationBatches.clear();
    this.dirty = true;
  }
  configureDivision(profile) {
    this.profile = profile;
    this.clearEquipment();
    this.buildWorld();
  }
  bufferDraw(buffer, count, mode, color) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(this.position);
    gl.vertexAttribPointer(this.position, 3, gl.FLOAT, false, 0, 0);
    gl.uniform3fv(this.u.color, color);
    gl.drawArrays(mode, 0, count);
  }
  draw(matrix, mesh = 'cube') {
    if (this.capture) {
      for (const type of ['tri', 'lines'])
        this.appendTransformed(this.capture[type], this.geometry[mesh][type], matrix);
      return;
    }
    const gl = this.gl,
      g = this.meshes[mesh];
    gl.uniformMatrix4fv(this.u.model, false, matrix);
    this.bufferDraw(g.tri.buffer, g.tri.count, gl.TRIANGLES, WHITE);
    this.bufferDraw(g.lines.buffer, g.lines.count, gl.LINES, INK);
  }
  appendTransformed(target, vertices, m) {
    for (let j = 0; j < vertices.length; j += 3) {
      const x = vertices[j],
        y = vertices[j + 1],
        z = vertices[j + 2];
      target.push(
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
      );
    }
  }
  captureBatch(callback) {
    const data = { tri: [], lines: [] };
    this.capture = data;
    try {
      callback();
    } finally {
      this.capture = null;
    }
    const batch = {};
    for (const type of ['tri', 'lines']) {
      const buffer = this.gl.createBuffer();
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(data[type]), this.gl.STATIC_DRAW);
      batch[type] = { buffer, count: data[type].length / 3 };
    }
    return batch;
  }
  deleteBatch(batch) {
    if (batch) for (const type of ['tri', 'lines']) this.gl.deleteBuffer(batch[type].buffer);
  }
  drawBatch(batch) {
    const gl = this.gl;
    gl.uniformMatrix4fv(this.u.model, false, identity());
    this.bufferDraw(batch.tri.buffer, batch.tri.count, gl.TRIANGLES, WHITE);
    this.bufferDraw(batch.lines.buffer, batch.lines.count, gl.LINES, INK);
  }
  box(x, y, z, sx, sy, sz, mesh = 'cube', ry = 0, rx = 0) {
    this.draw(model(x, y, z, sx, sy, sz, ry, rx), mesh);
  }
  line(a, b) {
    if (Math.hypot(...a.map((v, i) => v - b[i])) < 0.001) return;
    this.draw(segmentMatrix(a, b, 0.012), 'cylinder');
  }
  rod(a, b, width = 0.1) {
    this.draw(segmentMatrix(a, b, width), 'cylinder');
  }
  worldPoint(pose, v) {
    const [x, y, z] = v,
      c = Math.cos(pose.yaw),
      s = Math.sin(pose.yaw);
    return [pose.root[0] + x * c + z * s, y, pose.root[2] - x * s + z * c];
  }
  hands(pose) {
    for (let j = 0; j < 2; j++) {
      const side = j === 0 ? -1 : 1,
        local = pose.hands[j],
        hand = this.worldPoint(pose, local),
        shoulder = this.worldPoint(pose, [side * 0.25, pose.shoulderY, 0.1]);
      let elbow = this.worldPoint(pose, [
        side * 0.39,
        lerp(pose.shoulderY, local[1], 0.58) - 0.14,
        lerp(0.1, local[2], 0.47) + 0.09,
      ]);
      this.rod(shoulder, elbow, 0.13);
      this.box(...elbow, 0.13, 0.13, 0.13, 'sphere');
      this.rod(elbow, hand, 0.105);
      this.box(...hand, 0.13, 0.17, 0.075, 'sphere', pose.yaw);
      for (let f = 0; f < 4; f++) {
        const a = this.worldPoint(pose, [
            local[0] + (f - 1.5) * 0.027,
            local[1] - 0.055,
            local[2] - 0.015,
          ]),
          b = this.worldPoint(pose, [
            local[0] + (f - 1.5) * 0.027,
            local[1] - 0.105,
            local[2] - 0.055,
          ]);
        this.rod(a, b, 0.026);
      }
      const thumb = this.worldPoint(pose, [
        local[0] - side * 0.073,
        local[1] - 0.01,
        local[2] - 0.06,
      ]);
      this.rod(hand, thumb, 0.035);
    }
  }
  sled(x, z, load = 152) {
    for (const side of [-1, 1]) this.box(x + side * 0.51, 0.09, z, 0.13, 0.14, 1.6);
    this.box(x, 0.2, z, 1.25, 0.14, 1.3);
    for (const y of load <= 102 ? [0.34, 0.46] : [0.34, 0.46, 0.58])
      this.box(x, y, z, 0.68, 0.1, 0.68, 'cylinder');
    this.box(x, 0.69, z, 0.08, 0.45, 0.08, 'cylinder');
    for (const side of [-1, 1])
      this.box(x + side * 0.43, 0.75, z + 0.45, 0.06, 1.3, 0.06, 'cylinder');
    this.box(x, 1.31, z + 0.45, 0.92, 0.05, 0.05);
  }
  rope(a, b) {
    for (let j = 0; j < 12; j++) {
      const q = j / 12,
        r = (j + 1) / 12,
        u = blend(a, b, q),
        v = blend(a, b, r);
      u[1] -= Math.sin(q * Math.PI) * 0.12;
      v[1] -= Math.sin(r * Math.PI) * 0.12;
      this.rod(u, v, 0.029);
    }
  }
  kettlebell(x, y, z, load = 24) {
    const size = load === 16 ? 0.29 : 0.35;
    this.box(x, y - 0.27, z, size, size * 1.15, size, 'sphere');
    const points = [
      [x - 0.1, y - 0.12, z],
      [x - 0.1, y + 0.01, z],
      [x + 0.1, y + 0.01, z],
      [x + 0.1, y - 0.12, z],
    ];
    for (let j = 0; j < 3; j++) this.rod(points[j], points[j + 1], 0.034);
  }
  drawLabel(text, x, y, z, height = 0.2, slot = null) {
    const key = slot || text;
    if (!this.labelCache.has(key) || this.labelCache.get(key).text !== text) {
      const vertices = [];
      let left = -text.length * 0.38;
      for (const ch of text) {
        for (const stroke of FONT[ch] || []) {
          for (let j = 1; j < stroke.length; j++)
            vertices.push(
              left + stroke[j - 1][0],
              stroke[j - 1][1],
              0,
              left + stroke[j][0],
              stroke[j][1],
              0,
            );
        }
        left += 0.76;
      }
      const buffer = this.labelCache.get(key)?.buffer || this.gl.createBuffer();
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(vertices), this.gl.STATIC_DRAW);
      this.labelCache.set(key, { buffer, count: vertices.length / 3, text, vertices });
    }
    const label = this.labelCache.get(key);
    if (this.capture) {
      this.appendTransformed(
        this.capture.lines,
        label.vertices,
        model(x, y, z, height, height, height),
      );
      return;
    }
    this.gl.uniformMatrix4fv(this.u.model, false, model(x, y, z, height, height, height));
    this.bufferDraw(label.buffer, label.count, this.gl.LINES, INK);
  }
  crowd(t, cheering) {
    for (const side of [-1, 1])
      for (let j = 0; j < 4; j++) {
        const x = 40 + side * (3.25 + (j % 2) * 0.15),
          z = -16 - j * 4.2,
          y = 1.35;
        this.box(x, 1.78, z, 0.27, 0.3, 0.27, 'sphere');
        this.rod([x, 0.95, z], [x, 1.55, z], 0.3);
        for (const leg of [-1, 1])
          this.rod([x + leg * 0.1, 0.97, z], [x + leg * 0.15, 0.1, z], 0.12);
        const wave = cheering ? Math.sin(t * 7 + j) * 0.1 : 0;
        for (const arm of [-1, 1]) {
          const hand = [
            x + arm * (cheering ? 0.34 + wave : 0.34),
            cheering ? 2.13 + wave : 1.36,
            z - 0.12,
          ];
          const elbow = [x + arm * 0.3, cheering ? 1.82 : 1.12, z];
          this.rod([x + arm * 0.14, y + 0.16, z], elbow, 0.09);
          this.rod(elbow, hand, 0.075);
          this.box(...hand, 0.09, 0.13, 0.075, 'sphere');
        }
      }
  }
  athlete(pose, index, t, sex) {
    const pt = (v) => this.worldPoint(pose, v),
      y = pose.eye[1],
      low = !pose.run && index === 3 ? pose.action || 0 : 0,
      row = !pose.run && index === 4 && !pose.watching;
    const hipY = row ? 0.52 : Math.max(0.22, y - 0.84),
      hipZ = low ? 0.65 : 0.1;
    this.box(
      ...pt([0, y + 0.015, 0]),
      sex === 'female' ? 0.25 : 0.28,
      0.3,
      0.26,
      'sphere',
      pose.yaw,
      pose.pitch,
    );
    this.rod(pt([0, hipY, hipZ]), pt([0, pose.shoulderY, 0.1]), sex === 'female' ? 0.29 : 0.34);
    const stride =
      pose.run || pose.following || ([1, 3, 5, 6].includes(index) && !pose.watching)
        ? Math.sin(t * (index === 6 ? 3.9 : 5.4)) * 0.38
        : 0;
    for (const side of [-1, 1]) {
      const foot = pt([
          side * 0.13,
          row ? 0.35 : Math.max(0.07, low * 0.02),
          row ? -1.0 : hipZ + side * stride + (low ? 0.4 : 0),
        ]),
        knee = pt([
          side * 0.14,
          Math.max(0.15, hipY * 0.52) + (row ? 0.18 : 0),
          hipZ - 0.12 + (row ? -0.5 : side * stride * 0.55),
        ]);
      this.rod(pt([side * 0.1, hipY, hipZ]), knee, 0.14);
      this.rod(knee, foot, 0.11);
      this.box(...foot, 0.14, 0.1, 0.27, 'sphere', pose.yaw);
    }
    this.hands(pose);
    this.drawLabel('TEAM', pose.root[0], y + 0.3, pose.root[2], 0.13, 'teammate-label');
  }
  drawStation(j, eq, s, active) {
    const i = j,
      profile = s.profile || this.profile,
      t = s.phaseTime;
    const [x, z] = layout[j];
    if (j === 1 || j === 2) {
      const load = j === 1 ? profile?.push : profile?.pull;
      this.sled(x, eq.sledZ, load);
      this.drawLabel(`${load || 152} KG`, x, 0.29, eq.sledZ + 0.68, 0.14, `sled-${j}`);
    }
    if (j === 2) {
      const hand = this.worldPoint(eq, eq.hands[0]);
      this.rope([x, 0.16, eq.sledZ + 0.65], [hand[0], hand[1] - 0.03, hand[2]]);
      for (let k = 0; k < 10; k++) {
        const a = k * Math.PI * 0.48,
          b = (k + 1) * Math.PI * 0.48;
        this.rod(
          [x + Math.cos(a) * 0.32, 0.05, 16.9 + Math.sin(a) * 0.32],
          [x + Math.cos(b) * 0.32, 0.05, 16.9 + Math.sin(b) * 0.32],
          0.029,
        );
      }
    }
    if (j === 0) {
      for (const side of [-1, 1]) {
        const hand = this.worldPoint(eq, eq.hands[side === -1 ? 0 : 1]);
        this.rope([x + side * 0.48, 2.95, z + 2.07], hand);
        this.box(...hand, 0.19, 0.04, 0.07);
      }
      this.drawLabel(
        active && i === 0
          ? String(Math.floor(s.progress * 1000)).padStart(4, '0')
          : this.settled.has(j)
            ? '1000'
            : '0000',
        x,
        1.52,
        z + 2.155,
        0.07,
        'ski-counter',
      );
    }
    if (j === 4) {
      const h = eq.hands[0],
        hp = this.worldPoint(eq, [0, h[1], h[2]]);
      this.box(...hp, 0.55, 0.055, 0.07);
      this.rope([x, 0.55, z - 0.25], hp);
      this.box(x, 0.49, eq.root[2] + 0.12, 0.52, 0.11, 0.42);
      this.drawLabel(
        active && i === 4
          ? String(Math.floor(s.progress * 1000)).padStart(4, '0')
          : this.settled.has(j)
            ? '1000'
            : '0000',
        x,
        1.15,
        z - 0.24,
        0.068,
        'row-counter',
      );
    }
    if (j === 5)
      for (const side of [-1, 1]) {
        const h = this.worldPoint(eq, eq.hands[side === -1 ? 0 : 1]);
        if (!(active && i === j)) h[1] = 0.48;
        this.kettlebell(...h, profile?.carry);
        this.drawLabel(
          `${profile?.carry || 24}`,
          h[0],
          h[1] - 0.31,
          h[2] + 0.17,
          0.08,
          `kb-${side}`,
        );
      }
    if (j === 6) {
      const top = active && i === j ? eq.shoulderY + 0.19 : 0.35;
      this.rod(
        this.worldPoint(eq, [-0.57, top, 0.06]),
        this.worldPoint(eq, [0.57, top, 0.06]),
        profile?.bag === 10 ? 0.27 : 0.34,
      );
      const label = this.worldPoint(eq, [0, top - 0.03, 0.24]);
      this.drawLabel(`${profile?.bag || 20} KG`, ...label, 0.12, 'bag-load');
    }
    if (j === 7) {
      this.box(...eq.ball, 0.4, 0.4, 0.4, 'sphere', active && i === 7 ? t * 0.35 : 0);
      this.drawLabel(
        `${profile?.ball || 6}`,
        eq.ball[0],
        eq.ball[1] - 0.045,
        eq.ball[2] + 0.205,
        0.09,
        'ball-load',
      );
    }
  }
  render(s) {
    const gl = this.gl,
      pose = participantPose(s),
      t = s.phaseTime,
      i = pose.index;
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform1f(this.u.isPoint, 0);
    gl.uniform1f(this.u.pointSize, 2.1 * this.dpr);
    const vp = multiply(
      perspective(this.canvas.width / this.canvas.height, pose.fov),
      view(pose.eye, pose.yaw, pose.pitch, pose.roll),
    );
    gl.uniformMatrix4fv(this.u.matrix, false, vp);
    this.drawBatch(this.staticBatch);
    gl.uniformMatrix4fv(this.u.model, false, identity());
    gl.uniform1f(this.u.isPoint, 1);
    this.bufferDraw(this.pointsBuffer, this.pointsCount, gl.POINTS, INK);
    gl.uniform1f(this.u.isPoint, 0);
    const active =
        ['workout', 'partner', 'handoff'].includes(s.mode) || (!s.mode && s.phase % 2 === 1),
      worker = active ? workerPose(s) : null,
      profile = s.profile || this.profile;
    for (let j = 0; j < 8; j++) {
      if (active && i === j) {
        this.drawStation(j, worker, s, true);
        continue;
      }
      if (!this.idlePoses.has(j))
        this.idlePoses.set(
          j,
          exercisePose({ phase: j * 2 + 1, progress: 0, phaseTime: 0, reduced: false, profile }),
        );
      const eq = this.settled.get(j) || this.idlePoses.get(j);
      let cache = this.stationBatches.get(j);
      if (!cache || cache.pose !== eq) {
        this.deleteBatch(cache?.batch);
        cache = { pose: eq, batch: this.captureBatch(() => this.drawStation(j, eq, s, false)) };
        this.stationBatches.set(j, cache);
      }
      this.drawBatch(cache.batch);
    }

    if (s.route && pose.travel) {
      if (this.cachedRoute !== s.route) {
        this.deleteBatch(this.routeBatch);
        this.cachedRoute = s.route;
        this.routeBatch = this.captureBatch(() => {
          const points = s.route.samples;
          for (let k = 1; k < points.length; k += 3) {
            const a = points[k - 1],
              b = points[Math.min(points.length - 1, k + 1)];
            this.rod([a[0], 0.044, a[1]], [b[0], 0.044, b[1]], 0.037);
          }
        });
      }
      this.drawBatch(this.routeBatch);
    }
    if (['finish', 'celebrate', 'complete'].includes(s.mode)) this.crowd(s.time || 0, true);
    else this.drawBatch(this.crowdBatch);
    if (pose.celebrating) {
      for (let j = 0; j < 16; j++) {
        const q = j * 1.71;
        this.box(
          40 + Math.sin(q) * 2.8,
          3.3 - ((t * 0.7 + j * 0.27) % 2.4),
          -26 + Math.cos(q) * 1.1,
          0.045,
          0.08,
          0.022,
          'cube',
          q + t * 0.7,
        );
      }
    }
    if (profile?.doubles) {
      let teammate;
      if (s.mode === 'partner') teammate = worker;
      else if (s.mode === 'handoff') {
        const parked = watchPose({ ...s, mode: 'partner', progress: 0.5, phaseTime: 0 }),
          q = ease(s.progress);
        teammate = {
          ...worker,
          root: blend(parked.root, worker.root, q),
          eye: blend(parked.eye, worker.eye, q),
          hands: worker.hands.map((h, j) => blend(parked.hands[j], h, q)),
          shoulderY: lerp(parked.shoulderY, worker.shoulderY, q),
        };
      } else if (s.mode === 'workout') teammate = watchPose(s);
      else {
        teammate = { ...pose, root: [...pose.root], eye: [...pose.eye] };
        const c = Math.cos(pose.yaw),
          sn = Math.sin(pose.yaw),
          dx = 1.1 * c - 2.2 * sn,
          dz = -1.1 * sn - 2.2 * c;
        teammate.root[0] += dx;
        teammate.root[2] += dz;
        teammate.eye[0] += dx;
        teammate.eye[2] += dz;
      }
      this.athlete(
        teammate,
        s.mode === 'partner'
          ? workerPose({ ...s, profile: { ...profile, targetHeight: profile.partnerTargetHeight } })
              .index
          : pose.index,
        t,
        profile.partnerSex,
      );
    }
    this.hands(pose);
  }
}

const FONT = {
  0: [
    [
      [0, 0],
      [0.6, 0],
      [0.6, 1],
      [0, 1],
      [0, 0],
    ],
  ],
  1: [
    [
      [0.1, 0.75],
      [0.3, 1],
      [0.3, 0],
    ],
    [
      [0, 0],
      [0.6, 0],
    ],
  ],
  2: [
    [
      [0, 1],
      [0.6, 1],
      [0.6, 0.55],
      [0, 0],
      [0.6, 0],
    ],
  ],
  3: [
    [
      [0, 1],
      [0.6, 1],
      [0.6, 0],
      [0, 0],
    ],
    [
      [0.05, 0.5],
      [0.6, 0.5],
    ],
  ],
  4: [
    [
      [0, 1],
      [0, 0.5],
      [0.6, 0.5],
    ],
    [
      [0.6, 1],
      [0.6, 0],
    ],
  ],
  5: [
    [
      [0.6, 1],
      [0, 1],
      [0, 0.5],
      [0.6, 0.5],
      [0.6, 0],
      [0, 0],
    ],
  ],
  6: [
    [
      [0.6, 1],
      [0, 1],
      [0, 0],
      [0.6, 0],
      [0.6, 0.5],
      [0, 0.5],
    ],
  ],
  7: [
    [
      [0, 1],
      [0.6, 1],
      [0.15, 0],
    ],
  ],
  8: [
    [
      [0, 0.5],
      [0, 1],
      [0.6, 1],
      [0.6, 0],
      [0, 0],
      [0, 0.5],
      [0.6, 0.5],
    ],
  ],
  9: [
    [
      [0.6, 0.5],
      [0, 0.5],
      [0, 1],
      [0.6, 1],
      [0.6, 0],
    ],
  ],
  K: [
    [
      [0, 0],
      [0, 1],
    ],
    [
      [0.6, 1],
      [0, 0.45],
      [0.6, 0],
    ],
  ],
  M: [
    [
      [0, 0],
      [0, 1],
      [0.3, 0.5],
      [0.6, 1],
      [0.6, 0],
    ],
  ],
  '.': [
    [
      [0.25, 0],
      [0.3, 0],
    ],
  ],
  A: [
    [
      [0, 0],
      [0.3, 1],
      [0.6, 0],
    ],
    [
      [0.12, 0.4],
      [0.48, 0.4],
    ],
  ],
  E: [
    [
      [0.6, 1],
      [0, 1],
      [0, 0],
      [0.6, 0],
    ],
    [
      [0, 0.5],
      [0.5, 0.5],
    ],
  ],
  F: [
    [
      [0, 0],
      [0, 1],
      [0.6, 1],
    ],
    [
      [0, 0.55],
      [0.5, 0.55],
    ],
  ],
  G: [
    [
      [0.6, 1],
      [0, 1],
      [0, 0],
      [0.6, 0],
      [0.6, 0.5],
      [0.3, 0.5],
    ],
  ],
  H: [
    [
      [0, 0],
      [0, 1],
    ],
    [
      [0.6, 0],
      [0.6, 1],
    ],
    [
      [0, 0.5],
      [0.6, 0.5],
    ],
  ],
  I: [
    [
      [0, 1],
      [0.6, 1],
    ],
    [
      [0.3, 1],
      [0.3, 0],
    ],
    [
      [0, 0],
      [0.6, 0],
    ],
  ],
  N: [
    [
      [0, 0],
      [0, 1],
      [0.6, 0],
      [0.6, 1],
    ],
  ],
  O: [
    [
      [0, 0],
      [0.6, 0],
      [0.6, 1],
      [0, 1],
      [0, 0],
    ],
  ],
  R: [
    [
      [0, 0],
      [0, 1],
      [0.6, 1],
      [0.6, 0.55],
      [0, 0.55],
    ],
    [
      [0.25, 0.55],
      [0.6, 0],
    ],
  ],
  S: [
    [
      [0.6, 1],
      [0, 1],
      [0, 0.5],
      [0.6, 0.5],
      [0.6, 0],
      [0, 0],
    ],
  ],
  T: [
    [
      [0, 1],
      [0.6, 1],
    ],
    [
      [0.3, 1],
      [0.3, 0],
    ],
  ],
  U: [
    [
      [0, 1],
      [0, 0],
      [0.6, 0],
      [0.6, 1],
    ],
  ],
  X: [
    [
      [0, 1],
      [0.6, 0],
    ],
    [
      [0, 0],
      [0.6, 1],
    ],
  ],
  Z: [
    [
      [0, 1],
      [0.6, 1],
      [0, 0],
      [0.6, 0],
    ],
  ],
};
