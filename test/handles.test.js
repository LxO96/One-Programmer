// Covers the two interaction changes: handle knobs stay visible and grabbable no
// matter how short the handle is, and the hover readout is a vertical cursor whose
// text is pinned to the graph rather than trailing the pointer.
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = path.join(__dirname, '..');

let lines = [], arcs = [], dashState = [];
function stubCtx() {
	const c = {
		_dash: [],
		save() {}, restore() {}, clearRect() {}, closePath() {}, fill() {}, stroke() {},
		beginPath() {}, bezierCurveTo() {}, roundRect() {}, fillRect() {}, fillText() {},
		scale() {}, translate() {},
		setLineDash(d) { c._dash = d; },
		moveTo(x, y) { c._from = { x, y }; },
		lineTo(x, y) { lines.push({ from: c._from, to: { x, y }, dash: c._dash.slice() }); c._from = { x, y }; },
		arc(x, y, r) { arcs.push({ x, y, r }); },
		measureText: s => ({ width: s.length * 6 }),
		font: '', fillStyle: '', strokeStyle: '', lineWidth: 0, lineJoin: '', lineCap: '',
		textAlign: '', textBaseline: '', letterSpacing: '',
	};
	return c;
}

let ctx = stubCtx();
const W = 1200, H = 400;
const canvas = {
	width: W, height: H,
	getContext: () => ctx,
	getBoundingClientRect: () => ({ width: W, height: H, left: 0, top: 0 }),
	addEventListener() {},
	captured: null,
	setPointerCapture(id) { this.captured = id; },
	releasePointerCapture(id) { this.captured = null; },
};

const tooltip = { textContent: '', style: {}, offsetWidth: 120, classList: {
	_s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
	contains(c) { return this._s.has(c); } } };

const sb = {
	window: { devicePixelRatio: 1, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } },
	document: {
		addEventListener() {}, querySelectorAll: () => [],
		getElementById: id => {
			if (id.startsWith('editor-canvas')) return canvas;
			if (id.startsWith('canvas-tooltip')) return tooltip;
			return null;
		},
	},
	console: { debug() {} },
	Chart: function() {},
};
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(DIR, 'settings.js'), 'utf8'), sb);
vm.runInContext(fs.readFileSync(path.join(DIR, 'programmer.js'), 'utf8'), sb);
sb.graphIt = function() {};
sb.loadSettings();

const P = sb.makePoint;
let fail = 0;
function ok(n, c, d) { if (!c) fail++; console.log((c ? 'PASS  ' : 'FAIL  ') + n + (d !== undefined ? '   -> ' + d : '')); }

const MIN = 26;   // MIN_HANDLE_DRAW_PX
const len = o => Math.hypot(o.dx, o.dy);

// ── handle knobs are always drawn clear of the anchor ──
console.log('\n-- handle visibility --');
{
	// The anchor circle is 12px and a knob is 6px, so anything under 18px overlaps.
	const zero = P(0.5, 0.5, 0, 0);
	const o = sb.handleOffsetPx(zero, 'out', W, H);
	const i = sb.handleOffsetPx(zero, 'in', W, H);
	ok('zero-length handle still gets a visible out knob', len(o) >= MIN - 1e-9, len(o).toFixed(2));
	ok('  and a visible in knob', len(i) >= MIN - 1e-9, len(i).toFixed(2));
	ok('  laid out along the volume axis', Math.abs(o.dy) < 1e-9 && o.dx > 0, o.dx.toFixed(1) + ',' + o.dy.toFixed(1));
	ok('  with the two on opposite sides', Math.sign(o.dx) === -Math.sign(i.dx));
	ok('  and both clear of the anchor circle', len(o) > 18 && len(i) > 18);
}
{
	// A handle squashed by monotonicity clamping: 0.0002 normalized = 0.24px.
	const tiny = P(0.5, 0.5, 0.0002, 0.0002);
	const o = sb.handleOffsetPx(tiny, 'out', W, H);
	ok('sub-pixel handle is pushed out to the minimum', Math.abs(len(o) - MIN) < 1e-6, len(o).toFixed(3));
	// Direction must survive being pushed out: 0.0002*1200 = 0.24 right, 0.0002*400 = 0.08 up.
	const wantAngle = Math.atan2(-0.0002 * H, 0.0002 * W);
	ok('  along its own tangent, not a default', Math.abs(Math.atan2(o.dy, o.dx) - wantAngle) < 1e-9);
}
{
	const big = P(0.5, 0.5, 0.2, 0.1);
	const o = sb.handleOffsetPx(big, 'out', W, H);
	const trueLen = Math.hypot(0.2 * W, 0.1 * H);
	ok('a long handle is drawn at its true length', Math.abs(len(o) - trueLen) < 1e-9, len(o).toFixed(1));
}
{
	// Asymmetric: the long side keeps its length, the short side gets the floor.
	const cp = { x: 0.5, y: 0.5, cpxIn: 0.0001, cpyIn: 0, cpxOut: 0.25, cpyOut: 0 };
	const o = sb.handleOffsetPx(cp, 'out', W, H), i = sb.handleOffsetPx(cp, 'in', W, H);
	ok('long side unaffected by the floor', Math.abs(len(o) - 0.25 * W) < 1e-9, len(o).toFixed(1));
	ok('short side floored', Math.abs(len(i) - MIN) < 1e-6, len(i).toFixed(2));
	ok('  still opposite the long side', Math.sign(i.dx) === -Math.sign(o.dx));
}
{
	// Vertical tangent, the shape enforceMonotonicHandles produces when it flattens.
	const flat = P(0.5, 0.5, 0, 0.3);
	const o = sb.handleOffsetPx(flat, 'out', W, H);
	ok('vertical tangent keeps its true length', Math.abs(len(o) - 0.3 * H) < 1e-9, len(o).toFixed(1));
	ok('  and points straight up', Math.abs(o.dx) < 1e-9 && o.dy < 0, o.dx + ',' + o.dy);
}

