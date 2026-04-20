# UI Redesign & Canvas Editor — Design Spec

**Date:** 2026-04-20  
**Project:** Crem One Programmer  

---

## Overview

Replace the current 1200-slider UI with a clean split-panel layout. The per-profile pressure curve editor becomes a freehand-paint HTML5 canvas. The existing Chart.js overview is kept as a mini panel.

---

## Layout & Structure

The page is a full-viewport split-panel app:

```
┌─────────────────────────────────────────────────────────┐
│  Header: "Crem One Programmer"              [Export ↓]  │
├──────────────────┬──────────────────────────────────────┤
│  LEFT PANEL      │  RIGHT PANEL                         │
│  ─────────────   │  ─────────────────────────────────   │
│  [Drop .txt]     │  Name | Volume | Time | Limit []     │
│                  │  ─────────────────────────────────   │
│  Profile list    │                                       │
│  • P1 ESPRESSO   │        Canvas editor                  │
│  • P2 LUNGO      │        (freehand draw here)           │
│  • P3 FILTER     │                                       │
│  • P4 TEST       │  ─────────────────────────────────   │
│  • P5 EMPTY      │  Smoothness ──●──  Version [v1][v2]  │
│                  │                                       │
│  [Mini overview] │                                       │
└──────────────────┴──────────────────────────────────────┘
```

- **Left panel**: fixed ~300px width, `#fafafa` background, right border separator
  - File drop zone (dashed border, accepts `.txt`)
  - Profile list: 5 items, each with color dot, name, volume. Clicking switches the active profile
  - Mini Chart.js overview at bottom: all 5 curves visible, updates live on every stroke
- **Right panel**: flex-grow, white background
  - Header bar: name input, volume (ml), time (s), "Limit to volume" checkbox
  - Canvas area: fills remaining space, `#f7f9fc` background, rounded border
  - Footer bar: smoothness slider + value display, file version v1/v2 toggle buttons
- **Top header**: white, bottom border, app title left, Export button (blue) right

**Visual style**: clean light UI — white/light gray, `system-ui` font, `#1976d2` blue accent, no shadows except subtle card borders.

---

## Canvas Editor

### Rendering
- One `<canvas>` element per profile, only the active profile's canvas is shown
- Grid: horizontal lines at each bar (0–10), vertical lines at every 24ml; labels on left axis
- Pre-infusion zone: subtle blue tint over first 18ml (fixed ~7.5% of width)
- Pressure curve: drawn as a smooth quadratic bezier path with a semi-transparent fill below it
- Each profile has its own color: `#FFBE86`, `#FFE156`, `#33E9CE`, `#FFB5C2`, `#3777FF`

### Interaction
- **mousedown**: begin paint stroke, record start position
- **mousemove** (while down): map x → volume index, y → pressure value (clamped 0–10), write to `pressureArray`, apply smoothing, redraw
- **mouseup / mouseleave**: end stroke
- Touch events mirrored for mobile compatibility

### Smoothing
Identical algorithm to current slider smoothing: a moving-average window of width `smoothVal * 4` centered on the painted index. Controlled by the smoothness slider (1–20).

### Coordinate mapping
```
volumeIndex = Math.round((mouseX / canvasWidth) * (profile.volume - 1))
pressureValue = (1 - mouseY / canvasHeight) * 10   // clamped [0, 10]
```

---

## Data Flow

1. User drags on canvas → `paintHandler(e)` fires
2. `paintHandler` maps coordinates → writes into `activeProfiles[n].pressureArray`
3. Calls `drawCanvas(n)` → redraws the active profile's canvas
4. Calls `graphIt(activeProfiles)` → updates the mini Chart.js overview
5. On Export click → `writeOut()` reads `activeProfiles` (unchanged logic)
6. On file load → `handleFiles()` reads + interpolates → calls `drawCanvas` for active profile + `graphIt`

---

## Code Changes

### Removed
- All 1200 `<input type="range">` elements (created dynamically in `addElements`)
- `writeranges(profiles)` — no longer needed
- `fixranges()` — no longer needed
- CSS rules: `input[type=range]`, `div[id^="in"]`, `div[id^="vLine"]`, `div[id^="rangeBoxes"]`, `h3[id^="barText"]`, `hr`, `div[id^="infusiondiv"]`
- `#putsDiv` div in HTML

### Added
- Split-panel HTML structure: `#left-panel`, `#right-panel`, `#editor-header`, `#canvas-area`, `#controls-footer`
- Profile list items (`#profile-list`) with color dots, generated dynamically
- One `<canvas id="editor-canvas-N">` per profile, created in `addElements()`
- `drawCanvas(profileIndex)` — renders bezier curve + grid onto the canvas
- `paintHandler(e)` — mousedown/mousemove handler, writes values + triggers redraw
- `setActiveProfile(n)` — switches which profile is shown in the editor, updates list highlight
- File version toggle replaces `<input type="range" id="fileVersion">`

### Unchanged
- `graphIt(profiles)` — mini overview rendering (logic unchanged; `#myChart` canvas moves from `#graphbox` into `#left-panel`)
- `handleFiles(fileList)` — file reading + parsing
- `interpolateProfile` / `interpolateArray` — interpolation logic
- `getTextFile` / `writeOut` — export logic
- `getFileVersion` — minor update to read toggle instead of slider

---

## File Changes

| File | Change |
|------|--------|
| `OneProfileProgrammer.html` | Full restructure to split-panel layout |
| `proggStyle.css` | Replace slider rules with panel/canvas/list styles |
| `programmer.js` | Replace `addElements`/`fixranges`/`writeranges` with canvas setup + paint handlers |
