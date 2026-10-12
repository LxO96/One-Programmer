// The volume axis is split in two: pre-infusion always gets the first third of the
// width and extraction the rest, however many millilitres each covers, with the scale
// easing from one to the other rather than kinking at the border. Curves are
// still stored in plain millilitres, so drawing, hit-testing and the cursor must all
// go through the same mapping or they drift apart.
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = path.join(__dirname, '..');

let strokes = [], rects = [], lines = [];
function stubCtx() {
	let cur = null;
	const c = {
		save() {}, restore() {}, clearRect() {}, closePath() {}, fill() {}, fillText() {},
		roundRect() {}, arc() {}, setLineDash() {}, scale() {}, translate() {},
		fillRect(x, y, w, h) { rects.push({ x, y, w, h }); },
		beginPath() { cur = { pts: [] }; },
		moveTo(x, y) { if (cur) cur.pts.push({ x, y }); },
		lineTo(x, y) { if (cur) cur.pts.push({ x, y }); lines.push({ x, y }); },
		bezierCurveTo(a, b, d, e, x, y) { if (cur) cur.pts.push({ x, y, c1: { x: a, y: b }, c2: { x: d, y: e } }); },
		stroke() { if (cur) { cur.width = c.lineWidth; strokes.push(cur); } },
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
	setPointerCapture() {}, releasePointerCapture() {},
};
const tooltip = { textContent: '', style: {}, offsetWidth: 100,
	classList: { add() {}, remove() {}, contains: () => false } };
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
};
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(DIR, 'settings.js'), 'utf8'), sb);
vm.runInContext(fs.readFileSync(path.join(DIR, 'programmer.js'), 'utf8'), sb);
sb.loadSettings();

const P = sb.makePoint;
let fail = 0;
function ok(n, c, d) { if (!c) fail++; console.log((c ? 'PASS  ' : 'FAIL  ') + n + (d !== undefined ? '   -> ' + d : '')); }
const near = (a, b, eps) => Math.abs(a - b) < (eps || 1e-6);

function render() {
	strokes = []; rects = []; lines = []; ctx = stubCtx();
	sb.drawCanvas(0);
	return strokes.find(s => s.width === 2.5);
}
const ev = (x, y) => ({ currentTarget: canvas, clientX: x, clientY: y, pointerId: 1, button: 0, pointerType: 'mouse' });

// 80ml of pre-infusion on a 161ml profile puts the split at exactly half the volume,
// which the axis then squeezes into the first third of the width.
function setup() {
	sb.setPreInfusionMl(80);
	sb.activeProfileIndex = 0;
	sb.activePointIndex = -1;
	sb.draggingAnchorIndex = -1;
	sb.draggingHandle = null;
	sb.crosshairX = -1;
	sb.activeProfiles.forEach(p => { p.volume = 161; });
	sb.activeProfiles[0].controlPoints = [
		P(0, 0.2, 0.05, 0), P(0.25, 0.5, 0.05, 0), P(0.75, 0.8, 0.05, 0), P(1, 0.2, 0.05, 0),
	];
}

// Screen x, in pixels, of a normalized volume on the 161ml axis set up above.
const SPLIT = 0.5;
const toPx = x => sb.axisToScreen(x, SPLIT) * W;

