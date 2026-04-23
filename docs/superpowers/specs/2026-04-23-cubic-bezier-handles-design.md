# Cubic Bezier Handle Editor — Design Spec

**Date:** 2026-04-23
**Project:** Crem One Programmer

---

## Overview

Replace the current midpoint-quadratic-bezier (tension point) editor with a standard cubic bezier anchor-and-handle editor. Each anchor point lies on the curve. Two handles extend from each anchor controlling the tangent; handles are always collinear through the anchor (smooth node) but may have different lengths on each side.

Also fixes the pre-infusion zone width from 18 ml to 80 ml.

---

## Data Model

### Control Points

Each point gains two handle offset fields:

```javascript
profile.controlPoints = [
  { x: 0.0,  y: 0.0,  cpx: 0.05, cpy: 0.0 },
  { x: 0.5,  y: 0.8,  cpx: 0.08, cpy: 0.0 },
  { x: 1.0,  y: 0.6,  cpx: 0.0,  cpy: 0.0 },
]
```

- `x, y` — anchor position in normalized space (0–1); the anchor lies **on** the curve
- `cpx, cpy` — out-handle offset in normalized space
- In-handle offset is always `(-cpx, -cpy)` — mirrored, never stored separately
- Out-handle world position: `(x + cpx, y + cpy)`
- In-handle world position: `(x - cpx, y - cpy)`
- First point: only out-handle is used by the curve; last point: only in-handle is used

Default for a new/empty profile: `[{x:0, y:0, cpx:0.15, cpy:0}, {x:1, y:0, cpx:0, cpy:0}]`

### Coordinate Mapping

Unchanged from existing spec:
```
canvasX → x (normalized) = canvasX / canvas.width (CSS px)
canvasY → y (normalized) = 1 - canvasY / canvas.height
```

---

## Rendering (`drawCanvas`)

1. Sort `controlPoints` by x ascending
2. Draw grid, pre-infusion zone (80 ml wide, not 18 ml)
3. Build cubic bezier path:
   ```javascript
   ctx.moveTo(cpX(pts[0]), cpY(pts[0]));
   for (let i = 0; i < pts.length - 1; i++) {
     ctx.bezierCurveTo(
       cpX(pts[i])   + pts[i].cpx   * w,  cpY(pts[i])   - pts[i].cpy   * h,
       cpX(pts[i+1]) - pts[i+1].cpx * w,  cpY(pts[i+1]) + pts[i+1].cpy * h,
       cpX(pts[i+1]), cpY(pts[i+1])
     );
   }
   ```
4. Fill under curve, stroke curve (unchanged style)
5. For the active point (`activePointIndex`), draw handle lines and circles:
   - Thin dashed line from anchor to each handle position
   - Small circle (radius 6) at each handle tip
6. Draw anchor handles: filled circle radius 8 (active/hovered: 12, filled with profile color)

---

## Globals

Replace `draggingPointIndex` and `hoveredPointIndex` with:

```javascript
var activePointIndex = -1;     // point whose handles are shown
var draggingAnchorIndex = -1;  // anchor being dragged
var draggingHandle = null;     // 'in' | 'out' | null — which handle being dragged
var hoveredPointIndex = -1;    // point under cursor (for highlight)
```

---

## Canvas Interaction

| Event | Action |
|-------|--------|
| `mousedown` within 12px of anchor | Set `activePointIndex`, start dragging anchor |
| `mousedown` within 10px of active point's handle circle | Start dragging that handle (`'in'` or `'out'`) |
| `mousedown` on empty space | Add new point with auto handles, set as active, start dragging it |
| `mousemove` dragging anchor | Update `x, y` clamped to [0,1]; keep `cpx, cpy` |
| `mousemove` dragging handle | `cpx = mx_norm - anchor.x`, `cpy = anchor.y - my_norm`; clamp handle length to max 0.5 |
| `mouseup` / `mouseleave` | End drag; re-sort points by x |
| `dblclick` on anchor | Remove point if count > 2; reset `activePointIndex` if it was that point |

Hit-testing uses `scaleX = canvas.width / rect.width` (DPI scaling), same as current code.

---

## Auto-Handle Generation

Used when adding a new point and in `arrayToControlPoints`.

For a point at index `i` in the sorted array of `n` points, compute the Catmull-Rom tangent:

```javascript
function catmullRomHandles(pts, i) {
  const prev = pts[Math.max(0, i - 1)];
  const next = pts[Math.min(pts.length - 1, i + 1)];
  const tx = (next.x - prev.x) / 6;
  const ty = (next.y - prev.y) / 6;
  return { cpx: tx, cpy: ty };
}
```

Dividing by 6 (rather than 2) gives the standard cubic bezier conversion from Catmull-Rom that produces C1-continuous smooth curves.

---

## Curve Sampling (`sampleCurveAtX`)

Replace the current quadratic implementation with cubic bezier sampling:

For each segment between `pts[i]` and `pts[i+1]`:
- `P0 = pts[i]`, `P3 = pts[i+1]`
- `P1 = { x: P0.x + P0.cpx, y: P0.y + P0.cpy }`
- `P2 = { x: P3.x - P3.cpx, y: P3.y - P3.cpy }`

Solve `x(t) = (1-t)³P0x + 3(1-t)²tP1x + 3(1-t)t²P2x + t³P3x = targetX` numerically using bisection (20 iterations), then evaluate `y(t)`.

---

## `deriveArray`

Replace linear interpolation with cubic bezier sampling via `sampleCurveAtX`:

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

---

## `arrayToControlPoints`

Unchanged structure — Douglas-Peucker simplification — but after computing anchor positions, apply `catmullRomHandles` to each point to generate smooth handles:

```javascript
function arrayToControlPoints(profileIndex) {
  // ... existing DP simplification to get anchor positions ...
  const simplified = douglasPeucker(pts, 0.02);
  profile.controlPoints = simplified.map((p, i, arr) => {
    const h = catmullRomHandles(arr, i);
    return { x: p.x, y: p.y, cpx: h.cpx, cpy: h.cpy };
  });
}
```

---

## `emptyProfiles`

Add `cpx`/`cpy` to default control points:
```javascript
controlPoints: [{ x: 0, y: 0, cpx: 0.15, cpy: 0 }, { x: 1, y: 0, cpx: 0, cpy: 0 }]
```

---

## Code Changes Summary

| Item | Change |
|------|--------|
| `profile.controlPoints` | Add `cpx, cpy` fields to each point |
| `emptyProfiles` | Default points include `cpx, cpy` |
| Globals | Replace `draggingPointIndex` with `activePointIndex`, `draggingAnchorIndex`, `draggingHandle` |
| `drawCanvas` | Cubic bezier path; handle lines/circles for active point; pre-infusion 80ml |
| `startEdit` / `moveEdit` / `endEdit` / `removePoint` | Updated hit-testing and drag logic for anchors and handles |
| `sampleCurveAtX` | Rewritten for cubic bezier (bisection solver) |
| `deriveArray` | Uses `sampleCurveAtX` instead of linear interpolation |
| `arrayToControlPoints` | Apply `catmullRomHandles` after DP simplification |
| `catmullRomHandles` | New pure helper function |
