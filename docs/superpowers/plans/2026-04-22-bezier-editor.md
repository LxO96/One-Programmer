# Bezier Control Point Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the freehand-paint canvas interaction with a sparse control point bezier editor where users click to add points, drag to move them, and double-click to remove them.

**Architecture:** Each profile stores a `controlPoints` array of normalized `{x, y}` objects as the primary source of truth. `pressureArray[240]` becomes export-only, derived from control points in `deriveArray()` right before export. `drawCanvas` renders directly from control points.

**Tech Stack:** Vanilla JS, HTML5 Canvas 2D API (no new dependencies)

---

## File Map

| File | Change |
|------|--------|
| `programmer.js` | Add `douglasPeucker`, `arrayToControlPoints`, `deriveArray`; add `controlPoints` to profiles; update `drawCanvas`, `addElements`, `handleFiles`, `writeOut`, `profileInputUpdate`; replace paint handlers with edit handlers; remove `applySmoothPaint`, `startPaint`, `continuePaint`, `endPaint` |
| `OneProfileProgrammer.html` | Remove smoothness `control-group` div |
| `proggStyle.css` | Remove `#settingNum` and `#outputFileSmoothness` rules |

---

## Task 1: Add utility functions and initialize controlPoints

**Files:**
- Modify: `programmer.js`

This task adds three pure functions and wires up the data model. No DOM interaction — everything is testable by opening the browser console.

- [ ] **Step 1: Add `douglasPeucker` after the `labelarray` block (around line 23)**

Find this line in `programmer.js`:
```javascript
var activeProfileIndex = 0;
```

Insert the following three functions immediately **before** that line:

```javascript
function douglasPeucker(pts, epsilon) {
	if (pts.length < 3) return pts.slice();
	let maxDist = 0, maxIdx = 0;
	const start = pts[0], end = pts[pts.length - 1];
	const dx = end.x - start.x, dy = end.y - start.y;
	const len = Math.sqrt(dx * dx + dy * dy);
	for (let i = 1; i < pts.length - 1; i++) {
		let dist;
		if (len === 0) {
			const ex = pts[i].x - start.x, ey = pts[i].y - start.y;
			dist = Math.sqrt(ex * ex + ey * ey);
		} else {
			const t = ((pts[i].x - start.x) * dx + (pts[i].y - start.y) * dy) / (len * len);
			const px = start.x + t * dx - pts[i].x;
			const py = start.y + t * dy - pts[i].y;
			dist = Math.sqrt(px * px + py * py);
		}
		if (dist > maxDist) { maxDist = dist; maxIdx = i; }
	}
	if (maxDist > epsilon) {
		const left = douglasPeucker(pts.slice(0, maxIdx + 1), epsilon);
		const right = douglasPeucker(pts.slice(maxIdx), epsilon);
		return left.slice(0, -1).concat(right);
	}
	return [{ x: pts[0].x, y: pts[0].y }, { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y }];
}

function arrayToControlPoints(profileIndex) {
	const profile = activeProfiles[profileIndex];
	const vol = Math.ceil(parseInt(profile.volume));
	if (vol < 2) {
		profile.controlPoints = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
		return;
	}
	const pts = [];
	for (let i = 0; i < vol; i++) {
		pts.push({ x: i / (vol - 1), y: Math.max(0, Math.min(1, parseFloat(profile.pressureArray[i]) / 10)) });
	}
	profile.controlPoints = douglasPeucker(pts, 0.02);
}

function deriveArray(profileIndex) {
	const profile = activeProfiles[profileIndex];
	const vol = Math.ceil(parseInt(profile.volume));
	const pts = [...profile.controlPoints].sort((a, b) => a.x - b.x);
	for (let i = 0; i < 240; i++) {
		if (i >= vol) { profile.pressureArray[i] = 0; continue; }
		const t = vol === 1 ? 0 : i / (vol - 1);
		let lo = pts[0], hi = pts[pts.length - 1];
		for (let j = 0; j < pts.length - 1; j++) {
			if (pts[j].x <= t && pts[j + 1].x >= t) { lo = pts[j]; hi = pts[j + 1]; break; }
		}
		const frac = hi.x === lo.x ? 0 : (t - lo.x) / (hi.x - lo.x);
		const pressure = (lo.y + (hi.y - lo.y) * frac) * 10;
		profile.pressureArray[i] = Math.max(0, Math.min(10, Math.round(pressure * 10) / 10));
	}
}
```

- [ ] **Step 2: Add `controlPoints` to `emptyProfiles`**

Find:
```javascript
		pressureArray: Array(240).fill("0.0"),
	})
```

