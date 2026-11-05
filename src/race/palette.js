// Scene colours for the dark arena: lit faces, outlines and labels per material.
const hex = (value) => [0, 2, 4].map((i) => parseInt(value.slice(1 + i, 3 + i), 16) / 255);
// finish only applies to geometry drawn live each frame (athletes):
// gloss = hard white glint, dots = halftone shadows, rim = light on grazing faces.
const paint = (face, edge = '#000000', label = '#ffffff', finish = {}) => ({
  face: hex(face),
  edge: hex(edge),
  label: hex(label),
  finish: [finish.gloss || 0, finish.dots ? 1 : 0, finish.rim || 0],
});
const BODY = { gloss: 0.55, dots: true, rim: 0.3 };

export const BACKGROUND = hex('#0a0a0a');
export const DOTS = hex('#3a3a3a');
// Fog fades far geometry into the background (world units from the eye).
export const FOG = { near: 14, far: 72 };
// Lambert levels are snapped to three tones so every facet reads as a flat plane.
export const LIGHT = { direction: [0.35, 1, 0.5], tones: [0.55, 0.78, 1] };

export const PAINT = {
  floor: paint('#1c1c1c'),
  wall: paint('#242424', '#0a0a0a'),
  post: paint('#3a3a3a', '#3a3a3a'),
  board: paint('#141414', '#ffed00'),
  marking: paint('#5e5e5e', '#5e5e5e'),
  lane: paint('#333333', '#333333'),
  route: paint('#ffed00', '#ffed00'),
  sign: paint('#ffed00', '#000000', '#000000'),
  metal: paint('#8a8a8a', '#111111', '#ffed00'),
  rubber: paint('#2b2b2b', '#000000', '#ffed00'),
  weight: paint('#3d3d3d', '#000000', '#ffffff'),
  sled: paint('#ffed00', '#000000', '#000000'),
  rope: paint('#c8c8c8', '#555555'),
  skin: paint('#c68a63', '#3b2417', '#ffffff', BODY),
  band: paint('#ffed00', '#3d3700', '#ffffff', BODY),
  sleeve: paint('#1e1e1e', '#ffed00', '#ffffff', BODY),
  kit: paint('#ffed00', '#000000', '#ffffff', BODY),
  shorts: paint('#1e1e1e', '#000000', '#ffffff', BODY),
  crowd: paint('#2f2f2f', '#000000'),
  confetti: paint('#ffed00', '#ffed00'),
};
