# Settings, Zone Labels & Onboarding — Design Spec

**Date:** 2026-07-29
**Project:** Crem One Programmer

---

## Overview

Three related additions:

1. A **settings modal** that makes the pre-infusion length configurable, replacing the hardcoded 80 ml constant in `drawCanvas`.
2. **Transparent zone labels** drawn on the editor canvas, naming the pre-infusion and extraction sections.
3. A **first-run welcome modal** explaining the tool, shown once per browser.

Pre-infusion length is a **global, machine-wide** value shared by all five profiles, not a per-profile field.

### Non-goal: pre-infusion is display-only

The v1 and v2 export formats carry `TYPE`, `INDEX`, `NAME`, `ML`, `TIME` and the pressure array. There is no pre-infusion field. This setting therefore guides *where the user draws* and never reaches the machine. The settings modal says so in its help text, so the value isn't mistaken for exported data.

---

## Component 1: Settings Store (`settings.js`)

`programmer.js` is ~970 lines and owns the curve editor. Settings and overlay chrome are a separate concern and live in a new `settings.js`, loaded **before** `programmer.js` so its `DOMContentLoaded` listener registers first and settings are loaded before the first `drawCanvas`.

### State

```javascript
appSettings = { preInfusionMl: 80 }
```

### Persistence

| Key | Value |
|-----|-------|
| `cremOne.settings` | JSON of `appSettings` |
| `cremOne.welcomeSeen` | `"1"` once the welcome modal is dismissed |

Every `localStorage` access is wrapped in try/catch. The page is opened directly from disk over `file://`, where some browsers treat the origin as opaque and throw on storage access. On any failure the app degrades to in-memory-only settings and keeps working; persistence is never allowed to break the editor.

### Validation

`clampPreInfusion(v)` is the single validation choke point, applied on **load** and on **input**:

- Empty / null / non-numeric → default (80)
- Otherwise rounded and clamped to `[0, 240]`

Clamping on load matters because a corrupt or hand-edited localStorage value would otherwise produce a zone wider than the canvas or a negative fill.

### Interface

```javascript
loadSettings()            // read + validate from storage, called at startup
getPreInfusionMl()        // read
setPreInfusionMl(v)       // validate, store, persist; returns clamped value
hasSeenWelcome()
markWelcomeSeen()
resetWelcome()            // powers "show the intro again"
```

`drawCanvas` calls `getPreInfusionMl()` at its one existing call site (the `preW` line); the literal `80` is removed.

---

## Component 2: Zone Labels

Two watermarks drawn on the canvas: `PRE-INFUSION` over the tinted left zone, `EXTRACTION` over the remainder.

`drawZoneLabel(ctx, text, x0, x1, h)`:

- Uppercase, bold, wide letter-spacing, centred horizontally and vertically in its zone
- `rgba(20, 30, 48, 0.07)` — reads as a watermark, not as content
- Font size scales with zone width, bounded to 11–20 px
- **Skipped when the zone cannot fit the text.** Without this, a 240 ml profile clips `PRE-INFUSION` into an unreadable stub, and at `preInfusionMl = 0` there is no left zone at all — only `EXTRACTION` should draw, spanning the full width.

Drawn after the grid lines and before the curve fill, so the curve always sits on top.

`ctx.letterSpacing` is only supported in newer browsers; where it is absent the property assignment is ignored and the label renders un-spaced. Set before `measureText` so the fit check accounts for it.

---

## Component 3: Modals

One shared backdrop and modal shell in CSS, used by both popups. Markup lives in `OneProfileProgrammer.html`; behaviour in `settings.js`.

Dismissal, for both: ✕ button, primary button, backdrop click, and Escape.

### Settings modal

Opened by a ⚙ icon button placed left of Export in the header.

- One number field: pre-infusion in ml, `min=0 max=240`
- Help text noting the value is a visual guide and is not exported
- A "Show the intro again" link, so the welcome popup isn't a one-shot the user can never get back
- Editing redraws the active canvas live

### Welcome modal

Shown on load when `cremOne.welcomeSeen` is unset. Covers:

- What the tool does — read, edit and export the five machine profiles
- How the graph reads — volume left to right, 0–10 bar bottom to top
- What the two zones mean for the shot — pre-infusion wets the puck at low pressure, extraction is the pressure curve that pulls the shot
- Editor controls — click to add, drag anchors, drag handles to shape, double-click to remove
- Export, and the v1/v2 file version toggle

Dismissing sets the flag.

---

## Redraw Scope

Only the active canvas is redrawn when the setting changes. The other four wrappers are `display:none`, so their `getBoundingClientRect()` is zero-sized and `drawCanvas` already guards against that; `setActiveProfile` redraws on switch.

---

## Testing

The settings store is pure logic and gets the same node sandbox harness used for the bezier monotonicity fix:

- Clamping: negative, over-max, fractional, non-numeric, empty
- Corrupt localStorage JSON recovers to defaults rather than throwing
- A `localStorage` that throws on every access leaves the app on working in-memory defaults
- Welcome flag round-trips, and `resetWelcome` clears it

`drawZoneLabel`'s fit logic is checked against a stub 2D context: label present at a normal width, absent at `preInfusionMl = 0` and at zone widths too narrow for the text.

Modal behaviour and visual placement are verified by opening the page.

---

## Files Touched

| File | Change |
|------|--------|
| `settings.js` | New — settings store, modal wiring, zone label helper |
| `programmer.js` | `drawCanvas` uses `getPreInfusionMl()`, draws zone labels |
| `OneProfileProgrammer.html` | ⚙ button, modal markup, `settings.js` script tag |
| `proggStyle.css` | Backdrop, modal shell, icon button |
