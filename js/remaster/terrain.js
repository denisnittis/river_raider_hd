// Remaster terrain: realistic look — deep river water, rocky cliffs along the
// banks and jungle canopy. Procedural by default; tileable textures in
// assets/remaster/textures/{water,rock,jungle}.png replace the procedural parts.

export const REMASTER_TEXTURES = ['water', 'rock', 'jungle'];

export const FS_REMASTER = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_base;
uniform sampler2D u_water, u_rock, u_jungle;
uniform float u_has_water, u_has_rock, u_has_jungle;
uniform vec2 u_size;
uniform float u_scroll;
uniform float u_time;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 hash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
float ridged(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * (1.0 - abs(noise(p) * 2.0 - 1.0)); p = p * 2.1 + 9.3; a *= 0.5; }
  return v;
}
// nearest feature point: returns distance, writes offset and cell id
float voronoi(vec2 x, out vec2 rel, out float id) {
  vec2 n = floor(x), f = fract(x);
  float md = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = 0.15 + 0.7 * hash2(n + g);
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < md) { md = d; rel = r; id = hash(n + g); }
  }
  return sqrt(md);
}

const vec3 LIGHT = vec3(-0.55, -0.65, 0.75);   // from the upper left

// one layer of tree crowns: returns height (0 = gap) and lit colour
vec4 crowns(vec2 p, float scale, float seed) {
  vec2 rel; float id;
  float d = voronoi(p / scale + seed, rel, id);
  float rad = 0.55 + 0.25 * id;
  float h = clamp(1.0 - d / rad, 0.0, 1.0);
  vec3 n = normalize(vec3(rel * 1.6, h + 0.25));
  float diff = clamp(dot(n, normalize(LIGHT)), 0.0, 1.0);
  vec3 dark = vec3(0.02, 0.07, 0.03), light = vec3(0.20, 0.36, 0.11);
  light = mix(light, vec3(0.30, 0.38, 0.13), step(0.9, id));        // a few yellowish trees
  light = mix(light, vec3(0.11, 0.27, 0.15), step(id, 0.25));       // some bluish ones
  float leaves = 0.7 + 0.6 * noise(p * 1.4);                        // leaf clumps
  vec3 c = mix(dark, light, diff * leaves) * (0.55 + 0.45 * h);
  return vec4(c, h);
}

