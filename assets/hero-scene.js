// 3D hero scene — knowledge-graph constellation around the avatar.
// Vanilla Three.js (vendored, no CDN). Interaction: drag to rotate, hover for
// labels, click to jump to a section or open a project page.
import * as THREE from './vendor/three.module.min.js';

const hero = document.querySelector('.hero-3d');
const container = document.getElementById('hero-canvas');
if (hero && container) init();

function init() {
  const tip = document.getElementById('hero-tip');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;

  const PALETTE = { indigo: 0x8b93ff, teal: 0x5eead4, pink: 0xf0abfc, amber: 0xfbbf24 };

  // id, label, color, action, actionLabel
  const NODE_DEFS = [
    ['交互体验', PALETTE.indigo, '#focus', '跳转'],
    ['企业数据治理', PALETTE.teal, '#focus', '跳转'],
    ['知识图谱', PALETTE.pink, '#focus', '跳转'],
    ['Agent 工程', PALETTE.indigo, '#focus', '跳转'],
    ['Claude Code 内功课', PALETTE.teal, 'course/', '打开课程'],
    ['Agent 实验室', PALETTE.pink, 'agent-lab/', '打开实验室'],
    ['华为 · 上海', PALETTE.indigo, '#experience', '跳转'],
    ['西安交通大学', PALETTE.teal, '#experience', '跳转'],
    ['SETE · 引用 50+', PALETTE.pink, 'https://github.com/wonanut/SETE', '打开 GitHub'],
    ['dsh-plugins', PALETTE.indigo, 'https://github.com/wonanut/dsh-plugins', '打开 GitHub'],
    ['travel-vue', PALETTE.teal, 'https://github.com/wonanut/travel-vue', '打开 GitHub'],
    ['联系我', PALETTE.pink, '#contact', '跳转'],
  ];

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (error) {
    document.body.classList.add('no-3d');
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
  camera.position.set(0, 0, 11.2);
  camera.lookAt(0, 0, 0);

  const group = new THREE.Group();
  scene.add(group);

  let width = 1, height = 1;

  const clock = new THREE.Clock();
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2(-2, -2);

  let hovered = null;
  let dragging = false;
  let dragMoved = false;
  let lastX = 0, lastY = 0;
  let lastInteraction = 0;
  let yaw = 0, pitch = -0.14, targetYaw = 0, targetPitch = -0.14;
  let pointerX = 0, pointerY = 0;
  let active = true;

  /* ---------- textures ---------- */
  function makeGlowTexture() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.28, 'rgba(255,255,255,.55)');
    g.addColorStop(0.62, 'rgba(255,255,255,.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function makeRingTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 16, 0.4, 2.4);
    ctx.stroke();
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function avatarTexture(url) {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const img = new Image();
    img.onload = function () {
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
      ctx.clip();
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      ctx.restore();
      tex.needsUpdate = true;
    };
    img.src = url;
    return tex;
  }

  const glowTex = makeGlowTexture();
  const ringTex = makeRingTexture();

  /* ---------- lights (only for subtle depth on any future materials) ---------- */
  scene.add(new THREE.AmbientLight(0xffffff, 1));

  /* ---------- starfield ---------- */
  function makeStars(count, radius, size, color, opacity) {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i += 1) {
      const r = radius * (0.55 + Math.random() * 0.45);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.65;
      positions[i * 3 + 2] = r * Math.cos(phi);
      c.setHex([0x8b93ff, 0x5eead4, 0xf0abfc, 0xffffff][Math.floor(Math.random() * 4)]);
      c.multiplyScalar(0.55 + Math.random() * 0.45);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size, vertexColors: true, transparent: true, opacity,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    return new THREE.Points(geo, mat);
  }

  const stars = makeStars(finePointer ? 820 : 440, 22, 0.045, 0x9aa8ff, 0.75);
  scene.add(stars);
  const dust = makeStars(240, 5.4, 0.03, 0x8b93ff, 0.5);
  group.add(dust);

  /* ---------- center avatar ---------- */
  const avatar = new THREE.Sprite(new THREE.SpriteMaterial({
    map: avatarTexture('assets/avatar.jpg'), transparent: true, depthWrite: false,
  }));
  avatar.scale.setScalar(1.32);
  group.add(avatar);

  const avatarRing = new THREE.Sprite(new THREE.SpriteMaterial({
    map: ringTex, color: PALETTE.indigo, transparent: true, opacity: 0.75,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  avatarRing.scale.setScalar(2.1);
  group.add(avatarRing);

  const centerGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0x6a7bff, transparent: true, opacity: 0.22,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  centerGlow.scale.setScalar(3.0);
  group.add(centerGlow);

  const centerLabel = new THREE.Sprite(new THREE.SpriteMaterial({
    map: (function () {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 64;
      const ctx = c.getContext('2d');
      ctx.font = '600 22px system-ui, -apple-system, "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(233,237,247,.9)';
      ctx.fillText('DORAN', 128, 32);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })(),
    transparent: true, depthWrite: false, opacity: 0.8,
  }));
  centerLabel.scale.set(1.05, 0.26, 1);
  centerLabel.position.set(0, -0.92, 0);
  group.add(centerLabel);

  /* ---------- nodes ---------- */
  const nodeViews = [];
  const hitMeshes = [];

  function fibonacci(i, count) {
    const y = 1 - (i / Math.max(count - 1, 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = Math.PI * (3 - Math.sqrt(5)) * i;
    return { x: Math.cos(theta) * r, y, z: Math.sin(theta) * r };
  }

  NODE_DEFS.forEach(function (def, i) {
    const label = def[0], color = def[1], target = def[2], actionLabel = def[3];
    const dir = fibonacci(i, NODE_DEFS.length);
    const radius = 2.55 + (i % 3) * 0.36;
    const pos = new THREE.Vector3(dir.x * radius, dir.y * radius * 0.72, dir.z * radius);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 12, 12),
      new THREE.MeshBasicMaterial({ color, toneMapped: false })
    );
    core.position.copy(pos);
    group.add(core);

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color, transparent: true, opacity: 0.9,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    glow.position.copy(pos);
    glow.scale.setScalar(0.82);
    group.add(glow);

    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 8, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    hit.position.copy(pos);
    hit.userData.nodeIndex = i;
    group.add(hit);
    hitMeshes.push(hit);

    nodeViews.push({ index: i, label, color, target, actionLabel, core, glow, hit, baseGlow: 0.82 });
  });

  /* ---------- edges ---------- */
  function addEdges() {
    const positions = [];
    const colors = [];
    const c1 = new THREE.Color(), c2 = new THREE.Color();

    function edge(a, b, colorA, colorB, scaleAlpha) {
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      c1.setHex(colorA).multiplyScalar(scaleAlpha);
      c2.setHex(colorB).multiplyScalar(scaleAlpha);
      colors.push(c1.r, c1.g, c1.b, c2.r, c2.g, c2.b);
    }

    // center node (origin) to every node
    nodeViews.forEach(function (n) {
      edge(new THREE.Vector3(0, 0, 0), n.core.position, 0x6a7bff, n.color, 0.55);
    });
    // connect adjacent nodes to form a loose net
    for (let i = 0; i < nodeViews.length; i += 1) {
      const a = nodeViews[i];
      const b = nodeViews[(i + 1) % nodeViews.length];
      edge(a.core.position, b.core.position, a.color, b.color, 0.22);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    group.add(new THREE.LineSegments(geo, mat));
  }
  addEdges();

  /* ---------- layout / resize ---------- */
  function resize() {
    width = hero.clientWidth || window.innerWidth;
    height = hero.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    const small = width < 920;
    if (small) {
      group.position.set(0.1, 0.45, 0);
      camera.position.z = 12.2;
      group.scale.setScalar(0.9);
    } else {
      camera.position.z = 11.2;
      const halfWidth = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z * camera.aspect;
      const x = Math.min(2.6, Math.max(1.2, halfWidth * 0.95 - 3.8));
      group.position.set(x, 0.02, 0);
      group.scale.setScalar(1);
    }
  }

  resize();
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(hero);
  else window.addEventListener('resize', resize);

  /* ---------- interaction ---------- */
  function setTip(node, clientX, clientY) {
    if (!tip) return;
    if (!node) { tip.hidden = true; return; }
    const rect = hero.getBoundingClientRect();
    tip.innerHTML = '';
    const dot = document.createElement('span');
    dot.className = 't-dot';
    dot.style.background = '#' + node.color.toString(16).padStart(6, '0');
    const label = document.createElement('b');
    label.textContent = node.label;
    const act = document.createElement('span');
    act.className = 't-act';
    act.textContent = node.actionLabel;
    tip.appendChild(dot);
    tip.appendChild(label);
    tip.appendChild(act);
    const x = Math.min(Math.max(clientX - rect.left, 70), width - 70);
    const y = Math.max(clientY - rect.top, 44);
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
    tip.hidden = false;
  }

  function nodeFromHit(hit) {
    if (!hit) return null;
    return nodeViews[hit.userData.nodeIndex] || null;
  }

  function setHovered(node, clientX, clientY) {
    if (hovered === node) { if (node) setTip(node, clientX, clientY); return; }
    hovered = node;
    container.classList.toggle('is-hover', Boolean(node));
    setTip(node, clientX, clientY);
    window.dispatchEvent(new CustomEvent('hero-node', { detail: node ? node.label : null }));
  }

  function pick(clientX, clientY) {
    const rect = container.getBoundingClientRect();
    pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObjects(hitMeshes, false);
    return hits.length ? nodeFromHit(hits[0].object) : null;
  }

  function insideHero(clientX, clientY) {
    const rect = container.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  container.addEventListener('pointerdown', function (event) {
    if (event.button !== undefined && event.button !== 0) return;
    dragging = true;
    dragMoved = false;
    lastX = event.clientX;
    lastY = event.clientY;
    lastInteraction = performance.now();
    container.classList.add('grabbing');
    if (container.setPointerCapture) { try { container.setPointerCapture(event.pointerId); } catch (e) {} }
  });

  window.addEventListener('pointermove', function (event) {
    pointerX = (event.clientX / Math.max(window.innerWidth, 1)) * 2 - 1;
    pointerY = (event.clientY / Math.max(window.innerHeight, 1)) * 2 - 1;

    if (dragging) {
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 2) dragMoved = true;
      lastX = event.clientX;
      lastY = event.clientY;
      targetYaw += dx * 0.006;
      targetPitch = Math.max(-0.85, Math.min(0.85, targetPitch + dy * 0.0042));
      lastInteraction = performance.now();
      setTip(null);
      hovered = null;
      container.classList.remove('is-hover');
      return;
    }

    if (insideHero(event.clientX, event.clientY)) {
      setHovered(pick(event.clientX, event.clientY), event.clientX, event.clientY);
    } else if (hovered) {
      setHovered(null, 0, 0);
    }
  }, { passive: true });

  function endDrag(event) {
    if (!dragging) return;
    dragging = false;
    container.classList.remove('grabbing');
    if (!dragMoved && event && insideHero(event.clientX, event.clientY)) {
      const node = pick(event.clientX, event.clientY);
      if (node) activate(node);
    }
    lastInteraction = performance.now();
  }

  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', function () { dragging = false; container.classList.remove('grabbing'); });

  function activate(node) {
    if (!node) return;
    if (node.target.charAt(0) === '#') {
      const el = document.querySelector(node.target);
      if (el) el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      setTip(null);
      hovered = null;
      container.classList.remove('is-hover');
    } else if (/^https?:/.test(node.target)) {
      window.open(node.target, '_blank', 'noopener');
    } else {
      window.location.href = node.target;
    }
  }

  // keyboard escape hatch: nodes are mirrored by the visible content links
  container.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && hovered) activate(hovered);
  });

  /* ---------- animation ---------- */
  function tick() {
    requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!active || document.hidden) return;

    if (!reduceMotion && !dragging && performance.now() - lastInteraction > 3200) {
      targetYaw += dt * 0.12;
    }

    yaw += (targetYaw - yaw) * 0.085;
    pitch += (targetPitch - pitch) * 0.085;
    group.rotation.y = yaw;
    group.rotation.x = pitch;

    // subtle parallax
    const k = reduceMotion ? 0 : 0.32;
    camera.position.x += (pointerX * k - camera.position.x) * 0.04;
    camera.position.y += (-pointerY * k * 0.7 - camera.position.y) * 0.04;
    camera.lookAt(0, 0, 0);

    const t = clock.elapsedTime;
    if (!reduceMotion) {
      stars.rotation.y += dt * 0.012;
      dust.rotation.y -= dt * 0.02;
      centerGlow.material.opacity = 0.18 + Math.sin(t * 1.2) * 0.04;
      avatarRing.material.rotation = reduceMotion ? 0 : t * 0.15;
    }

    for (let i = 0; i < nodeViews.length; i += 1) {
      const view = nodeViews[i];
      const isHovered = hovered === view;
      const pulse = reduceMotion ? 0 : Math.sin(t * 1.6 + i * 1.3) * 0.07;
      const target = (isHovered ? 1.55 : 1 + pulse) * view.baseGlow;
      view.glow.scale.setScalar(view.glow.scale.x + (target - view.glow.scale.x) * 0.18);
      const coreTarget = isHovered ? 1.6 : 1;
      view.core.scale.setScalar(view.core.scale.x + (coreTarget - view.core.scale.x) * 0.2);
    }

    renderer.render(scene, camera);
  }

  /* ---------- visibility / lifecycle ---------- */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      active = entries[0].isIntersecting;
      if (active) clock.getDelta();
    }, { threshold: 0.01 }).observe(hero);
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) clock.getDelta();
  });

  document.body.classList.add('has-3d');
  clock.start();
  tick();

  /* ---------- debug hooks (used by the site's interaction checks) ---------- */
  window.__hero3d = {
    ready: true,
    nodes: nodeViews.map(function (n) { return { label: n.label, target: n.target }; }),
    rotation: function () { return { yaw: yaw, pitch: pitch }; },
    screenPos: function (index) {
      const view = nodeViews[index];
      if (!view) return null;
      const v = new THREE.Vector3();
      view.core.getWorldPosition(v);
      v.project(camera);
      const rect = container.getBoundingClientRect();
      return {
        x: rect.left + ((v.x + 1) / 2) * rect.width,
        y: rect.top + ((-v.y + 1) / 2) * rect.height,
      };
    },
  };
}
