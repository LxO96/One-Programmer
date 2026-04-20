# UI Redesign & Canvas Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 1200 range-slider UI with a clean split-panel layout featuring a freehand-paint HTML5 canvas curve editor.

**Architecture:** Left panel holds file drop, profile list, and mini Chart.js overview. Right panel holds a per-profile canvas editor with bezier curve rendering and mouse-paint interaction. All five profiles share the same data structure; only the active profile's canvas is visible at a time.

**Tech Stack:** Vanilla JS, HTML5 Canvas 2D API, Chart.js 3.5.1 (existing, for mini overview)

---

## File Map

| File | Change |
|------|--------|
| `OneProfileProgrammer.html` | Full restructure to split-panel layout; remove `#putsDiv`, `#graphbox`, `#setDiv`; add `#left-panel`, `#right-panel`, `#editor-header`, `#canvas-area`, `#controls-footer` |
| `proggStyle.css` | Complete replacement — remove all `input[type=range]` / vLine / rangeBoxes rules; add panel, profile list, canvas, footer styles |
| `programmer.js` | Remove `writeranges`, `fixranges`, `sliderUpdate`; add `drawCanvas`, `startPaint`, `continuePaint`, `endPaint`, `applySmoothPaint`, `setActiveProfile`, `profileInputUpdate`, `setFileVersion`; update `addElements`, `DOMContentLoaded`, `writeOut` |

---

## Task 1: Restructure HTML

**Files:**
- Modify: `OneProfileProgrammer.html`

- [ ] **Step 1: Replace the entire HTML body with the split-panel structure**

Open `OneProfileProgrammer.html` and replace everything from `<body>` to `</body>` with:

```html
<body>
  <header>
    <div>
      <h2>Crem One Programmer</h2>
      <p class="header-sub">Pressure profile editor</p>
    </div>
    <button id="bigOutButton">Export ↓</button>
  </header>

  <div id="app">
    <div id="left-panel">
      <div id="drop-area">
        <div class="drop-zone-inner">
          <p>Drop .txt profile or click to select</p>
          <input type="file" id="fileElem" accept=".txt" style="display:none">
          <label class="button" for="fileElem">Select file</label>
        </div>
      </div>
      <div id="profile-list-section">
        <div class="section-label">Profiles</div>
        <div id="profile-list"></div>
      </div>
      <div id="graphbox">
        <div class="section-label">Overview</div>
        <canvas id="myChart" width="268" height="150"></canvas>
      </div>
    </div>

    <div id="right-panel">
      <div id="editor-header"></div>
      <div id="canvas-area"></div>
      <div id="controls-footer">
        <div class="control-group">
          <span class="control-label">Smoothness</span>
          <input type="range" id="settingNum" value="10" min="1" max="20" step="1">
          <span id="outputFileSmoothness">10</span>
        </div>
        <div class="control-group">
          <span class="control-label">File version</span>
          <div class="version-toggle">
            <button class="ver-btn" id="ver1">v1</button>
            <button class="ver-btn active" id="ver2">v2</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <a download="info.txt" id="downloadlink" style="display:none">Download</a>
</body>
```

- [ ] **Step 2: Open the page in a browser and verify structure**

