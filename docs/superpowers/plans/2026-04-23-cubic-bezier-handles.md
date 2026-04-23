# Cubic Bezier Handle Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the midpoint-quadratic-bezier tension-point editor with a standard cubic bezier anchor-and-handle editor where anchors lie on the curve and smooth handles control tangents.

**Architecture:** Each `controlPoint` gains `cpx/cpy` (out-handle offset); the in-handle is always `(-cpx, -cpy)`. `drawCanvas` renders cubic bezier segments and draws handle lines/circles for the active point. `sampleCurveAtX` is rewritten with a bisection solver for cubic segments. Interaction is split between anchor dragging and handle dragging via new globals `activePointIndex`, `draggingAnchorIndex`, `draggingHandle`.

**Tech Stack:** Vanilla JS, HTML5 Canvas 2D API. No build tools, no test framework — verification is manual via opening `OneProfileProgrammer.html` in a browser.

---

## File Map

| File | Changes |
|------|---------|
| `programmer.js` | All changes — data model, rendering, interaction, math |

---

### Task 1: Add `catmullRomHandles`, update `emptyProfiles` and `arrayToControlPoints`

**Files:**
- Modify: `programmer.js` lines 1–64

This establishes the new data model. Every control point gets `cpx` and `cpy` fields. `catmullRomHandles` is a pure function that auto-generates smooth handles using the Catmull-Rom tangent formula.

- [ ] **Step 1: Add `catmullRomHandles` after `douglasPeucker`**

In `programmer.js`, after the closing `}` of `douglasPeucker` (currently line 50), insert:

```javascript
function catmullRomHandles(pts, i) {
	const prev = pts[Math.max(0, i - 1)];
	const next = pts[Math.min(pts.length - 1, i + 1)];
	return { cpx: (next.x - prev.x) / 6, cpy: (next.y - prev.y) / 6 };
}
```

- [ ] **Step 2: Update `emptyProfiles` default `controlPoints`**

In `programmer.js` line 9, change:
```javascript
controlPoints: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
```
to:
```javascript
controlPoints: [{ x: 0, y: 0, cpx: 0.15, cpy: 0 }, { x: 1, y: 0, cpx: 0, cpy: 0 }],
```

- [ ] **Step 3: Replace `arrayToControlPoints`**

Replace the entire `arrayToControlPoints` function with:

```javascript
function arrayToControlPoints(profileIndex) {
	const profile = activeProfiles[profileIndex];
	const vol = Math.ceil(parseInt(profile.volume));
	if (vol < 2) {
		profile.controlPoints = [{ x: 0, y: 0, cpx: 0.15, cpy: 0 }, { x: 1, y: 0, cpx: 0, cpy: 0 }];
		return;
	}
	const pts = [];
	for (let i = 0; i < vol; i++) {
		pts.push({ x: i / (vol - 1), y: Math.max(0, Math.min(1, parseFloat(profile.pressureArray[i]) / 10)) });
	}
	const simplified = douglasPeucker(pts, 0.02);
	profile.controlPoints = simplified.map(function(p, i, arr) {
		const h = catmullRomHandles(arr, i);
		return { x: p.x, y: p.y, cpx: h.cpx, cpy: h.cpy };
	});
}
```

- [ ] **Step 4: Verify in browser**

Open `OneProfileProgrammer.html`. Load a profile file. The canvas should render a smooth curve (same as before — nothing looks different yet since drawCanvas still uses the old path). No console errors.

- [ ] **Step 5: Commit**

```bash
git add programmer.js
git commit -m "feat: add catmullRomHandles, add cpx/cpy to control point data model"
```

---

### Task 2: Rewrite `sampleCurveAtX` for cubic bezier + update `deriveArray`

**Files:**
- Modify: `programmer.js` — `sampleCurveAtX` function (lines ~388–433) and `deriveArray` function (lines ~66–81)

