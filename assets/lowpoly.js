/* =============================================================
   Low-poly floating-island scene — hand-written WebGL, zero libraries.
   Models are generated in code (fixed seeds), so there is nothing extra
   to download. Interactions: drag to orbit, hover landmarks for labels,
   click to jump, scroll to move the camera through the world.
   ============================================================= */
(function () {
  "use strict";

  var canvas = document.getElementById("scene");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "scene";
    canvas.setAttribute("aria-hidden", "true");
    document.body.insertBefore(canvas, document.body.firstChild);
  }

  var gl = null;
  try {
    gl = canvas.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: false })
      || canvas.getContext("experimental-webgl", { antialias: true, alpha: true });
  } catch (error) {
    gl = null;
  }
  if (!gl) {
    document.body.classList.add("no-scene");
    return;
  }

  /* ---------------- tiny math ---------------- */
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

  /* ---------------- colour helpers ---------------- */
  function hex(h) {
    var n = parseInt(h.replace("#", ""), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  function shade(c, k) {
    return [
      Math.max(0, Math.min(1, c[0] * k)),
      Math.max(0, Math.min(1, c[1] * k)),
      Math.max(0, Math.min(1, c[2] * k)),
    ];
  }
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  var C = {
    rockDeep: hex("#151a26"),
    rock: hex("#252d40"),
    rockLight: hex("#44536f"),
    grass: hex("#37706b"),
    grassLight: hex("#52a096"),
    snow: hex("#6f95a0"),
    crystalIndigo: hex("#a9aeff"),
    crystalTeal: hex("#7df5e4"),
    crystalPink: hex("#ffc4fb"),
    metal: hex("#94a3cc"),
    glow: hex("#dfe6ff"),
  };

  /* ---------------- deterministic RNG ---------------- */
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- flat-shaded mesh builder ---------------- */
  function Builder() { this.data = []; }
  Builder.prototype.tri = function (a, b, c, color) {
    var n = normalize(cross(sub(b, a), sub(c, a)));
    this.push(a, n, color);
    this.push(b, n, color);
    this.push(c, n, color);
  };
  Builder.prototype.push = function (p, n, c) {
    this.data.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2]);
  };
  Builder.prototype.quad = function (a, b, c, d, color, color2) {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color2 || color);
  };

  /* ---------------- model builders ---------------- */
  function buildIsland(seed, radius, peak, depth) {
    var r = rng(seed);
    var segments = 9;
    var rings = 4;
    var b = new Builder();
    var ringPts = [];
    var center = [0, peak * (0.9 + r() * 0.25), 0];

    for (var ring = 1; ring <= rings; ring += 1) {
      var rr = radius * (ring / rings);
      var arr = [];
      for (var s = 0; s < segments; s += 1) {
        var a = (s / segments) * Math.PI * 2 + ring * 0.09;
        var jitter = rr * (0.82 + r() * 0.34);
        var y = peak * Math.pow(1 - ring / rings, 1.25) * (0.35 + r() * 0.9);
        arr.push([Math.cos(a) * jitter, y, Math.sin(a) * jitter]);
      }
      ringPts.push(arr);
    }

    function surfaceColor(y, t) {
      if (y > peak * 0.42) return mix(C.grass, C.grassLight, 0.25 + t * 0.7);
      if (y > peak * 0.18) return mix(C.rockLight, C.grass, 0.35 + t * 0.4);
      return mix(C.rock, C.rockLight, t);
    }

    // top cap
    for (var i = 0; i < segments; i += 1) {
      var a1 = center;
      var b1 = ringPts[0][i];
      var c1 = ringPts[0][(i + 1) % segments];
      var yAvg = (a1[1] + b1[1] + c1[1]) / 3;
      b.tri(a1, b1, c1, surfaceColor(yAvg, r()));
    }
    // rings
    for (var ring2 = 1; ring2 < rings; ring2 += 1) {
      var outer = ringPts[ring2];
      var inner = ringPts[ring2 - 1];
      for (var s2 = 0; s2 < segments; s2 += 1) {
        var nxt = (s2 + 1) % segments;
        var yA = (inner[s2][1] + inner[nxt][1] + outer[s2][1] + outer[nxt][1]) / 4;
        var col = surfaceColor(yA, r());
        b.quad(inner[s2], outer[s2], outer[nxt], inner[nxt], col, shade(col, 0.92));
      }
    }
    // sides down to the tip
    var outerRing = ringPts[rings - 1];
    var tip = [0, -depth, 0];
    for (var s3 = 0; s3 < segments; s3 += 1) {
      var p1 = outerRing[s3];
      var p2 = outerRing[(s3 + 1) % segments];
      var side = mix(C.rock, C.rockDeep, r() * 0.7);
      b.tri(p1, p2, tip, side);
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
      var k = radius * (0.78 + r() * 0.45);
      return [v[0] * k, v[1] * k * (0.75 + r() * 0.4), v[2] * k];
    });
    ICO.f.forEach(function (face) {
      var base = mix(C.rock, C.rockLight, 0.25 + r() * 0.6);
      b.tri(verts[face[0]], verts[face[1]], verts[face[2]], base);
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
      top.push([Math.cos(a) * radius * 0.78, height * 0.72, Math.sin(a) * radius * 0.78]);
    }
    var apex = [0, height, 0];
    for (var j = 0; j < sides; j += 1) {
      var n = (j + 1) % sides;
      b.quad(bottom[j], bottom[n], top[n], top[j], shade(color, 0.72 + r() * 0.2), shade(color, 0.9 + r() * 0.2));
      b.tri(top[j], top[n], apex, shade(color, 1.05 + r() * 0.12));
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
      b.tri(v[face[0]], v[face[1]], v[face[2]], shade(color, 0.75 + r() * 0.45));
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
      b.quad(bottom[i], bottom[n], top[n], top[i], shade(color, 0.68 + r() * 0.2), shade(color, 0.82 + r() * 0.2));
    }
    b.quad(top[0], top[1], top[2], top[3], shade(color, 1.05), shade(color, 0.95));
    return b;
  }

  /* ---------------- WebGL setup ---------------- */
  var VS = [
    "attribute vec3 aPos;",
    "attribute vec3 aNor;",
    "attribute vec3 aCol;",
    "uniform mat4 uProj;",
    "uniform mat4 uView;",
    "uniform mat4 uModel;",
    "varying vec3 vNor;",
    "varying vec3 vWorld;",
    "varying vec3 vCol;",
    "void main() {",
    "  vec4 world = uModel * vec4(aPos, 1.0);",
    "  vWorld = world.xyz;",
    "  vNor = mat3(uModel) * aNor;",
    "  vCol = aCol;",
    "  gl_Position = uProj * uView * world;",
    "}",
  ].join("\n");

  var FS = [
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
    "void main() {",
    "  vec3 n = normalize(vNor);",
    "  float diff = max(dot(n, normalize(uLight)), 0.0);",
    "  float sky = max(dot(n, vec3(0.0, 1.0, 0.0)), 0.0);",
    "  float rim = pow(1.0 - max(dot(n, normalize(uEye - vWorld)), 0.0), 2.0);",
    "  vec3 col = vCol * (0.42 + 0.68 * diff + 0.18 * sky);",
    "  col += vCol * rim * 0.42;",
    "  col += vCol * uHighlight * 0.85;",
    "  float fog = smoothstep(uFogNear, uFogFar, length(uEye - vWorld));",
    "  col = mix(col, uFogColor, fog * 0.92);",
    "  gl_FragColor = vec4(col, 1.0);",
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

  var program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("program link failed");
  } catch (error) {
    document.body.classList.add("no-scene");
    return;
  }

  gl.useProgram(program);
  var A = {
    pos: gl.getAttribLocation(program, "aPos"),
    nor: gl.getAttribLocation(program, "aNor"),
    col: gl.getAttribLocation(program, "aCol"),
  };
  var U = {
    proj: gl.getUniformLocation(program, "uProj"),
    view: gl.getUniformLocation(program, "uView"),
    model: gl.getUniformLocation(program, "uModel"),
    eye: gl.getUniformLocation(program, "uEye"),
    light: gl.getUniformLocation(program, "uLight"),
    fogColor: gl.getUniformLocation(program, "uFogColor"),
    fogNear: gl.getUniformLocation(program, "uFogNear"),
    fogFar: gl.getUniformLocation(program, "uFogFar"),
    highlight: gl.getUniformLocation(program, "uHighlight"),
  };

  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.clearColor(0, 0, 0, 0);

  function makeMesh(builder) {
    var data = new Float32Array(builder.data);
    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return { buffer: buffer, count: data.length / 9 };
  }

  /* ---------------- scene assembly ---------------- */
  var objects = [];
  var landmarks = [];

  function addObject(mesh, opts) {
    var obj = {
      mesh: mesh,
      pos: opts.pos || [0, 0, 0],
      scale: opts.scale || 1,
      rotY: opts.rotY || 0,
      spin: opts.spin || 0,
      bobAmp: opts.bobAmp || 0,
      bobSpeed: opts.bobSpeed || 0,
      bobPhase: opts.bobPhase || 0,
      orbit: opts.orbit || null,
      highlight: 0,
      landmark: opts.landmark || null,
      baseY: (opts.pos || [0, 0, 0])[1],
    };
    objects.push(obj);
    if (opts.landmark) landmarks.push(obj);
    return obj;
  }

  // main island
  addObject(makeMesh(buildIsland(11, 3.15, 1.0, 1.9)), { pos: [0, -0.55, 0], bobAmp: 0.06, bobSpeed: 0.55 });
  // smaller islands
  addObject(makeMesh(buildIsland(23, 1.45, 0.55, 1.1)), { pos: [-3.45, 0.15, -1.9], bobAmp: 0.09, bobSpeed: 0.7, bobPhase: 1.2 });
  addObject(makeMesh(buildIsland(37, 1.7, 0.7, 1.3)), { pos: [3.25, 0.1, -1.35], bobAmp: 0.08, bobSpeed: 0.62, bobPhase: 2.4 });
  addObject(makeMesh(buildIsland(41, 0.95, 0.4, 0.8)), { pos: [1.4, -0.7, 2.85], bobAmp: 0.1, bobSpeed: 0.8, bobPhase: 3.1 });

  // rocks on the main island
  [[-1.35, 0.12, 1.1, 0.5], [1.6, 0.02, 0.7, 0.34], [-0.4, 0.05, -1.5, 0.3], [1.1, 0.18, -1.2, 0.26]].forEach(function (r, i) {
    addObject(makeMesh(buildRock(50 + i, r[3])), { pos: [r[0], r[1], r[2]], rotY: i * 1.7, spin: 0.02 });
  });

  // crystal cluster (landmark: focus)
  var crystalColors = [C.crystalIndigo, C.crystalTeal, C.crystalPink];
  var cluster = [
    [0.0, 0.62, 0.0, 0.3, 2.1, C.crystalIndigo],
    [0.52, 0.52, 0.28, 0.19, 1.35, C.crystalTeal],
    [-0.42, 0.5, 0.18, 0.17, 1.2, C.crystalPink],
    [0.12, 0.5, -0.5, 0.15, 1.05, C.crystalTeal],
  ];
  var clusterObject = addObject(makeMesh((function () {
    var merged = new Builder();
    cluster.forEach(function (c, i) {
      var g = buildCrystal(70 + i, c[3], c[4], c[5]);
      var pos = [0, 0, 0];
      var gd = g.data;
      for (var k = 0; k < gd.length; k += 9) {
        merged.push([gd[k] + c[0], gd[k + 1] + c[1], gd[k + 2] + c[2]], [gd[k + 3], gd[k + 4], gd[k + 5]], [gd[k + 6], gd[k + 7], gd[k + 8]]);
      }
    });
    return merged;
  })()), { pos: [0, 0, 0], bobAmp: 0.02, bobSpeed: 0.9, landmark: { label: "技术方向", target: "#focus", offsetY: 2.6 } });

  // course cube (landmark: course)
  var courseCube = addObject(makeMesh(buildBox(81, 0.48, C.crystalIndigo, C.metal)), {
    pos: [-2.75, 1.9, -1.25], rotY: 0.6, spin: 0.25, bobAmp: 0.12, bobSpeed: 0.8, bobPhase: 0.6,
    landmark: { label: "Claude Code 内功课", target: "course/", offsetY: 0.95 },
  });

  // lab octahedron (landmark: agent-lab)
  var labGem = addObject(makeMesh(buildOcta(91, 0.42, C.crystalPink)), {
    pos: [2.95, 2.15, 0.2], rotY: 0.3, spin: 0.4, bobAmp: 0.14, bobSpeed: 0.9, bobPhase: 2.0,
    landmark: { label: "Agent 实验室", target: "agent-lab/", offsetY: 0.95 },
  });

  // experience monolith on right island (landmark: experience)
  var monolith = addObject(makeMesh(buildMonolith(101, 0.34, 1.75, C.metal)), {
    pos: [3.3, 0.55, -1.35], rotY: 0.5, bobAmp: 0.04, bobSpeed: 0.6, bobPhase: 1.4,
    landmark: { label: "经历 · 华为 / XJTU", target: "#experience", offsetY: 2.1 },
  });

  // contact beacon (landmark: contact)
  var beacon = addObject(makeMesh(buildOcta(111, 0.3, C.crystalTeal)), {
    pos: [0.4, 3.0, -2.9], rotY: 0.9, spin: 0.5, bobAmp: 0.16, bobSpeed: 0.75, bobPhase: 4.2,
    landmark: { label: "联系我", target: "#contact", offsetY: 0.8 },
  });

  // projects shards ring (landmark: projects)
  var shards = [];
  for (var sh = 0; sh < 9; sh += 1) {
    var rad = 4.3 + (sh % 3) * 0.55;
    shards.push(addObject(makeMesh(buildOcta(130 + sh, 0.12 + (sh % 3) * 0.05, sh % 2 ? C.crystalIndigo : C.crystalTeal)), {
      pos: [0, 0, 0],
      orbit: { radius: rad, phase: (sh / 9) * Math.PI * 2, speed: 0.07 + (sh % 3) * 0.012, y: 0.4 + (sh % 4) * 0.45 },
      rotY: sh, spin: 0.6,
    }));
  }
  var projectsLandmark = addObject(makeMesh(buildCrystal(150, 0.2, 1.15, C.crystalIndigo)), {
    pos: [0, 2.15, 0.0], rotY: 0, spin: 0.2, bobAmp: 0.1, bobSpeed: 0.7, bobPhase: 5.0,
    landmark: { label: "项目与作品", target: "#projects", offsetY: 1.15 },
  });

  /* ---------------- resize ---------------- */
  var dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  var W = 1, H = 1;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
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
  var interactiveSelector = "a,button,input,textarea,select,label,[role='button'],.stat,.card,.project";

  function setTip(node) {
    if (!tip) return;
    if (!node) { tip.hidden = true; return; }
    tip.textContent = "";
    var dot = document.createElement("span");
    dot.className = "tip-dot";
    dot.style.background = node.landmark && node.landmark.target.indexOf("#") === 0 ? "#5eead4" : "#8b93ff";
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

  function pick(clientX, clientY) {
    var best = null;
    var bestDist = 46;
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

  /* ---------------- scroll & camera ---------------- */
  var scrollTarget = 0;
  var scrollProgress = 0;

  function updateScroll() {
    var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    scrollTarget = Math.max(0, Math.min(1, window.scrollY / max));
  }
  window.addEventListener("scroll", updateScroll, { passive: true });
  updateScroll();

  var proj = perspective((45 * Math.PI) / 180, W / H, 0.1, 60);
  var view;
  var eye = [0, 3.3, 13.6];
  var target = [1, 0.55, 0];
  var worldShift = 0;

  function cameraState(progress, t) {
    var small = W < 900;
    var centerX = small ? 0 : 0.55;
    var angle = 0.35 + progress * 2.0 + dragOffset;
    var radius = (small ? 16.2 : 15.5) + Math.sin(progress * Math.PI) * 1.4;
    var ex = centerX + Math.sin(angle) * radius + pointer.x * 0.5;
    var ey = (small ? 4.0 : 3.8) + Math.sin(progress * Math.PI * 1.2) * 1.1 - pointer.y * 0.3;
    var ez = Math.cos(angle) * radius;
    var ty = (small ? 0.5 : 0.75) + progress * 0.4;
    return { eye: [ex, Math.max(1.4, ey), ez], target: [centerX, ty, 0] };
  }

  function updateWorldShift() {
    worldShift = window.innerWidth < 900 ? 0 : 3.4;
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

  /* ---------------- render loop ---------------- */
  var lightDir = normalize([-0.45, 0.92, 0.5]);
  var fogColor = [0.027, 0.035, 0.055];
  var active = true;
  var lastTime = 0;
  var frame = 0;
  var lastOpacity = 1;

  function draw() {
    var now = performance.now();
    var t = now * 0.001;
    var dt = Math.min((now - lastTime) / 1000 || 0.016, 0.05);
    lastTime = now;

    scrollProgress += (scrollTarget - scrollProgress) * 0.08;
    // keep the world as a backdrop once the hero is left; dim it so text stays readable
    var fadeIn = Math.max(0, Math.min(1, (scrollProgress - 0.03) / 0.18));
    var sceneOpacity = 1 - fadeIn * 0.75;
    if (Math.abs(sceneOpacity - lastOpacity) > 0.01) {
      lastOpacity = sceneOpacity;
      canvas.style.opacity = sceneOpacity.toFixed(3);
    }
    var cam = cameraState(scrollProgress, t);
    eye = cam.eye;
    target = cam.target;
    view = lookAt(eye, target, [0, 1, 0]);

    // per-object hover factor
    for (var h = 0; h < landmarks.length; h += 1) {
      var lm = landmarks[h];
      lm.highlight += ((hovered === lm ? 1 : 0) - lm.highlight) * 0.18;
    }

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniformMatrix4fv(U.proj, false, proj);
    gl.uniformMatrix4fv(U.view, false, view);
    gl.uniform3fv(U.eye, new Float32Array(eye));
    gl.uniform3fv(U.light, new Float32Array(lightDir));
    gl.uniform3fv(U.fogColor, new Float32Array(fogColor));
    gl.uniform1f(U.fogNear, 15);
    gl.uniform1f(U.fogFar, 42);

    for (var i = 0; i < objects.length; i += 1) {
      var obj = objects[i];
      var pos = obj.pos;
      if (obj.orbit) {
        var ang = obj.orbit.phase + t * obj.orbit.speed;
        pos = [Math.cos(ang) * obj.orbit.radius, obj.orbit.y + Math.sin(t * 0.7 + i) * 0.12, Math.sin(ang) * obj.orbit.radius];
      } else {
        pos = [obj.pos[0] + worldShift, obj.pos[1] + bob(obj), obj.pos[2]];
      }
      if (obj.orbit) pos = [pos[0] + worldShift, pos[1], pos[2]];
      var ry = obj.rotY + (obj.spin ? t * obj.spin : 0);
      var scale = obj.scale * (1 + (obj.highlight || 0) * 0.16);
      var model = modelMatrix(pos, ry, scale);

      gl.uniformMatrix4fv(U.model, false, model);
      gl.uniform1f(U.highlight, obj.highlight || 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, obj.mesh.buffer);
      gl.enableVertexAttribArray(A.pos);
      gl.vertexAttribPointer(A.pos, 3, gl.FLOAT, false, 36, 0);
      gl.enableVertexAttribArray(A.nor);
      gl.vertexAttribPointer(A.nor, 3, gl.FLOAT, false, 36, 12);
      gl.enableVertexAttribArray(A.col);
      gl.vertexAttribPointer(A.col, 3, gl.FLOAT, false, 36, 24);
      gl.drawArrays(gl.TRIANGLES, 0, obj.mesh.count);
    }

    frame += 1;
    if (active && !document.hidden) requestAnimationFrame(draw);
    else setTimeout(function () { if (active && !document.hidden) requestAnimationFrame(draw); }, 400);
  }

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) { lastTime = performance.now(); requestAnimationFrame(draw); }
  });

  document.body.classList.add("scene-on");
  updateScroll();
  requestAnimationFrame(draw);

  /* ---------------- debug hooks (used by interaction checks) ---------------- */
  window.__lowpoly = {
    ready: true,
    landmarks: landmarks.map(function (o) { return { label: o.landmark.label, target: o.landmark.target, pos: o.pos.slice() }; }),
    screenPos: function (index) {
      var obj = landmarks[index];
      if (!obj) return null;
      var world = [obj.pos[0] + worldShift, obj.pos[1] + bob(obj) + (obj.landmark.offsetY || 0), obj.pos[2]];
      return project(world);
    },
    camera: function () { return { eye: eye.slice(), target: target.slice(), scroll: scrollProgress, drag: dragOffset }; },
    objects: objects.length,
  };
})();
