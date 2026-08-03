// A control point carries separate in- and out-handles. The two share one tangent
// direction, so the curve stays smooth through the anchor, but their lengths are
// independent — a point can be approached gently and left sharply.
//   out handle sits at (x + cpxOut, y + cpyOut)
//   in  handle sits at (x - cpxIn,  y - cpyIn)
// Both offset vectors point the same way; only their magnitudes differ.
function makePoint(x, y, cpx, cpy) {
	return { x: x, y: y, cpxIn: cpx, cpyIn: cpy, cpxOut: cpx, cpyOut: cpy };
}

// The volume axis counts water through the pump, not what lands in the cup: about
// 120ml here is a 36ml double espresso, a ratio of roughly 3.3 to 1. Every millilitre
// below is a pump millilitre; the "out" figures are those divided by 3.3.
//
// Starting profiles, so a first visit opens on something worth looking at instead of
// five flat lines called test1..test5. Stops are (millilitre, bar) pairs read straight
// off the graph; handles are derived the same way an imported file's are.
const PRESET_PROFILES = [
	{
		// The default 9-bar shot: brief low-pressure wetting, quick ramp, long hold.
		name: 'CLASSIC', volume: 120,   // ≈36ml out
		stops: [[0, 2], [20, 3], [35, 9], [90, 9], [119, 7.5]],
	},
	{
		// Shorter and thicker than CLASSIC. It cannot go much below this: the machine
		// pre-infuses for the first 80ml, so a profile shorter than that would be all
		// pre-infusion and no extraction.
		name: 'SHORT', volume: 100,     // ≈30ml out
		stops: [[0, 2], [20, 3], [34, 9.5], [99, 8.5]],
	},
	{
		// Lungo — more water at gentler pressure to avoid stripping the puck.
		name: 'LUNGO', volume: 200,     // ≈60ml out
		stops: [[0, 2], [25, 3], [45, 8], [120, 7], [199, 5.5]],
	},
	{
		// Long, soft pre-infusion before any real pressure. Suits light roasts, which
		// are dense and channel easily if you hit them hard cold.
		name: 'BLOOM', volume: 120,     // ≈36ml out
		stops: [[0, 1.5], [40, 2.5], [55, 8.5], [95, 8], [119, 6.5]],
	},
	{
		// Declining pressure: peak early, then ease off as the puck erodes. The classic
		// lever-machine shape, and forgiving of a coarser grind.
		name: 'DECLINE', volume: 120,   // ≈36ml out
		stops: [[0, 2], [18, 4], [32, 9.5], [60, 8], [90, 6], [119, 4.5]],
	},
];

function presetProfile(preset) {
	const vol = preset.volume;
	const pts = preset.stops.map(function(s) {
		return {
			x: Math.max(0, Math.min(1, s[0] / (vol - 1))),
			y: Math.max(0, Math.min(1, s[1] / 10)),
		};
	});
	const profile = {
		name: preset.name,
		volume: vol,
		time: 0,
		volLim: 0,
		pressureArray: Array(240).fill("0.0"),
		controlPoints: pts.map(function(p, i, arr) {
			const h = catmullRomHandles(arr, i);
			return makePoint(p.x, p.y, h.cpx, h.cpy);
		}),
	};
	enforceMonotonicHandles(profile);
	return profile;
}

function buildPresets() { return PRESET_PROFILES.map(presetProfile); }


var readProfiles = [];
var activeProfiles = buildPresets();



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

function catmullRomHandles(pts, i) {
	const prev = pts[Math.max(0, i - 1)];
	const next = pts[Math.min(pts.length - 1, i + 1)];
	return { cpx: (next.x - prev.x) / 6, cpy: (next.y - prev.y) / 6 };
}

// Smallest x-distance allowed between two anchors, so no volume gets two pressures.
const MIN_X_GAP = 0.004;

// A cubic segment is a function of x only when its control x-coords are ordered
// x0 <= x1 <= x2 <= x3. Otherwise the curve folds back and one volume ends up with
// two pressures. Handles that break the ordering are shrunk along their own
// direction, so the tangent the user drew is kept and only its reach is cut.
function enforceMonotonicHandles(profile) {
	const pts = [...profile.controlPoints].sort((a, b) => a.x - b.x);

	// A handle pointing backwards in x can never be made valid by shrinking. Flatten
	// the tangent to vertical instead, keeping its pressure direction. Both handles
	// are zeroed together so they stay collinear.
	for (const p of pts) {
		if (p.cpxOut < 0 || p.cpxIn < 0) { p.cpxOut = 0; p.cpxIn = 0; }
	}

	// Each segment is governed by its own two handles — the left point's out-handle
	// and the right point's in-handle — and no handle is shared between segments, so
	// a single pass settles it. Scaling a handle preserves its direction, so the
	// tangent stays collinear and the curve stays smooth through the anchor.
	for (let i = 0; i < pts.length - 1; i++) {
		const gap = pts[i + 1].x - pts[i].x;
		const reach = pts[i].cpxOut + pts[i + 1].cpxIn;
		if (reach <= gap || reach === 0) continue;
		const s = gap / reach;
		pts[i].cpxOut *= s;    pts[i].cpyOut *= s;
		pts[i + 1].cpxIn *= s; pts[i + 1].cpyIn *= s;
	}
}

// Keeps an anchor clear of the x it is being dragged toward, so two anchors never
// share a volume (which would read as a vertical jump between two pressures).
function clampAnchorX(profile, point, x) {
	x = Math.max(0, Math.min(1, x));
	let lo = 0, hi = 1;
	for (const p of profile.controlPoints) {
		if (p === point) continue;
		// A tie resolves toward the side the anchor is coming from, so a neighbour
		// parked exactly on an edge can't push it outside the 0–1 range.
		const below = p.x < x || (p.x === x && p.x < point.x);
		if (below) lo = Math.max(lo, p.x + MIN_X_GAP);
		else hi = Math.min(hi, p.x - MIN_X_GAP);
	}
	if (lo > hi) return Math.max(0, Math.min(1, (lo + hi) / 2));
	return Math.max(lo, Math.min(hi, x));
}