`sampleCurveAtX` is used by both the tooltip and `deriveArray`. The new version uses bisection (20 iterations, ~1/1M accuracy) to find parametric `t` where the cubic x(t) = targetX, then evaluates y(t). `deriveArray` switches from linear interpolation to calling `sampleCurveAtX`.

- [ ] **Step 1: Replace `sampleCurveAtX`**

Replace the entire `sampleCurveAtX` function (from `// Evaluates y of the midpoint-quadratic-bezier path` comment through the closing `}`) with:

```javascript
// Evaluates y of the cubic bezier path at a given normalized x using bisection.
function sampleCurveAtX(sortedPts, tx) {
	const n = sortedPts.length;
	if (n === 1) return sortedPts[0].y;
	if (tx <= sortedPts[0].x) return sortedPts[0].y;
	if (tx >= sortedPts[n - 1].x) return sortedPts[n - 1].y;

	for (let i = 0; i < n - 1; i++) {
		const p0 = sortedPts[i], p3 = sortedPts[i + 1];
		if (tx > p3.x) continue;
		const p1x = p0.x + p0.cpx, p1y = p0.y + p0.cpy;
		const p2x = p3.x - p3.cpx, p2y = p3.y - p3.cpy;
		let lo = 0, hi = 1;
		for (let iter = 0; iter < 20; iter++) {
			const t = (lo + hi) / 2;
			const mt = 1 - t;
			const x = mt*mt*mt*p0.x + 3*mt*mt*t*p1x + 3*mt*t*t*p2x + t*t*t*p3.x;
			if (x < tx) lo = t; else hi = t;
		}
		const t = (lo + hi) / 2, mt = 1 - t;
		return mt*mt*mt*p0.y + 3*mt*mt*t*p1y + 3*mt*t*t*p2y + t*t*t*p3.y;
	}
	return sortedPts[n - 1].y;
}
```

- [ ] **Step 2: Replace `deriveArray`**

Replace the entire `deriveArray` function with:

```javascript
function deriveArray(profileIndex) {
	const profile = activeProfiles[profileIndex];
	const vol = Math.ceil(parseInt(profile.volume));
	const pts = [...profile.controlPoints].sort((a, b) => a.x - b.x);
	for (let i = 0; i < 240; i++) {
		if (i >= vol) { profile.pressureArray[i] = "0.0"; continue; }
		const t = vol === 1 ? 0 : i / (vol - 1);
		const y = sampleCurveAtX(pts, t);
		profile.pressureArray[i] = Math.max(0, Math.min(10, Math.round(y * 100) / 10));
	}
}
```

- [ ] **Step 3: Verify in browser**

Open `OneProfileProgrammer.html`. Click "Write out" and confirm no console errors. Tooltip still appears on mousemove. The curve still renders (unchanged rendering for now).

- [ ] **Step 4: Commit**

```bash
git add programmer.js
git commit -m "feat: rewrite sampleCurveAtX for cubic bezier, update deriveArray"
```

---

### Task 3: Update globals and `setActiveProfile`

**Files:**
- Modify: `programmer.js` — globals (~line 85), `setActiveProfile` (~line 178)

Must be done before Task 4 (drawCanvas uses these globals).

- [ ] **Step 1: Replace globals**

Find:
```javascript
var draggingPointIndex = -1;
var hoveredPointIndex = -1;
```
Replace with:
```javascript
var activePointIndex = -1;
var draggingAnchorIndex = -1;
var draggingHandle = null;
var hoveredPointIndex = -1;
```

- [ ] **Step 2: Update `setActiveProfile` to reset new globals**

Find inside `setActiveProfile`:
```javascript
draggingPointIndex = -1;
hoveredPointIndex = -1;
```
Replace with:
```javascript
activePointIndex = -1;
draggingAnchorIndex = -1;
draggingHandle = null;
hoveredPointIndex = -1;
```

- [ ] **Step 3: Verify no console errors**

