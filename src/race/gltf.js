// Minimal binary glTF (GLB) reader for one skinned, textured mesh — enough for the athlete arms.
const MAGIC = 0x46546c67,
  JSON_CHUNK = 0x4e4f534a,
  BIN_CHUNK = 0x004e4942;
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const ARRAYS = {
  5121: Uint8Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array,
};

export function parseGlb(buffer) {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== MAGIC) throw new Error('Not a GLB file');
  let offset = 12,
    json = null,
    bin = null;
  while (offset < view.byteLength) {
    const length = view.getUint32(offset, true),
      type = view.getUint32(offset + 4, true),
      start = offset + 8;
    if (type === JSON_CHUNK)
      json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, length)));
    if (type === BIN_CHUNK) bin = new Uint8Array(buffer, start, length);
    offset = start + length;
  }
  if (!json || !bin) throw new Error('GLB needs a JSON and a BIN chunk');
  return { json, bin };
}

function bytesOf(glb, viewIndex) {
  const v = glb.json.bufferViews[viewIndex];
  return glb.bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
}

export function readAccessor(glb, index) {
  const a = glb.json.accessors[index],
    Type = ARRAYS[a.componentType],
    size = COMPONENTS[a.type],
    view = glb.json.bufferViews[a.bufferView],
    stride = view.byteStride || 0,
    bytes = bytesOf(glb, a.bufferView),
    start = a.byteOffset || 0,
    out = new Type(a.count * size);
  if (!stride || stride === size * Type.BYTES_PER_ELEMENT) {
    // Copy so the result is aligned no matter where the view sits in the BIN chunk.
    const slice = bytes.slice(start, start + out.byteLength);
    out.set(new Type(slice.buffer, 0, out.length));
  } else {
    for (let i = 0; i < a.count; i++) {
      const row = bytes.slice(
        start + i * stride,
        start + i * stride + size * Type.BYTES_PER_ELEMENT,
      );
      out.set(new Type(row.buffer, 0, size), i * size);
    }
  }
  return out;
}

// Returns the first skinned primitive with its skeleton (rest pose) and base colour image bytes.
export function readSkinnedMesh(buffer) {
  const glb = parseGlb(buffer),
    { json } = glb,
    meshNode = json.nodes.findIndex((n) => n.mesh !== undefined && n.skin !== undefined);
  if (meshNode < 0) throw new Error('No skinned mesh');
  const primitive = json.meshes[json.nodes[meshNode].mesh].primitives[0],
    attr = primitive.attributes,
    skin = json.skins[json.nodes[meshNode].skin];
  const parents = new Array(json.nodes.length).fill(-1);
  json.nodes.forEach((n, i) => (n.children || []).forEach((c) => (parents[c] = i)));
  const nodes = json.nodes.map((n, i) => ({
    name: n.name || `node${i}`,
    parent: parents[i],
    translation: n.translation || [0, 0, 0],
    rotation: n.rotation || [0, 0, 0, 1],
    scale: n.scale || [1, 1, 1],
  }));
  const material = json.materials?.[primitive.material],
    textureIndex = material?.pbrMetallicRoughness?.baseColorTexture?.index,
    image = textureIndex === undefined ? null : json.images[json.textures[textureIndex].source];
  return {
    positions: readAccessor(glb, attr.POSITION),
    normals: readAccessor(glb, attr.NORMAL),
    uvs: attr.TEXCOORD_0 === undefined ? null : readAccessor(glb, attr.TEXCOORD_0),
    joints: readAccessor(glb, attr.JOINTS_0),
    weights: readAccessor(glb, attr.WEIGHTS_0),
    indices: readAccessor(glb, primitive.indices),
    nodes,
    skin: {
      joints: skin.joints,
      inverseBind: readAccessor(glb, skin.inverseBindMatrices),
    },
    image: image ? { mimeType: image.mimeType, bytes: bytesOf(glb, image.bufferView) } : null,
  };
}