Replace with:
```javascript
		pressureArray: Array(240).fill("0.0"),
		controlPoints: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
	})
```

- [ ] **Step 3: Replace paint globals with edit globals**

Find:
```javascript
var isPainting = false;
var lastPaintIndex = -1;
var lastPaintValue = 0;
```

Replace with:
```javascript
var draggingPointIndex = -1;
var hoveredPointIndex = -1;
```

- [ ] **Step 4: Open the browser console and verify the functions exist**

Open `OneProfileProgrammer.html` in a browser. In the console run:
```javascript
douglasPeucker([{x:0,y:0},{x:0.5,y:0.5},{x:1,y:0}], 0.02)
// Expected: [{x:0,y:0},{x:1,y:0}]  (middle point eliminated — it's on the line)

douglasPeucker([{x:0,y:0},{x:0.5,y:0.8},{x:1,y:0}], 0.02)
// Expected: all 3 points kept (middle point is far off the line)

deriveArray(0)
activeProfiles[0].pressureArray.slice(0, 5)
// Expected: [0, 0, 0, 0, 0]  (flat zero curve)
```

- [ ] **Step 5: Commit**

```bash
git add programmer.js
git commit -m "feat: add douglasPeucker, arrayToControlPoints, deriveArray; init controlPoints"
```

---

## Task 2: Update `drawCanvas` to render from `controlPoints`

**Files:**
- Modify: `programmer.js`

Replace the entire `drawCanvas` function. The grid/colors/bezier style are unchanged — only the path source and the addition of control point handle rendering.

- [ ] **Step 1: Replace the entire `drawCanvas` function**

Find the entire `drawCanvas` function (starts with `function drawCanvas(profileIndex) {`, ends with the closing `}` after `ctx.restore();`).

Replace it with:

```javascript
function drawCanvas(profileIndex) {
	const canvas = document.getElementById('editor-canvas-' + (profileIndex + 1));
	if (!canvas) return;
	const ctx = canvas.getContext('2d');
	ctx.save();
	const w = canvas.width;
	const h = canvas.height;
	const profile = activeProfiles[profileIndex];
	const vol = Math.ceil(parseInt(profile.volume));
	const color = PROFILE_COLORS[profileIndex];
	const pts = [...(profile.controlPoints || [{ x: 0, y: 0 }, { x: 1, y: 0 }])].sort((a, b) => a.x - b.x);

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
		if (bar > 0 && bar < 10) {
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

	if (pts.length < 2) { ctx.restore(); return; }

	function cpX(p) { return p.x * w; }
	function cpY(p) { return (1 - p.y) * h; }

	function buildPath() {
		ctx.moveTo(cpX(pts[0]), cpY(pts[0]));
		for (let i = 1; i < pts.length; i++) {
			const x0 = cpX(pts[i - 1]), y0 = cpY(pts[i - 1]);
			const x1 = cpX(pts[i]),     y1 = cpY(pts[i]);
			ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
		}
		ctx.lineTo(cpX(pts[pts.length - 1]), cpY(pts[pts.length - 1]));
	}

	const r = parseInt(color.slice(1, 3), 16);
	const g = parseInt(color.slice(3, 5), 16);
	const b = parseInt(color.slice(5, 7), 16);

	// Fill under curve
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

	// Control point handles
	profile.controlPoints.forEach(function(cp, i) {
		const cx = cp.x * w;
		const cy = (1 - cp.y) * h;
		const radius = i === hoveredPointIndex ? 8 : 5;
		ctx.beginPath();
		ctx.arc(cx, cy, radius, 0, Math.PI * 2);
		ctx.fillStyle = '#fff';
		ctx.fill();
		ctx.strokeStyle = color;
		ctx.lineWidth = 2;
		ctx.stroke();
	});

	ctx.restore();
}
```

- [ ] **Step 2: Open the browser and verify the canvas renders with control points**

Open `OneProfileProgrammer.html`. Expected:
- Canvas shows a flat line at 0 bar with a white circle at each end (the two default control points)
- Grid lines visible
- Pre-infusion zone tint on the left
- No JS errors in console

In the console run:
```javascript
activeProfiles[0].controlPoints.push({x: 0.5, y: 0.8});
drawCanvas(0);
// Expected: curve bows upward to 8 bar at the midpoint
```

- [ ] **Step 3: Commit**

```bash
git add programmer.js
git commit -m "feat: update drawCanvas to render bezier from controlPoints with handles"
```

---

## Task 3: Add edit handlers and replace paint handlers in `addElements`

**Files:**
- Modify: `programmer.js`

Add four new interaction functions and update `addElements` to attach them. Delete the old paint functions.

