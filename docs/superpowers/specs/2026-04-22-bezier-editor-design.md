# Bezier Control Point Editor — Design Spec

**Date:** 2026-04-22
**Project:** Crem One Programmer

---

## Overview

Replace the freehand-paint canvas interaction with a sparse control point bezier editor. Users add, drag, and remove control points; the curve is rendered as a smooth bezier path through those points. The underlying `pressureArray[240]` becomes a derived/export-only value computed from control points on demand.

---

## Data Model

### Control Points

Each profile gains a `controlPoints` array:

```javascript
profile.controlPoints = [
  { x: 0.0, y: 0.0 },  // x: normalized volume (0–1), y: normalized pressure (0–1)
  { x: 1.0, y: 0.0 },
]
```

- **x** maps to volume position: `volIndex = x * (profile.volume - 1)`
- **y** maps to pressure: `pressure = y * 10`
- Always sorted by x before rendering and deriving the array
- Minimum 2 points enforced (cannot remove below 2)
- Default state for a new/empty profile: `[{x:0,y:0}, {x:1,y:0}]` (flat zero line)

### pressureArray

`pressureArray[240]` is no longer the primary source of truth. It is populated only when needed for export (inside `writeOut` / `getTextFile`). `drawCanvas` reads from `controlPoints` directly.

A helper `deriveArray(profileIndex)` fills `pressureArray` by interpolating the control points over `profile.volume` samples.

---

## Coordinate Mapping

```
canvasX → x (normalized) = canvasX / canvas.width
canvasY → y (normalized) = 1 - canvasY / canvas.height   // flipped: top = 10 bar

volIndex = Math.round(x * (vol - 1))
pressure = y * 10   // clamped [0, 10]
```

Reverse mapping (for hit-testing control points):
```
canvasX = cp.x * canvas.width
canvasY = (1 - cp.y) * canvas.height
```

---

## Canvas Interaction

### Mouse events (replacing paint handlers)

| Event | Action |
|-------|--------|
| `mousedown` on empty space | Add new control point at cursor; begin dragging it |
| `mousedown` on existing point | Begin dragging that point |
| `mousemove` (dragging) | Move dragged point to cursor, clamped to canvas bounds |
| `mouseup` / `mouseleave` | End drag; re-sort points by x |
| `dblclick` on existing point | Remove point (if count > 2) |

### Hit radius

A point is "hit" if the cursor is within 12px (CSS pixels, scaled to canvas DPI).

### Hover highlight

On `mousemove` (not dragging), find the nearest point within 16px. If found, redraw with that point enlarged (radius 8 vs 5) to indicate it is grabbable.

---

## Rendering (`drawCanvas`)

`drawCanvas(profileIndex)` is updated to build the bezier path from `controlPoints` instead of `pressureArray`:

1. Sort `controlPoints` by x ascending
2. Draw grid and pre-infusion zone (unchanged)
3. Build midpoint bezier path through the sorted points (same algorithm as current — quadratic bezier between consecutive midpoints)
4. Fill under the curve, stroke the curve (unchanged colors/style)
5. Draw control point handles: filled white circle, colored stroke, radius 5 (or 8 if hovered)

---

## Deriving pressureArray

```javascript
function deriveArray(profileIndex) {
  const profile = activeProfiles[profileIndex];
  const vol = Math.ceil(parseInt(profile.volume));
  const pts = [...profile.controlPoints].sort((a, b) => a.x - b.x);
  for (let i = 0; i < 240; i++) {
    const t = (i / (vol - 1));  // normalized position for this index
    profile.pressureArray[i] = interpolateCurve(pts, t) * 10;
  }
}
```

`interpolateCurve(pts, t)` linearly interpolates between the two bracketing control points (simple lerp is sufficient since the visual rendering already uses bezier smoothing).

---

## File Loading

When `handleFiles()` loads a profile, `pressureArray` is populated from the file. After loading, call `arrayToControlPoints(profileIndex)` to generate sparse control points using Douglas-Peucker simplification:

```javascript
function arrayToControlPoints(profileIndex) {
  const profile = activeProfiles[profileIndex];
  const vol = Math.ceil(parseInt(profile.volume));
  const pts = [];
  for (let i = 0; i < vol; i++) {
    pts.push({ x: i / (vol - 1), y: parseFloat(profile.pressureArray[i]) / 10 });
  }
  profile.controlPoints = douglasPeucker(pts, 0.02);  // epsilon = 0.02 (2% of range)
  // Always keep first and last point
}
```

Douglas-Peucker reduces ~240 points to typically 5–12 control points that faithfully represent the loaded curve.

---

## Code Changes

### Removed
- `startPaint(e)`, `continuePaint(e)`, `endPaint()`, `applySmoothPaint()` — replaced by edit handlers
- `settingNum` range input and `outputFileSmoothness` span from HTML
- `.control-group` for Smoothness from CSS
- Smoothness `input` event listener from `DOMContentLoaded`
- `var lastPaintValue`, `var isPainting` globals (replaced with `var draggingPointIndex = -1`, `var hoveredPointIndex = -1`)
- `var lastPaintIndex` global — removed
- `var fileVersionValue` — kept, smoothness global `smothVal` pattern removed

### Added
- `profile.controlPoints` array initialized in `emptyProfiles`
- `startEdit(e)`, `moveEdit(e)`, `endEdit()` — canvas mouse handlers
- `deriveArray(profileIndex)` — fills `pressureArray` from `controlPoints`
- `arrayToControlPoints(profileIndex)` — converts loaded array to sparse control points (Douglas-Peucker)
- `douglasPeucker(pts, epsilon)` — pure function, returns simplified point array

### Modified
- `drawCanvas(profileIndex)` — builds path from `controlPoints` instead of `pressureArray`; draws control point handles; highlights hovered point
- `addElements()` — attach `startEdit`/`moveEdit`/`endEdit` instead of paint handlers; remove smoothness listener
- `DOMContentLoaded` — remove smoothness slider wiring
- `handleFiles()` — call `arrayToControlPoints(i)` for each profile after loading
- `writeOut()` — call `deriveArray(i)` for each profile before `getTextFile()`
- `profileInputUpdate()` — no longer zeroes `pressureArray` on volLim; control points are already normalized so they stay valid when volume changes
- `OneProfileProgrammer.html` — remove smoothness `control-group` div
- `proggStyle.css` — remove `#settingNum` and `#outputFileSmoothness` rules

### Unchanged
- `drawCanvas` grid/color/bezier path style
- `setActiveProfile`, `profileInputUpdate` (mostly)
- `graphIt`, `handleFiles` (structure), `getTextFile`, `getFileVersion`, `setFileVersion`, `writeOut` (structure)
- `fixDropAera`, `interpolateProfile`, `interpolateArray`

---

## File Changes

| File | Change |
|------|--------|
| `programmer.js` | Replace paint handlers with edit handlers; add `deriveArray`, `arrayToControlPoints`, `douglasPeucker`; update `drawCanvas`, `addElements`, `DOMContentLoaded`, `handleFiles`, `writeOut` |
| `OneProfileProgrammer.html` | Remove smoothness `control-group` div |
| `proggStyle.css` | Remove `#settingNum` and `#outputFileSmoothness` CSS rules |
