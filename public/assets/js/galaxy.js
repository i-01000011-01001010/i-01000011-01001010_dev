(function () {
  'use strict';

  var DATA_URL = new URL('../data/projects.json', document.currentScript.src).href;

  var container = document.getElementById('scene');
  var legendEl = document.getElementById('legend');
  var backBtn = document.getElementById('backBtn');
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
    var DEFAULT_Z = 20;
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
    camera.position.set(0, 0, DEFAULT_Z);

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

    // Core / identity node
    var coreMesh = new THREE.Mesh(new THREE.SphereGeometry(0.7, 32, 32), new THREE.MeshBasicMaterial({ color: 0xf2c879 }));
    group.add(coreMesh);
    var coreGlow = makeGlowSprite(0xf2c879, 3.2);
    coreGlow.sprite.position.set(0, 0, 0);
    group.add(coreGlow.sprite);
    var coreShell = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xf2c879, wireframe: true, transparent: true, opacity: 0.22 })
    );
    group.add(coreShell);
    var coreLabelObj = makeLabelSprite(GALAXY_DATA.identity.label, 26, '#f2c879');
    coreLabelObj.sprite.position.set(0, -1.3, 0);
    group.add(coreLabelObj.sprite);

    var clickable = []; // { mesh, kind: 'system'|'project', sysIndex, proj? }

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
          proj._fade.lineMat.userData.factor = sysActive ? (top.kind === 'system' || projFocused ? 1 : 0.35) : 0.08;
        });
      });
    }

    // ------------------------------------------------------------------
    // Camera focus (rotate the group so the target sits on the view axis,
    // then dolly the camera in/out along Z — camera itself never moves
    // off-axis, so drag-to-look-around keeps working the same way)
    // ------------------------------------------------------------------
    function computeFocusRotation(P) {
      var px = P.x, py = P.y, pz = P.z;
      var y = Math.atan2(-px, pz);
      var zPrime = -px * Math.sin(y) + pz * Math.cos(y);
      if (zPrime < 0) { y += Math.PI; zPrime = -px * Math.sin(y) + pz * Math.cos(y); }
      var x = Math.atan2(py, zPrime);
      return { x: x, y: y };
    }

    function shortestDelta(a, b) {
      var d = (b - a) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      return d;
    }

    function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

    var tween = { active: false, t0: 0, duration: 850, fromX: 0, fromY: 0, dX: 0, dY: 0, fromZ: DEFAULT_Z, toZ: DEFAULT_Z, rotate: false };

    function focusOn(localPos, distance) {
      var rot = computeFocusRotation(localPos);
      tween.fromX = group.rotation.x;
      tween.fromY = group.rotation.y;
      tween.dX = shortestDelta(group.rotation.x, rot.x);
      tween.dY = shortestDelta(group.rotation.y, rot.y);
      tween.fromZ = camera.position.z;
      tween.toZ = localPos.length() + distance;
      tween.rotate = true;
      tween.t0 = performance.now();
      tween.active = true;
    }

    function resetView() {
      tween.fromZ = camera.position.z;
      tween.toZ = DEFAULT_Z;
      tween.rotate = false;
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

    function updateBackBtn() {
      if (focusStack.length) backBtn.classList.add('visible');
      else backBtn.classList.remove('visible');
    }

    function enterSystem(si) {
      focusStack = [{ kind: 'system', sysIndex: si }];
      applyFocusVisuals();
      focusOn(systems[si].pos, FOCUS_DIST_SYSTEM);
      showSystemPopup(systems[si]);
      updateBackBtn();
    }

    function enterProject(si, proj) {
      focusStack = [{ kind: 'system', sysIndex: si }, { kind: 'project', sysIndex: si, proj: proj }];
      applyFocusVisuals();
      focusOn(proj._mesh.position, FOCUS_DIST_PROJECT);
      showProjectPopup(systems[si], proj);
      updateBackBtn();
    }

    function goBack() {
      if (!focusStack.length) return;
      focusStack.pop();
      applyFocusVisuals();
      if (!focusStack.length) {
        resetView();
        closePopup();
      } else {
        var top = focusStack[focusStack.length - 1];
        focusOn(systems[top.sysIndex].pos, FOCUS_DIST_SYSTEM);
        showSystemPopup(systems[top.sysIndex]);
      }
      updateBackBtn();
    }

    backBtn.addEventListener('click', goBack);
    popupClose.addEventListener('click', closePopup);

    // ------------------------------------------------------------------
    // Pause: manual button OR hovering the scene OR being focused
    // ------------------------------------------------------------------
    var manualPaused = false;
    var isHovering = false;

    function updatePauseBtn() {
      pauseBtn.textContent = manualPaused ? '\u25B6' : '\u23F8';
      pauseBtn.setAttribute('aria-label', manualPaused ? 'Resume animation' : 'Pause animation');
    }
    pauseBtn.addEventListener('click', function () {
      manualPaused = !manualPaused;
      updatePauseBtn();
    });
    updatePauseBtn();

    container.addEventListener('mouseenter', function () { isHovering = true; });
    container.addEventListener('mouseleave', function () { isHovering = false; });

    function effectivelyPaused() {
      return manualPaused || isHovering || focusStack.length > 0;
    }

    // ------------------------------------------------------------------
    // Drag to rotate, wheel to zoom
    // ------------------------------------------------------------------
    var isDragging = false;
    var moved = false;
    var prev = { x: 0, y: 0 };
    var idleSpin = 0.0014;

    function pointerDown(x, y) {
      isDragging = true;
      moved = false;
      prev.x = x; prev.y = y;
      container.classList.add('dragging');
    }
    function pointerMove(x, y) {
      if (!isDragging) return;
      var dx = x - prev.x, dy = y - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      group.rotation.y += dx * 0.006;
      group.rotation.x += dy * 0.006;
      group.rotation.x = Math.max(-1.1, Math.min(1.1, group.rotation.x));
      prev.x = x; prev.y = y;
    }
    function pointerUp() { isDragging = false; container.classList.remove('dragging'); }

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
      var z = camera.position.z + e.deltaY * 0.014;
      camera.position.z = Math.max(3, Math.min(34, z));
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
      } else {
        var top = focusStack[focusStack.length - 1];
        var alreadyThisProject = top && top.kind === 'project' && top.proj === hit.proj;
        if (alreadyThisProject) { showProjectPopup(systems[hit.sysIndex], hit.proj); return; }
        enterProject(hit.sysIndex, hit.proj);
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
      var paused = effectivelyPaused();

      if (!paused) {
        group.rotation.y += idleSpin;
        systems.forEach(function (sys) {
          sys.projects.forEach(function (proj) {
            proj.orbitAngle += proj.orbitSpeed;
            positionPlanet(sys, proj);
          });
        });
      }

      if (tween.active) {
        var t = Math.min(1, (performance.now() - tween.t0) / tween.duration);
        var e = easeInOutCubic(t);
        if (tween.rotate) {
          group.rotation.x = tween.fromX + tween.dX * e;
          group.rotation.y = tween.fromY + tween.dY * e;
        }
        camera.position.z = tween.fromZ + (tween.toZ - tween.fromZ) * e;
        if (t >= 1) tween.active = false;
      }

      fadeables.forEach(function (m) {
        var target = m.userData.base * m.userData.factor;
        m.opacity += (target - m.opacity) * 0.08;
      });

      renderer.render(scene, camera);
    }
    animate();
  }
})();