- [ ] **Step 1: Add `startEdit`, `moveEdit`, `endEdit`, `removePoint` after `drawCanvas`**

Find the line:
```javascript
function applySmoothPaint(profileIndex, centerIdx, value, vol, smothVal) {
```

Replace everything from that line through the closing `}` of `endPaint` (the four functions `applySmoothPaint`, `startPaint`, `continuePaint`, `endPaint`) with:

```javascript
function startEdit(e) {
	const canvas = e.currentTarget;
	const rect = canvas.getBoundingClientRect();
	const scaleX = canvas.width / rect.width;
	const scaleY = canvas.height / rect.height;
	const mx = (e.clientX - rect.left) * scaleX;
	const my = (e.clientY - rect.top) * scaleY;
	const profile = activeProfiles[activeProfileIndex];
	const HIT = 12 * scaleX;

	const idx = profile.controlPoints.findIndex(function(cp) {
		return Math.hypot(cp.x * canvas.width - mx, (1 - cp.y) * canvas.height - my) < HIT;
	});

	if (idx >= 0) {
		draggingPointIndex = idx;
	} else {
		profile.controlPoints.push({
			x: Math.max(0, Math.min(1, mx / canvas.width)),
			y: Math.max(0, Math.min(1, 1 - my / canvas.height)),
		});
		draggingPointIndex = profile.controlPoints.length - 1;
	}

	drawCanvas(activeProfileIndex);
	graphIt(activeProfiles);
}

function moveEdit(e) {
	const canvas = e.currentTarget;
	const rect = canvas.getBoundingClientRect();
	const scaleX = canvas.width / rect.width;
	const scaleY = canvas.height / rect.height;
	const mx = (e.clientX - rect.left) * scaleX;
	const my = (e.clientY - rect.top) * scaleY;
	const profile = activeProfiles[activeProfileIndex];

	if (draggingPointIndex >= 0) {
		profile.controlPoints[draggingPointIndex] = {
			x: Math.max(0, Math.min(1, mx / canvas.width)),
			y: Math.max(0, Math.min(1, 1 - my / canvas.height)),
		};
		drawCanvas(activeProfileIndex);
		graphIt(activeProfiles);
	} else {
		const HIT = 16 * scaleX;
		const prev = hoveredPointIndex;
		hoveredPointIndex = profile.controlPoints.findIndex(function(cp) {
			return Math.hypot(cp.x * canvas.width - mx, (1 - cp.y) * canvas.height - my) < HIT;
		});
		if (hoveredPointIndex !== prev) drawCanvas(activeProfileIndex);
	}
}

function endEdit() {
	draggingPointIndex = -1;
}

function removePoint(e) {
	const canvas = e.currentTarget;
	const rect = canvas.getBoundingClientRect();
	const scaleX = canvas.width / rect.width;
	const scaleY = canvas.height / rect.height;
	const mx = (e.clientX - rect.left) * scaleX;
	const my = (e.clientY - rect.top) * scaleY;
	const profile = activeProfiles[activeProfileIndex];
	if (profile.controlPoints.length <= 2) return;

	const HIT = 12 * scaleX;
	const idx = profile.controlPoints.findIndex(function(cp) {
		return Math.hypot(cp.x * canvas.width - mx, (1 - cp.y) * canvas.height - my) < HIT;
	});

	if (idx >= 0) {
		profile.controlPoints.splice(idx, 1);
		hoveredPointIndex = -1;
		drawCanvas(activeProfileIndex);
		graphIt(activeProfiles);
	}
}
```

- [ ] **Step 2: Update canvas event listeners in `addElements`**

Find inside `addElements`:
```javascript
		canvas.addEventListener('mousedown', startPaint);
		canvas.addEventListener('mousemove', continuePaint);
		canvas.addEventListener('mouseup', endPaint);
		canvas.addEventListener('mouseleave', endPaint);
```

Replace with:
```javascript
		canvas.addEventListener('mousedown', startEdit);
		canvas.addEventListener('mousemove', moveEdit);
		canvas.addEventListener('mouseup', endEdit);
		canvas.addEventListener('mouseleave', endEdit);
		canvas.addEventListener('dblclick', removePoint);
```

- [ ] **Step 3: Open the browser and test edit interaction**

Open `OneProfileProgrammer.html`. Expected:
- Clicking on empty canvas space adds a white dot
- Dragging a dot moves it smoothly; the curve updates live
- Double-clicking a dot removes it
- Cannot reduce below 2 points (double-clicking with only 2 points does nothing)
- Hovering near a point enlarges it to radius 8
- Mini overview on the left updates as you drag

- [ ] **Step 4: Commit**

