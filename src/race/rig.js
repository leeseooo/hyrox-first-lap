// Bone maths for the skinned athlete arms: rest skeleton, two-bone IK and joint matrices.
// Matrices are column-major Float32Array(16) like the rest of the renderer; quaternions are [x, y, z, w].
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ],
  length = (a) => Math.hypot(a[0], a[1], a[2]),
  normalize = (a) => scale(a, 1 / (length(a) || 1));
export const vec = { sub, add, scale, dot, cross, length, normalize };

export function multiply(a, b) {
  const c = new Float32Array(16);
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 4; i++)
      for (let k = 0; k < 4; k++) c[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k];
  return c;
}

export function compose(t, q, s) {
  const [x, y, z, w] = q;
  return new Float32Array([
    (1 - 2 * (y * y + z * z)) * s[0],
    2 * (x * y + z * w) * s[0],
    2 * (x * z - y * w) * s[0],
    0,
    2 * (x * y - z * w) * s[1],
    (1 - 2 * (x * x + z * z)) * s[1],
    2 * (y * z + x * w) * s[1],
    0,
    2 * (x * z + y * w) * s[2],
    2 * (y * z - x * w) * s[2],
    (1 - 2 * (x * x + y * y)) * s[2],
    0,
    t[0],
    t[1],
    t[2],
    1,
  ]);
}

