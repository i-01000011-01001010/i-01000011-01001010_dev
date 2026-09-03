(function () {
  'use strict';

  var DATA_URL = new URL('../data/projects.json', document.currentScript.src).href;

  var container = document.getElementById('scene');
  var legendEl = document.getElementById('legend');
  var resetBtn = document.getElementById('resetBtn');
  var playBtn = document.getElementById('playBtn');
  var pauseBtn = document.getElementById('pauseBtn');
  var popupEl = document.getElementById('popup');
  var popupCrumb = popupEl.querySelector('.crumb');
  var popupTitle = popupEl.querySelector('.ptitle');
  var popupDesc = popupEl.querySelector('.desc');
  var popupLinks = popupEl.querySelector('.links');
  var popupClose = popupEl.querySelector('.popup-close');

  fetch(DATA_URL)
    .then(function (r) {
      if (!r.ok) throw new Error('projects.json ' + r.status);
      return r.json();
    })
    .then(init)
    .catch(function (err) {
      container.innerHTML =
        '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
        'font-family:JetBrains Mono, monospace;color:#8d8dac;font-size:13px;text-align:center;padding:24px;">' +
        'Could not load projects.json (' + err.message + ').<br>If you opened this file directly from disk, ' +
        'serve it from a local server instead \u2014 browsers block fetch() on file:// URLs.</div>';
    });

  function init(GALAXY_DATA) {
    // ------------------------------------------------------------------
    // Layout: derive positions from data only, no hand-placed coords.
    // ------------------------------------------------------------------
    function hash(str) {
      var h = 0;
      for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
      return h;
    }

    var SYSTEM_RADIUS = 8.5;
    var PLANET_BASE_RADIUS = 1.55;
    var PLANET_RADIUS_STEP = 0.95;

    var systems = GALAXY_DATA.systems.map(function (sys, i) {
      var angle = (i / GALAXY_DATA.systems.length) * Math.PI * 2;
      var yJitter = Math.sin(hash(sys.id) * 0.0001) * 2.2;
      var pos = new THREE.Vector3(
        Math.cos(angle) * SYSTEM_RADIUS,
        yJitter,
        Math.sin(angle) * SYSTEM_RADIUS
      );
      var colorInt = parseInt(sys.color.replace('#', ''), 16);

      var projects = sys.projects.map(function (p, j) {
        var h = hash(sys.id + ':' + p.id);
        return {
          data: p,
          orbitRadius: PLANET_BASE_RADIUS + j * PLANET_RADIUS_STEP,
          orbitAngle: (h % 360) * (Math.PI / 180),
          orbitSpeed: (0.18 + (h % 100) / 400) * (j % 2 === 0 ? 1 : -1) * 0.006,
          orbitTilt: ((h % 60) - 30) * (Math.PI / 180)
        };
      });

      return { data: sys, color: colorInt, pos: pos, projects: projects };
    });

    // ------------------------------------------------------------------
    // Legend
    // ------------------------------------------------------------------
    systems.forEach(function (s) {
      var item = document.createElement('div');
      item.className = 'item';
      var dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = '#' + s.color.toString(16).padStart(6, '0');
      var label = document.createElement('span');
      label.textContent = s.data.label;
      item.appendChild(dot);
      item.appendChild(label);
      legendEl.appendChild(item);
    });

    // ------------------------------------------------------------------
    // Scene / renderer
    // ------------------------------------------------------------------
    var DEFAULT_RADIUS = 20;
    var MIN_RADIUS = 3;
    var MAX_RADIUS = 34;
    var FOCUS_DIST_SYSTEM = 6.2;
    var FOCUS_DIST_PROJECT = 3.0;

    function makeLabelSprite(text, sizePx, color) {
      var canvasScale = 3;
      var canvas = document.createElement('canvas');
      canvas.width = 400 * canvasScale;
      canvas.height = 90 * canvasScale;
      var ctx = canvas.getContext('2d');
      ctx.scale(canvasScale, canvasScale);
      ctx.font = (sizePx || 26) + 'px "Space Grotesk", sans-serif';
      ctx.fillStyle = color || '#eef0fb';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 200, 45);
      var tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.LinearFilter;
      var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 1 });
      var sprite = new THREE.Sprite(mat);
      var w = 2.9 * ((sizePx || 26) / 26);
      sprite.scale.set(w, w * 0.2025, 1);
      return { sprite: sprite, mat: mat };
    }

    function makeGlowSprite(colorInt, size) {
      var canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      var ctx = canvas.getContext('2d');
      var c = '#' + colorInt.toString(16).padStart(6, '0');
      var grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, c);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
      var tex = new THREE.CanvasTexture(canvas);
      var mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: 0.55
      });
      var sprite = new THREE.Sprite(mat);
      sprite.scale.set(size, size, 1);
      return { sprite: sprite, mat: mat };
    }

    var fadeables = [];
    function registerFade(mat, baseOpacity) {
      mat.transparent = true;
      mat.opacity = baseOpacity;
      mat.userData.base = baseOpacity;
      mat.userData.factor = 1;
      fadeables.push(mat);
    }

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 200);
    camera.position.set(0, 0, DEFAULT_RADIUS);

    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    var group = new THREE.Group();
    scene.add(group);

    // Starfield
    (function () {
      var count = 900;
      var positions = new Float32Array(count * 3);
      for (var i = 0; i < count; i++) {
        var r = 30 + Math.random() * 60;
        var theta = Math.random() * Math.PI * 2;
        var phi = Math.acos((Math.random() * 2) - 1);
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);
      }
      var starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      var starMat = new THREE.PointsMaterial({ color: 0x8d8dac, size: 0.06, transparent: true, opacity: 0.5 });
      scene.add(new THREE.Points(starGeo, starMat));
    })();

    var clickable = []; // { mesh, kind: 'core'|'system'|'project', sysIndex?, proj? }

    // Core / identity node
    var coreMesh = new THREE.Mesh(new THREE.SphereGeometry(0.7, 32, 32), new THREE.MeshBasicMaterial({ color: 0xf2c879 }));
    group.add(coreMesh);
    registerFade(coreMesh.material, 1);
    clickable.push({ mesh: coreMesh, kind: 'core' });

    var coreGlow = makeGlowSprite(0xf2c879, 3.2);
    coreGlow.sprite.position.set(0, 0, 0);
    group.add(coreGlow.sprite);
    registerFade(coreGlow.mat, 0.55);

    var coreShell = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xf2c879, wireframe: true, transparent: true, opacity: 0.22 })
    );
    group.add(coreShell);
    registerFade(coreShell.material, 0.22);

    var coreLabelObj = makeLabelSprite(GALAXY_DATA.identity.label, 26, '#f2c879');
    coreLabelObj.sprite.position.set(0, -1.3, 0);
    group.add(coreLabelObj.sprite);
    registerFade(coreLabelObj.mat, 1);

    var coreFade = { meshMat: coreMesh.material, glowMat: coreGlow.mat, shellMat: coreShell.material, labelMat: coreLabelObj.mat };

    systems.forEach(function (sys, si) {
      var starMesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 28, 28), new THREE.MeshBasicMaterial({ color: sys.color }));
      starMesh.position.copy(sys.pos);
      group.add(starMesh);
      registerFade(starMesh.material, 1);
      clickable.push({ mesh: starMesh, kind: 'system', sysIndex: si });

      var starGlow = makeGlowSprite(sys.color, 2.1);
      starGlow.sprite.position.copy(sys.pos);
      group.add(starGlow.sprite);
      registerFade(starGlow.mat, 0.5);

      var coreLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), sys.pos]),
        new THREE.LineBasicMaterial({ color: 0x1c1a2c, transparent: true, opacity: 0.8 })
      );
      group.add(coreLine);
      registerFade(coreLine.material, 0.8);

      var starLabelObj = makeLabelSprite(sys.data.label, 24);
      starLabelObj.sprite.position.set(sys.pos.x, sys.pos.y - 0.85, sys.pos.z);
      group.add(starLabelObj.sprite);
      registerFade(starLabelObj.mat, 1);

      sys._fade = { starMat: starMesh.material, glowMat: starGlow.mat, lineMat: coreLine.material, labelMat: starLabelObj.mat };

      sys.projects.forEach(function (proj) {
        var planetMesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 20), new THREE.MeshBasicMaterial({ color: sys.color }));
        group.add(planetMesh);
        registerFade(planetMesh.material, 1);
        clickable.push({ mesh: planetMesh, kind: 'project', sysIndex: si, proj: proj });

        var planetGlow = makeGlowSprite(sys.color, 1.1);
        group.add(planetGlow.sprite);
        registerFade(planetGlow.mat, 0.45);

        var planetLabelObj = makeLabelSprite(proj.data.label, 15, '#c4c4dc');
        group.add(planetLabelObj.sprite);
        registerFade(planetLabelObj.mat, 1);

        var pts = [];
        for (var a = 0; a <= 64; a++) {
          var t = (a / 64) * Math.PI * 2;
          var ox = Math.cos(t) * proj.orbitRadius;
          var oz = Math.sin(t) * proj.orbitRadius;
          var oy = oz * Math.sin(proj.orbitTilt);
          pts.push(new THREE.Vector3(sys.pos.x + ox, sys.pos.y + oy, sys.pos.z + oz * Math.cos(proj.orbitTilt)));
        }
        var orbitLine = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: sys.color, transparent: true, opacity: 0.14 })
        );
        group.add(orbitLine);
        registerFade(orbitLine.material, 0.14);

        proj._mesh = planetMesh;
        proj._glow = planetGlow.sprite;
        proj._label = planetLabelObj.sprite;
        proj._fade = { meshMat: planetMesh.material, glowMat: planetGlow.mat, labelMat: planetLabelObj.mat, lineMat: orbitLine.material };
      });
    });

    function positionPlanet(sys, proj) {
      var ox = Math.cos(proj.orbitAngle) * proj.orbitRadius;
      var oz = Math.sin(proj.orbitAngle) * proj.orbitRadius;
      var oy = oz * Math.sin(proj.orbitTilt);
      var oz2 = oz * Math.cos(proj.orbitTilt);
      proj._mesh.position.set(sys.pos.x + ox, sys.pos.y + oy, sys.pos.z + oz2);
      proj._glow.position.copy(proj._mesh.position);
      proj._label.position.set(proj._mesh.position.x, proj._mesh.position.y - 0.5, proj._mesh.position.z);
    }

    // ------------------------------------------------------------------
    // Focus / isolate visuals (dim everything but the active branch)
    // ------------------------------------------------------------------
    function applyFocusVisuals() {
      var top = focusStack.length ? focusStack[focusStack.length - 1] : null;

      var coreActive = !top;
      var cf = coreActive ? 1 : 0.15;
      coreFade.meshMat.userData.factor = cf;
      coreFade.glowMat.userData.factor = cf;
      coreFade.shellMat.userData.factor = cf;
      coreFade.labelMat.userData.factor = cf;

      systems.forEach(function (sys, si) {
        var sysActive = !top || top.sysIndex === si;
        var f = sysActive ? 1 : 0.12;
        sys._fade.starMat.userData.factor = f;
        sys._fade.glowMat.userData.factor = f;
        sys._fade.lineMat.userData.factor = f;
        sys._fade.labelMat.userData.factor = f;

        sys.projects.forEach(function (proj) {
          var projFocused = top && top.kind === 'project' && top.sysIndex === si && top.proj === proj;
          var factor;
          if (!top) factor = 1;
          else if (!sysActive) factor = 0.08;
          else if (top.kind === 'system') factor = 1;
          else factor = projFocused ? 1 : 0.18;
          proj._fade.meshMat.userData.factor = factor;
          proj._fade.glowMat.userData.factor = factor;
          proj._fade.labelMat.userData.factor = factor;
          proj._fade.lineMat.userData.factor = sysActive ? ((!top || top.kind === 'system' || projFocused) ? 1 : 0.35) : 0.08;
        });
      });
    }

    // ------------------------------------------------------------------
    // Orbit camera: the camera always orbits a target point at some
    // radius (theta = azimuth, elevation = tilt). Normally that target
    // is the galaxy core (0,0,0). Selecting a system or planet tweens
    // the target to that object instead, so the same idle spin and the
    // same drag-to-look-around now orbit around the thing you picked —
    // nothing about "rotate" changes, only what it's rotating around.
    // ------------------------------------------------------------------
    var INITIAL_THETA = 0.5;
    var INITIAL_ELEVATION = 0.18;

    var camTheta = INITIAL_THETA;
    var camElevation = INITIAL_ELEVATION;
    var camRadius = DEFAULT_RADIUS;
    var camTarget = new THREE.Vector3(0, 0, 0);

    function updateCameraPosition() {
      var ce = Math.cos(camElevation), se = Math.sin(camElevation);
      camera.position.set(
        camTarget.x + camRadius * ce * Math.sin(camTheta),
        camTarget.y + camRadius * se,
        camTarget.z + camRadius * ce * Math.cos(camTheta)
      );
      camera.lookAt(camTarget);
    }
    updateCameraPosition();

    function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

    function shortestDelta(a, b) {
      var d = (b - a) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      return d;
    }

    var tween = {
      active: false, t0: 0, duration: 850,
      fromTarget: new THREE.Vector3(), toTarget: new THREE.Vector3(),
      fromRadius: DEFAULT_RADIUS, toRadius: DEFAULT_RADIUS,
      rotateCamera: false, fromTheta: 0, dTheta: 0, fromElevation: 0, dElevation: 0
    };

    // Used when selecting a system/planet/core: moves the target and
    // radius only, leaving the current viewing angle alone so you don't
    // get spun around on top of being zoomed in.
    function tweenTo(target, radius) {
      tween.fromTarget.copy(camTarget);
      tween.toTarget.copy(target);
      tween.fromRadius = camRadius;
      tween.toRadius = radius;
      tween.rotateCamera = false;
      tween.t0 = performance.now();
      tween.active = true;
    }

    // Used by reset: restores the exact view the page loaded with —
    // target, radius, AND the original viewing angle.
    function tweenToInitialView() {
      tween.fromTarget.copy(camTarget);
      tween.toTarget.set(0, 0, 0);
      tween.fromRadius = camRadius;
      tween.toRadius = DEFAULT_RADIUS;
      tween.fromTheta = camTheta;
      tween.dTheta = shortestDelta(camTheta, INITIAL_THETA);
      tween.fromElevation = camElevation;
      tween.dElevation = INITIAL_ELEVATION - camElevation;
      tween.rotateCamera = true;
      tween.t0 = performance.now();
      tween.active = true;
    }

    // ------------------------------------------------------------------
    // Focus stack + popup
    // ------------------------------------------------------------------
    var focusStack = [];

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    function openPopup() { popupEl.classList.add('visible'); popupEl.removeAttribute('hidden'); }
    function closePopup() { popupEl.classList.remove('visible'); }

    function showSystemPopup(sys) {
      popupCrumb.textContent = sys.data.label;
      popupTitle.textContent = sys.data.label;
      popupDesc.textContent = sys.data.desc || '';
      popupLinks.innerHTML = '';
      var note = popupEl.querySelector('.note');
      var text = sys.projects.length + ' project' + (sys.projects.length === 1 ? '' : 's') + ' in this system \u2014 tap one to open it.';
      if (!note) {
        note = document.createElement('p');
        note.className = 'note';
        popupEl.querySelector('.popup-card').appendChild(note);
      }
      note.textContent = text;
      openPopup();
    }

    function showProjectPopup(sys, proj) {
      var note = popupEl.querySelector('.note');
      if (note) note.remove();
      var p = proj.data;
      var crumb = sys.data.label + '<span class="sep">/</span>' + escapeHtml(p.label);
      if (p.status) crumb += '<span class="sep">/</span>' + escapeHtml(p.status);
      popupCrumb.innerHTML = crumb;
      popupTitle.textContent = p.label;
      popupDesc.textContent = p.desc || '';
      var links = '';
      if (p.github) links += '<a class="link" href="' + escapeHtml(p.github) + '" target="_blank" rel="noopener">source on GitHub</a>';
      if (p.demo) links += '<a class="link" href="' + escapeHtml(p.demo) + '" target="_blank" rel="noopener">view live</a>';
      popupLinks.innerHTML = links;
      openPopup();
    }

    function updateResetBtn() {
      if (focusStack.length) resetBtn.classList.add('visible');
      else resetBtn.classList.remove('visible');
    }

    function enterSystem(si) {
      focusStack = [{ kind: 'system', sysIndex: si }];
      applyFocusVisuals();
      tweenTo(systems[si].pos, FOCUS_DIST_SYSTEM);
      showSystemPopup(systems[si]);
      updateResetBtn();
    }

    function enterProject(si, proj) {
      focusStack = [{ kind: 'system', sysIndex: si }, { kind: 'project', sysIndex: si, proj: proj }];
      applyFocusVisuals();
      tweenTo(proj._mesh.position, FOCUS_DIST_PROJECT);
      showProjectPopup(systems[si], proj);
      updateResetBtn();
    }

    function resetToGalaxy() {
      focusStack = [];
      applyFocusVisuals();
      tweenToInitialView();
      closePopup();
      manualPaused = false;
      lastInteractionAt = null;
      updateResetBtn();
    }

    resetBtn.addEventListener('click', resetToGalaxy);
    popupClose.addEventListener('click', closePopup);

    // ------------------------------------------------------------------
    // Pause: manual button OR a recent interaction. Spin never stops on
    // its own until you actually do something (drag, zoom, or select a
    // node) — then it resumes automatically 30s after the last one.
    // ------------------------------------------------------------------
    var manualPaused = false;
    var lastInteractionAt = null; // null = no interaction yet, keep spinning
    var INACTIVITY_RESUME_MS = 30000;

    function markInteraction() { lastInteractionAt = performance.now(); }

    pauseBtn.addEventListener('click', function () {
      manualPaused = true;
    });
    playBtn.addEventListener('click', function () {
      manualPaused = false;
      lastInteractionAt = null; // spin AND planet orbits resume immediately, right where you are
    });

    // Single pause state governs both planet-orbit motion and camera
    // spin together, so Play/Pause always affect everything at once —
    // regardless of whether something is currently focused/zoomed-in.
    function isPaused() {
      if (manualPaused) return true;
      if (lastInteractionAt === null) return false;
      return (performance.now() - lastInteractionAt) < INACTIVITY_RESUME_MS;
    }

    // ------------------------------------------------------------------
    // Drag to rotate, wheel to zoom, with inertia on release
    // ------------------------------------------------------------------
    var isDragging = false;
    var moved = false;
    var prev = { x: 0, y: 0 };
    var idleSpin = 0.0014;

    var velTheta = 0;
    var velElevation = 0;
    var INERTIA_FRICTION = 0.95;
    var INERTIA_STOP_EPS = 0.00005;
    var INERTIA_MIN_FLICK_SPEED = 0.0015;

    function pointerDown(x, y) {
      isDragging = true;
      moved = false;
      prev.x = x; prev.y = y;
      velTheta = 0;
      velElevation = 0;
      container.classList.add('dragging');
      markInteraction();
    }
    function pointerMove(x, y) {
      if (!isDragging) return;
      var dx = x - prev.x, dy = y - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      var dTheta = dx * 0.006;
      var dElevation = dy * 0.006;
      camTheta += dTheta;
      camElevation += dElevation;
      camElevation = Math.max(-1.1, Math.min(1.1, camElevation));
      // Smoothed velocity estimate, carried forward as inertia on release
      velTheta = velTheta * 0.7 + dTheta * 0.3;
      velElevation = velElevation * 0.7 + dElevation * 0.3;
      prev.x = x; prev.y = y;
    }
    function pointerUp() {
      isDragging = false;
      container.classList.remove('dragging');
      var speed = Math.abs(velTheta) + Math.abs(velElevation);
      if (!moved || speed < INERTIA_MIN_FLICK_SPEED) {
        velTheta = 0;
        velElevation = 0;
      }
    }

    container.addEventListener('mousedown', function (e) { pointerDown(e.clientX, e.clientY); });
    window.addEventListener('mousemove', function (e) { pointerMove(e.clientX, e.clientY); });
    window.addEventListener('mouseup', pointerUp);

    container.addEventListener('touchstart', function (e) {
      var t = e.touches[0]; pointerDown(t.clientX, t.clientY);
    }, { passive: true });
    container.addEventListener('touchmove', function (e) {
      var t = e.touches[0]; pointerMove(t.clientX, t.clientY);
    }, { passive: true });
    container.addEventListener('touchend', pointerUp);

    container.addEventListener('wheel', function (e) {
      e.preventDefault();
      camRadius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, camRadius + e.deltaY * 0.014));
      markInteraction();
    }, { passive: false });

    // ------------------------------------------------------------------
    // Click / hover picking
    // ------------------------------------------------------------------
    var raycaster = new THREE.Raycaster();
    var mouseVec = new THREE.Vector2();
    var hoveredEntry = null;

    function pickAt(clientX, clientY) {
      var rect = renderer.domElement.getBoundingClientRect();
      mouseVec.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouseVec.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouseVec, camera);
      var hits = raycaster.intersectObjects(clickable.map(function (c) { return c.mesh; }));
      if (!hits.length) return null;
      return clickable.find(function (c) { return c.mesh === hits[0].object; });
    }

    container.addEventListener('mousemove', function (e) {
      if (isDragging) return;
      var hit = pickAt(e.clientX, e.clientY);
      if (hoveredEntry && hoveredEntry.mesh !== (hit && hit.mesh)) hoveredEntry.mesh.scale.setScalar(1);
      if (hit) hit.mesh.scale.setScalar(1.35);
      hoveredEntry = hit;
      container.style.cursor = hit ? 'pointer' : 'grab';
    });

    container.addEventListener('click', function (e) {
      if (moved) return;
      var hit = pickAt(e.clientX, e.clientY);
      if (!hit) {
        if (popupEl.classList.contains('visible')) closePopup();
        return;
      }
      if (hit.kind === 'system') {
        var alreadyThisSystem = focusStack.length === 1 && focusStack[0].kind === 'system' && focusStack[0].sysIndex === hit.sysIndex;
        if (alreadyThisSystem) { showSystemPopup(systems[hit.sysIndex]); return; }
        enterSystem(hit.sysIndex);
      } else if (hit.kind === 'project') {
        var top = focusStack[focusStack.length - 1];
        var alreadyThisProject = top && top.kind === 'project' && top.proj === hit.proj;
        if (alreadyThisProject) { showProjectPopup(systems[hit.sysIndex], hit.proj); return; }
        enterProject(hit.sysIndex, hit.proj);
      } else if (hit.kind === 'core') {
        resetToGalaxy();
      }
    });

    window.addEventListener('resize', function () {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    });

    // Place every planet once up front, in case the animation starts paused
    systems.forEach(function (sys) {
      sys.projects.forEach(function (proj) { positionPlanet(sys, proj); });
    });

    // ------------------------------------------------------------------
    // Animate
    // ------------------------------------------------------------------
    function animate() {
      requestAnimationFrame(animate);
      var paused = isPaused();

      if (!paused) {
        systems.forEach(function (sys) {
          sys.projects.forEach(function (proj) {
            proj.orbitAngle += proj.orbitSpeed;
            positionPlanet(sys, proj);
          });
        });
      }

      if (!isDragging && (velTheta !== 0 || velElevation !== 0)) {
        camTheta += velTheta;
        camElevation += velElevation;
        camElevation = Math.max(-1.1, Math.min(1.1, camElevation));
        velTheta *= INERTIA_FRICTION;
        velElevation *= INERTIA_FRICTION;
        if (Math.abs(velTheta) < INERTIA_STOP_EPS) velTheta = 0;
        if (Math.abs(velElevation) < INERTIA_STOP_EPS) velElevation = 0;
      }

      if (!paused) {
        camTheta += idleSpin;
      }

      if (tween.active) {
        var t = Math.min(1, (performance.now() - tween.t0) / tween.duration);
        var e = easeInOutCubic(t);
        camTarget.lerpVectors(tween.fromTarget, tween.toTarget, e);
        camRadius = tween.fromRadius + (tween.toRadius - tween.fromRadius) * e;
        if (tween.rotateCamera) {
          camTheta = tween.fromTheta + tween.dTheta * e;
          camElevation = tween.fromElevation + tween.dElevation * e;
        }
        if (t >= 1) tween.active = false;
      }

      updateCameraPosition();

      fadeables.forEach(function (m) {
        var target = m.userData.base * m.userData.factor;
        m.opacity += (target - m.opacity) * 0.08;
      });

      renderer.render(scene, camera);
    }
    animate();
  }
})();