void main() {
  vec2 ap = v_uv * u_size;
  float s = 0.0, wsum = 0.0, lw = 0.0, ww = 0.0;
  vec3 lc = vec3(0.0), wc = vec3(0.0);
  for (int j = -3; j <= 3; j++) {
    for (int i = -3; i <= 3; i++) {
      vec2 q = clamp(ap + vec2(float(i) * 2.0, float(j) * 1.6), vec2(0.5), u_size - 0.5);
      vec4 t = texture2D(u_base, q / u_size);
      float w = exp(-float(i * i + j * j) / 5.0);
      s += t.a * w; wsum += w;
      lc += t.rgb * t.a * w; lw += t.a * w;
      wc += t.rgb * (1.0 - t.a) * w; ww += (1.0 - t.a) * w;
    }
  }
  s /= wsum;
  // wider field: distance-like value used for cliff width and water depth
  float s2 = 0.0, w2 = 0.0;
  for (int j = -2; j <= 2; j++) {
    for (int i = -4; i <= 4; i++) {
      vec2 q = clamp(ap + vec2(float(i) * 3.2, float(j) * 3.0), vec2(0.5), u_size - 0.5);
      float w = exp(-float(i * i) / 10.0 - float(j * j) / 3.0);
      s2 += texture2D(u_base, q / u_size).a * w; w2 += w;
    }
  }
  s2 /= w2;
  vec4 c0 = texture2D(u_base, ap / u_size);
  vec3 landC = c0.a > 0.5 ? c0.rgb : (lw > 0.0 ? lc / lw : c0.rgb);
  vec3 waterC = c0.a < 0.5 ? c0.rgb : (ww > 0.0 ? wc / ww : c0.rgb);
  bool river = waterC.b > waterC.r + 0.08 && waterC.b > waterC.g;
  bool grass = landC.g > landC.r && landC.g > landC.b;

  vec2 wp = vec2(ap.x * 2.0, ap.y - u_scroll);   // world position, in scanlines
  // irregular, rocky coastline (kept small so the visible edge stays honest)
  float sp = s + (fbm(wp * 0.12) - 0.5) * 0.18;
  float land = smoothstep(0.48, 0.52, sp);

  // ---------- water
  vec3 deep = vec3(0.05, 0.17, 0.21), shallow = vec3(0.13, 0.36, 0.37);
  float depth = 1.0 - smoothstep(0.08, 0.5, s2);
  vec3 water = mix(shallow, deep, depth);
  if (!river) water = waterC * 0.8;
  // waves: two wave fields travelling in crossing directions. They move, but
  // there is no net current, so boats don't seem to drift against the water.
  float T = u_time;
  vec2 fa = wp * vec2(0.05, 0.075) + T * vec2(0.22, 0.14);
  vec2 fb = wp * vec2(0.08, 0.11) - T * vec2(0.18, -0.20);
  float ha = fbm(fa), hb = fbm(fb);
  float h0 = (ha + hb) * 0.5;
  float hx = (fbm(fa + vec2(0.06, 0.0)) + fbm(fb + vec2(0.06, 0.0))) * 0.5;
  float hy = (fbm(fa + vec2(0.0, 0.06)) + fbm(fb + vec2(0.0, 0.06))) * 0.5;
  vec3 nrm = normalize(vec3((h0 - hx) * 11.0, (h0 - hy) * 11.0, 1.0));
  float spec = pow(clamp(dot(reflect(-normalize(LIGHT), nrm), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 50.0);
  // slow swell crossing the river
  float swell = 0.06 * sin(dot(wp, vec2(0.045, 0.07)) - T * 1.1) + 0.05 * sin(dot(wp, vec2(-0.06, 0.035)) + T * 0.9);
  water *= 0.85 + 0.3 * h0 + swell;
  water += vec3(0.6, 0.75, 0.8) * spec * 0.5 * (0.3 + 0.7 * depth);
  if (u_has_water > 0.5) {
    // the photo texture in two layers sliding across each other, bent by the waves
    vec2 bend = nrm.xy * 0.025;
    vec3 t1 = texture2D(u_water, fract(wp / 160.0 + T * vec2(0.010, 0.006) + bend)).rgb;
    vec3 t2 = texture2D(u_water, fract(wp / 115.0 + vec2(0.37, 0.61) - T * vec2(0.008, -0.009) - bend)).rgb;
    vec3 t = (t1 + t2) * 0.5;
    t = mix(vec3(dot(t, vec3(0.3, 0.59, 0.11))), t, 1.25) * 1.12;      // keep contrast after mixing
    water = mix(water, t * (0.78 + 0.45 * h0 + swell), 0.75);
  }
  // sun glints that sparkle on the wave crests
  float gl = noise(wp * 2.2 + T * vec2(1.6, -0.9)) * noise(wp * 3.1 - T * vec2(1.1, 1.4));
  water += vec3(1.0, 0.97, 0.88) * smoothstep(0.55, 0.8, gl) * (0.06 + 2.2 * spec) * (0.35 + 0.65 * depth);
  // shadow of the cliffs on the water and foam where it meets the rocks
  water *= 1.0 - 0.5 * smoothstep(0.25, 0.5, s2) * (1.0 - land);
  float foam = smoothstep(0.38, 0.47, sp) * (1.0 - smoothstep(0.47, 0.5, sp));
  foam *= 0.5 + 0.5 * noise(wp * 0.7 + vec2(0.0, -u_time * 2.5));
  water = mix(water, vec3(0.88, 0.94, 0.95), foam * 0.8);

  // ---------- land
  vec3 ground;
  if (grass) {
    // jungle: two layers of tree crowns over a dark understorey
    vec4 a = crowns(wp, 13.0, 0.0);
    vec4 b = crowns(wp + vec2(3.1, 5.7), 8.0, 11.0);
    vec3 jungle = vec3(0.03, 0.08, 0.03);
    jungle = mix(jungle, b.rgb, smoothstep(0.0, 0.2, b.a));
    jungle = mix(jungle, a.rgb, smoothstep(0.05, 0.25, a.a) * step(b.a * 0.8, a.a + 0.1));
    if (u_has_jungle > 0.5) {
      vec3 t = texture2D(u_jungle, fract(wp / vec2(220.0, 220.0))).rgb;
      jungle = t * (0.85 + 0.3 * a.a);
    }
    // rocky cliff band between the water and the trees
    float edgeN = fbm(wp * 0.09 + 4.0);
    float cliff = 1.0 - smoothstep(0.62 + 0.1 * edgeN, 0.80 + 0.1 * edgeN, s2);
    float r = ridged(wp * vec2(0.16, 0.42));
    vec3 rock = vec3(0.38, 0.35, 0.30) * (0.45 + 0.8 * r);
    rock *= 0.75 + 0.45 * noise(wp * vec2(0.6, 2.2));
    // boulders
    vec2 brel; float bid;
    float bd = voronoi(wp / 3.5, brel, bid);
    rock *= 0.8 + 0.35 * clamp(dot(normalize(vec3(brel, 0.6)), normalize(LIGHT)), 0.0, 1.0) * smoothstep(0.7, 0.2, bd);
    rock *= 0.65 + 0.5 * smoothstep(0.5, 0.8, s2);                    // lit towards the top
    if (u_has_rock > 0.5) rock = texture2D(u_rock, fract(wp / vec2(110.0, 110.0))).rgb * (0.7 + 0.5 * r);
    rock = mix(rock * 0.5, rock, smoothstep(0.5, 0.6, sp));             // wet at the waterline
    rock = mix(rock, vec3(0.16, 0.28, 0.10), smoothstep(0.62, 0.7, noise(wp * 0.35)) * 0.6);  // moss
    // trees overhang the cliff edge a little
    float over = smoothstep(0.2, 0.35, a.a) * smoothstep(0.55, 0.7, s2);
    ground = mix(jungle, rock, cliff * (1.0 - over));
  } else {
    // roads and other ground: keep the game's colour, add surface detail
    ground = landC * (0.78 + 0.25 * fbm(wp * 0.5) + 0.08 * noise(wp * 3.0));
  }
  vec3 col = mix(water, ground, land);
  // slight vignette for depth
  vec2 vq = v_uv - 0.5;
  col *= 1.0 - 0.25 * dot(vq, vq);
  gl_FragColor = vec4(col, 1.0);
}`;