Open `OneProfileProgrammer.html` in a browser. Expected: blank white page — no sliders, no old layout. The `#app` div exists but has no visible content yet (JS hasn't been updated). Console may show errors; that's fine.

- [ ] **Step 3: Commit**

```bash
git add OneProfileProgrammer.html
git commit -m "refactor: restructure HTML to split-panel layout"
```

---

## Task 2: Replace CSS

**Files:**
- Modify: `proggStyle.css`

- [ ] **Step 1: Replace the entire contents of `proggStyle.css`**

```css
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: system-ui, -apple-system, sans-serif;
  background: #fff;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Header ── */
header {
  background: #fff;
  border-bottom: 1px solid #e0e0e0;
  padding: 14px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}
header h2 { font-size: 16px; font-weight: 700; color: #222; }
.header-sub { font-size: 11px; color: #999; margin-top: 2px; display: block; }

#bigOutButton {
  background: #1976d2;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  letter-spacing: 0.02em;
}
#bigOutButton:hover { background: #1565c0; }

/* ── App shell ── */
#app {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ── Left panel ── */
#left-panel {
  width: 300px;
  min-width: 300px;
  border-right: 1px solid #e0e0e0;
  background: #fafafa;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #bbb;
  text-transform: uppercase;
  margin-bottom: 8px;
}

/* Drop area */
#drop-area {
  padding: 16px;
  border-bottom: 1px solid #eee;
}
.drop-zone-inner {
  border: 1.5px dashed #ccc;
  border-radius: 8px;
  padding: 14px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s;
}
.drop-zone-inner p { font-size: 11px; color: #999; margin-bottom: 8px; display: block; }
#drop-area.highlight .drop-zone-inner { border-color: #1976d2; }

.button {
  display: inline-block;
  padding: 6px 14px;
  background: #eee;
  cursor: pointer;
  border-radius: 5px;
  font-size: 12px;
  color: #555;
  transition: background 0.1s;
}
.button:hover { background: #e0e0e0; }

/* Profile list */
#profile-list-section {
  padding: 16px;
  border-bottom: 1px solid #eee;
}
#profile-list { display: flex; flex-direction: column; gap: 2px; }

.profile-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.1s;
}
.profile-item:hover { background: #f0f0f0; }
.profile-item.active { background: #e3f0fd; }
.profile-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
.profile-name { font-size: 13px; font-weight: 600; color: #333; flex: 1; }
.profile-vol { font-size: 11px; color: #aaa; }

/* Mini overview chart */
#graphbox {
  padding: 16px;
  flex: 1;
  display: flex;
  flex-direction: column;
}
#graphbox canvas { width: 100% !important; height: auto !important; }

/* ── Right panel ── */
#right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Editor header (inputs) */
#editor-header {
  padding: 14px 24px 12px;
  border-bottom: 1px solid #eee;
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.field-group { display: flex; align-items: center; gap: 6px; }
.field-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.07em;
  color: #bbb;
  text-transform: uppercase;
}
.field-input {
  border: 1px solid #ddd;
  border-radius: 5px;
  padding: 5px 9px;
  font-size: 13px;
  color: #333;
  outline: none;
  transition: border-color 0.15s;
}
.field-input:focus { border-color: #1976d2; }
.field-input.name-input { width: 110px; font-weight: 600; text-transform: uppercase; }
.field-input.num-input { width: 60px; }
.unit-label { font-size: 11px; color: #ccc; }
.limit-row { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #666; }
.limit-row input { cursor: pointer; }

/* Canvas area */
#canvas-area {
  flex: 1;
  padding: 16px 24px 10px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.editor-canvas-wrap {
  flex: 1;
  background: #f7f9fc;
  border: 1.5px solid #e0e8f0;
  border-radius: 10px;
  overflow: hidden;
  position: relative;
  min-height: 0;
}
.editor-canvas-wrap canvas {
  width: 100%;
  height: 100%;
  cursor: crosshair;
  display: block;
}
.canvas-hint {
  position: absolute;
  top: 10px;
  right: 14px;
  font-size: 10px;
  color: #c8d4e4;
  pointer-events: none;
  letter-spacing: 0.03em;
}

/* Controls footer */
#controls-footer {
  padding: 10px 24px 16px;
  border-top: 1px solid #eee;
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.control-group { display: flex; align-items: center; gap: 8px; }
.control-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.07em;
  color: #bbb;
  text-transform: uppercase;
}
#settingNum { width: 100px; accent-color: #1976d2; cursor: pointer; }
#outputFileSmoothness { font-size: 12px; color: #555; font-weight: 600; min-width: 20px; }
.version-toggle { display: flex; }
.ver-btn {
  border: 1px solid #ddd;
  background: #fff;
  padding: 5px 14px;
  font-size: 12px;
  cursor: pointer;
  color: #555;
  transition: background 0.1s, color 0.1s;
}
.ver-btn:first-child { border-radius: 5px 0 0 5px; }
.ver-btn:last-child { border-radius: 0 5px 5px 0; border-left: none; }
.ver-btn.active { background: #1976d2; color: #fff; border-color: #1976d2; }
```

- [ ] **Step 2: Open the page and verify styles load without errors**

Open `OneProfileProgrammer.html`. Expected: clean white header with "Crem One Programmer" title and a blue "Export ↓" button. No visible content below yet (JS not updated). No CSS errors in console.

- [ ] **Step 3: Commit**

```bash
git add proggStyle.css
git commit -m "refactor: replace all CSS with clean split-panel styles"
```

---

## Task 3: Update `addElements()` — create canvases and profile list

**Files:**
- Modify: `programmer.js`

- [ ] **Step 1: Add new globals at the top of `programmer.js`**

After the existing globals (`var hasGraphed`, `var readProfiles`, etc.), add:

```javascript
var activeProfileIndex = 0;
const PROFILE_COLORS = ['#FFBE86', '#FFE156', '#33E9CE', '#FFB5C2', '#3777FF'];
var isPainting = false;
var lastPaintIndex = -1;
var lastPaintValue = 0;
var fileVersionValue = 2;
```

- [ ] **Step 2: Replace the entire `addElements()` function**

```javascript
function addElements() {
  const profileList = document.getElementById('profile-list');
  const canvasArea = document.getElementById('canvas-area');
  const editorHeader = document.getElementById('editor-header');

  for (let n = 0; n < 5; n++) {
    // Profile list item
    const item = document.createElement('div');
    item.className = 'profile-item' + (n === 0 ? ' active' : '');
    item.id = 'profile-item-' + (n + 1);

    const dot = Object.assign(document.createElement('div'), { className: 'profile-dot' });
    dot.style.background = PROFILE_COLORS[n];

    const nameSpan = Object.assign(document.createElement('span'), {
      className: 'profile-name',
      id: 'profile-list-name-' + (n + 1),
      textContent: activeProfiles[n].name || ('Profile ' + (n + 1)),
    });
    const volSpan = Object.assign(document.createElement('span'), {
      className: 'profile-vol',
      id: 'profile-list-vol-' + (n + 1),
      textContent: activeProfiles[n].volume + 'ml',
    });

    item.appendChild(dot);
    item.appendChild(nameSpan);
    item.appendChild(volSpan);
    item.addEventListener('click', (function(idx) { return function() { setActiveProfile(idx); }; })(n));
    profileList.appendChild(item);

    // Canvas wrapper
    const wrap = Object.assign(document.createElement('div'), {
      className: 'editor-canvas-wrap',
      id: 'canvas-wrap-' + (n + 1),
    });
    wrap.style.display = n === 0 ? 'flex' : 'none';

    const canvas = Object.assign(document.createElement('canvas'), {
      id: 'editor-canvas-' + (n + 1),
      width: 1200,
      height: 400,
    });
    canvas.addEventListener('mousedown', startPaint);
    canvas.addEventListener('mousemove', continuePaint);
    canvas.addEventListener('mouseup', endPaint);
    canvas.addEventListener('mouseleave', endPaint);

    const hint = Object.assign(document.createElement('span'), {
      className: 'canvas-hint',
      textContent: 'click & drag to draw',
    });

    wrap.appendChild(canvas);
    wrap.appendChild(hint);
    canvasArea.appendChild(wrap);
  }

  // Editor header inputs (shared, reflect active profile)
  editorHeader.innerHTML = `
    <div class="field-group">
      <span class="field-label">Name</span>
      <input class="field-input name-input" id="nameBox" type="text" placeholder="NAME" maxlength="8">
    </div>
    <div class="field-group">
      <span class="field-label">Volume</span>
      <input class="field-input num-input" id="volBox" type="number" min="4" max="240">
      <span class="unit-label">ml</span>
    </div>
    <div class="field-group">
      <span class="field-label">Time</span>
      <input class="field-input num-input" id="timeBox" type="number" min="0">
      <span class="unit-label">s</span>
    </div>
    <div class="limit-row">
      <input type="checkbox" id="limCheck">
      <label for="limCheck">Limit to volume</label>
    </div>
  `;

  document.getElementById('nameBox').addEventListener('change', profileInputUpdate);
  document.getElementById('volBox').addEventListener('change', profileInputUpdate);
  document.getElementById('timeBox').addEventListener('change', profileInputUpdate);
  document.getElementById('limCheck').addEventListener('change', profileInputUpdate);

  console.debug("All elements loaded");
}
```

- [ ] **Step 3: Open the page and verify canvases and profile list appear**

Open `OneProfileProgrammer.html`. Expected:
- Left panel shows profile list with 5 colored dots (names may be empty until `setActiveProfile` is added in Task 4)
- Right panel shows editor header with Name/Volume/Time inputs and a canvas area
- No JS errors in console

- [ ] **Step 4: Commit**

```bash
git add programmer.js
git commit -m "refactor: replace addElements to create canvases and profile list"
```

---

## Task 4: Add `setActiveProfile()` and `profileInputUpdate()`

**Files:**
- Modify: `programmer.js`

- [ ] **Step 1: Add `setActiveProfile()` after `addElements()`**

```javascript
function setActiveProfile(n) {
  activeProfileIndex = n;

  for (let i = 0; i < 5; i++) {
    document.getElementById('profile-item-' + (i + 1)).classList.toggle('active', i === n);
    document.getElementById('canvas-wrap-' + (i + 1)).style.display = i === n ? 'flex' : 'none';
  }

  const profile = activeProfiles[n];
  document.getElementById('nameBox').value = profile.name;
  document.getElementById('volBox').value = profile.volume;
  document.getElementById('timeBox').value = profile.time;
  document.getElementById('limCheck').checked = !!profile.volLim;

  drawCanvas(n);
}
```

- [ ] **Step 2: Add `profileInputUpdate()` after `setActiveProfile()`**

```javascript
function profileInputUpdate() {
  const n = activeProfileIndex;
  const profile = activeProfiles[n];

  const name = document.getElementById('nameBox').value.toUpperCase().substring(0, 8);
  const volume = Math.min(240, Math.max(4, parseInt(document.getElementById('volBox').value) || 240));
  const time = parseInt(document.getElementById('timeBox').value) || 0;
  const volLim = document.getElementById('limCheck').checked;

  document.getElementById('nameBox').value = name;
  document.getElementById('volBox').value = volume;

  profile.name = name;
  profile.volume = volume;
  profile.time = time;
  profile.volLim = volLim;

  if (volLim) {
    for (let x = volume; x < 240; x++) {
      profile.pressureArray[x] = 0.0;
    }
  }

  document.getElementById('profile-list-name-' + (n + 1)).textContent = name || ('Profile ' + (n + 1));
  document.getElementById('profile-list-vol-' + (n + 1)).textContent = volume + 'ml';

  drawCanvas(n);
  graphIt(activeProfiles);
}
```

- [ ] **Step 3: In the `DOMContentLoaded` handler, add a call to `setActiveProfile(0)` after `addElements()`**

Find the existing `DOMContentLoaded` handler and change:
```javascript
addElements();
```
to:
```javascript
addElements();
setActiveProfile(0);
```

- [ ] **Step 4: Open the page and verify profile switching works**

Open `OneProfileProgrammer.html`. Expected:
- Clicking profile list items highlights the selected item
- Header inputs reflect each profile's name/volume/time
- No JS errors (drawCanvas will do nothing until Task 5)

- [ ] **Step 5: Commit**

```bash
git add programmer.js
git commit -m "feat: add setActiveProfile and profileInputUpdate"
```

---

## Task 5: Add `drawCanvas()`

**Files:**
- Modify: `programmer.js`

- [ ] **Step 1: Add `drawCanvas()` after `profileInputUpdate()`**

```javascript
function drawCanvas(profileIndex) {
  const canvas = document.getElementById('editor-canvas-' + (profileIndex + 1));
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const profile = activeProfiles[profileIndex];
  const vol = Math.max(2, Math.ceil(parseInt(profile.volume)));
  const arr = profile.pressureArray;
  const color = PROFILE_COLORS[profileIndex];

  ctx.clearRect(0, 0, w, h);

  // Pre-infusion zone (~first 18ml)
  const preW = Math.min(w, (18 / vol) * w);
  ctx.fillStyle = 'rgba(55, 119, 255, 0.05)';
  ctx.fillRect(0, 0, preW, h);

  // Horizontal grid lines (0–10 bar)
  for (let bar = 0; bar <= 10; bar++) {
    const y = h - (bar / 10) * h;
    ctx.strokeStyle = bar === 0 ? '#dde3ec' : '#eaeff5';
    ctx.lineWidth = bar === 0 ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    if (bar > 0) {
      ctx.fillStyle = '#c8d0dc';
      ctx.font = '14px system-ui';
      ctx.fillText(bar, 6, y - 4);
    }
  }

  // Vertical grid lines (every 24ml)
  for (let ml = 24; ml < vol; ml += 24) {
    const x = (ml / (vol - 1)) * w;
    ctx.strokeStyle = '#eaeff5';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  if (vol < 2) return;

  // Build smooth path using midpoint bezier
  function buildPath() {
    ctx.moveTo(0, h - (arr[0] / 10) * h);
    for (let i = 1; i < vol; i++) {
      const x = (i / (vol - 1)) * w;
      const y = h - (arr[i] / 10) * h;
      const prevX = ((i - 1) / (vol - 1)) * w;
      const prevY = h - (arr[i - 1] / 10) * h;
      ctx.quadraticCurveTo(prevX, prevY, (prevX + x) / 2, (prevY + y) / 2);
    }
    const lx = ((vol - 1) / (vol - 1)) * w;
    const ly = h - (arr[vol - 1] / 10) * h;
    ctx.lineTo(lx, ly);
  }

  // Fill under curve
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  ctx.beginPath();
  buildPath();
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.15)';
  ctx.fill();

  // Stroke curve
  ctx.beginPath();
  buildPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}
```

- [ ] **Step 2: Open the page and verify curves render**

Open `OneProfileProgrammer.html`. Expected:
- Each profile's canvas shows a flat line at 0 bar (all default values are 0)
- Grid lines (horizontal 0–10, vertical every 24ml) are visible
- Pre-infusion zone shows a faint blue tint on the left
- Switching profiles shows the correct color curve

- [ ] **Step 3: Commit**

```bash
git add programmer.js
git commit -m "feat: add drawCanvas with bezier curve rendering and grid"
```

---

## Task 6: Add paint interaction

**Files:**
- Modify: `programmer.js`

- [ ] **Step 1: Add `applySmoothPaint()` after `drawCanvas()`**

```javascript
function applySmoothPaint(profileIndex, centerIdx, value, vol) {
  const smothVal = parseInt(document.getElementById('settingNum').value) * 4;
  const half = Math.floor(smothVal / 2);
  const profile = activeProfiles[profileIndex];

  for (let s = -half; s <= half; s++) {
    const i = centerIdx + s;
    if (i < 0 || i >= vol) continue;
    const indexDiff = Math.abs(s);
    const adjustmentVal = (indexDiff * -2 / smothVal + 1);
    const current = parseFloat(profile.pressureArray[i]);
    let newVal = current + (value - current) * adjustmentVal;
    newVal = Math.max(0, Math.min(10, Math.round(newVal * 10) / 10));
    profile.pressureArray[i] = newVal;
  }
}
```

- [ ] **Step 2: Add `startPaint()`, `continuePaint()`, and `endPaint()` after `applySmoothPaint()`**

```javascript
function startPaint(e) {
  isPainting = true;
  lastPaintIndex = -1;
  continuePaint(e);
}

function continuePaint(e) {
  if (!isPainting) return;
  const canvas = e.currentTarget;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  const profile = activeProfiles[activeProfileIndex];
  const vol = Math.max(2, Math.ceil(parseInt(profile.volume)));

  const idx = Math.max(0, Math.min(vol - 1, Math.round((x / canvas.width) * (vol - 1))));
  const pressure = Math.max(0, Math.min(10, (1 - y / canvas.height) * 10));

  if (lastPaintIndex >= 0 && lastPaintIndex !== idx) {
    const startIdx = Math.min(lastPaintIndex, idx);
    const endIdx = Math.max(lastPaintIndex, idx);
    for (let i = startIdx; i <= endIdx; i++) {
      const t = (endIdx === startIdx) ? 1 : (i - startIdx) / (endIdx - startIdx);
      const interpPressure = lastPaintValue + (pressure - lastPaintValue) * t;
      applySmoothPaint(activeProfileIndex, i, interpPressure, vol);
    }
  } else {
    applySmoothPaint(activeProfileIndex, idx, pressure, vol);
  }

  lastPaintIndex = idx;
  lastPaintValue = pressure;

  drawCanvas(activeProfileIndex);
  graphIt(activeProfiles);
}

function endPaint() {
  isPainting = false;
  lastPaintIndex = -1;
}
```

- [ ] **Step 3: Open the page and verify painting works**

Open `OneProfileProgrammer.html`. Expected:
- Click and drag on the canvas area draws a smooth pressure curve
- The curve's smoothness changes when the Smoothness slider is adjusted
- The mini Chart.js overview on the left updates live as you paint
- No gaps in the curve when dragging quickly

- [ ] **Step 4: Commit**

```bash
git add programmer.js
git commit -m "feat: add freehand paint interaction with smoothing"
```

---

## Task 7: Update file version toggle and `writeOut()`

**Files:**
- Modify: `programmer.js`

- [ ] **Step 1: Add `setFileVersion()` and update `getFileVersion()`**

Replace the existing `getFileVersion` function:

```javascript
function getFileVersion(versionVal) {
  if (versionVal === undefined) versionVal = fileVersionValue;
  fileVersionValue = versionVal > 1.5 ? 2 : 1;
  document.getElementById('ver1').classList.toggle('active', fileVersionValue === 1);
  document.getElementById('ver2').classList.toggle('active', fileVersionValue === 2);
}

function setFileVersion(v) {
  fileVersionValue = v;
  document.getElementById('ver1').classList.toggle('active', v === 1);
  document.getElementById('ver2').classList.toggle('active', v === 2);
}
```

- [ ] **Step 2: Update `writeOut()` to use `fileVersionValue`**

Replace the existing `writeOut` function:

```javascript
function writeOut() {
  console.debug("writing Out");
  let finishedFile = getTextFile(fileVersionValue);

  var file = new Blob([finishedFile], { type: 'text/plain; charset=utf-8' });
  var a = document.createElement("a");
  var url = URL.createObjectURL(file);
  a.href = url;
  a.download = "IMPONE";
  document.body.appendChild(a);
  a.click();
  setTimeout(function() {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 0);

  console.debug(finishedFile);
}
```

- [ ] **Step 3: Open the page and verify `setFileVersion` works**

Open the browser console and run: `setFileVersion(1)` then `setFileVersion(2)`.
Expected: `#ver1` / `#ver2` buttons toggle the `.active` class correctly (blue highlight switches).

Note: click listeners are wired up in Task 8. Export will also be tested in Task 8.

- [ ] **Step 4: Commit**

```bash
git add programmer.js
git commit -m "feat: add file version toggle buttons and update writeOut"
```

---

## Task 8: Update `DOMContentLoaded` and `handleFiles()` to use canvas

**Files:**
- Modify: `programmer.js`

- [ ] **Step 1: Replace the full `DOMContentLoaded` handler**

```javascript
document.addEventListener("DOMContentLoaded", function(event) {
  graphIt(emptyProfiles);
  addElements();
  setActiveProfile(0);

  document.getElementById('ver1').addEventListener('click', function() { setFileVersion(1); });
  document.getElementById('ver2').addEventListener('click', function() { setFileVersion(2); });
  document.getElementById('settingNum').addEventListener('input', function() {
    document.getElementById('outputFileSmoothness').textContent = this.value;
  });

  const fileInput = document.getElementById("fileElem");
  fileInput.addEventListener('change', function() { handleFiles(this.files); });

  getFileVersion(2);
  fixDropAera();
  document.getElementById('bigOutButton').addEventListener("click", writeOut);
});
```

- [ ] **Step 2: Update `handleFiles()` to call `drawCanvas` and `setActiveProfile` instead of `writeranges`**

Find the end of `handleFiles()` — the lines after `activeProfiles = readProfiles`. Replace:

```javascript
      graphIt(readProfiles);
      writeranges(readProfiles);
      activeProfiles = readProfiles;
```

with:

```javascript
      activeProfiles = readProfiles;
      graphIt(activeProfiles);
      for (let i = 0; i < 5; i++) {
        document.getElementById('profile-list-name-' + (i + 1)).textContent = activeProfiles[i].name || ('Profile ' + (i + 1));
        document.getElementById('profile-list-vol-' + (i + 1)).textContent = activeProfiles[i].volume + 'ml';
        drawCanvas(i);
      }
      setActiveProfile(activeProfileIndex);
```

- [ ] **Step 3: Remove `writeranges`, `fixranges`, and `sliderUpdate` functions**

Delete these three functions entirely from `programmer.js`:
- `function fixranges() { ... }`
- `function writeranges(profiles) { ... }`
- `function sliderUpdate(change) { ... }`

Also delete the `<datalist id="values">` element from `OneProfileProgrammer.html` if still present.

- [ ] **Step 4: Full end-to-end test**

Open `OneProfileProgrammer.html`. Verify:
1. Page loads with clean split-panel layout — no console errors
2. Click each profile in the left list — canvas switches, inputs update
3. Paint a curve by clicking and dragging — smooth bezier curve appears, mini overview updates
4. Change the Name/Volume/Time inputs — profile list reflects changes
5. Adjust Smoothness slider — repainting uses new smoothing width
6. Click "Export ↓" — file downloads
7. Drag a `.txt` profile onto the drop area — curves load and display correctly on all 5 profiles

- [ ] **Step 5: Commit**

```bash
git add OneProfileProgrammer.html programmer.js
git commit -m "feat: wire up full canvas editor, remove slider system"
```