console.log('-- the mapping --');
{
	const split = SPLIT;
	ok('pre-infusion ends a third of the way across', near(sb.axisToScreen(split, split), 1 / 3));
	ok('  the ends stay put', sb.axisToScreen(0, split) === 0 && near(sb.axisToScreen(1, split), 1));
	// Away from the split each zone is evenly scaled: equal steps in, equal steps out.
	const step = x => sb.axisToScreen(x + 0.05, split) - sb.axisToScreen(x, split);
	ok('  the start of pre-infusion is evenly scaled', near(step(0), step(0.1)));
	ok('  the end of extraction is evenly scaled', near(step(0.85), step(0.95)));
	ok('  and pre-infusion is the more squeezed of the two', step(0) < step(0.9));

	// The point of the easing band: the scale never jumps, it only drifts.
	let increasing = true, worstJump = 0;
	for (let i = 1; i <= 1000; i++) {
		const x = i / 1000;
		if (!(sb.axisToScreen(x, split) > sb.axisToScreen(x - 0.001, split))) increasing = false;
		worstJump = Math.max(worstJump, Math.abs(sb.axisSlope(x, split) - sb.axisSlope(x - 0.001, split)));
	}
	ok('the axis only moves rightwards', increasing);
	ok('  and its scale changes gradually, with no kink', worstJump < 0.01, worstJump.toFixed(5));
	let worstSlope = 0;
	for (let i = 1; i < 100; i++) {
		const x = i / 100, e = 1e-6;
		const numeric = (sb.axisToScreen(x + e, split) - sb.axisToScreen(x - e, split)) / (2 * e);
		worstSlope = Math.max(worstSlope, Math.abs(numeric - sb.axisSlope(x, split)));
	}
	ok('  and the reported scale is the axis\'s real one', worstSlope < 1e-5, worstSlope);

	let worst = 0;
	for (let i = 0; i <= 100; i++) worst = Math.max(worst, Math.abs(sb.screenToAxis(sb.axisToScreen(i / 100, split), split) - i / 100));
	ok('screen and axis round-trip', worst < 1e-12, worst);
	ok('no pre-infusion leaves the axis linear', sb.axisToScreen(0.3, 0) === 0.3 && sb.screenToAxis(0.3, 0) === 0.3);
	ok('pre-infusion filling the shot leaves it linear', sb.axisToScreen(0.3, 1) === 0.3);
	ok('a longer ghost carries on past the right edge at the extraction scale',
		near(sb.axisToScreen(1.5, split), 1 + 0.5 * sb.axisSlope(1, split)));

	// Short and long pre-infusions still put the split on the third, with no fold.
	for (const s of [0.05, 0.2, 0.8, 0.95]) {
		let mono = true;
		for (let i = 1; i <= 200; i++) if (!(sb.axisToScreen(i / 200, s) > sb.axisToScreen((i - 1) / 200, s))) mono = false;
		ok('split at ' + s + ' lands on the third and never folds back', near(sb.axisToScreen(s, s), 1 / 3) && mono);
	}
}

console.log('\n-- drawing --');
{
	setup();
	const active = render();
	ok('the zone is a third of the width', near(rects[0].w, W / 3), rects[0].w);
	const xs = active.pts.map(p => p.x);
	ok('anchors are drawn through the axis',
		[0, 0.25, 0.75, 1].every(x => xs.some(px => near(px, toPx(x)))), xs.map(x => x.toFixed(1)).join(','));
	let increasing = true;
	for (let i = 1; i < xs.length; i++) if (!(xs[i] > xs[i - 1])) increasing = false;
	ok('the path only moves rightwards', increasing);

	// Every join between drawn pieces must be smooth: the handles either side of it
	// point in exactly opposite directions.
	let worstTurn = 0;
	for (let i = 1; i < active.pts.length - 1; i++) {
		const p = active.pts[i], n = active.pts[i + 1];
		const ax = p.x - p.c2.x, ay = p.y - p.c2.y, bx = n.c1.x - p.x, by = n.c1.y - p.y;
		if (Math.hypot(ax, ay) === 0 || Math.hypot(bx, by) === 0) continue;
		worstTurn = Math.max(worstTurn, Math.abs(ax * by - ay * bx) / (Math.hypot(ax, ay) * Math.hypot(bx, by)));
	}
	ok('the curve has no corners', worstTurn < 1e-6, worstTurn);

	// And the drawn pieces must sit on the true curve, not merely near their ends.
	const pts = [...sb.activeProfiles[0].controlPoints].sort((a, b) => a.x - b.x);
	let worstPx = 0;
	for (let i = 1; i < active.pts.length; i++) {
		const a = active.pts[i - 1], b = active.pts[i];
		const mx = (a.x + 3 * b.c1.x + 3 * b.c2.x + b.x) / 8, my = (a.y + 3 * b.c1.y + 3 * b.c2.y + b.y) / 8;
		const truth = (1 - sb.sampleCurveAtX(pts, sb.screenToAxis(mx / W, SPLIT))) * H;
		worstPx = Math.max(worstPx, Math.abs(truth - my));
	}
	ok('the drawn curve stays within half a pixel of the real one', worstPx < 0.5, worstPx.toFixed(4) + 'px');

	// Gridlines every 24ml.
	const grid = lines.filter(l => l.y === H).map(l => l.x);
	ok('gridlines follow the axis', [24, 48, 96, 144].every(ml => grid.some(x => near(x, toPx(ml / 160)))),
		grid.map(x => x.toFixed(1)).join(','));
}

