import { describe, expect, it } from 'vitest';
import { parseGlb, readAccessor } from '../src/race/gltf.js';

function glb(json, bin) {
  const pad = (bytes, fill) => {
    const out = new Uint8Array(Math.ceil(bytes.length / 4) * 4).fill(fill);
    out.set(bytes);
    return out;
  };
  const text = pad(new TextEncoder().encode(JSON.stringify(json)), 0x20),
    data = pad(new Uint8Array(bin), 0),
    out = new Uint8Array(12 + 8 + text.length + 8 + data.length),
    view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, out.length, true);
  view.setUint32(12, text.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(text, 20);
  view.setUint32(20 + text.length, data.length, true);
  view.setUint32(24 + text.length, 0x004e4942, true);
  out.set(data, 28 + text.length);
  return out.buffer;
}

describe('glb reader', () => {
  it('rejects files that are not GLB', () => {
    expect(() => parseGlb(new ArrayBuffer(16))).toThrow('Not a GLB');
  });

  it('reads packed and interleaved accessors', () => {
    // Two VEC2 floats interleaved with a padding float: stride 12 bytes.
    const floats = new Float32Array([1, 2, 99, 3, 4, 99]);
    const shorts = new Uint16Array([7, 8, 9, 0]);
    const bin = new Uint8Array(floats.byteLength + shorts.byteLength);
    bin.set(new Uint8Array(floats.buffer), 0);
    bin.set(new Uint8Array(shorts.buffer), floats.byteLength);
    const file = glb(
      {
        bufferViews: [
          { buffer: 0, byteOffset: 0, byteLength: floats.byteLength, byteStride: 12 },
          { buffer: 0, byteOffset: floats.byteLength, byteLength: 6 },
        ],
        accessors: [
          { bufferView: 0, componentType: 5126, count: 2, type: 'VEC2' },
          { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
        ],
      },
      bin,
    );
    const parsed = parseGlb(file);
    expect([...readAccessor(parsed, 0)]).toEqual([1, 2, 3, 4]);
    expect([...readAccessor(parsed, 1)]).toEqual([7, 8, 9]);
  });
});