export function quatMultiply(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

export function axisAngle(axis, angle) {
  const [x, y, z] = normalize(axis),
    s = Math.sin(angle / 2);
  return [x * s, y * s, z * s, Math.cos(angle / 2)];
}

// Shortest rotation taking unit vector u onto unit vector v.
export function fromTo(u, v) {
  const d = dot(u, v);
  if (d < -0.999999) {
    const helper = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    return axisAngle(cross(u, helper), Math.PI);
  }
  const c = cross(u, v),
    q = [c[0], c[1], c[2], 1 + d],
    n = Math.hypot(...q);
  return q.map((value) => value / n);
}

export function rotate(q, v) {
  const t = scale(cross(q, v), 2);
  return add(add(v, scale(t, q[3])), cross(q, t));
}

// Keeps the rest scale and orientation of matrix m, rotates it by q and moves it to point p.
function place(m, q, p) {
  const out = new Float32Array(m);
  for (let c = 0; c < 3; c++) {
    const r = rotate(q, [m[c * 4], m[c * 4 + 1], m[c * 4 + 2]]);
    out[c * 4] = r[0];
    out[c * 4 + 1] = r[1];
    out[c * 4 + 2] = r[2];
  }
  out[12] = p[0];
  out[13] = p[1];
  out[14] = p[2];
  return out;
}

export function restGlobals(nodes) {
  const globals = new Array(nodes.length);
  const resolve = (i) => {
    if (globals[i]) return globals[i];
    const n = nodes[i],
      local = compose(n.translation, n.rotation, n.scale);
    globals[i] = n.parent < 0 ? local : multiply(resolve(n.parent), local);
    return globals[i];
  };
  nodes.forEach((_, i) => resolve(i));
  return globals;
}

const head = (m) => [m[12], m[13], m[14]];

// Elbow and wrist for a shoulder s reaching for w, bending towards pole, with bone lengths a and b.
export function solveTwoBone(s, w, pole, a, b) {
  const toward = sub(w, s),
    reach = Math.min(Math.max(length(toward), Math.abs(a - b) + 1e-4), a + b - 1e-4),
    dir = normalize(toward),
    cosA = (a * a + reach * reach - b * b) / (2 * a * reach),
    sideways = sub(pole, s),
    bend = normalize(sub(sideways, scale(dir, dot(sideways, dir)))),
    elbow = add(
      add(s, scale(dir, a * cosA)),
      scale(bend, a * Math.sqrt(Math.max(0, 1 - cosA * cosA))),
    );
  return { elbow, wrist: add(s, scale(dir, reach)) };
}

// Everything the poser needs to know about one arm, read once from the rest skeleton and mesh.
export function armRig(mesh) {
  const globals = restGlobals(mesh.nodes),
    joint = (name) => mesh.skin.joints.findIndex((n) => mesh.nodes[n].name === name);
  const sides = ['Left', 'Right'].map((side, j) => {
    const ids = ['Arm', 'ForeArm', 'Hand'].map((part) => joint(side + part));
    if (ids.some((id) => id < 0)) throw new Error(`Missing ${side} arm bones`);
    const [arm, fore, hand] = ids.map((id) => globals[mesh.skin.joints[id]]),
      shoulder = head(arm),
      elbow = head(fore),
      wrist = head(hand);
    // The hand points from the wrist to the middle of the vertices it drives most.
    let sum = [0, 0, 0],
      count = 0;
    for (let v = 0; v < mesh.weights.length / 4; v++) {
      let best = 0;
      for (let k = 1; k < 4; k++)
        if (mesh.weights[v * 4 + k] > mesh.weights[v * 4 + best]) best = k;
      if (mesh.joints[v * 4 + best] === ids[2]) {
        sum = add(sum, [
          mesh.positions[v * 3],
          mesh.positions[v * 3 + 1],
          mesh.positions[v * 3 + 2],
        ]);
        count++;
      }
    }
    const centre = count ? scale(sum, 1 / count) : add(wrist, normalize(sub(wrist, elbow))),
      handAxis = normalize(sub(centre, wrist)),
      // In the rest A-pose the palms face the thighs (left hand sits on +x).
      inward = [j === 0 ? -1 : 1, 0, 0],
      palm = normalize(sub(inward, scale(handAxis, dot(inward, handAxis))));
    return {
      ids,
      upper: length(sub(elbow, shoulder)),
      lower: length(sub(wrist, elbow)),
      reach: length(sub(centre, wrist)),
      upperAxis: normalize(sub(elbow, shoulder)),
      lowerAxis: normalize(sub(wrist, elbow)),
      handAxis,
      palm,
    };
  });
  return { globals, sides, count: mesh.skin.joints.length };
}

function signedAngle(from, to, axis) {
  return Math.atan2(dot(cross(from, to), axis), dot(from, to));
}

// targets[j] = { shoulder, elbow (pole hint), hand (palm centre), palm (normal) } in model space.
export function poseArms(rig, mesh, targets) {
  const posed = rig.globals.slice();
  rig.sides.forEach((side, j) => {
    const t = targets[j],
      [armJoint, foreJoint, handJoint] = side.ids.map((id) => mesh.skin.joints[id]),
      guess = sub(t.hand, scale(normalize(sub(t.hand, t.elbow)), side.reach)),
      { elbow, wrist } = solveTwoBone(t.shoulder, guess, t.elbow, side.upper, side.lower),
      forearm = normalize(sub(wrist, elbow));
    const alignHand = fromTo(side.handAxis, forearm),
      turned = rotate(alignHand, side.palm),
      wanted = normalize(sub(t.palm, scale(forearm, dot(t.palm, forearm)))),
      twist = signedAngle(turned, wanted, forearm);
    // Half the wrist twist goes into the forearm so the skin does not wring at the wrist.
    const foreRotation = quatMultiply(
      axisAngle(forearm, twist * 0.5),
      fromTo(side.lowerAxis, forearm),
    );
    posed[armJoint] = place(
      rig.globals[armJoint],
      fromTo(side.upperAxis, normalize(sub(elbow, t.shoulder))),
      t.shoulder,
    );
    posed[foreJoint] = place(rig.globals[foreJoint], foreRotation, elbow);
    posed[handJoint] = place(
      rig.globals[handJoint],
      quatMultiply(axisAngle(forearm, twist), alignHand),
      wrist,
    );
  });
  const matrices = new Float32Array(rig.count * 16);
  mesh.skin.joints.forEach((node, j) =>
    matrices.set(
      multiply(posed[node], mesh.skin.inverseBind.subarray(j * 16, j * 16 + 16)),
      j * 16,
    ),
  );
  return matrices;
}