// ── the drawn knob is what you grab ──
console.log('\n-- hit-testing the drawn knob --');
{
	const profile = sb.activeProfiles[0];
	profile.controlPoints = [P(0, 0, 0.1, 0), P(0.5, 0.5, 0.00005, 0), P(1, 0, 0.1, 0)];
	sb.activeProfileIndex = 0;
	sb.activePointIndex = 1;
	sb.draggingHandle = null;
	sb.draggingAnchorIndex = -1;

	const ev = (x, y) => ({ currentTarget: canvas, clientX: x, clientY: y, pointerId: 3, button: 0 });
	// Anchor is at (600, 200); the near-zero out handle is drawn 26px to its right.
	sb.startEdit(ev(600 + MIN, 200));
	ok('grabbing a floored out knob starts a handle drag', sb.draggingHandle === 'out', sb.draggingHandle);
	sb.endEdit(ev(600 + MIN, 200));

	sb.activePointIndex = 1;
	sb.startEdit(ev(600 - MIN, 200));
	ok('grabbing the floored in knob starts an in drag', sb.draggingHandle === 'in', sb.draggingHandle);
	sb.endEdit(ev(600 - MIN, 200));

	// Where the handle actually is — right on top of the anchor — must grab the anchor,
	// otherwise the point itself becomes unmovable once its handles collapse.
	sb.activePointIndex = 1;
	sb.startEdit(ev(600, 200));
	ok('the anchor itself is still grabbable', sb.draggingHandle === null && sb.draggingAnchorIndex === 1,
		sb.draggingHandle + '/' + sb.draggingAnchorIndex);
	sb.endEdit(ev(600, 200));
}

// ── vertical cursor ──
console.log('\n-- vertical cursor --');
function render() {
	lines = []; arcs = []; ctx = stubCtx();
	sb.drawCanvas(0);
	// The cursor is the only full-height dashed vertical line.
	return lines.filter(l => l.dash.length && l.from.x === l.to.x && Math.abs(l.to.y - l.from.y) === H);
}
{
	const profile = sb.activeProfiles[0];
	profile.controlPoints = [P(0, 0, 0.1, 0), P(0.5, 0.5, 0.1, 0), P(1, 0, 0.1, 0)];
	sb.activePointIndex = -1;
	sb.crosshairX = -1;

	ok('no cursor drawn when not hovering', render().length === 0);

	const ev = (x, y) => ({ currentTarget: canvas, clientX: x, clientY: y, pointerId: 4 });
	sb.moveEdit(ev(300, 120));
	ok('hovering sets the cursor position', Math.abs(sb.crosshairX - 0.25) < 1e-9, sb.crosshairX);

	const v = render();
	ok('a vertical cursor line is drawn', v.length === 1, v.length);
	ok('  at the pointer x, spanning the full height',
		v[0] && v[0].from.x === 300 && v[0].from.y === 0 && v[0].to.y === H,
		v[0] && JSON.stringify(v[0]));

	// A dot marks where the cursor meets the curve — at the pressure being reported.
	const sorted = [...profile.controlPoints].sort((a, b) => a.x - b.x);
	const wantY = (1 - sb.sampleCurveAtX(sorted, 0.25)) * H;
	const dot = arcs.find(a => Math.abs(a.x - 300) < 1e-9 && a.r === 4);
	ok('a dot marks the curve intersection', !!dot && Math.abs(dot.y - wantY) < 1e-9,
		dot ? dot.y.toFixed(1) + ' vs ' + wantY.toFixed(1) : 'missing');

	// The readout must be independent of pointer y — that is the whole point of the change.
	const at120 = tooltip.style.left;
	sb.moveEdit(ev(300, 20));
	ok('readout text is unchanged by pointer height', tooltip.style.left === at120, tooltip.style.left);
	ok('  and has no y of its own to track', tooltip.style.top === undefined, tooltip.style.top);
	ok('readout follows the cursor x', tooltip.style.left === '300px', tooltip.style.left);
	ok('readout reports bar and ml', /bar.*ml/.test(tooltip.textContent), tooltip.textContent);

	// Clamped at the edges so the box never overflows the canvas.
	sb.moveEdit(ev(2, 200));
	ok('readout clamped at the left edge', parseFloat(tooltip.style.left) >= tooltip.offsetWidth / 2,
		tooltip.style.left);
	sb.moveEdit(ev(W - 2, 200));
	ok('readout clamped at the right edge',
		parseFloat(tooltip.style.left) <= W - tooltip.offsetWidth / 2, tooltip.style.left);

	sb.hoverOut();
	ok('leaving the canvas clears the cursor', sb.crosshairX === -1, sb.crosshairX);
	ok('  and hides the readout', !tooltip.classList.contains('visible'));
	ok('  and stops drawing the line', render().length === 0);

	// A drag in progress keeps the cursor; hoverOut must not steal it.
	sb.moveEdit(ev(600, 100));
	sb.draggingAnchorIndex = 1;
	sb.hoverOut();
	ok('cursor survives hoverOut mid-drag', sb.crosshairX >= 0, sb.crosshairX);
	sb.endEdit(ev(600, 100));
	ok('releasing clears the cursor', sb.crosshairX === -1, sb.crosshairX);
}

console.log(fail === 0 ? '\nall checks passed' : '\n' + fail + ' check(s) failed');
process.exit(fail ? 1 : 0);