function arrayToControlPoints(profileIndex) {
	const profile = activeProfiles[profileIndex];
	const vol = Math.ceil(parseInt(profile.volume));
	if (vol < 2) {
		profile.controlPoints = [makePoint(0, 0, 0.15, 0), makePoint(1, 0, 0, 0)];
		return;
	}
	const pts = [];
	for (let i = 0; i < vol; i++) {
		pts.push({ x: i / (vol - 1), y: Math.max(0, Math.min(1, parseFloat(profile.pressureArray[i]) / 10)) });
	}
	const simplified = douglasPeucker(pts, 0.02);
	profile.controlPoints = simplified.map(function(p, i, arr) {
		const h = catmullRomHandles(arr, i);
		return makePoint(p.x, p.y, h.cpx, h.cpy);
	});
	enforceMonotonicHandles(profile);
}

function deriveArray(profileIndex) {
	const profile = activeProfiles[profileIndex];
	const vol = Math.ceil(parseInt(profile.volume));
	const pts = [...profile.controlPoints].sort((a, b) => a.x - b.x);
	for (let i = 0; i < 240; i++) {
		if (i >= vol) { profile.pressureArray[i] = "0.0"; continue; }
		const t = vol === 1 ? 0 : i / (vol - 1);
		const y = sampleCurveAtX(pts, t);
		profile.pressureArray[i] = String(Math.max(0, Math.min(10, Math.round(y * 100) / 10)));
	}
}

var activeProfileIndex = 0;
const PROFILE_COLORS = ['#FFBE86', '#FFE156', '#33E9CE', '#FFB5C2', '#3777FF'];
var activePointIndex = -1;
var draggingAnchorIndex = -1;
var draggingHandle = null;
var hoveredPointIndex = -1;
var crosshairX = -1;
var fileVersionValue = 2;

