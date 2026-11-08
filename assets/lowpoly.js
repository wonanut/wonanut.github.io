/* =============================================================
   Light low-poly floating world + holographic scanning shader.
   Hand-written WebGL, zero libraries. All geometry is generated in
   code with fixed seeds. Shader effects inspired by the holographic
   shader pattern (scan lines + fresnel + glitch) adapted to a light
   daylight scene.
   ============================================================= */
(function () {
  "use strict";

  var canvas = document.getElementById("scene");
  if (!canvas) return;

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
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function normalize(a) { var l = Math.sqrt(dot(a, a)) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

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
        out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
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

  /* ---------------- colours (daylight pastel) ---------------- */
  function hex(h) {
    var n = parseInt(h.replace("#", ""), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  function shade(c, k) { return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)]; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  var C = {
    rockDeep: hex("#8d7a61"),
    rock: hex("#b3a083"),
    rockLight: hex("#d9c8a8"),
    sand: hex("#eddfc0"),
    grass: hex("#83c795"),
    grassLight: hex("#b3e4b2"),
    grassDeep: hex("#5fae7d"),
    water: hex("#79cfe8"),
    waterLight: hex("#c8f1fa"),
    trunk: hex("#8b6a4e"),
    pine: hex("#4d9f6b"),
    pineLight: hex("#86cf96"),
    leaf: hex("#68bd82"),
    leafLight: hex("#a5dfa8"),
    cabinWall: hex("#f6ecd9"),
    cabinRoof: hex("#cd7a5e"),
    cabinDoor: hex("#7d5b44"),
    cloud: hex("#ffffff"),
    cloudShade: hex("#e4eefa"),
    holo: hex("#11b4c9"),
    holoLight: hex("#9ceffb"),
    metal: hex("#a9b8cd"),
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

  /* ---------------- builder ---------------- */
  function Builder() { this.data = []; }
  Builder.prototype.push = function (p, n, c) { this.data.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2]); };
  Builder.prototype.tri = function (a, b, c, color) {
    var n = normalize(cross(sub(b, a), sub(c, a)));
    this.push(a, n, color); this.push(b, n, color); this.push(c, n, color);
  };
  Builder.prototype.quad = function (a, b, c, d, color, color2) {
    this.tri(a, b, c, color); this.tri(a, c, d, color2 || color);
  };

  /* ---------------- models ---------------- */
  function buildTerracedIsland(seed, radius, tiers, depth) {
    var r = rng(seed);
    var seg = 12;
    var b = new Builder();
    var rings = [];
    for (var t = 0; t < tiers; t += 1) {
      var rr = radius * (1 - t * 0.2);
      var arr = [];
      for (var s = 0; s < seg; s += 1) {
        var a = (s / seg) * Math.PI * 2 + t * 0.16;
        var jitter = rr * (0.9 + r() * 0.18);
        arr.push([Math.cos(a) * jitter, 0.62 * t + (r() - 0.5) * 0.12, Math.sin(a) * jitter]);
      }
      rings.push(arr);
    }

    // bottom tip
    var tip = [0, -depth, 0];
    for (var i = 0; i < seg; i += 1) {
      var n = (i + 1) % seg;
      b.tri(rings[0][i], rings[0][n], tip, mix(C.rock, C.rockDeep, 0.2 + r() * 0.6));
    }
    for (var tier = 0; tier < tiers; tier += 1) {
      // top cap of this tier
      var center = [0, rings[tier][0][1] + 0.09, 0];
      for (var k = 0; k < seg; k += 1) {
        var k2 = (k + 1) % seg;
        b.tri(center, rings[tier][k], rings[tier][k2], mix(C.grass, C.grassLight, 0.2 + r() * 0.8));
      }
      // cliff up to next tier
      if (tier + 1 < tiers) {
        for (var c = 0; c < seg; c += 1) {
          var c2 = (c + 1) % seg;
          var lowA = rings[tier][c], lowB = rings[tier][c2];
          var upA = rings[tier + 1][c], upB = rings[tier + 1][c2];
          var col = tier % 2 === 0 ? C.rockLight : C.sand;
          b.quad(lowA, lowB, upB, upA, shade(col, 0.92 + r() * 0.16), shade(col, 0.8 + r() * 0.15));
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
    return {
      v: raw.map(function (p) { return normalize(p); }),
      f: [
        [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
        [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
        [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
      ],
    };
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

  function buildIcosa(seed, radius, color) {
    var r = rng(seed);
    var b = new Builder();
    var verts = ICO.v.map(function (v) {
      var k = radius * (0.92 + r() * 0.16);
      return [v[0] * k, v[1] * k, v[2] * k];
    });
    ICO.f.forEach(function (face) {
      b.tri(verts[face[0]], verts[face[1]], verts[face[2]], shade(color, 0.85 + r() * 0.3));
    });
    return b;
  }

  function buildCrystal(seed, radius, height, color) {
    var r = rng(seed);
    var sides = 6;
    var b = new Builder();
    var bottom = [], top = [];
    for (var i = 0; i < sides; i += 1) {
      var a = (i / sides) * Math.PI * 2 + r() * 0.2;
      bottom.push([Math.cos(a) * radius, 0, Math.sin(a) * radius]);
      top.push([Math.cos(a) * radius * 0.76, height * 0.72, Math.sin(a) * radius * 0.76]);
    }
    var apex = [0, height, 0];
    for (var j = 0; j < sides; j += 1) {
      var n = (j + 1) % sides;
      b.quad(bottom[j], bottom[n], top[n], top[j], shade(color, 0.8 + r() * 0.2), shade(color, 0.95 + r() * 0.2));
      b.tri(top[j], top[n], apex, shade(color, 1.08 + r() * 0.12));
    }
    b.tri(bottom[0], bottom[2], bottom[4], shade(color, 0.55));
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
    var faces = [[0, 1, 2, 3], [5, 4, 7, 6], [1, 5, 6, 2], [4, 0, 3, 7], [3, 2, 6, 7], [4, 5, 1, 0]];
    faces.forEach(function (f, i) {
      var col = i % 2 ? colorA : colorB;
      b.quad(v[f[0]], v[f[1]], v[f[2]], v[f[3]], shade(col, 0.85 + r() * 0.2), shade(col, 0.92 + r() * 0.15));
    });
    return b;
  }

  function buildOcta(seed, size, color) {
    var r = rng(seed);
    var b = new Builder();
    var v = [[size, 0, 0], [-size, 0, 0], [0, size * 1.5, 0], [0, -size * 1.5, 0], [0, 0, size], [0, 0, -size]];
    var f = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [0, 4, 3], [4, 1, 3], [1, 5, 3], [5, 0, 3]];
    f.forEach(function (face) { b.tri(v[face[0]], v[face[1]], v[face[2]], shade(color, 0.8 + r() * 0.35)); });
    return b;
  }

  function buildPine(seed, height) {
    var r = rng(seed);
    var b = new Builder();
    var trunkH = height * 0.24;
    var trunkR = Math.max(0.022, height * 0.028);
    var sides = 4;
    var low = [], high = [];
    for (var i = 0; i < sides; i += 1) {
      var a = (i / sides) * Math.PI * 2 + Math.PI / 4;
      low.push([Math.cos(a) * trunkR, 0, Math.sin(a) * trunkR]);
      high.push([Math.cos(a) * trunkR * 0.8, trunkH, Math.sin(a) * trunkR * 0.8]);
    }
    for (var j = 0; j < sides; j += 1) {
      var n = (j + 1) % sides;
      b.quad(low[j], low[n], high[n], high[j], C.trunk, shade(C.trunk, 0.9));
    }
    var layers = [
      { base: 0.18, top: 0.6, rad: 0.32 },
      { base: 0.44, top: 0.8, rad: 0.24 },
      { base: 0.66, top: 1.0, rad: 0.16 },
    ];
    layers.forEach(function (layer, li) {
      var baseY = height * layer.base;
      var tipY = height * layer.top;
      var rad = height * layer.rad;
      var ring = [];
      for (var k = 0; k < 6; k += 1) {
        var ang = (k / 6) * Math.PI * 2 + li * 0.5;
        ring.push([Math.cos(ang) * rad, baseY, Math.sin(ang) * rad]);
      }
      var tip = [0, tipY, 0];
      var col = mix(C.pine, C.pineLight, 0.2 + r() * 0.6);
      for (var k2 = 0; k2 < 6; k2 += 1) {
        var nn = (k2 + 1) % 6;
        b.tri(ring[k2], ring[nn], tip, shade(col, 0.9 + r() * 0.25));
      }
    });
    return b;
  }

  function buildRoundTree(seed, height) {
    var r = rng(seed);
    var b = new Builder();
    var trunkH = height * 0.42;
    var trunkR = Math.max(0.02, height * 0.026);
    var low = [], high = [];
    for (var i = 0; i < 4; i += 1) {
      var a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      low.push([Math.cos(a) * trunkR, 0, Math.sin(a) * trunkR]);
      high.push([Math.cos(a) * trunkR * 0.85, trunkH, Math.sin(a) * trunkR * 0.85]);
    }
    for (var j = 0; j < 4; j += 1) {
      var n = (j + 1) % 4;
      b.quad(low[j], low[n], high[n], high[j], C.trunk, shade(C.trunk, 0.9));
    }
    var canopy = buildIcosa(seed, height * 0.34, mix(C.leaf, C.leafLight, 0.3 + r() * 0.5));
    var d = canopy.data;
    for (var k = 0; k < d.length; k += 9) {
      b.push([d[k], d[k + 1] + trunkH + height * 0.16, d[k + 2]], [d[k + 3], d[k + 4], d[k + 5]], [d[k + 6], d[k + 7], d[k + 8]]);
    }
    return b;
  }

  function buildCabin(seed, width) {
    var r = rng(seed);
    var b = new Builder();
    var w = width, h = width * 0.72, d = width * 0.82;
    var v = [
      [-w, 0, -d], [w, 0, -d], [w, 0, d], [-w, 0, d],
      [-w, h, -d], [w, h, -d], [w, h, d], [-w, h, d],
    ];
    var faces = [[0, 1, 2, 3], [1, 5, 6, 2], [0, 4, 7, 3], [4, 5, 1, 0], [7, 6, 2, 3]];
    faces.forEach(function (f, i) {
      var col = i === 0 ? C.rockLight : C.cabinWall;
      b.quad(v[f[0]], v[f[1]], v[f[2]], v[f[3]], shade(col, 0.88 + r() * 0.16), shade(col, 0.96 + r() * 0.1));
    });
    // roof
    var roofColor = C.cabinRoof;
    var ridge = [0, h + w * 0.62, 0];
    b.tri(v[4], v[5], ridge, shade(roofColor, 0.95));
    b.tri(v[6], v[7], ridge, shade(roofColor, 0.85));
    b.tri(v[5], v[6], ridge, shade(roofColor, 1.02));
    b.tri(v[7], v[4], ridge, shade(roofColor, 0.9));
    // door
    b.quad([-w * 0.18, 0, d + 0.01], [w * 0.18, 0, d + 0.01], [w * 0.18, h * 0.62, d + 0.01], [-w * 0.18, h * 0.62, d + 0.01], C.cabinDoor);
    return b;
  }

  function buildCloud(seed, radius) {
    var r = rng(seed);
    var b = new Builder();
    var blobs = 4 + Math.floor(r() * 3);
    for (var i = 0; i < blobs; i += 1) {
      var k = radius * (0.5 + r() * 0.55);
      var ico = buildIcosa(seed + i * 7, k, r() > 0.5 ? C.cloud : C.cloudShade);
      var ox = (r() - 0.5) * radius * 1.7;
      var oy = (r() - 0.4) * radius * 0.5;
      var oz = (r() - 0.5) * radius * 1.3;
      var d = ico.data;
      for (var q = 0; q < d.length; q += 9) {
        b.push([d[q] + ox, d[q + 1] + oy, d[q + 2] + oz], [d[q + 3], d[q + 4], d[q + 5]], [d[q + 6], d[q + 7], d[q + 8]]);
      }
    }
    return b;
  }

  function buildWaterfall(seed, height) {
    var r = rng(seed);
    var b = new Builder();
    var steps = 7;
    var width = 0.16;
    for (var i = 0; i < steps; i += 1) {
      var y1 = -height * (i / steps);
      var y2 = -height * ((i + 1) / steps);
      var w1 = width * (1 + i * 0.16);
      var w2 = width * (1 + (i + 1) * 0.16);
      var z = i * 0.04;
      var col = mix(C.water, C.waterLight, 0.2 + r() * 0.6);
      b.quad([-w1, y1, z], [w1, y1, z], [w2, y2, z + 0.03], [-w2, y2, z + 0.03], col, shade(col, 0.95));
    }
    return b;
  }

  function buildSteps(seed, width, count) {
    var r = rng(seed);
    var b = new Builder();
    for (var i = 0; i < count; i += 1) {
      var y = i * 0.28 + (r() - 0.5) * 0.06;
      var z = i * 0.72;
      var w = width * (0.9 + r() * 0.2);
      var box = buildBox(seed + i, w, C.rockLight, C.sand);
      var d = box.data;
      for (var k = 0; k < d.length; k += 9) {
        b.push([d[k], d[k + 1] + y, d[k + 2] + z], [d[k + 3], d[k + 4], d[k + 5]], [d[k + 6], d[k + 7], d[k + 8]]);
      }
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
    "precision highp float;",
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
    "  vec3 bottom = vec3(1.0, 0.965, 0.90);",
    "  vec3 mid = vec3(0.88, 0.95, 1.0);",
    "  vec3 top = vec3(0.66, 0.84, 1.0);",
    "  vec3 col = mix(bottom, mid, smoothstep(0.0, 0.52, uv.y));",
    "  col = mix(col, top, smoothstep(0.5, 1.0, uv.y));",
    "  vec2 sun = vec2(0.76 + uPointer.x * 0.01, 0.75 - uPointer.y * 0.01);",
    "  float sd = length((uv - sun) * vec2(1.6, 1.0));",
    "  col += vec3(1.0, 0.88, 0.66) * smoothstep(0.42, 0.0, sd) * 0.42;",
    "  col += vec3(1.0, 0.95, 0.85) * smoothstep(0.16, 0.0, sd) * 0.5;",
    "  float t = uTime * 0.008;",
    "  float n1 = noise(vec2(uv.x * 2.2 + t, uv.y * 1.6 - t * 0.6));",
    "  float n2 = noise(vec2(uv.x * 4.5 - t * 0.7, uv.y * 3.0 + t * 0.4));",
    "  float clouds = smoothstep(0.55, 0.85, n1 * 0.7 + n2 * 0.3);",
    "  float band = smoothstep(0.35, 0.75, uv.y) * smoothstep(1.0, 0.62, uv.y);",
    "  col = mix(col, vec3(1.0, 1.0, 1.0), clouds * band * 0.5);",
    "  float gridY = smoothstep(0.03, 0.0, abs(fract(uv.y * 90.0) - 0.5));",
    "  col = mix(col, vec3(0.45, 0.78, 0.86), gridY * smoothstep(0.55, 0.95, uv.y) * 0.05);",
    "  col *= 1.0 - 0.02 * step(0.5, fract(uv.y * 220.0));",
    "  vec2 p = uv - 0.5;",
    "  col *= 1.0 - dot(p, p) * 0.18;",
    "  gl_FragColor = vec4(col, 1.0);",
    "}",
  ].join("\n");

  var CLOUD_VS = [
    "attribute vec3 aPos;",
    "varying vec3 vWorld;",
    "uniform mat4 uProj;",
    "uniform mat4 uView;",
    "void main(){ vWorld = aPos; gl_Position = uProj * uView * vec4(aPos, 1.0); }",
  ].join("\n");

  var CLOUD_FS = [
    "precision highp float;",
    "varying vec3 vWorld;",
    "uniform float uTime;",
    "uniform vec3 uEye;",
    "float hash21(vec2 p){ p = fract(p * vec2(123.34, 345.45)); p += dot(p, p + 34.345); return fract(p.x * p.y); }",
    "float noise(vec2 p){",
    "  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(hash21(i), hash21(i + vec2(1.0,0.0)), f.x), mix(hash21(i + vec2(0.0,1.0)), hash21(i + vec2(1.0,1.0)), f.x), f.y);",
    "}",
    "void main(){",
    "  vec2 p = vWorld.xz * 0.09 + vec2(uTime * 0.006, uTime * 0.004);",
    "  float n = noise(p) * 0.6 + noise(p * 2.3) * 0.4;",
    "  vec3 col = mix(vec3(0.72, 0.88, 0.98), vec3(1.0, 1.0, 1.0), smoothstep(0.35, 0.8, n));",
    "  float dist = length(vWorld.xz) * 0.018;",
    "  col = mix(col, vec3(0.92, 0.96, 1.0), smoothstep(0.2, 0.9, dist));",
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
    "precision highp float;",
    "varying vec3 vNor;",
    "varying vec3 vWorld;",
    "varying vec3 vCol;",
    "uniform vec3 uEye;",
    "uniform vec3 uLight;",
    "uniform vec3 uFogColor;",
    "uniform float uFogNear;",
    "uniform float uFogFar;",
    "uniform float uGlow;",
    "void main(){",
    "  vec3 n = normalize(vNor);",
    "  float diff = max(dot(n, normalize(uLight)), 0.0);",
    "  float sky = max(dot(n, vec3(0.0, 1.0, 0.0)), 0.0);",
    "  float rim = pow(1.0 - max(dot(n, normalize(uEye - vWorld)), 0.0), 2.0);",
    "  vec3 col = vCol * (0.58 + 0.55 * diff + 0.16 * sky);",
    "  col += vCol * rim * 0.22;",
    "  col += vCol * uGlow * 0.5;",
    "  float fog = smoothstep(uFogNear, uFogFar, length(uEye - vWorld));",
    "  col = mix(col, uFogColor, fog * 0.9);",
    "  gl_FragColor = vec4(col, 1.0);",
    "}",
  ].join("\n");

  var HOLO_VS = [
    "attribute vec3 aPos;",
    "attribute vec3 aNor;",
    "uniform mat4 uProj;",
    "uniform mat4 uView;",
    "uniform mat4 uModel;",
    "uniform float uTime;",
    "varying vec3 vPos;",
    "varying vec3 vWorld;",
    "varying vec3 vNor;",
    "float rand(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }",
    "void main(){",
    "  vec3 p = aPos;",
    "  float glitch = sin(uTime * 1.7 + aPos.y * 9.0) * sin(uTime * 0.9 + aPos.x * 6.0);",
    "  glitch = smoothstep(0.55, 1.0, glitch);",
    "  p.x += (rand(p.xy + uTime) - 0.5) * 0.12 * glitch;",
    "  p.z += (rand(p.zy + uTime) - 0.5) * 0.12 * glitch;",
    "  vec4 world = uModel * vec4(p, 1.0);",
    "  vPos = p; vWorld = world.xyz; vNor = mat3(uModel) * aNor;",
    "  gl_Position = uProj * uView * world;",
    "}",
  ].join("\n");

  var HOLO_FS = [
    "precision highp float;",
    "varying vec3 vPos;",
    "varying vec3 vWorld;",
    "varying vec3 vNor;",
    "uniform float uTime;",
    "uniform float uScan;",
    "uniform vec3 uColor;",
    "uniform vec3 uEye;",
    "uniform float uMinY;",
    "uniform float uMaxY;",
    "void main(){",
    "  float scan = pow(0.5 + 0.5 * sin(vPos.y * 52.0 - uTime * 5.0), 6.0);",
    "  float fres = pow(1.0 - abs(dot(normalize(vNor), normalize(uEye - vWorld))), 2.2);",
    "  float ny = clamp((vPos.y - uMinY) / max(0.001, uMaxY - uMinY), 0.0, 1.0);",
    "  float sweep = smoothstep(0.09, 0.0, abs(ny - uScan));",
    "  float alpha = 0.05 + scan * 0.16 + fres * 0.42 + sweep * 0.55;",
    "  if (alpha < 0.035) discard;",
    "  vec3 col = uColor * (0.8 + 0.7 * sweep) + vec3(0.85, 1.0, 1.0) * scan * 0.35;",
    "  gl_FragColor = vec4(col, alpha);",
    "}",
  ].join("\n");

  var WIRE_VS = [
    "attribute vec3 aPos;",
    "uniform mat4 uProj;",
    "uniform mat4 uView;",
    "uniform mat4 uModel;",
    "uniform float uTime;",
    "varying vec3 vPos;",
    "void main(){",
    "  vec3 p = aPos;",
    "  float glitch = smoothstep(0.6, 1.0, sin(uTime * 2.1 + aPos.y * 8.0) * sin(uTime * 1.1 + aPos.z * 5.0));",
    "  p.x += (fract(sin(dot(p.xy + uTime, vec2(12.98, 78.23))) * 43758.5) - 0.5) * 0.1 * glitch;",
    "  vec4 world = uModel * vec4(p, 1.0);",
    "  vPos = p;",
    "  gl_Position = uProj * uView * world;",
    "}",
  ].join("\n");

  var WIRE_FS = [
    "precision highp float;",
    "varying vec3 vPos;",
    "uniform float uTime;",
    "uniform float uScan;",
    "uniform vec3 uColor;",
    "uniform float uMinY;",
    "uniform float uMaxY;",
    "void main(){",
    "  float ny = clamp((vPos.y - uMinY) / max(0.001, uMaxY - uMinY), 0.0, 1.0);",
    "  float sweep = smoothstep(0.12, 0.0, abs(ny - uScan));",
    "  float scan = pow(0.5 + 0.5 * sin(vPos.y * 40.0 - uTime * 4.0), 4.0);",
    "  float alpha = 0.16 + scan * 0.22 + sweep * 0.5;",
    "  gl_FragColor = vec4(uColor * (1.0 + sweep), alpha);",
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
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link failed");
    return p;
  }

  var progs;
  try {
    progs = {
      sky: program(SKY_VS, SKY_FS),
      cloud: program(CLOUD_VS, CLOUD_FS),
      mesh: program(MESH_VS, MESH_FS),
      holo: program(HOLO_VS, HOLO_FS),
      wire: program(WIRE_VS, WIRE_FS),
    };
  } catch (error) {
    console.error("[lowpoly]", error && (error.message || error));
    document.body.classList.add("no-scene");
    return;
  }

  gl.clearColor(0.85, 0.93, 1.0, 1);
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

  function cloudPlaneBuffer() {
    var s = 70;
    var data = new Float32Array([-s, -6, -s, s, -6, -s, s, -6, s, -s, -6, -s, s, -6, s, -s, -6, s]);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buf;
  }

  function wireBuffer(builder) {
    var d = builder.data;
    var seen = {};
    var verts = [];
    for (var i = 0; i < d.length; i += 27) {
      var tri = [
        [d[i], d[i + 1], d[i + 2]],
        [d[i + 9], d[i + 10], d[i + 11]],
        [d[i + 18], d[i + 19], d[i + 20]],
      ];
      for (var e = 0; e < 3; e += 1) {
        var a = tri[e], b = tri[(e + 1) % 3];
        var ka = a.map(function (n) { return n.toFixed(3); }).join(",");
        var kb = b.map(function (n) { return n.toFixed(3); }).join(",");
        var key = ka < kb ? ka + "|" + kb : kb + "|" + ka;
        if (seen[key]) continue;
        seen[key] = true;
        verts.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      }
    }
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    return { buffer: buf, count: verts.length / 3 };
  }

  var SKY = skyBuffer();
  var CLOUD_PLANE = cloudPlaneBuffer();

  /* ---------------- scene ---------------- */
  var objects = [];
  var landmarks = [];
  var worldShift = 3.9;

  function addObject(mesh, opts) {
    var obj = {
      mesh: mesh,
      pos: opts.pos || [0, 0, 0],
      rotY: opts.rotY || 0,
      spin: opts.spin || 0,
      bobAmp: opts.bobAmp || 0,
      bobSpeed: opts.bobSpeed || 0,
      bobPhase: opts.bobPhase || 0,
      glow: opts.glow || 0,
      landmark: opts.landmark || null,
      highlight: 0,
    };
    objects.push(obj);
    if (opts.landmark) landmarks.push(obj);
    return obj;
  }

  // main island + small islands
  addObject(meshBuffer(buildTerracedIsland(11, 3.15, 3, 2.0)), { pos: [0, -0.9, 0], bobAmp: 0.04, bobSpeed: 0.5 });
  addObject(meshBuffer(buildTerracedIsland(23, 1.65, 2, 1.2)), { pos: [-3.75, 0.15, -1.7], bobAmp: 0.06, bobSpeed: 0.7, bobPhase: 1.2 });
  addObject(meshBuffer(buildTerracedIsland(37, 1.95, 2, 1.35)), { pos: [3.55, 0.0, -1.15], bobAmp: 0.06, bobSpeed: 0.6, bobPhase: 2.4 });
  addObject(meshBuffer(buildTerracedIsland(41, 1.05, 2, 0.8)), { pos: [1.6, -0.75, 3.15], bobAmp: 0.08, bobSpeed: 0.8, bobPhase: 3.1 });

  // trees
  [[-1.9, 0.78, 1.1, 1.0], [1.7, 0.78, 0.9, 0.85], [-1.1, 1.36, -1.4, 0.8], [1.9, 0.78, -1.5, 0.75], [-2.3, 0.78, 1.9, 0.7]].forEach(function (p, i) {
    addObject(meshBuffer(i % 2 ? buildPine(200 + i, p[3]) : buildRoundTree(240 + i, p[3])), { pos: [p[0], p[1], p[2]], rotY: i * 1.2 });
  });
  [[-3.95, 0.62, -1.7, 0.7], [-3.45, 0.62, -2.1, 0.6], [3.25, 0.62, -1.6, 0.8], [3.95, 0.62, -0.8, 0.6], [1.5, 0.28, 3.2, 0.55]].forEach(function (p, i) {
    addObject(meshBuffer(i % 2 ? buildRoundTree(280 + i, p[3]) : buildPine(300 + i, p[3])), { pos: [p[0], p[1], p[2]], rotY: i * 1.7 });
  });

  // rocks
  [[-1.4, 1.36, 1.6, 0.32], [1.4, 1.36, 1.3, 0.26], [2.2, 0.78, 0.2, 0.2], [-0.6, 1.36, -1.4, 0.24], [3.0, 0.62, -0.6, 0.22]].forEach(function (r, i) {
    addObject(meshBuffer(buildRock(320 + i, r[3])), { pos: [r[0], r[1], r[2]], rotY: i * 1.5 });
  });

  // cabins (landmark: experience)
  addObject(meshBuffer((function () {
    var b = new Builder();
    var cab = buildCabin(401, 0.3);
    var d = cab.data;
    for (var k = 0; k < d.length; k += 9) b.push([d[k] - 0.55, d[k + 1] + 1.36, d[k + 2] + 0.45], [d[k + 3], d[k + 4], d[k + 5]], [d[k + 6], d[k + 7], d[k + 8]]);
    var cab2 = buildCabin(402, 0.22);
    var d2 = cab2.data;
    for (var k2 = 0; k2 < d2.length; k2 += 9) b.push([d2[k2] + 0.15, d2[k2 + 1] + 1.36, d2[k2 + 2] - 0.35], [d2[k2 + 3], d2[k2 + 4], d2[k2 + 5]], [d2[k2 + 6], d2[k2 + 7], d2[k2 + 8]]);
    return b;
  })()), { pos: [0, 0, 0], bobAmp: 0.01, bobSpeed: 0.6, landmark: { label: "经历 · 华为 / XJTU", target: "#experience", offsetY: 2.0 } });

  // waterfall
  addObject(meshBuffer(buildWaterfall(501, 2.4)), { pos: [-1.2, 0.6, 2.1], rotY: 0.2, spin: 0.02 });

  // floating steps (landmark: projects)
  addObject(meshBuffer(buildSteps(601, 0.22, 7)), { pos: [2.4, 1.5, 0.2], rotY: 0.9, bobAmp: 0.03, bobSpeed: 0.6, landmark: { label: "项目与作品", target: "#projects", offsetY: 2.1 } });

  // crystal cluster (landmark: focus)
  var clusterMesh = (function () {
    var b = new Builder();
    var defs = [
      [0.0, 0.0, 0.0, 0.26, 1.9, C.holo],
      [0.5, -0.05, 0.3, 0.16, 1.2, C.holoLight],
      [-0.45, -0.05, 0.2, 0.14, 1.05, C.holo],
      [0.1, -0.1, -0.5, 0.12, 0.9, C.holoLight],
    ];
    defs.forEach(function (c, i) {
      var g = buildCrystal(700 + i, c[3], c[4], c[5]);
      var d = g.data;
      for (var k = 0; k < d.length; k += 9) b.push([d[k] + c[0], d[k + 1] + c[1], d[k + 2] + c[2]], [d[k + 3], d[k + 4], d[k + 5]], [d[k + 6], d[k + 7], d[k + 8]]);
    });
    return b;
  })();
  addObject(meshBuffer(clusterMesh), {
    pos: [0.2, 1.35, -0.2], bobAmp: 0.015, bobSpeed: 0.9, glow: 0.5,
    landmark: { label: "技术方向", target: "#focus", offsetY: 2.4 },
  });

  // lab floating gem (landmark: agent-lab)
  addObject(meshBuffer(buildOcta(720, 0.38, C.crystalPink || C.holo)), {
    pos: [3.4, 2.2, 0.6], spin: 0.3, bobAmp: 0.1, bobSpeed: 0.8, glow: 0.35,
    landmark: { label: "Agent 实验室", target: "agent-lab/", offsetY: 0.9 },
  });

  // hologram landmark (course) — placeholder mesh, hologram itself is drawn separately
  addObject(meshBuffer(buildOcta(735, 0.001, C.holo)), {
    pos: [0.55, 3.55, -0.1],
    landmark: { label: "Claude Code 内功课", target: "course/", offsetY: 1.1 },
  });

  // contact beacon
  addObject(meshBuffer(buildOcta(730, 0.28, C.holoLight)), {
    pos: [-0.4, 3.4, -2.6], spin: 0.4, bobAmp: 0.14, bobSpeed: 0.7, glow: 0.5,
    landmark: { label: "联系我", target: "#contact", offsetY: 0.8 },
  });

  // orbiting shards
  for (var sh = 0; sh < 10; sh += 1) {
    var rad = 4.4 + (sh % 3) * 0.6;
    addObject(meshBuffer(buildOcta(900 + sh, 0.09 + (sh % 3) * 0.03, sh % 2 ? C.holo : C.holoLight)), {
      pos: [0, 0, 0],
      orbit: { radius: rad, phase: (sh / 10) * Math.PI * 2, speed: 0.05 + (sh % 3) * 0.01, y: 0.9 + (sh % 5) * 0.35 },
      spin: 0.5, glow: 0.35,
    });
  }

  /* ---------------- hologram (scan shader) ---------------- */
  var holoGem = buildIcosa(950, 0.95, C.holo);
  var holoMesh = meshBuffer(holoGem);
  var holoWire = wireBuffer(holoGem);
  var HOLO = {
    pos: [0.55, 3.55, -0.1],
    scale: 0.95,
    spin: 0.16,
    light: new Float32Array([0.55, 1.0, 1.0]),
    color: new Float32Array([0.05, 0.62, 0.72]),
    minY: -1.0,
    maxY: 1.0,
  };

  /* ---------------- resize ---------------- */
  var W = 1, H = 1, lastAspect = 0;
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
  var dragging = false, dragMoved = false, lastX = 0, dragOffset = 0, hovered = null;
  var tip = document.getElementById("scene-tip");
  var interactiveSelector = "a,button,input,textarea,select,label,[role='button'],.stat,.card,.project";

  function updateShift() {
    worldShift = window.innerWidth < 900 ? 0 : 4.6;
  }
  updateShift();
  window.addEventListener("resize", updateShift);

  function bob(obj) {
    return obj.bobAmp ? Math.sin(performance.now() * 0.001 * obj.bobSpeed + obj.bobPhase) * obj.bobAmp : 0;
  }

  function project(world) {
    var mvp = multiply(proj, view);
    var x = mvp[0] * world[0] + mvp[4] * world[1] + mvp[8] * world[2] + mvp[12];
    var y = mvp[1] * world[0] + mvp[5] * world[1] + mvp[9] * world[2] + mvp[13];
    var w = mvp[3] * world[0] + mvp[7] * world[1] + mvp[11] * world[2] + mvp[15];
    if (w <= 0.001) return null;
    var nx = x / w, ny = y / w;
    if (nx < -1.4 || nx > 1.4 || ny < -1.4 || ny > 1.4) return null;
    return [((nx + 1) / 2) * W, ((1 - ny) / 2) * H];
  }

  function pick(clientX, clientY) {
    var best = null, bestDist = 48;
    for (var i = 0; i < landmarks.length; i += 1) {
      var obj = landmarks[i];
      var world = [obj.pos[0] + worldShift, obj.pos[1] + bob(obj) + (obj.landmark.offsetY || 0), obj.pos[2]];
      var screen = project(world);
      if (!screen) continue;
      var dx = screen[0] - clientX, dy = screen[1] - clientY;
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
    dot.style.background = node.landmark.target.indexOf("#") === 0 ? "#0f766e" : "#4f46e5";
    var label = document.createElement("b");
    label.textContent = node.landmark.label;
    var act = document.createElement("span");
    act.className = "tip-act";
    act.textContent = node.landmark.target.indexOf("#") === 0 ? "跳转" : (node.landmark.target.indexOf("http") === 0 ? "打开 GitHub" : "打开");
    tip.appendChild(dot); tip.appendChild(label); tip.appendChild(act);
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
      setTip(null); hovered = null; document.body.style.cursor = "";
      return;
    }
    if (scrollProgress > 0.11) {
      if (hovered) { hovered = null; setTip(null); document.body.style.cursor = ""; }
      return;
    }
    var node = pick(event.clientX, event.clientY);
    if (node !== hovered) {
      hovered = node;
      setTip(node);
      document.body.style.cursor = node ? "pointer" : "";
    } else if (node) setTip(node);
  }, { passive: true });

  window.addEventListener("pointerdown", function (event) {
    if (event.target && event.target.closest && event.target.closest(interactiveSelector)) return;
    if (event.pointerType === "touch") return;
    dragging = true; dragMoved = false; lastX = event.clientX;
    document.body.classList.add("scene-dragging");
  });

  window.addEventListener("pointerup", function (event) {
    var wasDragging = dragging;
    dragging = false;
    document.body.classList.remove("scene-dragging");
    if (scrollProgress > 0.11) return;
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
  var scrollTarget = 0, scrollProgress = 0;
  function updateScroll() {
    var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    scrollTarget = Math.max(0, Math.min(1, window.scrollY / max));
  }
  window.addEventListener("scroll", function () {
    updateScroll();
    if (hovered) { hovered = null; setTip(null); document.body.style.cursor = ""; }
  }, { passive: true });
  updateScroll();

  var proj = perspective((43 * Math.PI) / 180, W / H, 0.1, 90);
  var view, eye = [0, 4.8, 19.5], target = [0.4, 0.8, 0];

  function cameraState(progress) {
    var small = W < 900;
    var centerX = small ? 0 : 0.4;
    var angle = 0.32 + progress * 1.7 + dragOffset;
    var radius = (small ? 23.5 : 19.6) + Math.sin(progress * Math.PI) * 1.2;
    var ex = centerX + Math.sin(angle) * radius + pointer.x * 0.5;
    var ey = (small ? 6.2 : 5.0) + Math.sin(progress * Math.PI * 1.1) * 0.8 - pointer.y * 0.3;
    var ez = Math.cos(angle) * radius;
    var ty = (small ? 0.5 : 0.8) + progress * 0.3;
    return { eye: [ex, Math.max(1.8, ey), ez], target: [centerX, ty, 0] };
  }

  /* ---------------- uniforms ---------------- */
  function us(p) {
    return {
      proj: gl.getUniformLocation(p, "uProj"), view: gl.getUniformLocation(p, "uView"),
      model: gl.getUniformLocation(p, "uModel"), eye: gl.getUniformLocation(p, "uEye"),
      light: gl.getUniformLocation(p, "uLight"), fogColor: gl.getUniformLocation(p, "uFogColor"),
      fogNear: gl.getUniformLocation(p, "uFogNear"), fogFar: gl.getUniformLocation(p, "uFogFar"),
      glow: gl.getUniformLocation(p, "uGlow"), time: gl.getUniformLocation(p, "uTime"),
      scroll: gl.getUniformLocation(p, "uScroll"), pointer: gl.getUniformLocation(p, "uPointer"),
      scan: gl.getUniformLocation(p, "uScan"), color: gl.getUniformLocation(p, "uColor"),
      minY: gl.getUniformLocation(p, "uMinY"), maxY: gl.getUniformLocation(p, "uMaxY"),
    };
  }
  var U = {
    sky: us(progs.sky), cloud: us(progs.cloud), mesh: us(progs.mesh), holo: us(progs.holo), wire: us(progs.wire),
  };
  var A = {
    sky: gl.getAttribLocation(progs.sky, "aPos"),
    cloud: gl.getAttribLocation(progs.cloud, "aPos"),
    mesh: {
      pos: gl.getAttribLocation(progs.mesh, "aPos"),
      nor: gl.getAttribLocation(progs.mesh, "aNor"),
      col: gl.getAttribLocation(progs.mesh, "aCol"),
    },
    holo: { pos: gl.getAttribLocation(progs.holo, "aPos"), nor: gl.getAttribLocation(progs.holo, "aNor") },
    wire: gl.getAttribLocation(progs.wire, "aPos"),
  };

  /* ---------------- render ---------------- */
  var lastTime = 0, lastOpacity = 1;
  var fogColor = new Float32Array([0.92, 0.96, 1.0]);
  var lightDir = new Float32Array(normalize([-0.35, 0.9, 0.55]));

  function draw() {
    var now = performance.now();
    var t = now * 0.001;
    var dt = Math.min((now - lastTime) / 1000 || 0.016, 0.05);
    lastTime = now;

    scrollProgress += (scrollTarget - scrollProgress) * 0.08;
    var sceneOpacity = 1 - Math.max(0, Math.min(1, (scrollProgress - 0.02) / 0.16));
    if (Math.abs(sceneOpacity - lastOpacity) > 0.01) {
      lastOpacity = sceneOpacity;
      canvas.style.opacity = sceneOpacity.toFixed(3);
    }

    var aspect = W / Math.max(1, H);
    if (Math.abs(aspect - lastAspect) > 0.001) {
      lastAspect = aspect;
      proj = perspective((43 * Math.PI) / 180, aspect, 0.1, 90);
    }

    var cam = cameraState(scrollProgress);
    eye = cam.eye; target = cam.target;
    view = lookAt(eye, target, [0, 1, 0]);

    if (sceneOpacity < 0.22 && hovered) {
      hovered = null;
      setTip(null);
      document.body.style.cursor = "";
    }
    for (var h = 0; h < landmarks.length; h += 1) {
      var lm = landmarks[h];
      lm.highlight += ((hovered === lm ? 1 : 0) - lm.highlight) * 0.18;
    }

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    /* sky */
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.BLEND);
    gl.useProgram(progs.sky);
    gl.uniform1f(U.sky.time, t);
    gl.uniform1f(U.sky.scroll, scrollProgress);
    gl.uniform2f(U.sky.pointer, pointer.x, pointer.y);
    gl.bindBuffer(gl.ARRAY_BUFFER, SKY);
    gl.enableVertexAttribArray(A.sky);
    gl.vertexAttribPointer(A.sky, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    /* cloud sea */
    gl.useProgram(progs.cloud);
    gl.uniformMatrix4fv(U.cloud.proj, false, proj);
    gl.uniformMatrix4fv(U.cloud.view, false, view);
    gl.uniform1f(U.cloud.time, t);
    gl.uniform3fv(U.cloud.eye, new Float32Array(eye));
    gl.bindBuffer(gl.ARRAY_BUFFER, CLOUD_PLANE);
    gl.enableVertexAttribArray(A.cloud);
    gl.vertexAttribPointer(A.cloud, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    /* meshes */
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND);
    gl.useProgram(progs.mesh);
    gl.uniformMatrix4fv(U.mesh.proj, false, proj);
    gl.uniformMatrix4fv(U.mesh.view, false, view);
    gl.uniform3fv(U.mesh.eye, new Float32Array(eye));
    gl.uniform3fv(U.mesh.light, lightDir);
    gl.uniform3fv(U.mesh.fogColor, fogColor);
    gl.uniform1f(U.mesh.fogNear, 26);
    gl.uniform1f(U.mesh.fogFar, 64);

    for (var i = 0; i < objects.length; i += 1) {
      var obj = objects[i];
      var pos;
      if (obj.orbit) {
        var ang = obj.orbit.phase + t * obj.orbit.speed;
        pos = [Math.cos(ang) * obj.orbit.radius + worldShift, obj.orbit.y + Math.sin(t * 0.7 + i) * 0.1, Math.sin(ang) * obj.orbit.radius];
      } else {
        pos = [obj.pos[0] + worldShift, obj.pos[1] + bob(obj), obj.pos[2]];
      }
      var ry = obj.rotY + (obj.spin ? t * obj.spin : 0);
      gl.uniformMatrix4fv(U.mesh.model, false, modelMatrix(pos, ry, 1 + obj.highlight * 0.14));
      gl.uniform1f(U.mesh.glow, obj.glow || 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, obj.mesh.buffer);
      gl.enableVertexAttribArray(A.mesh.pos);
      gl.vertexAttribPointer(A.mesh.pos, 3, gl.FLOAT, false, 36, 0);
      gl.enableVertexAttribArray(A.mesh.nor);
      gl.vertexAttribPointer(A.mesh.nor, 3, gl.FLOAT, false, 36, 12);
      gl.enableVertexAttribArray(A.mesh.col);
      gl.vertexAttribPointer(A.mesh.col, 3, gl.FLOAT, false, 36, 24);
      gl.drawArrays(gl.TRIANGLES, 0, obj.mesh.count);
    }

    /* hologram */
    var holoY = HOLO.pos[1] + Math.sin(t * 0.9) * 0.08;
    var scan = ((t * 0.16) % 1);
    var holoModel = modelMatrix([HOLO.pos[0] + worldShift, holoY, HOLO.pos[2]], t * HOLO.spin, HOLO.scale);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.useProgram(progs.holo);
    gl.uniformMatrix4fv(U.holo.proj, false, proj);
    gl.uniformMatrix4fv(U.holo.view, false, view);
    gl.uniformMatrix4fv(U.holo.model, false, holoModel);
    gl.uniform1f(U.holo.time, t);
    gl.uniform1f(U.holo.scan, scan);
    gl.uniform3fv(U.holo.color, HOLO.color);
    gl.uniform3fv(U.holo.eye, new Float32Array(eye));
    gl.uniform1f(U.holo.minY, HOLO.minY);
    gl.uniform1f(U.holo.maxY, HOLO.maxY);
    gl.bindBuffer(gl.ARRAY_BUFFER, holoMesh.buffer);
    gl.enableVertexAttribArray(A.holo.pos);
    gl.vertexAttribPointer(A.holo.pos, 3, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(A.holo.nor);
    gl.vertexAttribPointer(A.holo.nor, 3, gl.FLOAT, false, 36, 12);
    gl.drawArrays(gl.TRIANGLES, 0, holoMesh.count);

    gl.useProgram(progs.wire);
    gl.uniformMatrix4fv(U.wire.proj, false, proj);
    gl.uniformMatrix4fv(U.wire.view, false, view);
    gl.uniformMatrix4fv(U.wire.model, false, holoModel);
    gl.uniform1f(U.wire.time, t);
    gl.uniform1f(U.wire.scan, scan);
    gl.uniform3fv(U.wire.color, new Float32Array([0.08, 0.7, 0.8]));
    gl.uniform1f(U.wire.minY, HOLO.minY);
    gl.uniform1f(U.wire.maxY, HOLO.maxY);
    gl.bindBuffer(gl.ARRAY_BUFFER, holoWire.buffer);
    gl.enableVertexAttribArray(A.wire);
    gl.vertexAttribPointer(A.wire, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.LINES, 0, holoWire.count);

    gl.depthMask(true);
    gl.disable(gl.BLEND);
    requestAnimationFrame(draw);
  }

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) lastTime = performance.now();
  });

  document.body.classList.add("scene-on");
  requestAnimationFrame(draw);

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
  };
})();
