import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readSkinnedMesh } from '../src/race/gltf.js';
import {
  armRig,
  compactSkin,
  fromTo,
  invert,
  multiply,
  poseArms,
  rotate,
  solveTwoBone,
  vec,
} from '../src/race/rig.js';

const close = (a, b, digits = 4) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits));
const model = (sex) => {
  const file = readFileSync(new URL(`../public/models/arms-${sex}.glb`, import.meta.url));
  return compactSkin(
    readSkinnedMesh(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)),
  );
};

describe('rig maths', () => {
  it('rotates one direction onto another', () => {
    const u = vec.normalize([1, 2, 3]),
      v = vec.normalize([-2, 0.5, 1]);
    close(rotate(fromTo(u, v), u), v);
    close(rotate(fromTo(u, vec.scale(u, -1)), u), vec.scale(u, -1));
  });

  it('keeps both bone lengths and bends towards the pole', () => {
    const s = [0, 1.4, 0],
      { elbow, wrist } = solveTwoBone(s, [0.1, 1.1, -0.35], [0.4, 1.1, 0.2], 0.25, 0.26);
    expect(vec.length(vec.sub(elbow, s))).toBeCloseTo(0.25, 5);
    expect(vec.length(vec.sub(wrist, elbow))).toBeCloseTo(0.26, 5);
    expect(elbow[0]).toBeGreaterThan(0.05);
  });

  it('inverts affine matrices', () => {
    const m = new Float32Array([0, 0.02, 0, 0, -0.02, 0, 0, 0, 0, 0, 0.02, 0, 1, 2, 3, 1]);
    close(multiply(m, invert(m)), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('straightens the arm when the target is out of reach', () => {
    const { elbow, wrist } = solveTwoBone([0, 0, 0], [0, 0, -5], [0, -1, 0], 0.25, 0.26);
    expect(vec.length(wrist)).toBeCloseTo(0.51, 3);
    expect(vec.length(vec.sub(wrist, elbow))).toBeCloseTo(0.26, 3);
  });
});

describe.each(['male', 'female'])('%s arms model', (sex) => {
  const mesh = model(sex),
    rig = armRig(mesh);

  it('ships a light skinned mesh with a base colour texture', () => {
    expect(mesh.indices.length / 3).toBeLessThanOrEqual(8000);
    expect(mesh.positions.length / 3).toBeLessThan(65536);
    expect(mesh.image?.mimeType).toBe('image/jpeg');
    // Only the arm and finger joints stay, well inside the smallest WebGL uniform budget.
    expect(rig.count).toBe(10);
    expect(rig.sides.every((side) => side.fingers)).toBe(true);
  });

  it('measures real arm lengths in metres', () => {
    for (const side of rig.sides) {
      expect(side.upper).toBeGreaterThan(0.2);
      expect(side.upper).toBeLessThan(0.35);
      expect(side.lower).toBeGreaterThan(0.2);
      expect(side.lower).toBeLessThan(0.35);
    }
  });

  const targets = (grip) =>
    [-1, 1].map((x) => ({
      shoulder: [-x * 0.22, 1.41, -0.1],
      elbow: [-x * 0.42, 1.1, 0.05],
      hand: [-x * 0.25, 1.15, 0.4],
      palm: [x, 0, 0],
      grip,
    }));
  const jointAt = (bones, id, p) => {
    const m = bones.subarray(id * 16, id * 16 + 16);
    return [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);
  };

  it('closes the fingers towards the palm when gripping', () => {
    const open = poseArms(rig, mesh, targets(0)),
      fist = poseArms(rig, mesh, targets(1));
    rig.sides.forEach((side, j) => {
      const tips = rig.globals[mesh.skin.joints[side.fingers[1]]],
        p = [tips[12], tips[13], tips[14]],
        palm = targets(1)[j].palm,
        shift = vec.sub(jointAt(fist, side.fingers[1], p), jointAt(open, side.fingers[1], p));
      expect(vec.dot(shift, palm)).toBeGreaterThan(0.01);
    });
  });

  it('puts the posed shoulders and hands where they were asked', () => {
    const asked = [-1, 1].map((x) => ({
      shoulder: [-x * 0.22, 1.41, -0.1],
      elbow: [-x * 0.42, 1.1, 0.05],
      hand: [-x * 0.25, 1.15, 0.4],
      palm: [x, 0, 0],
    }));
    const bones = poseArms(rig, mesh, asked);
    rig.sides.forEach((side, j) => {
      // The arm joint matrix carries the rest shoulder onto the target shoulder.
      const arm = rig.globals[mesh.skin.joints[side.ids[0]]];
      close(jointAt(bones, side.ids[0], [arm[12], arm[13], arm[14]]), asked[j].shoulder, 3);
    });
  });
});