function addElements() {
	const profileList = document.getElementById('profile-list');
	const canvasArea = document.getElementById('canvas-area');
	const editorHeader = document.getElementById('editor-header');

	for (let n = 0; n < 5; n++) {
		// Profile list item
		const item = document.createElement('div');
		item.className = 'profile-item' + (n === activeProfileIndex ? ' active' : '');
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
		// Pointer events rather than mouse events so a drag can capture the pointer and
		// survive the cursor leaving the canvas.
		canvas.addEventListener('pointerdown', startEdit);
		canvas.addEventListener('pointermove', moveEdit);
		canvas.addEventListener('pointerup', endEdit);
		canvas.addEventListener('pointercancel', endEdit);
		canvas.addEventListener('pointerleave', hoverOut);
		canvas.addEventListener('dblclick', removePoint);

		const hint = Object.assign(document.createElement('span'), {
			className: 'canvas-hint',
			textContent: lastPointerType === 'touch'
				? 'tap to add · drag to move · double-tap to remove'
				: 'click to add · drag to move · dbl-click to remove',
		});

		const tooltip = Object.assign(document.createElement('div'), {
			className: 'canvas-tooltip',
			id: 'canvas-tooltip-' + (n + 1),
		});

		wrap.appendChild(canvas);
		wrap.appendChild(hint);
		wrap.appendChild(tooltip);
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

function setActiveProfile(n) {
	const previous = activeProfileIndex;
	activeProfileIndex = n;
	activePointIndex = -1;
	draggingAnchorIndex = -1;
	draggingHandle = null;
	hoveredPointIndex = -1;

	for (let i = 0; i < 5; i++) {
		document.getElementById('profile-item-' + (i + 1)).classList.toggle('active', i === n);
		document.getElementById('canvas-wrap-' + (i + 1)).style.display = i === n ? 'flex' : 'none';
	}

	const profile = activeProfiles[n];
	document.getElementById('nameBox').value = profile.name;
	document.getElementById('volBox').value = profile.volume;
	document.getElementById('timeBox').value = profile.time;
	document.getElementById('limCheck').checked = !!profile.volLim;

	// The incoming canvas is shown straight away but rendered from the outgoing
	// profile's axis first, so its opening frame matches the one just hidden and the
	// eased redraws carry it the rest of the way.
	startProfileSwitch(previous, n);
	if (!switchAnim) drawCanvas(n);
}

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
	profile.volLim = volLim ? 1 : 0;

	document.getElementById('timeBox').value = time;

	document.getElementById('profile-list-name-' + (n + 1)).textContent = name || ('Profile ' + (n + 1));
	document.getElementById('profile-list-vol-' + (n + 1)).textContent = volume + 'ml';

	drawCanvas(n);
}

// Which kind of pointer was last used. Seeded from a media query so the very first
// paint on a phone is already finger-sized, then kept current from the events
// themselves — a tablet with a keyboard and a mouse switches back and forth.
var lastPointerType = (typeof window !== 'undefined' && window.matchMedia
	&& window.matchMedia('(pointer: coarse)').matches) ? 'touch' : 'mouse';

// A fingertip covers far more of the screen than a cursor tip, so every hit target
// grows by the same factor on touch, landing near the ~44px target platform
// guidelines ask for.
function touchSized(base) {
	return lastPointerType === 'touch' ? Math.round(base * 1.9) : base;
}

// Shortest a handle knob may be drawn from its anchor, in CSS pixels. Monotonicity
// clamping and flat tangents routinely leave a handle a fraction of a pixel long,
// which buries its knob under the anchor circle where it can't be seen or grabbed.
// The stored handle keeps its true length — only the drawing and the hit-test are
// pushed out to this radius. On touch it has to clear a finger-sized anchor, so the
// two stay separately grabbable.
function minHandleDrawPx() { return lastPointerType === 'touch' ? 46 : 26; }

// Pixel offset of one handle knob from its anchor. Both handles share a tangent
// direction, so either can supply it; a point with no tangent at all falls back to
// the volume axis so it still shows two grabbable knobs.
function handleOffsetPx(cp, which, w, h) {
	let tx = cp.cpxOut, ty = cp.cpyOut;
	if (tx === 0 && ty === 0) { tx = cp.cpxIn; ty = cp.cpyIn; }

	// Normalized offsets scale by w in x and h in y, so the direction has to be taken
	// in pixel space or the knob drifts off the tangent on a non-square canvas.
	let ux = tx * w, uy = -ty * h;
	let dirLen = Math.hypot(ux, uy);
	if (dirLen === 0) { ux = 1; uy = 0; dirLen = 1; }
	ux /= dirLen; uy /= dirLen;

	const ownLen = which === 'out'
		? Math.hypot(cp.cpxOut * w, cp.cpyOut * h)
		: Math.hypot(cp.cpxIn * w, cp.cpyIn * h);
	const len = Math.max(ownLen, minHandleDrawPx());
	const signed = which === 'out' ? len : -len;
	return { dx: ux * signed, dy: uy * signed };
}

// A background profile keeps its own hue so you can tell the lines apart, but blended
// toward grey so it still recedes behind the one being edited. The blend is doing the
// real work: the pale yellow and pink simply vanish on white if you only drop the
// alpha, because they are already near-white to begin with.
// The grey is deliberately neutral rather than the cool grey used elsewhere in the
// UI. Blending toward an even grey shifts every channel by the same amount, so the
// ordering of a colour's channels — which is what your eye reads as its hue — cannot
// flip. A blue-tinted grey pulled the teal's blue past its green and turned it cyan.
const GHOST_GREY = 138;
const GHOST_MIX = 0.68;     // 0 keeps the colour as-is, 1 is fully grey
const GHOST_ALPHA = 0.7;

function hexToRgb(hex) {
	return [1, 3, 5].map(function(i) { return parseInt(hex.slice(i, i + 2), 16); });
}

// Blends a profile colour between its ghost form (emphasis 0) and its full strength
// (emphasis 1). The in-between values are what make a profile switch cross-fade.
function curveColor(hex, emphasis) {
	const rgb = hexToRgb(hex);
	const mix = GHOST_MIX * (1 - emphasis);
	const alpha = GHOST_ALPHA + (1 - GHOST_ALPHA) * emphasis;
	const out = rgb.map(function(v) { return Math.round(v * (1 - mix) + GHOST_GREY * mix); });
	return 'rgba(' + out[0] + ',' + out[1] + ',' + out[2] + ',' + Math.round(alpha * 1000) / 1000 + ')';
}

function ghostColor(hex) { return curveColor(hex, 0); }


// ── Switching profiles ──
//
// The x-axis is measured in the active profile's millilitres, so moving from a 70ml
// profile to a 200ml one rescales every curve at once and the whole graph jumps. The
// axis length and the colour emphasis are eased between the two instead, which reads
// as the graph stretching rather than being cut.

const SWITCH_MS = 280;
var switchAnim = null;   // { fromIndex, toIndex, fromVol, toVol, start }

function nowMs() {
	return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

function prefersReducedMotion() {
	if (typeof window === 'undefined' || !window.matchMedia) return false;
	try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
	catch (e) { return false; }
}

function easeInOut(t) {
	return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function switchProgress() {
	if (!switchAnim) return 1;
	const t = (nowMs() - switchAnim.start) / SWITCH_MS;
	if (t <= 0) return 0;
	return t >= 1 ? 1 : easeInOut(t);
}

function profileVolume(profileIndex) {
	return Math.ceil(parseInt(activeProfiles[profileIndex].volume));
}

// Volume the axis is currently drawn against. Mid-switch this sits between the two
// profiles' volumes, which is what stops the curves snapping to a new scale.
function axisVolume(profileIndex) {
	const vol = profileVolume(profileIndex);
	if (!switchAnim || switchAnim.toIndex !== profileIndex) return vol;
	const p = switchProgress();
	return switchAnim.fromVol + (switchAnim.toVol - switchAnim.fromVol) * p;
}

// How strongly profile `i` is drawn on the canvas belonging to `profileIndex`:
// 1 for the profile being edited, 0 for a background ghost, in between mid-switch.
function profileEmphasis(profileIndex, i) {
	if (!switchAnim || switchAnim.toIndex !== profileIndex) return i === profileIndex ? 1 : 0;
	const p = switchProgress();
	if (i === switchAnim.toIndex) return p;
	if (i === switchAnim.fromIndex) return 1 - p;
	return 0;
}

function startProfileSwitch(fromIndex, toIndex) {
	if (fromIndex === toIndex || fromIndex < 0) return;
	if (prefersReducedMotion()) return;
	// Clicking through the list faster than the transition can finish must pick up from
	// wherever the axis has actually reached. Reading the profile's own volume instead
	// would snap the graph back to a width it had already left.
	const fromVol = switchAnim ? axisVolume(switchAnim.toIndex) : profileVolume(fromIndex);
	switchAnim = {
		fromIndex: fromIndex, toIndex: toIndex,
		fromVol: fromVol, toVol: profileVolume(toIndex),
		start: nowMs(),
	};
	stepProfileSwitch();
}

function stepProfileSwitch() {
	if (!switchAnim) return;
	const index = switchAnim.toIndex;
	// Without a frame source (a test sandbox) there is nothing to animate against, so
	// land on the finished state rather than freezing part-way.
	const canAnimate = typeof requestAnimationFrame === 'function';
	if (!canAnimate || switchProgress() >= 1) {
		switchAnim = null;
		drawCanvas(index);
		return;
	}
	drawCanvas(index);
	requestAnimationFrame(stepProfileSwitch);
}

// Traces one profile's curve into the current path. `k` maps that profile's own
// normalized volume onto the canvas x-axis, which belongs to the profile being
// edited — k is 1 for that one, and the ratio of volumes for a background profile.
function traceProfile(ctx, points, w, h, k) {
	const pts = [...points].sort((a, b) => a.x - b.x);
	if (pts.length < 2) return false;
	ctx.moveTo(pts[0].x * k * w, (1 - pts[0].y) * h);
	for (let i = 0; i < pts.length - 1; i++) {
		const p = pts[i], q = pts[i + 1];
		ctx.bezierCurveTo(
			(p.x + p.cpxOut) * k * w, (1 - p.y - p.cpyOut) * h,
			(q.x - q.cpxIn) * k * w,  (1 - q.y + q.cpyIn) * h,
			q.x * k * w, (1 - q.y) * h
		);
	}
	return true;
}

// Pointer position in CSS pixels plus normalized 0–1 curve space. The canvas backing
// store is devicePixelRatio-scaled, but every hit radius below is a CSS-pixel
// distance, so all hit-testing happens in CSS space.
function pointerPos(e) {
	// dblclick is a MouseEvent and carries no pointerType, so the last one seen stands.
	lastPointerType = e.pointerType || lastPointerType;
	const canvas = e.currentTarget;
	const rect = canvas.getBoundingClientRect();
	const px = e.clientX - rect.left;
	const py = e.clientY - rect.top;
	return {
		canvas: canvas,
		px: px, py: py,
		w: rect.width, h: rect.height,
		touch: lastPointerType === 'touch',
		normX: Math.max(0, Math.min(1, px / rect.width)),
		normY: Math.max(0, Math.min(1, 1 - py / rect.height)),
	};
}

// ── Removing a point ──
//
// On a mouse this is a double-click and the browser tells us so. On touch it can't be:
// `dblclick` is only synthesised from a double-tap at the browser's discretion, and
// suppressing double-tap-to-zoom with touch-action:none is exactly the situation where
// several mobile browsers stop sending it. So touch gets its own detection from the
// pointerdown stream, and the dblclick handler stands down when that has just fired.

// Deliberately more generous than the ~300ms browsers use for double-tap-to-zoom. That
// threshold is tuned to get out of the way of scrolling; this one is a considered action
// aimed at a small target, and there is nothing else a second tap on an already-selected
// point could mean, so erring long costs nothing.
const DOUBLE_TAP_MS = 450;
const DOUBLE_TAP_SLOP = 26;      // CSS px of finger wobble allowed between the two taps

var lastTap = null;              // { index, time, x, y }
var lastTouchRemoveAt = -Infinity;

// Removes an anchor by index. Returns false if it declined — the profile is already at
// its floor of two points, or the index is stale — so a gesture can fall through to
// its normal behaviour instead of silently doing nothing.
function removePointAt(idx) {
	const profile = activeProfiles[activeProfileIndex];
	if (profile.controlPoints.length <= 2) return false;
	if (idx < 0 || idx >= profile.controlPoints.length) return false;

	profile.controlPoints.splice(idx, 1);
	draggingAnchorIndex = -1;
	draggingHandle = null;
	hoveredPointIndex = -1;
	if (activePointIndex === idx) activePointIndex = -1;
	else if (activePointIndex > idx) activePointIndex--;
	// Merging two segments into one only ever widens the gap, so this cannot shrink a
	// handle. It is here so the invariant holds no matter how the points got here.
	enforceMonotonicHandles(profile);
	drawCanvas(activeProfileIndex);
	return true;
}

function drawCanvas(profileIndex) {
	const canvas = document.getElementById('editor-canvas-' + (profileIndex + 1));
	if (!canvas) return;
	const ctx = canvas.getContext('2d');
	const dpr = window.devicePixelRatio || 1;
	const rect = canvas.getBoundingClientRect();
	if (rect.width > 0 && rect.height > 0) {
		canvas.width = Math.round(rect.width * dpr);
		canvas.height = Math.round(rect.height * dpr);
	}
	ctx.save();
	ctx.scale(dpr, dpr);
	const w = Math.round(rect.width) || canvas.width;
	const h = Math.round(rect.height) || canvas.height;
	const profile = activeProfiles[profileIndex];
	// The axis volume is animated during a profile switch; the profile's own volume is
	// still what its labels and readouts are quoted in.
	const vol = axisVolume(profileIndex);
	const ownVol = profileVolume(profileIndex);
	const switching = switchAnim !== null && switchAnim.toIndex === profileIndex;
	const color = PROFILE_COLORS[profileIndex];
	const pts = [...(profile.controlPoints || [{ x: 0, y: 0 }, { x: 1, y: 0 }])].sort((a, b) => a.x - b.x);

	ctx.clearRect(0, 0, w, h);

	// Pre-infusion zone — length is a global setting, purely a drawing guide
	const preW = Math.min(w, (getPreInfusionMl() / vol) * w);
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

	// Zone watermarks — under the curve, skipped when a zone is too narrow to fit
	drawZoneLabel(ctx, 'Pre-infusion', 0, preW, h);
	drawZoneLabel(ctx, 'Extraction', preW, w, h);

	if (pts.length < 2) { ctx.restore(); return; }

	// Every profile goes through one path, weakest first so the one being edited lands
	// on top. Each shares this canvas's millilitre axis rather than being stretched to
	// its width, so pressures line up at the same point of the shot; a longer profile
	// simply runs off the right edge, which is the truthful picture.
	const drawOrder = activeProfiles.map(function(_, i) { return i; })
		.sort(function(a, b) { return profileEmphasis(profileIndex, a) - profileEmphasis(profileIndex, b); });

	ctx.save();
	ctx.lineJoin = 'round';
	ctx.lineCap = 'round';
	for (const i of drawOrder) {
		const other = activeProfiles[i];
		const otherVol = profileVolume(i);
		if (!other.controlPoints || !(otherVol > 1) || !(vol > 1)) continue;
		const emphasis = profileEmphasis(profileIndex, i);
		const k = (otherVol - 1) / (vol - 1);

		if (emphasis > 0) {
			// The fill belongs to the profile being edited, so it fades in with it.
			const rgb = hexToRgb(PROFILE_COLORS[i]);
			ctx.beginPath();
			if (traceProfile(ctx, other.controlPoints, w, h, k)) {
				ctx.lineTo(w, h);
				ctx.lineTo(0, h);
				ctx.closePath();
				ctx.fillStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ','
					+ (0.15 * emphasis).toFixed(3) + ')';
				ctx.fill();
			}
		}

		ctx.strokeStyle = curveColor(PROFILE_COLORS[i], emphasis);
		ctx.lineWidth = 1.5 + emphasis;
		ctx.beginPath();
		if (traceProfile(ctx, other.controlPoints, w, h, k)) ctx.stroke();
	}
	ctx.restore();

	// Anchors, handles and the cursor belong to a settled canvas. Mid-switch the curve
	// is drawn against an axis that is still moving, so they would sit off it.
	if (switching) { ctx.restore(); return; }

	// Vertical cursor at the pointer, with a dot where it crosses the curve. The
	// numeric readout is the tooltip element, pinned to the top of the graph.
	if (crosshairX >= 0) {
		const chx = crosshairX * w;
		const chy = (1 - sampleCurveAtX(pts, crosshairX)) * h;
		ctx.save();
		ctx.strokeStyle = 'rgba(20,30,48,0.3)';
		ctx.lineWidth = 1;
		ctx.setLineDash([3, 4]);
		ctx.beginPath();
		ctx.moveTo(chx, 0);
		ctx.lineTo(chx, h);
		ctx.stroke();
		ctx.setLineDash([]);
		ctx.beginPath();
		ctx.arc(chx, chy, 4, 0, Math.PI * 2);
		ctx.fillStyle = color;
		ctx.fill();
		ctx.strokeStyle = '#fff';
		ctx.lineWidth = 1.5;
		ctx.stroke();
		ctx.restore();
	}

	// Draw bezier handles for active point
	if (activePointIndex >= 0 && activePointIndex < profile.controlPoints.length) {
		const cp = profile.controlPoints[activePointIndex];
		const ax = cp.x * w, ay = (1 - cp.y) * h;
		const outO = handleOffsetPx(cp, 'out', w, h);
		const inO  = handleOffsetPx(cp, 'in', w, h);
		const outHx = ax + outO.dx, outHy = ay + outO.dy;
		const inHx  = ax + inO.dx,  inHy  = ay + inO.dy;

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
	// A label is roughly 90px wide. On a phone that is a quarter of the graph, so a
	// handful of points turns into an unreadable pile — there, only the point being
	// touched is labelled and the rest are read off the vertical cursor instead.
	const labelAll = w >= 520 || profile.controlPoints.length <= 3;
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
		if (!labelAll && !active) return;
		const curveY = sampleCurveAtX(sortedForLabel, cp.x);
		const pressure = (Math.round(curveY * 100) / 10).toFixed(1);
		const volIndex = Math.round(cp.x * (ownVol - 1));
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

	ctx.restore();
}

function startEdit(e) {
	if (e.button !== undefined && e.button !== 0) return;
	const canvas = e.currentTarget;
	// Route every later move and the release to this canvas even once the cursor
	// leaves it, so dragging a point off an edge no longer drops it.
	if (canvas.setPointerCapture && e.pointerId !== undefined) {
		try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* capture unsupported */ }
	}
	const pos = pointerPos(e);
	const profile = activeProfiles[activeProfileIndex];
	const normX = pos.normX, normY = pos.normY;

	// Hit-test the active point's handles first, against where they are actually
	// drawn — a handle clamped to near-zero length still shows a knob further out.
	if (activePointIndex >= 0 && activePointIndex < profile.controlPoints.length) {
		const cp = profile.controlPoints[activePointIndex];
		const ax = cp.x * pos.w, ay = (1 - cp.y) * pos.h;
		const hitR = touchSized(12);
		const hit = ['out', 'in'].find(function(which) {
			const o = handleOffsetPx(cp, which, pos.w, pos.h);
			return Math.hypot(ax + o.dx - pos.px, ay + o.dy - pos.py) < hitR;
		});
		if (hit) {
			draggingHandle = hit;
			drawCanvas(activeProfileIndex);
			return;
		}
	}

	// Hit-test anchors
	const anchorR = touchSized(12);
	const idx = profile.controlPoints.findIndex(function(cp) {
		return Math.hypot(cp.x * pos.w - pos.px, (1 - cp.y) * pos.h - pos.py) < anchorR;
	});

	// Second tap on the same anchor, soon enough and close enough: remove it. Only
	// registered when a tap lands on an existing point, so double-tapping empty space
	// adds a point and then leaves it alone rather than adding and deleting.
	if (idx >= 0 && pos.touch) {
		const now = nowMs();
		const isSecondTap = lastTap
			&& lastTap.index === idx
			&& now - lastTap.time < DOUBLE_TAP_MS
			&& Math.hypot(lastTap.x - pos.px, lastTap.y - pos.py) < DOUBLE_TAP_SLOP;
		if (isSecondTap) {
			lastTap = null;
			if (removePointAt(idx)) {
				lastTouchRemoveAt = now;
				return;
			}
		}
		lastTap = { index: idx, time: now, x: pos.px, y: pos.py };
	}

	if (idx >= 0) {
		activePointIndex = idx;
		draggingAnchorIndex = idx;
	} else {
		// Add new point with auto-computed handles
		const newPt = makePoint(normX, normY, 0, 0);
		newPt.x = clampAnchorX(profile, newPt, normX);
		profile.controlPoints.push(newPt);
		const sorted = [...profile.controlPoints].sort((a, b) => a.x - b.x);
		const pos = sorted.indexOf(newPt);
		const h = catmullRomHandles(sorted, pos);
		newPt.cpxIn = h.cpx; newPt.cpyIn = h.cpy;
		newPt.cpxOut = h.cpx; newPt.cpyOut = h.cpy;
		enforceMonotonicHandles(profile);
		activePointIndex = profile.controlPoints.length - 1;
		draggingAnchorIndex = activePointIndex;
	}

	drawCanvas(activeProfileIndex);
}

const MAX_HANDLE_LEN = 0.5;

// Drags one handle to (normX, normY). The dragged side takes its full new length and
// sets the shared tangent direction; the opposite side keeps its own length and is
// re-aimed along that direction. That keeps the anchor smooth while letting the two
// sides reach different distances.
function dragHandle(cp, which, normX, normY) {
	let dx, dy;
	if (which === 'out') { dx = normX - cp.x; dy = normY - cp.y; }
	else                 { dx = cp.x - normX; dy = cp.y - normY; }

	let len = Math.hypot(dx, dy);
	// A zero-length drag has no direction to derive, so leave the tangent alone.
	if (len === 0) return;
	if (len > MAX_HANDLE_LEN) { dx = (dx / len) * MAX_HANDLE_LEN; dy = (dy / len) * MAX_HANDLE_LEN; len = MAX_HANDLE_LEN; }

	const ux = dx / len, uy = dy / len;
	if (which === 'out') {
		const otherLen = Math.hypot(cp.cpxIn, cp.cpyIn);
		cp.cpxOut = dx; cp.cpyOut = dy;
		cp.cpxIn = ux * otherLen; cp.cpyIn = uy * otherLen;
	} else {
		const otherLen = Math.hypot(cp.cpxOut, cp.cpyOut);
		cp.cpxIn = dx; cp.cpyIn = dy;
		cp.cpxOut = ux * otherLen; cp.cpyOut = uy * otherLen;
	}
}

// Evaluates y of the cubic bezier path at a given normalized x using bisection.
function sampleCurveAtX(sortedPts, tx) {
	const n = sortedPts.length;
	if (n === 1) return sortedPts[0].y;
	if (tx <= sortedPts[0].x) return sortedPts[0].y;
	if (tx >= sortedPts[n - 1].x) return sortedPts[n - 1].y;

	for (let i = 0; i < n - 1; i++) {
		const p0 = sortedPts[i], p3 = sortedPts[i + 1];
		if (tx > p3.x) continue;
		const p1x = p0.x + p0.cpxOut, p1y = p0.y + p0.cpyOut;
		const p2x = p3.x - p3.cpxIn,  p2y = p3.y - p3.cpyIn;
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

// Readout for the vertical cursor. It rides the cursor's x but sits at a fixed height
// on the graph rather than trailing the pointer, so it never covers the curve you are
// reading and never sits under your own hand.
function showTooltip(profileIndex, normX, canvasEl) {
	const tooltip = document.getElementById('canvas-tooltip-' + (profileIndex + 1));
	if (!tooltip) return;
	const profile = activeProfiles[profileIndex];
	const vol = Math.ceil(parseInt(profile.volume));
	const volIndex = Math.round(normX * (vol - 1));
	const sortedPts = [...profile.controlPoints].sort((a, b) => a.x - b.x);
	const curveY = sampleCurveAtX(sortedPts, normX);
	const pressure = Math.round(curveY * 100) / 10;
	tooltip.textContent = pressure.toFixed(1) + ' bar  ·  ' + volIndex + ' ml';
	tooltip.classList.add('visible');

	// Measured after the text is set, so the clamp uses this frame's width.
	const rect = canvasEl.getBoundingClientRect();
	const half = tooltip.offsetWidth / 2;
	const x = Math.max(half + 6, Math.min(rect.width - half - 6, normX * rect.width));
	tooltip.style.left = x + 'px';
}

function hideTooltip(profileIndex) {
	const tooltip = document.getElementById('canvas-tooltip-' + (profileIndex + 1));
	if (tooltip) tooltip.classList.remove('visible');
}

function moveEdit(e) {
	const pos = pointerPos(e);
	const profile = activeProfiles[activeProfileIndex];

	// Once the finger has travelled, this was a drag rather than the first of two taps,
	// so it must not pair up with the next tap into a removal.
	if (lastTap && Math.hypot(lastTap.x - pos.px, lastTap.y - pos.py) >= DOUBLE_TAP_SLOP) {
		lastTap = null;
	}

	if (draggingHandle !== null && activePointIndex >= 0) {
		dragHandle(profile.controlPoints[activePointIndex], draggingHandle, pos.normX, pos.normY);
		enforceMonotonicHandles(profile);
	} else if (draggingAnchorIndex >= 0) {
		const anchor = profile.controlPoints[draggingAnchorIndex];
		anchor.x = clampAnchorX(profile, anchor, pos.normX);
		anchor.y = pos.normY;
		enforceMonotonicHandles(profile);
	} else {
		const hoverR = touchSized(16);
		hoveredPointIndex = profile.controlPoints.findIndex(function(cp) {
			return Math.hypot(cp.x * pos.w - pos.px, (1 - cp.y) * pos.h - pos.py) < hoverR;
		});
	}

	// The vertical cursor tracks every move, so the canvas redraws on every move
	// rather than only when the hovered anchor changes.
	crosshairX = pos.normX;
	drawCanvas(activeProfileIndex);
	showTooltip(activeProfileIndex, pos.normX, pos.canvas);
}

function endEdit(e) {
	const canvas = e && e.currentTarget;
	if (canvas && canvas.releasePointerCapture && e.pointerId !== undefined) {
		try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
	}
	draggingAnchorIndex = -1;
	draggingHandle = null;
	hoveredPointIndex = -1;
	crosshairX = -1;
	hideTooltip(activeProfileIndex);
	drawCanvas(activeProfileIndex);
}

// Clears hover chrome only. An in-progress drag deliberately survives leaving the
// canvas — the pointer is captured, so the release still arrives here.
function hoverOut() {
	if (draggingAnchorIndex >= 0 || draggingHandle !== null) return;
	hoveredPointIndex = -1;
	crosshairX = -1;
	hideTooltip(activeProfileIndex);
	drawCanvas(activeProfileIndex);
}

function removePoint(e) {
	// A touch double-tap has already been dealt with from the pointer stream. Browsers
	// that then also synthesise a dblclick must not take a second point with it.
	if (nowMs() - lastTouchRemoveAt < DOUBLE_TAP_MS * 2) return;

	const pos = pointerPos(e);
	const profile = activeProfiles[activeProfileIndex];
	const removeR = touchSized(12);
	const idx = profile.controlPoints.findIndex(function(cp) {
		return Math.hypot(cp.x * pos.w - pos.px, (1 - cp.y) * pos.h - pos.py) < removeR;
	});
	removePointAt(idx);
}


// A cleared profile is a flat line at 0 bar — the same shape the editor used to start
// from. The name and volume describe the slot on the machine rather than the curve, so
// they are kept; only the pressure is thrown away.
function clearProfile(profileIndex) {
	const profile = activeProfiles[profileIndex];
	profile.controlPoints = [makePoint(0, 0, 0.15, 0), makePoint(1, 0, 0, 0)];
	profile.pressureArray = Array(240).fill("0.0");
	if (profileIndex === activeProfileIndex) {
		activePointIndex = -1;
		draggingAnchorIndex = -1;
		draggingHandle = null;
		hoveredPointIndex = -1;
	}
}

function clearActiveProfile() {
	clearProfile(activeProfileIndex);
	drawCanvas(activeProfileIndex);
}

function clearAllProfiles() {
	for (let i = 0; i < activeProfiles.length; i++) clearProfile(i);
	// Every canvas holds ghosts of the other four, so all five are now stale.
	for (let i = 0; i < activeProfiles.length; i++) drawCanvas(i);
}

function confirmClearActive() {
	const profile = activeProfiles[activeProfileIndex];
	openConfirm({
		title: 'Clear this profile',
		message: 'This flattens ' + (profile.name || 'the current profile') + ' to 0 bar across its '
			+ 'whole volume. Its name and volume are kept. The other four are untouched. '
			+ 'This cannot be undone.',
		confirmLabel: 'Clear profile',
		onConfirm: clearActiveProfile,
	});
}

function confirmClearAll() {
	openConfirm({
		title: 'Clear all profiles',
		message: 'This flattens all five profiles to 0 bar, discarding every curve in the '
			+ 'editor — including any you imported. Names and volumes are kept. '
			+ 'This cannot be undone.',
		confirmLabel: 'Clear all five',
		onConfirm: clearAllProfiles,
	});
}


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



function fixDropAera() {
	var dropArea = document.getElementById('drop-area');

	// Prevent default drag behaviors
	['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
		dropArea.addEventListener(eventName, preventDefaults, false);
		document.body.addEventListener(eventName, preventDefaults, false);
	});

	// Highlight drop area when file is dragged over it
	['dragenter', 'dragover'].forEach(eventName => {
		dropArea.addEventListener(eventName, highlight, false);
	});

	// Unhighlight drop area when file is dragged out of it
	['dragleave', 'drop'].forEach(eventName => {
		dropArea.addEventListener(eventName, unhighlight, false);
	});

	// Handle dropped files
	dropArea.addEventListener('drop', handleDrop, false);

	function preventDefaults(e) {
		e.preventDefault();
		e.stopPropagation();
	}

	function highlight() {
		dropArea.classList.add('highlight');
		// The previous result is about to be replaced, so stop showing it the moment a
		// new file is over the zone.
		setDropStatus('');
	}
	function unhighlight() {
		dropArea.classList.remove('highlight');
	}

	function handleDrop(e) {
		var dt = e.dataTransfer;
		var files = dt.files;

		if (!files || files.length === 0) {
			// Dragging selected text or a link rather than a file lands here.
			setDropStatus('That was not a file. Drop a .txt profile export.', 'error');
			return;
		}
		handleFiles(files);
	}
}


// run after page load
document.addEventListener("DOMContentLoaded", function(event) {
	addElements();
	setActiveProfile(0);

	document.getElementById('ver1').addEventListener('click', function() { setFileVersion(1); });
	document.getElementById('ver2').addEventListener('click', function() { setFileVersion(2); });
	const fileInput = document.getElementById("fileElem");
	fileInput.addEventListener('change', function() { handleFiles(this.files); });

	getFileVersion(2);
	fixDropAera();
	document.getElementById('bigOutButton').addEventListener("click", writeOut);
	document.getElementById('clearButton').addEventListener('click', confirmClearActive);
	document.getElementById('clearAllButton').addEventListener('click', confirmClearAll);
});

// Message under the drop zone. `kind` is one of 'busy', 'ok', 'error' — anything else
// clears it. The element is aria-live, so the outcome reaches a screen reader too.
function setDropStatus(message, kind) {
	const el = document.getElementById('dropStatus');
	if (!el) return;
	el.textContent = message || '';
	el.className = 'drop-status' + (kind ? ' ' + kind : '');
	el.hidden = !message;
}

// Largest plausible profile export is a few tens of kilobytes; anything far past that
// is the wrong file, and reading it as text would be pointless.
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

// Parses a Crem One export into five profiles.
//
// Returns a result object instead of throwing or assigning to globals: the previous
// version indexed straight into the line array, so a truncated file threw a TypeError
// part-way through and a merely malformed one loaded silently as NaN volumes and
// undefined names. Nothing here touches the editor's state, so a file that fails to
// parse leaves the profiles you already had exactly as they were.
function parseProfileFile(text) {
	const lines = text.replaceAll('\n', '').split('\r');
	// Same heuristic the exporter's two formats imply: v1 is 60 steps, v2 is 240.
	const version = lines.length < 400 ? 1 : 2;
	const stride = version < 2 ? 66 : 246;

	// The final block's trailing blank line may be missing, hence the -1.
	if (lines.length < stride * 5 - 1) {
		return { ok: false, error: 'Too short to hold five profiles — expected about '
			+ (stride * 5) + ' lines, found ' + lines.length + '.' };
	}

	const profiles = [];
	for (let i = 0; i < 5; i++) {
		const base = i * stride;
		const nameLine = lines[2 + base] || '';
		const volLine = lines[3 + base] || '';
		const timeLine = lines[4 + base] || '';

		if (!/^NAME:/.test(nameLine) || !/^ML:/.test(volLine)) {
			return { ok: false, error: 'Profile ' + (i + 1) + ' is not laid out as expected. '
				+ 'Is this a Crem One profile export?' };
		}

		const volume = parseInt(volLine.substring(3), 10);
		const time = parseInt(timeLine.substring(5), 10);

		const pressures = [];
		for (let l = 5; l < stride - 1; l++) {
			const raw = lines[l + base];
			const v = parseFloat((raw || '').substring(4));
			if (!isFinite(v)) {
				return { ok: false, error: 'Profile ' + (i + 1) + ' has an unreadable pressure '
					+ 'on line ' + (l + base + 1) + '.' };
			}
			pressures.push(Math.max(0, Math.min(10, v)));
		}

		profiles.push({
			name: nameLine.substring(5).trim(),
			volume: isFinite(volume) ? Math.max(4, Math.min(240, volume)) : 240,
			time: isFinite(time) ? time : 0,
			volLim: 0,
			pressureArray: pressures,
		});
	}
	return { ok: true, version: version, profiles: profiles };
}

// Commits a parsed set of profiles to the editor and redraws everything.
function applyProfiles(profiles) {
	readProfiles = interpolateProfile(profiles, 240);
	activeProfiles = readProfiles;
	for (let i = 0; i < 5; i++) {
		arrayToControlPoints(i);
		document.getElementById('profile-list-name-' + (i + 1)).textContent =
			activeProfiles[i].name || ('Profile ' + (i + 1));
		document.getElementById('profile-list-vol-' + (i + 1)).textContent =
			activeProfiles[i].volume + 'ml';
		drawCanvas(i);
	}
	setActiveProfile(activeProfileIndex);
}

function handleFiles(fileList) {
	if (!fileList || fileList.length === 0) return;
	const file = fileList[0];

	if (file.size > MAX_IMPORT_BYTES) {
		setDropStatus('That file is far too big to be a profile export.', 'error');
		return;
	}

	// A profile file holds all five profiles, so a second file would have nothing left
	// to load into. Say so on the result rather than only while reading, or the notice
	// disappears the moment the import succeeds.
	const extra = fileList.length > 1
		? ' Only the first of ' + fileList.length + ' files was used.' : '';

	setDropStatus('Reading ' + file.name + '…' + extra, 'busy');

	const reader = new FileReader();

	reader.onerror = function() {
		setDropStatus('Could not read ' + file.name + '.', 'error');
	};

	reader.onload = function(e) {
		let result;
		try {
			result = parseProfileFile(e.target.result);
		} catch (err) {
			console.debug('import failed', err);
			result = { ok: false, error: 'That file could not be read as a Crem One profile.' };
		}
		if (!result.ok) {
			// Deliberately leaves the current profiles untouched.
			setDropStatus(result.error, 'error');
			return;
		}
		applyProfiles(result.profiles);
		setDropStatus('Loaded 5 profiles from ' + file.name + ' (v' + result.version + ').'
			+ extra, 'ok');
	};

	reader.readAsText(file);
}

function interpolateProfile(originalProfiles, wantedLenght) {
	for (o = 0; o < 5; o++) {
		const profile = originalProfiles[o].pressureArray;
		newProfile = interpolateArray(profile, wantedLenght);
		originalProfiles[o].pressureArray = newProfile;
	}
	return originalProfiles;
}

function interpolateArray(originalArray, targetLength) {
	const originalLength = originalArray.length;
	const ratio = (originalLength - 1) / (targetLength - 1);
	const interpolatedArray = [];

	for (let i = 0; i < targetLength; i++) {
		const index = i * ratio;
		const lowerIndex = Math.floor(index);
		const upperIndex = Math.ceil(index);

		if (lowerIndex === upperIndex) {
			interpolatedArray.push(originalArray[lowerIndex]);
		} else {
			const lowerValue = originalArray[lowerIndex];
			const upperValue = originalArray[upperIndex];
			const fraction = index - lowerIndex;
			const interpolatedValue = lowerValue + fraction * (upperValue - lowerValue);
			interpolatedArray.push(interpolatedValue);
		}
	}

	return interpolatedArray;
}


function getTextFile(fileVersion = 1) {
	let finFile = "";
	let mlPerStep = 4;
	if (fileVersion == 2) {
		mlPerStep = 1;
		outPutProfiles = interpolateProfile(activeProfiles, 240);
	} else {
		outPutProfiles = interpolateProfile(activeProfiles, 60);
	}
	let steps = Math.floor(240 / mlPerStep);

	for (o = 0; o < 5; o++) {
		let volumeTxt = "";
		let timeTxt = "";
		let start = "TYPE:P\rINDEX: " + o + "\rNAME:" + outPutProfiles[o].name + "\r";
		volumeTxt = "ML:" + String(outPutProfiles[o].volume).padStart(4, " ") + "\r"
		timeTxt = "TIME:" + String(outPutProfiles[o].time).padStart(4, " ") + "\r"
		let arrayTxt = "";
		for (ee = 0; ee < steps; ee++) {
			estring = ee.toString();
			arrayTxt = arrayTxt.concat(estring.padStart(3, " ") + ":" + (parseFloat(outPutProfiles[o].pressureArray[ee]).toFixed(1)).padStart(4, " ") + "\r");
		}
		arrayTxt = arrayTxt.concat("\r\n")
		finFile = finFile.concat(start, volumeTxt, timeTxt, arrayTxt);
	}
	return finFile;
}

function writeOut() {
	console.debug("writing Out");
	for (let i = 0; i < 5; i++) deriveArray(i);
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