console.log('\n-- pointer --');
{
	setup();
	sb.startEdit(ev(toPx(0.75), H * 0.2));
	ok('the anchor past the split is grabbed where it is drawn', sb.draggingAnchorIndex === 2, sb.draggingAnchorIndex);
	sb.endEdit(ev(toPx(0.75), H * 0.2));

	setup();
	sb.startEdit(ev(W / 4, H * 0.9));
	const added = sb.activeProfiles[0].controlPoints[4];
	ok('a point added on the graph gets the millilitre position under the pointer',
		added && near(toPx(added.x), W / 4), added && added.x);
	sb.endEdit(ev(W / 4, H * 0.9));

	setup();
	sb.moveEdit(ev(1000, H / 2));
	ok('the cursor reads the axis, not the raw pixel', near(toPx(sb.crosshairX), 1000), sb.crosshairX);
	ok('  and the readout sits over the pointer', near(parseFloat(tooltip.style.left), 1000), tooltip.style.left);
	ok('  quoting the millilitres there', tooltip.textContent.includes(Math.round(sb.crosshairX * 160) + ' ml'), tooltip.textContent);

	// A handle is dragged at its anchor's own scale.
	setup();
	const cp = sb.activeProfiles[0].controlPoints[2];
	sb.activePointIndex = 2;
	sb.draggingHandle = 'out';
	sb.moveEdit(ev(toPx(0.75) + 100, (1 - cp.y) * H));
	ok('a handle drag is measured at its anchor\'s scale', near(cp.cpxOut, 100 / (W * sb.axisSlope(0.75, SPLIT))), cp.cpxOut);
	sb.draggingHandle = null;
}

console.log('\n-- squeeze turned off --');
{
	setup();
	sb.setSqueezePreInfusion(false);
	const active = render();
	ok('the zone goes back to its millilitre width', near(rects[0].w, W * 80 / 160), rects[0].w);
	const xs = active.pts.map(p => p.x);
	ok('anchors are drawn on a plain linear axis',
		[0, 0.25, 0.75, 1].every(x => xs.some(px => near(px, x * W))), xs.map(x => x.toFixed(1)).join(','));
	ok('  each segment as a single curve again', active.pts.length === 4, active.pts.length);
	sb.moveEdit(ev(1000, H / 2));
	ok('the cursor reads the raw pixel', near(sb.crosshairX, 1000 / W), sb.crosshairX);
	sb.startEdit(ev(0.75 * W, H * 0.2));
	ok('anchors are grabbed at their linear position', sb.draggingAnchorIndex === 2, sb.draggingAnchorIndex);
	sb.endEdit(ev(0.75 * W, H * 0.2));

	sb.setSqueezePreInfusion(true);
	render();
	ok('turning it back on restores the third', near(rects[0].w, W / 3), rects[0].w);
}

console.log(fail === 0 ? '\nall checks passed' : '\n' + fail + ' check(s) failed');
process.exit(fail ? 1 : 0);
