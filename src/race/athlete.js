// First-person athlete arms: a skinned, textured GLB posed from the procedural hand targets.
import { readSkinnedMesh } from './gltf.js';
import { armRig, compactSkin, poseArms, vec } from './rig.js';

const vertex = (bones) =>
  `attribute vec3 position;attribute vec3 normal;attribute vec2 uv;attribute vec4 joint;attribute vec4 weight;uniform mat4 matrix;uniform mat4 model;uniform mat4 bones[${bones}];varying vec3 world;varying vec3 surface;varying vec2 texel;void main(){mat4 skin=weight.x*bones[int(joint.x)]+weight.y*bones[int(joint.y)]+weight.z*bones[int(joint.z)]+weight.w*bones[int(joint.w)];vec4 w=model*skin*vec4(position,1.);world=w.xyz;surface=(model*skin*vec4(normal,0.)).xyz;texel=uv;gl_Position=matrix*w;}`;
// Smooth light, a soft highlight and a warm rim (the accent colour) so the arms lift off the dark hall.
const fragment = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D albedo;uniform vec3 light;uniform vec3 eye;uniform vec3 fogColor;uniform vec2 fog;varying vec3 world;varying vec3 surface;varying vec2 texel;void main(){vec3 n=normalize(surface),v=normalize(eye-world);if(dot(n,v)<0.)n=-n;vec3 base=texture2D(albedo,texel).rgb;float diffuse=max(dot(n,light),0.)*.7+.38;float spec=pow(max(dot(n,normalize(light+v)),0.),36.)*.2;float rim=pow(1.-max(dot(n,v),0.),3.)*.45;vec3 c=base*diffuse+spec+rim*vec3(1.,.93,.45);c=mix(c,fogColor,smoothstep(fog.x,fog.y,distance(world,eye)));gl_FragColor=vec4(c,1.);}`;

const ATTRIBUTES = ['position', 'normal', 'uv', 'joint', 'weight'];

export class AthleteArms {
  constructor(gl, { fogColor, fog, light }) {
    this.gl = gl;
    this.look = { fogColor, fog, light };
    this.models = new Map();
  }
  // Starts loading the arms for one sex; draw() falls back to the old arms until it is ready.
  load(sex) {
    if (this.models.has(sex)) return this.models.get(sex);
    const entry = { ready: false, failed: false };
    this.models.set(sex, entry);
    fetch(`/models/arms-${sex}.glb`)
      .then((r) => {
        if (!r.ok) throw new Error(`arms ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buffer) => this.build(entry, compactSkin(readSkinnedMesh(buffer))))
      .catch(() => (entry.failed = true));
    return entry;
  }
  async build(entry, mesh) {
    const gl = this.gl,
      rig = armRig(mesh);
    if (gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS) < rig.count * 4 + 16)
      throw new Error('Not enough uniforms for the arm bones');
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex(rig.count)));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
    ATTRIBUTES.forEach((name, i) => gl.bindAttribLocation(program, i, name));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Arm shader link failed');
    const upload = (target, data) => {
      const buffer = gl.createBuffer();
      gl.bindBuffer(target, buffer);
      gl.bufferData(target, data, gl.STATIC_DRAW);
      return buffer;
    };
    const uniforms = {};
    for (const name of ['matrix', 'model', 'bones', 'albedo', 'light', 'eye', 'fogColor', 'fog'])
      uniforms[name] = gl.getUniformLocation(program, name);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([200, 150, 120, 255]),
    );
    if (mesh.image) {
      // createImageBitmap reads the bytes directly, so no blob: URL has to pass the CSP.
      const bitmap = await createImageBitmap(
        new Blob([mesh.image.bytes], { type: mesh.image.mimeType }),
      );
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      bitmap.close?.();
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    Object.assign(entry, {
      mesh,
      rig,
      program,
      uniforms,
      texture,
      buffers: [
        [upload(gl.ARRAY_BUFFER, mesh.positions), 3, gl.FLOAT],
        [upload(gl.ARRAY_BUFFER, mesh.normals), 3, gl.FLOAT],
        [
          upload(gl.ARRAY_BUFFER, mesh.uvs || new Float32Array((mesh.positions.length / 3) * 2)),
          2,
          gl.FLOAT,
        ],
        [
          upload(gl.ARRAY_BUFFER, mesh.joints),
          4,
          mesh.joints instanceof Uint8Array ? gl.UNSIGNED_BYTE : gl.UNSIGNED_SHORT,
        ],
        [upload(gl.ARRAY_BUFFER, mesh.weights), 4, gl.FLOAT],
      ],
      indices: upload(gl.ELEMENT_ARRAY_BUFFER, mesh.indices),
      count: mesh.indices.length,
      ready: true,
    });
  }
  // pose: { root, yaw, shoulders, elbows, hands, palms, grip } in world space (index 0 = left arm).
  draw(sex, viewProjection, eye, pose) {
    const entry = this.load(sex);
    if (!entry.ready) return false;
    const gl = this.gl,
      u = entry.uniforms,
      // The model faces +z with its left hand on +x; the player looks down -z with the left hand on -x.
      turn = pose.yaw + Math.PI,
      c = Math.cos(turn),
      s = Math.sin(turn),
      toModel = (p) => {
        const x = p[0] - pose.root[0],
          z = p[2] - pose.root[2];
        return [x * c - z * s, p[1] - pose.root[1], x * s + z * c];
      },
      dirToModel = (d) => [d[0] * c - d[2] * s, d[1], d[0] * s + d[2] * c];
    const targets = [0, 1].map((j) => ({
      shoulder: toModel(pose.shoulders[j]),
      elbow: toModel(pose.elbows[j]),
      hand: toModel(pose.hands[j]),
      palm: vec.normalize(dirToModel(pose.palms[j])),
      grip: pose.grip,
    }));
    const bones = poseArms(entry.rig, entry.mesh, targets),
      model = new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, ...pose.root, 1]);
    gl.useProgram(entry.program);
    gl.uniformMatrix4fv(u.matrix, false, viewProjection);
    gl.uniformMatrix4fv(u.model, false, model);
    gl.uniformMatrix4fv(u.bones, false, bones);
    gl.uniform3fv(u.light, this.look.light);
    gl.uniform3fv(u.eye, eye);
    gl.uniform3fv(u.fogColor, this.look.fogColor);
    gl.uniform2f(u.fog, this.look.fog.near, this.look.fog.far);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, entry.texture);
    gl.uniform1i(u.albedo, 0);
    entry.buffers.forEach(([buffer, size, type], i) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, size, type, false, 0, 0);
    });
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, entry.indices);
    gl.drawElements(gl.TRIANGLES, entry.count, gl.UNSIGNED_SHORT, 0);
    // Leave only attribute 0 on: the arena program owns every other slot.
    for (let i = 1; i < ATTRIBUTES.length; i++) gl.disableVertexAttribArray(i);
    return true;
  }
}