Open `OneProfileProgrammer.html`. Open browser devtools console. The page should load without any `ReferenceError` for `draggingPointIndex`. The canvas may render incorrectly (that's fine — drawCanvas still references old variable name at this point, which will be fixed in Task 4).

- [ ] **Step 4: Commit**

```bash
git add programmer.js
git commit -m "refactor: replace draggingPointIndex with activePointIndex/draggingAnchorIndex/draggingHandle globals"
```

---

### Task 4: Update `drawCanvas` — cubic path, handle visuals, pre-infusion fix

**Files:**
- Modify: `programmer.js` — `drawCanvas` function (lines ~223–356)

- [ ] **Step 1: Fix pre-infusion zone width**

In `drawCanvas`, find:
```javascript
const preW = Math.min(w, (18 / vol) * w);
```
Replace with:
```javascript
const preW = Math.min(w, (80 / vol) * w);
```

- [ ] **Step 2: Replace `buildPath` with cubic bezier**

Find and replace the entire `buildPath` function inside `drawCanvas`:

Old:
```javascript
function buildPath() {
    ctx.moveTo(cpX(pts[0]), cpY(pts[0]));
    for (let i = 1; i < pts.length; i++) {
        const x0 = cpX(pts[i - 1]), y0 = cpY(pts[i - 1]);
        const x1 = cpX(pts[i]),     y1 = cpY(pts[i]);
        ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    }
    ctx.lineTo(cpX(pts[pts.length - 1]), cpY(pts[pts.length - 1]));
}
```

New:
```javascript
function buildPath() {
    ctx.moveTo(cpX(pts[0]), cpY(pts[0]));
    for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i], q = pts[i + 1];
        ctx.bezierCurveTo(
            cpX(p) + p.cpx * w,  cpY(p) - p.cpy * h,
            cpX(q) - q.cpx * w,  cpY(q) + q.cpy * h,
            cpX(q), cpY(q)
        );
    }
}
```

- [ ] **Step 3: Update anchor handle rendering to use `activePointIndex`**

Find the handle rendering block inside `drawCanvas`:
```javascript
// Control point handles — iterate insertion-order so index i matches hoveredPointIndex
const sortedForLabel = [...profile.controlPoints].sort((a, b) => a.x - b.x);
profile.controlPoints.forEach(function(cp, i) {
    const cx = cp.x * w;
    const cy = (1 - cp.y) * h;
    const active = i === hoveredPointIndex || i === draggingPointIndex;
    const radius = active ? 12 : 8;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = active ? color : '#fff';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Label above handle
    const curveY = sampleCurveAtX(sortedForLabel, cp.x);
    const pressure = (Math.round(curveY * 100) / 10).toFixed(1);
    const volIndex = Math.round(cp.x * (vol - 1));
    const label = pressure + ' bar · ' + volIndex + ' ml';
    const fontSize = 11;
    ctx.font = 'bold ' + fontSize + 'px system-ui, sans-serif';
    const tw = ctx.measureText(label).width;
    const pad = 6;
    const bw = tw + pad * 2;
    const bh = fontSize + pad * 2;
    const bx = Math.max(2, Math.min(w - bw - 2, cx - bw / 2));
    const by = cy - radius - 6 - bh;
    ctx.fillStyle = 'rgba(20,30,48,0.82)';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 5);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + pad, by + bh / 2);
});
```

Replace with:

```javascript
// Draw bezier handles for active point
if (activePointIndex >= 0 && activePointIndex < profile.controlPoints.length) {
    const cp = profile.controlPoints[activePointIndex];
    const ax = cp.x * w, ay = (1 - cp.y) * h;
    const outHx = (cp.x + cp.cpx) * w, outHy = (1 - cp.y - cp.cpy) * h;
    const inHx  = (cp.x - cp.cpx) * w, inHy  = (1 - cp.y + cp.cpy) * h;

    ctx.strokeStyle = 'rgba(180,200,220,0.7)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(inHx, inHy);
    ctx.lineTo(ax, ay);
    ctx.lineTo(outHx, outHy);
    ctx.stroke();
    ctx.setLineDash([]);

    [[outHx, outHy], [inHx, inHy]].forEach(function(h) {
        ctx.beginPath();
        ctx.arc(h[0], h[1], 6, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
    });
}

// Anchor circles and labels — iterate insertion-order so index i matches activePointIndex/hoveredPointIndex
const sortedForLabel = [...profile.controlPoints].sort((a, b) => a.x - b.x);
profile.controlPoints.forEach(function(cp, i) {
    const cx = cp.x * w;
    const cy = (1 - cp.y) * h;
    const active = i === activePointIndex || i === hoveredPointIndex;
    const radius = active ? 12 : 8;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = active ? color : '#fff';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Label above anchor
    const curveY = sampleCurveAtX(sortedForLabel, cp.x);
    const pressure = (Math.round(curveY * 100) / 10).toFixed(1);
    const volIndex = Math.round(cp.x * (vol - 1));
    const label = pressure + ' bar · ' + volIndex + ' ml';
    const fontSize = 11;
    ctx.font = 'bold ' + fontSize + 'px system-ui, sans-serif';
    const tw = ctx.measureText(label).width;
    const pad = 6;
    const bw = tw + pad * 2;
    const bh = fontSize + pad * 2;
    const bx = Math.max(2, Math.min(w - bw - 2, cx - bw / 2));
    const by = cy - radius - 6 - bh;
    ctx.fillStyle = 'rgba(20,30,48,0.82)';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 5);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + pad, by + bh / 2);
});
```

- [ ] **Step 4: Verify in browser**

Open `OneProfileProgrammer.html`. The curve should now render as a smooth cubic bezier. Clicking an anchor should show dashed handle lines with two small circles. The pre-infusion zone should now span the first 80ml of the volume range (roughly 1/3 of a 240ml profile).

- [ ] **Step 5: Commit**

```bash
git add programmer.js
git commit -m "feat: cubic bezier path rendering, handle visuals, fix pre-infusion to 80ml"
```

---

### Task 5: Rewrite interaction handlers

**Files:**
- Modify: `programmer.js` — `startEdit`, `moveEdit`, `endEdit`, `removePoint`

- [ ] **Step 1: Replace `startEdit`**

Replace the entire `startEdit` function with:

```javascript
function startEdit(e) {
	const canvas = e.currentTarget;
	const rect = canvas.getBoundingClientRect();
	const scaleX = canvas.width / rect.width;
	const scaleY = canvas.height / rect.height;
	const mx = (e.clientX - rect.left) * scaleX;
	const my = (e.clientY - rect.top) * scaleY;
	const profile = activeProfiles[activeProfileIndex];
	const normX = Math.max(0, Math.min(1, mx / canvas.width));
	const normY = Math.max(0, Math.min(1, 1 - my / canvas.height));

	// Hit-test active point's handles first
	if (activePointIndex >= 0 && activePointIndex < profile.controlPoints.length) {
		const cp = profile.controlPoints[activePointIndex];
		const outHx = (cp.x + cp.cpx) * canvas.width;
		const outHy = (1 - cp.y - cp.cpy) * canvas.height;
		const inHx  = (cp.x - cp.cpx) * canvas.width;
		const inHy  = (1 - cp.y + cp.cpy) * canvas.height;
		const HIT_H = 10 * scaleX;
		if (Math.hypot(outHx - mx, outHy - my) < HIT_H) {
			draggingHandle = 'out';
			drawCanvas(activeProfileIndex);
			return;
		}
		if (Math.hypot(inHx - mx, inHy - my) < HIT_H) {
			draggingHandle = 'in';
			drawCanvas(activeProfileIndex);
			return;
		}
	}

	// Hit-test anchors
	const HIT = 12 * scaleX;
	const idx = profile.controlPoints.findIndex(function(cp) {
		return Math.hypot(cp.x * canvas.width - mx, (1 - cp.y) * canvas.height - my) < HIT;
	});

	if (idx >= 0) {
		activePointIndex = idx;
		draggingAnchorIndex = idx;
	} else {
		// Add new point with auto-computed handles
		const newPt = { x: normX, y: normY, cpx: 0, cpy: 0 };
		profile.controlPoints.push(newPt);
		const sorted = [...profile.controlPoints].sort((a, b) => a.x - b.x);
		const pos = sorted.indexOf(newPt);
		const h = catmullRomHandles(sorted, pos);
		newPt.cpx = h.cpx;
		newPt.cpy = h.cpy;
		activePointIndex = profile.controlPoints.length - 1;
		draggingAnchorIndex = activePointIndex;
	}

	drawCanvas(activeProfileIndex);
	graphIt(activeProfiles);
}
```

- [ ] **Step 2: Replace `moveEdit`**

Replace the entire `moveEdit` function with:

```javascript
function moveEdit(e) {
	const canvas = e.currentTarget;
	const rect = canvas.getBoundingClientRect();
	const scaleX = canvas.width / rect.width;
	const scaleY = canvas.height / rect.height;
	const mx = (e.clientX - rect.left) * scaleX;
	const my = (e.clientY - rect.top) * scaleY;
	const profile = activeProfiles[activeProfileIndex];
	const normX = Math.max(0, Math.min(1, mx / canvas.width));
	const normY = Math.max(0, Math.min(1, 1 - my / canvas.height));

	if (draggingHandle !== null && activePointIndex >= 0) {
		const cp = profile.controlPoints[activePointIndex];
		if (draggingHandle === 'out') {
			cp.cpx = normX - cp.x;
			cp.cpy = normY - cp.y;
		} else {
			cp.cpx = cp.x - normX;
			cp.cpy = cp.y - normY;
		}
		const len = Math.sqrt(cp.cpx * cp.cpx + cp.cpy * cp.cpy);
		if (len > 0.5) { cp.cpx = (cp.cpx / len) * 0.5; cp.cpy = (cp.cpy / len) * 0.5; }
		drawCanvas(activeProfileIndex);
		graphIt(activeProfiles);
	} else if (draggingAnchorIndex >= 0) {
		profile.controlPoints[draggingAnchorIndex].x = normX;
		profile.controlPoints[draggingAnchorIndex].y = normY;
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

	showTooltip(activeProfileIndex, normX, canvas, e.clientX, e.clientY);
}
```

- [ ] **Step 3: Replace `endEdit`**

Replace the entire `endEdit` function with:

```javascript
function endEdit() {
	draggingAnchorIndex = -1;
	draggingHandle = null;
	hoveredPointIndex = -1;
	activePointIndex = -1;
	hideTooltip(activeProfileIndex);
	drawCanvas(activeProfileIndex);
}
```

- [ ] **Step 4: Replace `removePoint`**

Replace the entire `removePoint` function with:

```javascript
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
		if (activePointIndex === idx) activePointIndex = -1;
		else if (activePointIndex > idx) activePointIndex--;
		drawCanvas(activeProfileIndex);
		graphIt(activeProfiles);
	}
}
```

- [ ] **Step 5: Verify full interaction in browser**

Open `OneProfileProgrammer.html` and test:
- Click empty space → adds anchor, handles auto-generated ✓
- Click anchor → anchor enlarges, dashed handle lines + circles appear ✓
- Drag handle circle → curve reshapes smoothly, opposite handle mirrors ✓
- Drag anchor → moves without losing handle offsets ✓
- Double-click anchor (with 3+ points) → removes it ✓
- Mouse leave → handles disappear ✓
- Switch profile tab → handles cleared ✓
- Load a file → profile renders as cubic bezier with auto-handles ✓
- Write out → exported pressure values match the displayed curve ✓

- [ ] **Step 6: Commit**

```bash
git add programmer.js
git commit -m "feat: cubic bezier anchor-and-handle editor, smooth mirrored handles"
```
