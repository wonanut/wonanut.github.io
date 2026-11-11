/* =============================================================
   Low-poly floating world — hand-written WebGL, no libraries.

   Models are generated in code with fixed seeds (no downloads).
   Shaders add the "tech" layer: animated aurora sky, a glowing data
   ocean grid, pulsing crystal emissive and drifting data motes.
   Interactions: drag to orbit, hover landmarks for labels, click to
   jump/open, scroll to fly the camera through the archipelago.
   ============================================================= */
(function () {
  "use strict";

  var canvas = document.getElementById("scene");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "scene";
    var bg = document.querySelector(".scene-bg");
    if (bg) bg.insertBefore(canvas, bg.firstChild);
    else document.body.insertBefore(canvas, document.body.firstChild);
  }

  var gl = null;
  try {
    gl = canvas.getContext("webgl", { antialias: true, alpha: false, powerPreference: "high-performance" })
      || canvas.getContext("experimental-webgl", { antialias: true, alpha: false });
  } catch (error) {
    gl = null;
  }
  if (!gl) {
    document.body.classList.add("no-scene");
    return;
  }

  /* ---------------- math ---------------- */
  function vec3(x, y, z) { return [x, y, z]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function normalize(a) {
    var l = Math.sqrt(dot(a, a)) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  }

  function perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2);
    var nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0,
    ]);
  }

  function lookAt(eye, center, up) {
    var z = normalize(sub(eye, center));
    var x = normalize(cross(up, z));
    var y = cross(z, x);
    return new Float32Array([
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
    ]);
  }

  function multiply(a, b) {
    var out = new Float32Array(16);
    for (var c = 0; c < 4; c += 1) {
      for (var r = 0; r < 4; r += 1) {
        out[c * 4 + r] =
          a[r] * b[c * 4] +
          a[4 + r] * b[c * 4 + 1] +
          a[8 + r] * b[c * 4 + 2] +
          a[12 + r] * b[c * 4 + 3];
      }
    }
    return out;
  }

  function modelMatrix(pos, ry, scale) {
    var c = Math.cos(ry), s = Math.sin(ry);
    return new Float32Array([
      c * scale, 0, -s * scale, 0,
      0, scale, 0, 0,
      s * scale, 0, c * scale, 0,
      pos[0], pos[1], pos[2], 1,
    ]);
  }

  /* ---------------- colour ---------------- */
  function hex(h) {
    var n = parseInt(h.replace("#", ""), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  function shade(c, k) {
    return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
  }
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  var C = {
    leaf: hex("#3f8f72"),
    leafLight: hex("#6fc79a"),
    ruin: hex("#7d8aa8"),
    rockDeep: hex("#101a2b"),
    rock: hex("#1e2c45"),
    rockLight: hex("#33476b"),
    grass: hex("#27665f"),
    grassLight: hex("#43a291"),
    crystalIndigo: hex("#9aa6ff"),
    crystalTeal: hex("#5cf2da"),
    crystalPink: hex("#ff9df2"),
    metal: hex("#7d8dbd"),
    trunk: hex("#3a3143"),
    pine: hex("#1c5a55"),
    pineLight: hex("#368a78"),
  };

  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- mesh builder ---------------- */
  function Builder() { this.data = []; }
  Builder.prototype.push = function (p, n, c) {
    this.data.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2]);
  };
  Builder.prototype.tri = function (a, b, c, color) {
    var n = normalize(cross(sub(b, a), sub(c, a)));
    this.push(a, n, color);
    this.push(b, n, color);
    this.push(c, n, color);
  };
  Builder.prototype.quad = function (a, b, c, d, color, color2) {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color2 || color);
  };

  /* ---------------- models ---------------- */
  function buildTerracedIsland(seed, radius, tiers, depth) {
    var r = rng(seed);
    var seg = 12;
    var b = new Builder();
    var rings = [];
    for (var t = 0; t < tiers; t += 1) {
      var rr = radius * (1 - t * 0.21);
      var arr = [];
      for (var s = 0; s < seg; s += 1) {
        var a = (s / seg) * Math.PI * 2 + t * 0.14;
        var jitter = rr * (0.9 + r() * 0.17);
        arr.push([Math.cos(a) * jitter, t * 0.5, Math.sin(a) * jitter]);
      }
      rings.push(arr);
    }
    var tip = [0, -depth, 0];
    for (var i = 0; i < seg; i += 1) {
      var n = (i + 1) % seg;
      b.tri(rings[0][i], rings[0][n], tip, mix(C.rock, C.rockDeep, 0.25 + r() * 0.6));
    }
    for (var tier = 0; tier < tiers; tier += 1) {
      var center = [0, tier * 0.5 + 0.03, 0];
      for (var k = 0; k < seg; k += 1) {
        var k2 = (k + 1) % seg;
        b.tri(center, rings[tier][k], rings[tier][k2], mix(C.grass, C.grassLight, 0.15 + r() * 0.7));
      }
      if (tier + 1 < tiers) {
        for (var c = 0; c < seg; c += 1) {
          var c2 = (c + 1) % seg;
          var col = tier % 2 === 0 ? C.rockLight : C.rock;
          b.quad(rings[tier][c], rings[tier][c2], rings[tier + 1][c2], rings[tier + 1][c], shade(col, 0.85 + r() * 0.25), shade(col, 0.7 + r() * 0.2));
        }
      }
    }
    return b;
  }

  var ICO = (function () {
    var t = (1 + Math.sqrt(5)) / 2;
    var raw = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ];
    var v = raw.map(function (p) { return normalize(p); });
    var f = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ];
    return { v: v, f: f };
  })();

  function buildRock(seed, radius) {
    var r = rng(seed);
    var b = new Builder();
    var verts = ICO.v.map(function (v) {
      var k = radius * (0.76 + r() * 0.5);
      return [v[0] * k, v[1] * k * (0.7 + r() * 0.5), v[2] * k];
    });
    ICO.f.forEach(function (face) {
      b.tri(verts[face[0]], verts[face[1]], verts[face[2]], mix(C.rock, C.rockLight, 0.2 + r() * 0.7));
    });
    return b;
  }

  function buildCrystal(seed, radius, height, color) {
    var r = rng(seed);
    var sides = 6;
    var b = new Builder();
    var bottom = [];
    var top = [];
    for (var i = 0; i < sides; i += 1) {
      var a = (i / sides) * Math.PI * 2 + r() * 0.2;
      bottom.push([Math.cos(a) * radius, 0, Math.sin(a) * radius]);
      top.push([Math.cos(a) * radius * 0.76, height * 0.72, Math.sin(a) * radius * 0.76]);
    }
    var apex = [0, height, 0];
    for (var j = 0; j < sides; j += 1) {
      var n = (j + 1) % sides;
      b.quad(bottom[j], bottom[n], top[n], top[j], shade(color, 0.7 + r() * 0.2), shade(color, 0.9 + r() * 0.2));
      b.tri(top[j], top[n], apex, shade(color, 1.08 + r() * 0.12));
    }
    b.tri(bottom[0], bottom[2], bottom[4], shade(color, 0.5));
    return b;
  }

  function buildBox(seed, size, colorA, colorB) {
    var r = rng(seed);
    var b = new Builder();
    var s = size;
    var v = [
      [-s, -s * 1.25, -s * 0.45], [s, -s * 1.25, -s * 0.45], [s, s * 1.25, -s * 0.45], [-s, s * 1.25, -s * 0.45],
      [-s, -s * 1.25, s * 0.45], [s, -s * 1.25, s * 0.45], [s, s * 1.25, s * 0.45], [-s, s * 1.25, s * 0.45],
    ];
    var faces = [
      [0, 1, 2, 3], [5, 4, 7, 6], [1, 5, 6, 2], [4, 0, 3, 7], [3, 2, 6, 7], [4, 5, 1, 0],
    ];
    faces.forEach(function (f, i) {
      var col = i % 2 ? colorA : colorB;
      b.quad(v[f[0]], v[f[1]], v[f[2]], v[f[3]], shade(col, 0.82 + r() * 0.3), shade(col, 0.9 + r() * 0.2));
    });
    return b;
  }

  function buildOcta(seed, size, color) {
    var r = rng(seed);
    var b = new Builder();
    var v = [[size, 0, 0], [-size, 0, 0], [0, size * 1.5, 0], [0, -size * 1.5, 0], [0, 0, size], [0, 0, -size]];
    var f = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [0, 4, 3], [4, 1, 3], [1, 5, 3], [5, 0, 3]];
    f.forEach(function (face) {
      b.tri(v[face[0]], v[face[1]], v[face[2]], shade(color, 0.72 + r() * 0.5));
    });
    return b;
  }

  function buildMonolith(seed, width, height, color) {
    var r = rng(seed);
    var b = new Builder();
    var w = width;
    var bottom = [[-w, 0, -w], [w, 0, -w], [w, 0, w], [-w, 0, w]];
    var top = [[-w * 0.55, height, -w * 0.55], [w * 0.55, height, -w * 0.55], [w * 0.55, height, w * 0.55], [-w * 0.55, height, w * 0.55]];
    for (var i = 0; i < 4; i += 1) {
      var n = (i + 1) % 4;
      b.quad(bottom[i], bottom[n], top[n], top[i], shade(color, 0.65 + r() * 0.2), shade(color, 0.8 + r() * 0.2));
    }
    b.quad(top[0], top[1], top[2], top[3], shade(color, 1.1), shade(color, 0.95));
    return b;
  }

  function buildPine(seed, height) {
    var r = rng(seed);
    var b = new Builder();
    var trunkH = height * 0.2;
    var trunkR = Math.max(0.025, height * 0.03);
    var sides = 4;
    var low = [];
    var high = [];
    for (var i = 0; i < sides; i += 1) {
      var a = (i / sides) * Math.PI * 2 + Math.PI / 4;
      low.push([Math.cos(a) * trunkR, 0, Math.sin(a) * trunkR]);
      high.push([Math.cos(a) * trunkR * 0.8, trunkH, Math.sin(a) * trunkR * 0.8]);
    }
    for (var j = 0; j < sides; j += 1) {
      var n = (j + 1) % sides;
      b.quad(low[j], low[n], high[n], high[j], C.trunk, shade(C.trunk, 0.85));
    }
    var layers = [
      { base: 0.18, top: 0.56, rad: 0.3 },
      { base: 0.42, top: 0.78, rad: 0.23 },
      { base: 0.64, top: 1.0, rad: 0.16 },
    ];
    layers.forEach(function (layer, li) {
      var baseY = height * layer.base;
      var tipY = height * layer.top;
      var rad = height * layer.rad;
      var ring = [];
      var coneSides = 6;
      for (var k = 0; k < coneSides; k += 1) {
        var ang = (k / coneSides) * Math.PI * 2 + li * 0.5;
        ring.push([Math.cos(ang) * rad, baseY, Math.sin(ang) * rad]);
      }
      var tip = [0, tipY, 0];
      var col = mix(C.pine, C.pineLight, 0.2 + r() * 0.7);
      for (var k2 = 0; k2 < coneSides; k2 += 1) {
        var nn = (k2 + 1) % coneSides;
        b.tri(ring[k2], ring[nn], tip, shade(col, 0.85 + r() * 0.3));
      }
    });
    return b;
  }

  function addOrientedBox(b, angle, radius, sx, sy, sz, color) {
    var rot = -(angle + Math.PI / 2);
    var c = Math.cos(rot), s = Math.sin(rot);
    var cx = Math.cos(angle) * radius;
    var cz = Math.sin(angle) * radius;
    function pt(x, y, z) {
      return [cx + x * c - z * s, y, cz + x * s + z * c];
    }
    var v = [
      pt(-sx, -sy, -sz), pt(sx, -sy, -sz), pt(sx, sy, -sz), pt(-sx, sy, -sz),
      pt(-sx, -sy, sz), pt(sx, -sy, sz), pt(sx, sy, sz), pt(-sx, sy, sz),
    ];
    b.quad(v[0], v[1], v[2], v[3], shade(color, 0.75), shade(color, 0.9));
    b.quad(v[5], v[4], v[7], v[6], shade(color, 0.7), shade(color, 0.85));
    b.quad(v[1], v[5], v[6], v[2], shade(color, 1.0), shade(color, 1.05));
    b.quad(v[4], v[0], v[3], v[7], shade(color, 0.8), shade(color, 0.95));
    b.quad(v[3], v[2], v[6], v[7], shade(color, 1.1), shade(color, 1.0));
    b.quad(v[4], v[5], v[1], v[0], shade(color, 0.65), shade(color, 0.8));
  }

  function buildRoundTree(seed, height) {
    var r = rng(seed);
    var b = new Builder();
    var trunkH = height * 0.4;
    var trunkR = Math.max(0.02, height * 0.026);
    var sides = 4;
    var low = [], high = [];
    for (var i = 0; i < sides; i += 1) {
      var a = (i / sides) * Math.PI * 2 + Math.PI / 4;
      low.push([Math.cos(a) * trunkR, 0, Math.sin(a) * trunkR]);
      high.push([Math.cos(a) * trunkR * 0.85, trunkH, Math.sin(a) * trunkR * 0.85]);
    }
    for (var j = 0; j < sides; j += 1) {
      var n = (j + 1) % sides;
      b.quad(low[j], low[n], high[n], high[j], C.trunk, shade(C.trunk, 0.9));
    }
    var canopy = new Builder();
    var verts = ICO.v.map(function (v) {
      var k = height * 0.32 * (0.92 + r() * 0.16);
      return [v[0] * k, v[1] * k * 0.85, v[2] * k];
    });
    ICO.f.forEach(function (face) {
      canopy.tri(verts[face[0]], verts[face[1]], verts[face[2]], mix(C.leaf, C.leafLight, 0.2 + r() * 0.6));
    });
    var d = canopy.data;
    for (var k2 = 0; k2 < d.length; k2 += 9) {
      b.push([d[k2], d[k2 + 1] + trunkH + height * 0.18, d[k2 + 2]], [d[k2 + 3], d[k2 + 4], d[k2 + 5]], [d[k2 + 6], d[k2 + 7], d[k2 + 8]]);
    }
    return b;
  }

  function buildRuin(seed, width, height) {
    var r = rng(seed);
    var b = new Builder();
    var w = width;
    var h = height * (0.7 + r() * 0.3);
    var v = [
      [-w, 0, -w], [w, 0, -w], [w, 0, w], [-w, 0, w],
      [-w * 0.86, h, -w * 0.86], [w * 0.9, h, -w * 0.8], [w * 0.82, h * 0.92, w * 0.84], [-w * 0.9, h * 0.96, w * 0.9],
    ];
    var faces = [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
    faces.forEach(function (f, i) {
      b.quad(v[f[0]], v[f[1]], v[f[2]], v[f[3]], shade(C.rockLight, 0.8 + r() * 0.25), shade(C.rock, 0.8 + r() * 0.2));
    });
    b.quad(v[4], v[5], v[6], v[7], C.sand || C.rockLight, shade(C.rockLight, 0.9));
    return b;
  }

  function buildBook(seed, width, height, thickness, cover, pages) {
    var r = rng(seed);
    var w = width, h = height, d = thickness;
    var b = new Builder();
    var v = [
      [-w, -h, -d], [w, -h, -d], [w, h, -d], [-w, h, -d],
      [-w, -h, d], [w, -h, d], [w, h, d], [-w, h, d],
    ];
    b.quad(v[0], v[1], v[2], v[3], pages, shade(pages, 0.94));       // back pages
    b.quad(v[5], v[4], v[7], v[6], pages, shade(pages, 0.96));       // front pages
    b.quad(v[4], v[0], v[3], v[7], shade(cover, 0.7), shade(cover, 0.8)); // spine
    b.quad(v[1], v[5], v[6], v[2], pages, shade(pages, 0.98));       // fore-edge
    b.quad(v[3], v[2], v[6], v[7], shade(cover, 0.95), shade(cover, 1.0)); // top
    b.quad(v[4], v[5], v[1], v[0], shade(cover, 0.75), shade(cover, 0.85)); // bottom
    return b;
  }

  function buildWaterfall(seed, height, width) {
    var r = rng(seed);
    var b = new Builder();
    var steps = 8;
    for (var i = 0; i < steps; i += 1) {
      var y1 = -height * (i / steps);
      var y2 = -height * ((i + 1) / steps);
      var w1 = width * (1 + i * 0.18);
      var w2 = width * (1 + (i + 1) * 0.18);
      var col = mix(C.crystalTeal, C.crystalIndigo, 0.2 + r() * 0.5);
      b.quad([-w1, y1, 0], [w1, y1, 0], [w2, y2, 0.03], [-w2, y2, 0.03], col, shade(col, 0.9));
    }
    return b;
  }

  function buildHalo(seed, radius, segments, color) {
    var r = rng(seed);
    var b = new Builder();
    for (var i = 0; i < segments; i += 1) {
      if (i % 6 === 5) continue;
      var a = (i / segments) * Math.PI * 2;
      addOrientedBox(b, a, radius, 0.26, 0.045 + r() * 0.02, 0.1, shade(color, 0.85 + r() * 0.3));
    }
    return b;
  }

  /* ---------------- shaders ---------------- */
  var SKY_VS = [
    "attribute vec2 aPos;",
    "varying vec2 vUv;",
    "void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.9999, 1.0); }",
  ].join("\n");

  var SKY_FS = [
    "precision mediump float;",
    "varying vec2 vUv;",
    "uniform float uTime;",
    "uniform float uScroll;",
    "uniform vec2 uPointer;",
    "float hash21(vec2 p){ p = fract(p * vec2(123.34, 345.45)); p += dot(p, p + 34.345); return fract(p.x * p.y); }",
    "float noise(vec2 p){",
    "  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);",
    "  float a = hash21(i), b = hash21(i + vec2(1.0,0.0));",
    "  float c = hash21(i + vec2(0.0,1.0)), d = hash21(i + vec2(1.0,1.0));",
    "  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);",
    "}",
    "void main(){",
    "  vec2 uv = vUv;",
    "  vec3 bottom = vec3(0.012, 0.022, 0.052);",
    "  vec3 mid = vec3(0.035, 0.06, 0.13);",
    "  vec3 top = vec3(0.02, 0.032, 0.085);",
    "  vec3 col = mix(bottom, mid, smoothstep(0.0, 0.58, uv.y));",
    "  col = mix(col, top, smoothstep(0.42, 1.0, uv.y));",
    "  float t = uTime * 0.02 + uScroll * 0.8;",
    "  float a1 = noise(vec2(uv.x * 2.4 + t * 1.1, uv.y * 1.7 - t * 0.7));",
    "  float a2 = noise(vec2(uv.x * 4.2 - t * 0.5, uv.y * 2.8 + t * 0.3));",
    "  float aurora = smoothstep(0.52, 0.92, a1 + 0.28 * a2) * smoothstep(1.0, 0.35, uv.y) * smoothstep(0.1, 0.42, uv.y);",
    "  col += mix(vec3(0.04, 0.20, 0.30), vec3(0.16, 0.10, 0.32), a2) * aurora * 1.5;",
    "  vec2 glowC = vec2(0.66 + uPointer.x * 0.02, 0.56 - uPointer.y * 0.02);",
    "  float gd = length((uv - glowC) * vec2(1.5, 1.0));",
    "  col += vec3(0.06, 0.10, 0.26) * smoothstep(0.75, 0.0, gd) * 0.9;",
    "  vec2 sp = uv * vec2(170.0, 96.0);",
    "  vec2 cell = floor(sp);",
    "  float rnd = hash21(cell);",
    "  vec2 f = fract(sp) - 0.5;",
    "  float star = smoothstep(0.12, 0.0, length(f)) * step(0.986, rnd);",
    "  col += vec3(0.7, 0.85, 1.0) * star * (0.45 + 0.55 * sin(uTime * 2.0 + rnd * 12.0));",
    "  col *= 1.0 - 0.035 * step(0.5, fract(uv.y * 240.0));",
    "  vec2 p = uv - 0.5;",
    "  col *= 1.0 - dot(p, p) * 0.6;",
    "  gl_FragColor = vec4(col, 1.0);",
    "}",
  ].join("\n");

  var MESH_VS = [
    "attribute vec3 aPos;",
    "attribute vec3 aNor;",
    "attribute vec3 aCol;",
    "uniform mat4 uProj;",
    "uniform mat4 uView;",
    "uniform mat4 uModel;",
    "varying vec3 vNor;",
    "varying vec3 vWorld;",
    "varying vec3 vCol;",
    "void main(){",
    "  vec4 world = uModel * vec4(aPos, 1.0);",
    "  vWorld = world.xyz;",
    "  vNor = mat3(uModel) * aNor;",
    "  vCol = aCol;",
    "  gl_Position = uProj * uView * world;",
    "}",
  ].join("\n");

  var MESH_FS = [
    "precision mediump float;",
    "varying vec3 vNor;",
    "varying vec3 vWorld;",
    "varying vec3 vCol;",
    "uniform vec3 uEye;",
    "uniform vec3 uLight;",
    "uniform vec3 uFogColor;",
    "uniform float uFogNear;",
    "uniform float uFogFar;",
    "uniform float uHighlight;",
    "uniform float uGlow;",
    "uniform float uTime;",
    "void main(){",
    "  vec3 n = normalize(vNor);",
    "  float diff = max(dot(n, normalize(uLight)), 0.0);",
    "  float sky = max(dot(n, vec3(0.0, 1.0, 0.0)), 0.0);",
    "  float rim = pow(1.0 - max(dot(n, normalize(uEye - vWorld)), 0.0), 2.2);",
    "  vec3 col = vCol * (0.34 + 0.72 * diff + 0.2 * sky);",
    "  col += vCol * rim * 0.5;",
    "  float pulse = 0.55 + 0.45 * sin(uTime * 2.4 + vWorld.y * 1.8);",
    "  col += vCol * (uGlow + uHighlight * 0.9) * pulse;",
    "  float fog = smoothstep(uFogNear, uFogFar, length(uEye - vWorld));",
    "  col = mix(col, uFogColor, fog * 0.94);",
    "  gl_FragColor = vec4(col, 1.0);",
    "}",
  ].join("\n");

  var OCEAN_VS = [
    "attribute vec3 aPos;",
    "uniform mat4 uProj;",
    "uniform mat4 uView;",
    "uniform float uTime;",
    "varying vec3 vWorld;",
    "void main(){",
    "  vec3 p = aPos;",
    "  p.y += sin(p.x * 0.22 + uTime * 0.55) * 0.14 + cos(p.z * 0.3 - uTime * 0.4) * 0.12;",
    "  vWorld = p;",
    "  gl_Position = uProj * uView * vec4(p, 1.0);",
    "}",
  ].join("\n");

  var OCEAN_FS = [
    "precision highp float;",
    "varying vec3 vWorld;",
    "uniform float uTime;",
    "void main(){",
    "  vec2 g = abs(fract(vWorld.xz * 0.32) - 0.5);",
    "  float line = smoothstep(0.46, 0.5, max(g.x, g.y));",
    "  float fade = smoothstep(46.0, 8.0, length(vWorld.xz));",
    "  float pulse = 0.55 + 0.45 * sin(vWorld.x * 0.55 + vWorld.z * 0.4 + uTime * 0.8);",
    "  vec3 col = mix(vec3(0.04, 0.34, 0.42), vec3(0.22, 0.26, 0.72), pulse);",
    "  float alpha = line * fade * (0.3 + 0.2 * pulse);",
    "  gl_FragColor = vec4(col * (1.8 + pulse * 1.0), alpha);",
    "}",
  ].join("\n");

  var PART_VS = [
    "attribute vec3 aPos;",
    "attribute vec3 aCol;",
    "attribute vec2 aMeta;",
    "uniform mat4 uProj;",
    "uniform mat4 uView;",
    "uniform float uTime;",
    "uniform vec2 uPointer;",
    "uniform float uShift;",
    "uniform float uBurst;",
    "varying vec3 vCol;",
    "varying float vAlpha;",
    "void main(){",
    "  vec3 p = aPos;",
    "  p.x += uShift;",
    "  float kick = 1.0 + uBurst * 2.2;",
    "  p.x += sin(uTime * 0.22 + aMeta.y * 6.28) * 0.55 * kick + uPointer.x * 0.4;",
    "  p.y += cos(uTime * 0.18 + aMeta.y * 5.0) * 0.38 * kick - uPointer.y * 0.25;",
    "  p.z += sin(uTime * 0.14 + aMeta.y * 3.0) * 0.5 * kick;",
    "  vec4 mv = uView * vec4(p, 1.0);",
    "  gl_Position = uProj * mv;",
    "  gl_PointSize = aMeta.x * (150.0 / max(1.0, -mv.z)) * (1.0 + uBurst * 0.6);",
    "  vCol = aCol;",
    "  vAlpha = (0.18 + 0.42 * (0.5 + 0.5 * sin(uTime * 1.4 + aMeta.y * 9.0))) * (1.0 + uBurst * 0.5);",
    "}",
  ].join("\n");

  var PART_FS = [
    "precision highp float;",
    "varying vec3 vCol;",
    "varying float vAlpha;",
    "void main(){",
    "  float r = length(gl_PointCoord - 0.5);",
    "  float a = smoothstep(0.5, 0.0, r) * vAlpha;",
    "  gl_FragColor = vec4(vCol * a, a);",
    "}",
  ].join("\n");

  var MORPH_VS = [
    "attribute vec3 aPos;",
    "attribute vec3 aCol;",
    "attribute vec2 aMeta;",
    "uniform mat4 uProj;",
    "uniform mat4 uView;",
    "uniform float uTime;",
    "uniform float uShift;",
    "uniform float uRot;",
    "uniform float uBurst;",
    "uniform vec3 uCenter;",
    "varying vec3 vCol;",
    "varying float vAlpha;",
    "void main(){",
    "  vec3 p = aPos - uCenter;",
    "  float c = cos(uRot), s = sin(uRot);",
    "  p = vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);",
    "  p *= 1.0 + uBurst * 0.06;",
    "  p += uCenter;",
    "  p.x += uShift;",
    "  p.x += sin(uTime * 0.7 + aMeta.y * 6.28) * 0.018;",
    "  p.y += cos(uTime * 0.6 + aMeta.y * 5.0) * 0.018;",
    "  vec4 mv = uView * vec4(p, 1.0);",
    "  gl_Position = uProj * mv;",
    "  gl_PointSize = aMeta.x * (90.0 / max(1.0, -mv.z)) * (1.0 + uBurst * 0.7);",
    "  vCol = aCol;",
    "  vAlpha = 0.28 + 0.18 * sin(uTime * 2.1 + aMeta.y * 12.0) + uBurst * 0.28;",
    "}",
  ].join("\n");

  var MORPH_FS = [
    "precision highp float;",
    "varying vec3 vCol;",
    "varying float vAlpha;",
    "void main(){",
    "  float r = length(gl_PointCoord - 0.5);",
    "  float a = smoothstep(0.5, 0.05, r) * vAlpha;",
    "  gl_FragColor = vec4(vCol * (1.0 + a * 0.6), a);",
    "}",
  ].join("\n");

  var BEAM_VS = [
    "attribute vec3 aPos;",
    "attribute float aPhase;",
    "uniform mat4 uProj;",
    "uniform mat4 uView;",
    "uniform float uShift;",
    "varying vec3 vWorld;",
    "varying float vPhase;",
    "void main(){",
    "  vWorld = aPos;",
    "  vWorld.x += uShift;",
    "  vPhase = aPhase;",
    "  gl_Position = uProj * uView * vec4(aPos, 1.0);",
    "}",
  ].join("\n");

  var BEAM_FS = [
    "precision highp float;",
    "varying vec3 vWorld;",
    "varying float vPhase;",
    "uniform float uTime;",
    "void main(){",
    "  float dash = fract(vWorld.y * 0.75 - uTime * 1.5 + vPhase);",
    "  float glow = smoothstep(0.0, 0.15, dash) * smoothstep(0.7, 0.45, dash);",
    "  float fade = smoothstep(4.4, 1.0, vWorld.y) * smoothstep(0.2, 0.8, vWorld.y);",
    "  vec3 col = mix(vec3(0.2, 0.85, 0.85), vec3(0.45, 0.5, 1.0), vPhase);",
    "  float alpha = glow * fade * 0.55;",
    "  gl_FragColor = vec4(col * (1.0 + glow), alpha);",
    "}",
  ].join("\n");

  function compile(type, source) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, source);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh) || "shader compile failed");
    }
    return sh;
  }

  function program(vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      var log = gl.getProgramInfoLog(p) || "link failed";
      console.error("[lowpoly] link log:", log);
      throw new Error(log);
    }
    return p;
  }

  var progs;
  try {
    progs = {
      sky: program(SKY_VS, SKY_FS),
      mesh: program(MESH_VS, MESH_FS),
      ocean: program(OCEAN_VS, OCEAN_FS),
      part: program(PART_VS, PART_FS),
      beam: program(BEAM_VS, BEAM_FS),
      morph: program(MORPH_VS, MORPH_FS),
    };
  } catch (error) {
    console.error("[lowpoly] program:", error && (error.message || error));
    document.body.classList.add("no-scene");
    return;
  }

  gl.clearColor(0.012, 0.02, 0.045, 1);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);

  /* ---------------- buffers ---------------- */
  function meshBuffer(builder) {
    var data = new Float32Array(builder.data);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return { buffer: buf, count: data.length / 9 };
  }

  function skyBuffer() {
    var data = new Float32Array([-1, -1, 3, -1, -1, 3]);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buf;
  }

  function oceanBuffer() {
    var size = 36, step = 3.0;
    var verts = [];
    for (var x = -size; x <= size; x += step) {
      for (var z = -size; z < size; z += step) {
        verts.push(x, -4.1, z, x, -4.1, z + step);
      }
    }
    for (var z2 = -size; z2 <= size; z2 += step) {
      for (var x2 = -size; x2 < size; x2 += step) {
        verts.push(x2, -4.1, z2, x2 + step, -4.1, z2);
      }
    }
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    return { buffer: buf, count: verts.length / 3 };
  }

  function particleBuffer(count) {
    var r = rng(4242);
    var pos = [], col = [], meta = [];
    for (var i = 0; i < count; i += 1) {
      var radius = 4 + r() * 10;
      var a = r() * Math.PI * 2;
      pos.push(Math.cos(a) * radius, -1.2 + r() * 6.5, Math.sin(a) * radius - 1.5);
      var c = [C.crystalTeal, C.crystalIndigo, C.crystalPink][Math.floor(r() * 3)];
      col.push(c[0], c[1], c[2]);
      meta.push(0.4 + r() * 1.2, r());
    }
    function b(data, n) {
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      return { buffer: buf, size: n };
    }
    return { pos: b(pos, 3), col: b(col, 3), meta: b(meta, 2), count: count };
  }

  function beamBuffer() {
    var spots = [
      [0.0, 0.0], [0.75, -0.45], [3.55, -1.25], [3.9, -0.85],
      [-3.7, -1.8], [1.45, 3.05], [-2.5, 2.3], [2.2, 1.35],
    ];
    var pos = [], phase = [];
    spots.forEach(function (s, i) {
      var x = s[0], z = s[1];
      pos.push(x, 0.6, z, x, 4.6, z);
      phase.push(i * 0.17, i * 0.17);
    });
    function b(data, n) {
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      return { buffer: buf, size: n };
    }
    return { pos: b(pos, 3), phase: b(phase, 1), count: pos.length / 3 };
  }

  var SKY = skyBuffer();
  var OCEAN = oceanBuffer();
  var PARTS = particleBuffer(150);
  var BEAMS = beamBuffer();

  /* ---------------- morphing particle sculpture ----------------
     Per-point position tween with random delays, inspired by the
     Up2017/particle effect template (QingXia-Ela), adapted to our
     raw WebGL pipeline. Shapes are sampled from the same low-poly
     builders so the particles feel part of the world. */
  var MORPH_COUNT = 1200;
  var MORPH_CENTER = [0.45, 3.55, -0.7];
  var morphBurst = 0;
  var morphRot = 0;

  function sampleBuilder(builder, count, scale, center) {
    var d = builder.data;
    var triCount = d.length / 27;
    var areas = new Float32Array(triCount);
    var total = 0;
    var i, a, b, c, ab, ac, cr;
    for (i = 0; i < triCount; i += 1) {
      a = i * 27; b = a + 9; c = a + 18;
      ab = [d[b] - d[a], d[b + 1] - d[a + 1], d[b + 2] - d[a + 2]];
      ac = [d[c] - d[a], d[c + 1] - d[a + 1], d[c + 2] - d[a + 2]];
      cr = cross(ab, ac);
      areas[i] = Math.sqrt(dot(cr, cr)) * 0.5;
      total += areas[i];
    }
    var out = new Float32Array(count * 3);
    var r = rng(7331 + count);
    for (i = 0; i < count; i += 1) {
      var pick = r() * total;
      var tri = 0;
      while (tri < triCount - 1 && pick > areas[tri]) { pick -= areas[tri]; tri += 1; }
      var base = tri * 27;
      var u = Math.sqrt(r());
      var v = r();
      var w0 = 1 - u;
      var w1 = u * (1 - v);
      var w2 = u * v;
      var px = d[base] * w0 + d[base + 9] * w1 + d[base + 18] * w2;
      var py = d[base + 1] * w0 + d[base + 10] * w1 + d[base + 19] * w2;
      var pz = d[base + 2] * w0 + d[base + 11] * w1 + d[base + 20] * w2;
      out[i * 3] = (px - center[0]) * scale + MORPH_CENTER[0];
      out[i * 3 + 1] = (py - center[1]) * scale + MORPH_CENTER[1];
      out[i * 3 + 2] = (pz - center[2]) * scale + MORPH_CENTER[2];
    }
    return out;
  }

  function makeShapes() {
    var shapes = {};

    // island: the same terraced language as the world
    shapes.island = sampleBuilder(
      buildTerracedIsland(911, 2.0, 3, 1.3),
      MORPH_COUNT, 0.92, [0, 0.35, 0]
    );

    // crystal: a cluster sampled from crystal surfaces
    var crystal = new Builder();
    [
      [0.0, 0.0, 0.0, 0.52, 2.2, C.crystalIndigo],
      [0.58, -0.1, 0.26, 0.3, 1.3, C.crystalTeal],
      [-0.52, -0.1, 0.18, 0.26, 1.1, C.crystalPink],
      [0.1, -0.15, -0.5, 0.2, 0.8, C.crystalTeal],
    ].forEach(function (c, ci) {
      var g = buildCrystal(880 + ci, c[3], c[4], c[5]);
      var d = g.data;
      for (var k = 0; k < d.length; k += 9) crystal.push([d[k] + c[0], d[k + 1] + c[1], d[k + 2] + c[2]], [d[k + 3], d[k + 4], d[k + 5]], [d[k + 6], d[k + 7], d[k + 8]]);
    });
    shapes.crystal = sampleBuilder(crystal, MORPH_COUNT, 0.9, [0, 0.9, 0]);

    // ring: torus
    var ring = new Float32Array(MORPH_COUNT * 3);
    var rr = rng(1777);
    for (var ri = 0; ri < MORPH_COUNT; ri += 1) {
      var R = 1.45, tube = 0.42;
      var u = rr() * Math.PI * 2;
      var v = rr() * Math.PI * 2;
      var x = (R + tube * Math.cos(v)) * Math.cos(u);
      var y = (R + tube * Math.cos(v)) * Math.sin(u);
      var z = tube * Math.sin(v);
      ring[ri * 3] = x + MORPH_CENTER[0];
      ring[ri * 3 + 1] = y + MORPH_CENTER[1];
      ring[ri * 3 + 2] = z + MORPH_CENTER[2];
    }
    shapes.ring = ring;

    // wave: reference-template style flat wave
    var wave = new Float32Array(MORPH_COUNT * 3);
    var wr = rng(2888);
    for (var wi = 0; wi < MORPH_COUNT; wi += 1) {
      var wx = (wr() * 2 - 1) * 1.9;
      var wz = (wr() * 2 - 1) * 1.45;
      var wy = Math.sin(wx * 2.5) * 0.26 + Math.cos(wz * 3.1) * 0.2 - 0.1;
      wave[wi * 3] = wx + MORPH_CENTER[0];
      wave[wi * 3 + 1] = wy + MORPH_CENTER[1];
      wave[wi * 3 + 2] = wz + MORPH_CENTER[2];
    }
    shapes.wave = wave;

    return shapes;
  }

  var SHAPES = makeShapes();
  var MORPH_COLORS = {};
  function shapeColors(name) {
    var r = rng(9100 + name.length);
    var cols = new Float32Array(MORPH_COUNT * 3);
    var palettes = {
      island: [C.crystalTeal, C.crystalTeal, C.grassLight, C.crystalIndigo],
      crystal: [C.crystalIndigo, C.crystalPink, C.crystalTeal, C.crystalIndigo],
      ring: [C.crystalTeal, C.crystalIndigo, C.crystalTeal, C.crystalPink],
      wave: [C.crystalPink, C.crystalTeal, C.crystalIndigo, C.crystalTeal],
    };
    var pal = palettes[name] || [C.crystalTeal, C.crystalIndigo];
    for (var i = 0; i < MORPH_COUNT; i += 1) {
      var c = pal[Math.floor(r() * pal.length)];
      var k = 0.55 + r() * 0.45;
      cols[i * 3] = c[0] * k;
      cols[i * 3 + 1] = c[1] * k;
      cols[i * 3 + 2] = c[2] * k;
    }
    return cols;
  }
  Object.keys(SHAPES).forEach(function (name) { MORPH_COLORS[name] = shapeColors(name); });

  var MORPH = {
    curPos: new Float32Array(MORPH_COUNT * 3),
    fromPos: new Float32Array(MORPH_COUNT * 3),
    curCol: new Float32Array(MORPH_COUNT * 3),
    fromCol: new Float32Array(MORPH_COUNT * 3),
    targetPos: SHAPES.island,
    targetCol: MORPH_COLORS.island,
    delays: new Float32Array(MORPH_COUNT),
    start: 0,
    duration: 1.55,
    active: false,
    name: "island",
  };

  function createMorphBuffers() {
    var r = rng(5151);
    var meta = [];
    var p = MORPH.curPos;
    var c = MORPH.curCol;
    for (var i = 0; i < MORPH_COUNT; i += 1) {
      var a = r() * Math.PI * 2;
      var b = Math.acos(r() * 2 - 1);
      var rad = 2.2 + r() * 2.0;
      p[i * 3] = MORPH_CENTER[0] + Math.sin(b) * Math.cos(a) * rad;
      p[i * 3 + 1] = MORPH_CENTER[1] + Math.cos(b) * rad;
      p[i * 3 + 2] = MORPH_CENTER[2] + Math.sin(b) * Math.sin(a) * rad;
      var col = [C.crystalTeal, C.crystalIndigo, C.crystalPink][Math.floor(r() * 3)];
      c[i * 3] = col[0] * 0.8; c[i * 3 + 1] = col[1] * 0.8; c[i * 3 + 2] = col[2] * 0.8;
      meta.push(0.28 + r() * 0.85, r());
    }
    var posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, p, gl.DYNAMIC_DRAW);
    var colBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, c, gl.DYNAMIC_DRAW);
    var metaBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, metaBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(meta), gl.STATIC_DRAW);
    return { pos: posBuf, col: colBuf, meta: metaBuf, count: MORPH_COUNT };
  }
  var MORPH_BUFFERS = createMorphBuffers();

  function easeInOutCubic(x) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }

  function morphTo(name) {
    if (!SHAPES[name]) return;
    var now = performance.now() / 1000;
    MORPH.fromPos.set(MORPH.curPos);
    MORPH.fromCol.set(MORPH.curCol);
    MORPH.targetPos = SHAPES[name];
    MORPH.targetCol = MORPH_COLORS[name];
    for (var i = 0; i < MORPH_COUNT; i += 1) MORPH.delays[i] = Math.random() * 0.55;
    MORPH.start = now;
    MORPH.active = true;
    MORPH.name = name;
    morphBurst = 1.0;
    var buttons = document.querySelectorAll("[data-morph]");
    for (var b = 0; b < buttons.length; b += 1) buttons[b].classList.toggle("active", buttons[b].getAttribute("data-morph") === name);
  }

  function updateMorph(t) {
    if (!MORPH.active) return;
    var pos = MORPH.curPos;
    var col = MORPH.curCol;
    var fp = MORPH.fromPos, tp = MORPH.targetPos;
    var fc = MORPH.fromCol, tc = MORPH.targetCol;
    var done = true;
    for (var i = 0; i < MORPH_COUNT; i += 1) {
      var raw = (t - MORPH.start - MORPH.delays[i]) / MORPH.duration;
      if (raw < 1) done = false;
      var p = Math.max(0, Math.min(1, raw));
      var e = easeInOutCubic(p);
      var dx = tp[i * 3] - fp[i * 3];
      var dy = tp[i * 3 + 1] - fp[i * 3 + 1];
      var dz = tp[i * 3 + 2] - fp[i * 3 + 2];
      var lift = Math.sin(Math.PI * p) * 0.28;
      var ix = fp[i * 3] - MORPH_CENTER[0];
      var iy = fp[i * 3 + 1] - MORPH_CENTER[1];
      var iz = fp[i * 3 + 2] - MORPH_CENTER[2];
      var il = Math.sqrt(ix * ix + iy * iy + iz * iz) || 1;
      pos[i * 3] = fp[i * 3] + dx * e + ix / il * lift;
      pos[i * 3 + 1] = fp[i * 3 + 1] + dy * e + iy / il * lift;
      pos[i * 3 + 2] = fp[i * 3 + 2] + dz * e + iz / il * lift;
      col[i * 3] = fc[i * 3] + (tc[i * 3] - fc[i * 3]) * e;
      col[i * 3 + 1] = fc[i * 3 + 1] + (tc[i * 3 + 1] - fc[i * 3 + 1]) * e;
      col[i * 3 + 2] = fc[i * 3 + 2] + (tc[i * 3 + 2] - fc[i * 3 + 2]) * e;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, MORPH_BUFFERS.pos);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos);
    gl.bindBuffer(gl.ARRAY_BUFFER, MORPH_BUFFERS.col);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, col);
    if (done) MORPH.active = false;
  }

  var morphButtons = document.querySelectorAll("[data-morph]");
  for (var mb = 0; mb < morphButtons.length; mb += 1) {
    (function (button) {
      button.addEventListener("click", function () { morphTo(button.getAttribute("data-morph")); });
    })(morphButtons[mb]);
  }
  morphTo("island");

  /* ---------------- scene objects ---------------- */
  var objects = [];
  var landmarks = [];

  function addObject(mesh, opts) {
    var obj = {
      mesh: mesh,
      pos: opts.pos || [0, 0, 0],
      rotY: opts.rotY || 0,
      spin: opts.spin || 0,
      bobAmp: opts.bobAmp || 0,
      bobSpeed: opts.bobSpeed || 0,
      bobPhase: opts.bobPhase || 0,
      orbit: opts.orbit || null,
      glow: opts.glow || 0,
      highlight: 0,
      landmark: opts.landmark || null,
    };
    objects.push(obj);
    if (opts.landmark) landmarks.push(obj);
    return obj;
  }

  // terraced islands
  addObject(meshBuffer(buildTerracedIsland(11, 3.2, 3, 2.0)), { pos: [0, 0, 0], bobAmp: 0.04, bobSpeed: 0.5 });
  addObject(meshBuffer(buildTerracedIsland(23, 1.6, 2, 1.0)), { pos: [-3.6, 0.2, -1.8], bobAmp: 0.06, bobSpeed: 0.7, bobPhase: 1.2 });
  addObject(meshBuffer(buildTerracedIsland(37, 1.9, 2, 1.1)), { pos: [3.5, 0.2, -1.3], bobAmp: 0.05, bobSpeed: 0.6, bobPhase: 2.4 });
  addObject(meshBuffer(buildTerracedIsland(41, 1.0, 1, 0.7)), { pos: [1.4, -0.6, 3.0], bobAmp: 0.08, bobSpeed: 0.8, bobPhase: 3.1 });

  // rocks on lower tiers
  [[-2.7, 0.02, 0.5, 0.42], [2.8, 0.02, -0.5, 0.34], [-0.6, 0.02, 2.9, 0.26], [2.2, 0.52, 1.2, 0.22], [-1.9, 0.52, -1.3, 0.2]].forEach(function (r, i) {
    addObject(meshBuffer(buildRock(50 + i, r[3])), { pos: [r[0], r[1], r[2]], rotY: i * 1.7 });
  });

  // trees — placed on flat tier tops so nothing floats
  var trees = [
    [-1.2, 1.02, 0.7, 1.15, 0], [1.1, 1.02, 0.5, 0.95, 1], [-0.2, 1.02, -1.3, 0.85, 0],
    [2.2, 0.52, 0.7, 1.0, 1], [1.5, 0.52, -1.9, 0.9, 0], [-2.3, 0.52, 0.9, 0.95, 1],
    [-1.0, 0.52, 2.1, 0.8, 0], [1.0, 0.52, 2.2, 0.7, 1], [-2.5, 0.52, -0.4, 0.75, 0],
    [3.1, 0.72, -1.5, 0.85, 1], [3.9, 0.72, -1.0, 0.7, 0],
    [-3.9, 0.72, -1.6, 0.8, 1], [-3.2, 0.72, -2.0, 0.65, 0],
  ];
  trees.forEach(function (p, i) {
    var builder = p[4] ? buildRoundTree(200 + i, p[3] * 1.18) : buildPine(240 + i, p[3] * 1.18);
    addObject(meshBuffer(builder), { pos: [p[0], p[1], p[2]], rotY: i * 1.3 });
  });

  // ruined stone pillars on the middle tier
  [[-1.8, 0.52, 1.4, 0.13, 0.85], [1.9, 0.52, -1.6, 0.11, 0.7], [0.9, 0.52, 1.9, 0.1, 0.6]].forEach(function (p, i) {
    addObject(meshBuffer(buildRuin(300 + i, p[3], p[4])), { pos: [p[0], p[1], p[2]], rotY: i * 1.9 });
  });

  // crystal cluster on the top tier
  var clusterDefs = [
    [0.0, 0.0, 0.0, 0.32, 2.3, C.crystalIndigo],
    [0.58, -0.04, 0.3, 0.2, 1.45, C.crystalTeal],
    [-0.48, -0.04, 0.2, 0.18, 1.3, C.crystalPink],
    [0.14, -0.06, -0.55, 0.15, 1.1, C.crystalTeal],
    [-0.2, -0.06, 0.62, 0.13, 0.85, C.crystalIndigo],
  ];
  var clusterMesh = (function () {
    var merged = new Builder();
    clusterDefs.forEach(function (c, i) {
      var g = buildCrystal(70 + i, c[3], c[4], c[5]);
      var d = g.data;
      for (var k = 0; k < d.length; k += 9) {
        merged.push([d[k] + c[0], d[k + 1] + c[1], d[k + 2] + c[2]], [d[k + 3], d[k + 4], d[k + 5]], [d[k + 6], d[k + 7], d[k + 8]]);
      }
    });
    return merged;
  })();
  addObject(meshBuffer(clusterMesh), {
    pos: [0, 1.02, 0], bobAmp: 0.015, bobSpeed: 0.9, glow: 0.35,
    landmark: { label: "技术方向", target: "#focus", offsetY: 2.9 },
  });

  // floating landmarks (these are meant to float)
  var courseMesh = (function () {
    var merged = new Builder();
    var defs = [
      [0.0, 0.0, 0.0, 0.2, 1.25, C.crystalIndigo],
      [0.32, -0.1, 0.18, 0.13, 0.8, C.crystalTeal],
      [-0.28, -0.1, 0.1, 0.11, 0.65, C.crystalIndigo],
    ];
    defs.forEach(function (c, i) {
      var g = buildCrystal(760 + i, c[3], c[4], c[5]);
      var d = g.data;
      for (var k = 0; k < d.length; k += 9) merged.push([d[k] + c[0], d[k + 1] + c[1], d[k + 2] + c[2]], [d[k + 3], d[k + 4], d[k + 5]], [d[k + 6], d[k + 7], d[k + 8]]);
    });
    return merged;
  })();
  addObject(meshBuffer(courseMesh), {
    pos: [-2.8, 2.2, -1.05], spin: 0.25, bobAmp: 0.1, bobSpeed: 0.8, bobPhase: 0.6, glow: 0.35,
    landmark: { label: "Claude Code 内功课", target: "course/", offsetY: 1.1 },
  });
  addObject(meshBuffer(buildOcta(91, 0.45, C.crystalPink)), {
    pos: [3.0, 2.4, 0.4], rotY: 0.3, spin: 0.35, bobAmp: 0.12, bobSpeed: 0.9, bobPhase: 2.0, glow: 0.55,
    landmark: { label: "Agent 实验室", target: "agent-lab/", offsetY: 0.95 },
  });
  addObject(meshBuffer(buildOcta(111, 0.32, C.crystalTeal)), {
    pos: [0.2, 3.2, -2.8], rotY: 0.9, spin: 0.4, bobAmp: 0.14, bobSpeed: 0.75, bobPhase: 4.2, glow: 0.6,
    landmark: { label: "联系我", target: "#contact", offsetY: 0.8 },
  });
  addObject(meshBuffer(buildCrystal(150, 0.22, 1.25, C.crystalIndigo)), {
    pos: [-1.7, 2.2, 1.7], rotY: 0, spin: 0.18, bobAmp: 0.1, bobSpeed: 0.7, bobPhase: 5.0, glow: 0.45,
    landmark: { label: "项目与作品", target: "#projects", offsetY: 1.25 },
  });

  // monolith on the right island's top tier
  addObject(meshBuffer(buildMonolith(101, 0.34, 1.9, C.metal)), {
    pos: [3.4, 0.72, -1.2], rotY: 0.5, bobAmp: 0.02, bobSpeed: 0.6, bobPhase: 1.4, glow: 0.25,
    landmark: { label: "经历 · 华为 / XJTU", target: "#experience", offsetY: 2.2 },
  });

  // orbiting shards
  for (var sh = 0; sh < 10; sh += 1) {
    var rad = 4.4 + (sh % 3) * 0.6;
    addObject(meshBuffer(buildOcta(130 + sh, 0.1 + (sh % 3) * 0.04, sh % 2 ? C.crystalIndigo : C.crystalTeal)), {
      pos: [0, 0, 0],
      orbit: { radius: rad, phase: (sh / 10) * Math.PI * 2, speed: 0.05 + (sh % 3) * 0.01, y: 0.6 + (sh % 5) * 0.4 },
      rotY: sh, spin: 0.5, glow: 0.35,
    });
  }

  /* ---------------- resize ---------------- */
  var W = 1, H = 1;
  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener("resize", resize);

  /* ---------------- interaction ---------------- */
  var pointer = { x: 0, y: 0, clientX: W / 2, clientY: H / 2 };
  var dragging = false;
  var dragMoved = false;
  var lastX = 0;
  var dragOffset = 0;
  var hovered = null;
  var tip = document.getElementById("scene-tip");
  var interactiveSelector = "a,button,input,textarea,select,label,[role='button'],.stat,.card,.project,.particle-switch";
  var worldShift = 0;

  function updateWorldShift() {
    worldShift = window.innerWidth < 900 ? 0 : 3.9;
  }
  updateWorldShift();
  window.addEventListener("resize", updateWorldShift);

  function bob(obj) {
    return obj.bobAmp ? Math.sin(performance.now() * 0.001 * obj.bobSpeed + obj.bobPhase) * obj.bobAmp : 0;
  }

  function project(world) {
    var mvp = multiply(proj, view);
    var x = mvp[0] * world[0] + mvp[4] * world[1] + mvp[8] * world[2] + mvp[12];
    var y = mvp[1] * world[0] + mvp[5] * world[1] + mvp[9] * world[2] + mvp[13];
    var w = mvp[3] * world[0] + mvp[7] * world[1] + mvp[11] * world[2] + mvp[15];
    if (w <= 0.001) return null;
    var nx = x / w;
    var ny = y / w;
    if (nx < -1.4 || nx > 1.4 || ny < -1.4 || ny > 1.4) return null;
    return [((nx + 1) / 2) * W, ((1 - ny) / 2) * H];
  }

  function pick(clientX, clientY) {
    var best = null;
    var bestDist = 48;
    for (var i = 0; i < landmarks.length; i += 1) {
      var obj = landmarks[i];
      var world = [obj.pos[0] + worldShift, obj.pos[1] + bob(obj) + (obj.landmark.offsetY || 0), obj.pos[2]];
      var screen = project(world);
      if (!screen) continue;
      var dx = screen[0] - clientX;
      var dy = screen[1] - clientY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) { bestDist = dist; best = obj; }
    }
    return best;
  }

  function setTip(node) {
    if (!tip) return;
    if (!node) { tip.hidden = true; return; }
    tip.textContent = "";
    var dot = document.createElement("span");
    dot.className = "tip-dot";
    dot.style.background = node.landmark.target.indexOf("#") === 0 ? "#5eead4" : "#8b93ff";
    var label = document.createElement("b");
    label.textContent = node.landmark.label;
    var act = document.createElement("span");
    act.className = "tip-act";
    act.textContent = node.landmark.target.indexOf("#") === 0 ? "跳转" : (node.landmark.target.indexOf("http") === 0 ? "打开 GitHub" : "打开");
    tip.appendChild(dot);
    tip.appendChild(label);
    tip.appendChild(act);
    tip.style.left = pointer.clientX + "px";
    tip.style.top = pointer.clientY + "px";
    tip.hidden = false;
  }

  function activate(obj) {
    if (!obj || !obj.landmark) return;
    var target = obj.landmark.target;
    if (target.charAt(0) === "#") {
      var el = document.querySelector(target);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (target.indexOf("http") === 0) {
      window.open(target, "_blank", "noopener");
    } else {
      window.location.href = target;
    }
  }

  window.addEventListener("pointermove", function (event) {
    pointer.clientX = event.clientX;
    pointer.clientY = event.clientY;
    pointer.x = (event.clientX / W) * 2 - 1;
    pointer.y = (event.clientY / H) * 2 - 1;

    if (dragging) {
      var dx = event.clientX - lastX;
      if (Math.abs(dx) > 2) dragMoved = true;
      lastX = event.clientX;
      dragOffset += dx * 0.005;
      setTip(null);
      hovered = null;
      document.body.style.cursor = "";
      return;
    }

    var node = pick(event.clientX, event.clientY);
    if (node !== hovered) {
      hovered = node;
      setTip(node);
      document.body.style.cursor = node ? "pointer" : "";
    } else if (node) {
      setTip(node);
    }
  }, { passive: true });

  window.addEventListener("pointerdown", function (event) {
    if (event.target && event.target.closest && event.target.closest(interactiveSelector)) return;
    if (event.pointerType === "touch") return;
    dragging = true;
    dragMoved = false;
    lastX = event.clientX;
    document.body.classList.add("scene-dragging");
  });

  window.addEventListener("pointerup", function (event) {
    var wasDragging = dragging;
    dragging = false;
    document.body.classList.remove("scene-dragging");
    if (wasDragging && !dragMoved) {
      var node = pick(event.clientX, event.clientY);
      if (node) activate(node);
    }
    if (event.pointerType === "touch" && event.target && !(event.target.closest && event.target.closest(interactiveSelector))) {
      var touchNode = pick(event.clientX, event.clientY);
      if (touchNode) activate(touchNode);
    }
  });

  window.addEventListener("pointercancel", function () {
    dragging = false;
    document.body.classList.remove("scene-dragging");
  });

  /* ---------------- scroll / camera ---------------- */
  var scrollTarget = 0;
  var scrollProgress = 0;

  function updateScroll() {
    var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    scrollTarget = Math.max(0, Math.min(1, window.scrollY / max));
  }
  window.addEventListener("scroll", updateScroll, { passive: true });
  updateScroll();

  var proj = perspective((45 * Math.PI) / 180, W / H, 0.1, 80);
  var view;
  var eye = [0, 3.8, 15.5];
  var target = [0.35, 0.75, 0];

  function cameraState(progress) {
    var small = W < 900;
    var centerX = small ? 0 : 0.35;
    var angle = 0.35 + progress * 2.05 + dragOffset;
    var radius = (small ? 16.6 : 16.3) + Math.sin(progress * Math.PI) * 1.4;
    var ex = centerX + Math.sin(angle) * radius + pointer.x * 0.5;
    var ey = (small ? 4.2 : 4.0) + Math.sin(progress * Math.PI * 1.2) * 1.0 - pointer.y * 0.3;
    var ez = Math.cos(angle) * radius;
    var ty = (small ? 0.5 : 0.75) + progress * 0.4;
    return { eye: [ex, Math.max(1.6, ey), ez], target: [centerX, ty, 0] };
  }

  /* ---------------- render loop ---------------- */
  var active = true;
  var lastTime = 0;
  var lastOpacity = 1;
  var fogColor = new Float32Array([0.02, 0.035, 0.075]);
  var lightDir = new Float32Array(normalize([-0.45, 0.9, 0.55]));

  function uniforms(p) {
    return {
      proj: gl.getUniformLocation(p, "uProj"),
      view: gl.getUniformLocation(p, "uView"),
      model: gl.getUniformLocation(p, "uModel"),
      eye: gl.getUniformLocation(p, "uEye"),
      light: gl.getUniformLocation(p, "uLight"),
      fogColor: gl.getUniformLocation(p, "uFogColor"),
      fogNear: gl.getUniformLocation(p, "uFogNear"),
      fogFar: gl.getUniformLocation(p, "uFogFar"),
      glow: gl.getUniformLocation(p, "uGlow"),
      highlight: gl.getUniformLocation(p, "uHighlight"),
      time: gl.getUniformLocation(p, "uTime"),
      scroll: gl.getUniformLocation(p, "uScroll"),
      pointer: gl.getUniformLocation(p, "uPointer"),
      shift: gl.getUniformLocation(p, "uShift"),
      burst: gl.getUniformLocation(p, "uBurst"),
      rot: gl.getUniformLocation(p, "uRot"),
      center: gl.getUniformLocation(p, "uCenter"),
    };
  }
  var US = {
    sky: uniforms(progs.sky),
    mesh: uniforms(progs.mesh),
    ocean: uniforms(progs.ocean),
    part: uniforms(progs.part),
    beam: uniforms(progs.beam),
    morph: uniforms(progs.morph),
  };
  var AT = {
    sky: {
      pos: gl.getAttribLocation(progs.sky, "aPos"),
    },
    mesh: {
      pos: gl.getAttribLocation(progs.mesh, "aPos"),
      nor: gl.getAttribLocation(progs.mesh, "aNor"),
      col: gl.getAttribLocation(progs.mesh, "aCol"),
    },
    ocean: {
      pos: gl.getAttribLocation(progs.ocean, "aPos"),
    },
    part: {
      pos: gl.getAttribLocation(progs.part, "aPos"),
      col: gl.getAttribLocation(progs.part, "aCol"),
      meta: gl.getAttribLocation(progs.part, "aMeta"),
    },
    beam: {
      pos: gl.getAttribLocation(progs.beam, "aPos"),
      phase: gl.getAttribLocation(progs.beam, "aPhase"),
    },
    morph: {
      pos: gl.getAttribLocation(progs.morph, "aPos"),
      col: gl.getAttribLocation(progs.morph, "aCol"),
      meta: gl.getAttribLocation(progs.morph, "aMeta"),
    },
  };

  var lastAspect = 0;

  function draw() {
    var now = performance.now();
    var t = now * 0.001;
    var dt = Math.min((now - lastTime) / 1000 || 0.016, 0.05);
    lastTime = now;
    if (!active || document.hidden) {
      requestAnimationFrame(draw);
      return;
    }

    scrollProgress += (scrollTarget - scrollProgress) * 0.08;
    morphRot += dt * 0.11;
    morphBurst = Math.max(0, morphBurst - dt * 1.45);
    updateMorph(t);
    var fadeIn = Math.max(0, Math.min(1, (scrollProgress - 0.03) / 0.18));
    var sceneOpacity = 1 - fadeIn * 0.82;
    if (Math.abs(sceneOpacity - lastOpacity) > 0.01) {
      lastOpacity = sceneOpacity;
      canvas.style.opacity = sceneOpacity.toFixed(3);
    }

    var aspect = W / Math.max(1, H);
    if (Math.abs(aspect - lastAspect) > 0.001) {
      lastAspect = aspect;
      proj = perspective((45 * Math.PI) / 180, aspect, 0.1, 80);
    }
    var cam = cameraState(scrollProgress);
    eye = cam.eye;
    target = cam.target;
    view = lookAt(eye, target, [0, 1, 0]);

    for (var h = 0; h < landmarks.length; h += 1) {
      var lm = landmarks[h];
      lm.highlight += ((hovered === lm ? 1 : 0) - lm.highlight) * 0.18;
    }

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    /* ---- sky ---- */
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.BLEND);
    gl.useProgram(progs.sky);
    gl.uniform1f(US.sky.time, t);
    gl.uniform1f(US.sky.scroll, scrollProgress);
    gl.uniform2f(US.sky.pointer, pointer.x, pointer.y);
    gl.bindBuffer(gl.ARRAY_BUFFER, SKY);
    gl.enableVertexAttribArray(AT.sky.pos);
    gl.vertexAttribPointer(AT.sky.pos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    /* ---- data ocean ---- */
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.useProgram(progs.ocean);
    gl.uniformMatrix4fv(US.ocean.proj, false, proj);
    gl.uniformMatrix4fv(US.ocean.view, false, view);
    gl.uniform1f(US.ocean.time, t);
    gl.bindBuffer(gl.ARRAY_BUFFER, OCEAN.buffer);
    gl.enableVertexAttribArray(AT.ocean.pos);
    gl.vertexAttribPointer(AT.ocean.pos, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.LINES, 0, OCEAN.count);

    /* ---- meshes ---- */
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.useProgram(progs.mesh);
    gl.uniformMatrix4fv(US.mesh.proj, false, proj);
    gl.uniformMatrix4fv(US.mesh.view, false, view);
    gl.uniform3fv(US.mesh.eye, new Float32Array(eye));
    gl.uniform3fv(US.mesh.light, lightDir);
    gl.uniform3fv(US.mesh.fogColor, fogColor);
    gl.uniform1f(US.mesh.fogNear, 17);
    gl.uniform1f(US.mesh.fogFar, 48);
    gl.uniform1f(US.mesh.time, t);

    for (var i = 0; i < objects.length; i += 1) {
      var obj = objects[i];
      var pos;
      if (obj.orbit) {
        var ang = obj.orbit.phase + t * obj.orbit.speed;
        pos = [Math.cos(ang) * obj.orbit.radius + worldShift, obj.orbit.y + Math.sin(t * 0.7 + i) * 0.12, Math.sin(ang) * obj.orbit.radius];
      } else {
        pos = [obj.pos[0] + worldShift, obj.pos[1] + bob(obj), obj.pos[2]];
      }
      var ry = obj.rotY + (obj.spin ? t * obj.spin : 0);
      var scale = 1 + (obj.highlight || 0) * 0.14;
      var model = modelMatrix(pos, ry, scale);
      gl.uniformMatrix4fv(US.mesh.model, false, model);
      gl.uniform1f(US.mesh.glow, obj.glow || 0);
      gl.uniform1f(US.mesh.highlight, obj.highlight || 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, obj.mesh.buffer);
      gl.enableVertexAttribArray(AT.mesh.pos);
      gl.vertexAttribPointer(AT.mesh.pos, 3, gl.FLOAT, false, 36, 0);
      gl.enableVertexAttribArray(AT.mesh.nor);
      gl.vertexAttribPointer(AT.mesh.nor, 3, gl.FLOAT, false, 36, 12);
      gl.enableVertexAttribArray(AT.mesh.col);
      gl.vertexAttribPointer(AT.mesh.col, 3, gl.FLOAT, false, 36, 24);
      gl.drawArrays(gl.TRIANGLES, 0, obj.mesh.count);
    }

    /* ---- energy beams ---- */
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    gl.useProgram(progs.beam);
    gl.uniformMatrix4fv(US.beam.proj, false, proj);
    gl.uniformMatrix4fv(US.beam.view, false, view);
    gl.uniform1f(US.beam.time, t);
    gl.uniform1f(US.beam.shift, worldShift);
    gl.bindBuffer(gl.ARRAY_BUFFER, BEAMS.pos.buffer);
    gl.enableVertexAttribArray(AT.beam.pos);
    gl.vertexAttribPointer(AT.beam.pos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, BEAMS.phase.buffer);
    gl.enableVertexAttribArray(AT.beam.phase);
    gl.vertexAttribPointer(AT.beam.phase, 1, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.LINES, 0, BEAMS.count);

    /* ---- motes ---- */
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    gl.useProgram(progs.part);
    gl.uniformMatrix4fv(US.part.proj, false, proj);
    gl.uniformMatrix4fv(US.part.view, false, view);
    gl.uniform1f(US.part.time, t);
    gl.uniform2f(US.part.pointer, pointer.x, pointer.y);
    gl.uniform1f(US.part.shift, worldShift);
    gl.uniform1f(US.part.burst, morphBurst);
    gl.bindBuffer(gl.ARRAY_BUFFER, PARTS.pos.buffer);
    gl.enableVertexAttribArray(AT.part.pos);
    gl.vertexAttribPointer(AT.part.pos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, PARTS.col.buffer);
    gl.enableVertexAttribArray(AT.part.col);
    gl.vertexAttribPointer(AT.part.col, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, PARTS.meta.buffer);
    gl.enableVertexAttribArray(AT.part.meta);
    gl.vertexAttribPointer(AT.part.meta, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.POINTS, 0, PARTS.count);

    /* ---- morphing particle sculpture ---- */
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    gl.useProgram(progs.morph);
    gl.uniformMatrix4fv(US.morph.proj, false, proj);
    gl.uniformMatrix4fv(US.morph.view, false, view);
    gl.uniform1f(US.morph.time, t);
    gl.uniform1f(US.morph.shift, worldShift);
    gl.uniform1f(US.morph.rot, morphRot);
    gl.uniform1f(US.morph.burst, morphBurst);
    gl.uniform3fv(US.morph.center, new Float32Array(MORPH_CENTER));
    gl.bindBuffer(gl.ARRAY_BUFFER, MORPH_BUFFERS.pos);
    gl.enableVertexAttribArray(AT.morph.pos);
    gl.vertexAttribPointer(AT.morph.pos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, MORPH_BUFFERS.col);
    gl.enableVertexAttribArray(AT.morph.col);
    gl.vertexAttribPointer(AT.morph.col, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, MORPH_BUFFERS.meta);
    gl.enableVertexAttribArray(AT.morph.meta);
    gl.vertexAttribPointer(AT.morph.meta, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.POINTS, 0, MORPH_COUNT);

    gl.depthMask(true);
    gl.disable(gl.BLEND);

    requestAnimationFrame(draw);
  }

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) { lastTime = performance.now(); }
  });

  document.body.classList.add("scene-on");
  updateScroll();
  requestAnimationFrame(draw);

  /* ---------------- debug hooks ---------------- */
  window.__lowpoly = {
    ready: true,
    landmarks: landmarks.map(function (o) { return { label: o.landmark.label, target: o.landmark.target }; }),
    screenPos: function (index) {
      var obj = landmarks[index];
      if (!obj) return null;
      var world = [obj.pos[0] + worldShift, obj.pos[1] + bob(obj) + (obj.landmark.offsetY || 0), obj.pos[2]];
      return project(world);
    },
    camera: function () { return { eye: eye.slice(), target: target.slice(), scroll: scrollProgress, drag: dragOffset }; },
    morph: function (name) { morphTo(name); },
    morphInfo: function () {
      var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (var i = 0; i < MORPH.curPos.length; i += 3) {
        for (var k = 0; k < 3; k += 1) {
          if (MORPH.curPos[i + k] < min[k]) min[k] = MORPH.curPos[i + k];
          if (MORPH.curPos[i + k] > max[k]) max[k] = MORPH.curPos[i + k];
        }
      }
      return { active: MORPH.active, name: MORPH.name, min: min, max: max };
    },
  };
})();