```bash
git add programmer.js
git commit -m "feat: add bezier edit handlers, replace freehand paint interaction"
```

---

## Task 4: Wire file loading and export

**Files:**
- Modify: `programmer.js`

Three small surgical edits: `handleFiles` calls `arrayToControlPoints` after loading, `writeOut` calls `deriveArray` before exporting, and `profileInputUpdate` no longer zeroes `pressureArray` (that's now `deriveArray`'s job).

- [ ] **Step 1: Update `handleFiles` to call `arrayToControlPoints` for each profile**

Find inside `handleFiles` (inside the `reader.onload` callback):
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

Replace with:
```javascript
		activeProfiles = readProfiles;
		graphIt(activeProfiles);
		for (let i = 0; i < 5; i++) {
			arrayToControlPoints(i);
			document.getElementById('profile-list-name-' + (i + 1)).textContent = activeProfiles[i].name || ('Profile ' + (i + 1));
			document.getElementById('profile-list-vol-' + (i + 1)).textContent = activeProfiles[i].volume + 'ml';
			drawCanvas(i);
		}
		setActiveProfile(activeProfileIndex);
```

- [ ] **Step 2: Update `writeOut` to call `deriveArray` for each profile before export**

Find:
```javascript
function writeOut() {
	console.debug("writing Out");
	let finishedFile = getTextFile(fileVersionValue);
```

Replace with:
```javascript
function writeOut() {
	console.debug("writing Out");
	for (let i = 0; i < 5; i++) deriveArray(i);
	let finishedFile = getTextFile(fileVersionValue);
```

- [ ] **Step 3: Remove the `volLim` pressureArray-zeroing block from `profileInputUpdate`**

Find inside `profileInputUpdate`:
```javascript
	if (volLim) {
		for (let x = volume; x < 240; x++) {
			profile.pressureArray[x] = "0.0";
		}
	}
```

Delete those four lines entirely. `deriveArray` already zeros indices ≥ `vol`, so this block is redundant.

- [ ] **Step 4: Load a profile file and verify it renders correctly**

Drag a `.txt` profile file onto the drop zone. Expected:
- All 5 profile canvases update with the loaded curves
- Each curve shows a small number of control point handles (typically 5–12 dots, not 240)
- Clicking Export downloads a file — verify it has valid pressure values (non-zero where the curve is drawn)
- Switching profiles shows each one's curve independently

- [ ] **Step 5: Commit**

```bash
git add programmer.js
git commit -m "feat: wire arrayToControlPoints on load and deriveArray on export"
```

---

## Task 5: Remove smoothness slider from HTML, CSS, and `DOMContentLoaded`

**Files:**
- Modify: `OneProfileProgrammer.html`
- Modify: `proggStyle.css`
- Modify: `programmer.js`

- [ ] **Step 1: Remove the smoothness control-group from `OneProfileProgrammer.html`**

Find:
```html
        <div class="control-group">
          <span class="control-label">Smoothness</span>
          <input type="range" id="settingNum" value="10" min="1" max="20" step="1">
          <span id="outputFileSmoothness">10</span>
        </div>
```

Delete those five lines entirely.

- [ ] **Step 2: Remove the smoothness CSS rules from `proggStyle.css`**

Find:
```css
#settingNum { width: 100px; accent-color: #1976d2; cursor: pointer; }
#outputFileSmoothness { font-size: 12px; color: #555; font-weight: 600; min-width: 20px; }
```

Delete both lines.

- [ ] **Step 3: Remove the smoothness event listener from `DOMContentLoaded` in `programmer.js`**

Find:
```javascript
	document.getElementById('settingNum').addEventListener('input', function() {
		document.getElementById('outputFileSmoothness').textContent = this.value;
	});
```

Delete those three lines.

- [ ] **Step 4: Full end-to-end test**

Open `OneProfileProgrammer.html`. Verify:
1. No "smoothness" slider visible in the footer — only the file version toggle remains
2. No JS console errors on load
3. Click on a canvas — adds a point, curve updates
4. Drag a point — moves smoothly, mini overview updates live
5. Double-click a point — removes it (minimum 2 enforced)
6. Hover near a point — dot enlarges to show grab target
7. Change profile name/volume in header inputs — profile list updates
8. Click v1 / v2 toggle — buttons highlight correctly
9. Click Export ↓ — file downloads with valid content
10. Drag a `.txt` profile file in — curves load with sparse control points, all 5 profiles display correctly

- [ ] **Step 5: Commit**

```bash
git add OneProfileProgrammer.html proggStyle.css programmer.js
git commit -m "refactor: remove smoothness slider, bezier editor is self-smoothing"
```
