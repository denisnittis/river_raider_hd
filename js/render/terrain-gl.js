// WebGL terrain: takes the playfield/background colors of the frame and
// redraws them with a fragment shader (see remaster/terrain.js).

const VS = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() { v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5); gl_Position = vec4(a_pos, 0.0, 1.0); }`;

export class TerrainGL {
  // fs: fragment shader source; textures: names of optional image samplers
  // (uniform sampler2D u_<name>, flag u_has_<name>)
  constructor(width, height, texW, texH, fs, textures = []) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width; this.canvas.height = height;
    const gl = this.gl = this.canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
    if (!gl) throw new Error('WebGL not available');
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = this.prog = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    gl.useProgram(p);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, 'a_pos');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);   // interpolated: smooth bank contour
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.texW = texW; this.texH = texH;
    this.u = {
      size: gl.getUniformLocation(p, 'u_size'), scroll: gl.getUniformLocation(p, 'u_scroll'),
      time: gl.getUniformLocation(p, 'u_time'),
    };
    gl.uniform1i(gl.getUniformLocation(p, 'u_base'), 0);
    this.extra = textures.map((name, i) => {
      const t = { name, unit: i + 1, tex: gl.createTexture(), has: gl.getUniformLocation(p, 'u_has_' + name) };
      gl.uniform1i(gl.getUniformLocation(p, 'u_' + name), t.unit);
      gl.uniform1f(t.has, 0);
      return t;
    });
  }

  setTexture(name, img) {
    const gl = this.gl, t = this.extra.find(e => e.name === name);
    if (!t) return;
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0 + t.unit);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1f(t.has, 1);
    gl.activeTexture(gl.TEXTURE0);
  }

  // rgba: Uint8Array texW*texH*4 (alpha 255 = land / playfield)
  render(rgba, scroll, time) {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.texW, this.texH, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    gl.uniform2f(this.u.size, this.texW, this.texH);
    gl.uniform1f(this.u.scroll, scroll);
    gl.uniform1f(this.u.time, time);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
