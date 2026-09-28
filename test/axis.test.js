// The volume axis is split in two: pre-infusion always gets the first third of the
// width and extraction the rest, however many millilitres each covers. Curves are
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

console.log('-- the mapping --');
{
	const split = 0.5;
	ok('pre-infusion ends a third of the way across', near(sb.axisToScreen(split, split), 1 / 3));
	ok('  the ends stay put', sb.axisToScreen(0, split) === 0 && near(sb.axisToScreen(1, split), 1));
	ok('  each side is linear', near(sb.axisToScreen(0.25, split), 1 / 6) && near(sb.axisToScreen(0.75, split), 2 / 3));
	let worst = 0;
	for (let i = 0; i <= 100; i++) worst = Math.max(worst, Math.abs(sb.screenToAxis(sb.axisToScreen(i / 100, split), split) - i / 100));
	ok('screen and axis round-trip', worst < 1e-12, worst);
	ok('no pre-infusion leaves the axis linear', sb.axisToScreen(0.3, 0) === 0.3 && sb.screenToAxis(0.3, 0) === 0.3);
	ok('pre-infusion filling the shot leaves it linear', sb.axisToScreen(0.3, 1) === 0.3);
	ok('a longer ghost carries on past the right edge', near(sb.axisToScreen(1.5, split), 1 + (2 / 3)));
}

console.log('\n-- drawing --');
{
	setup();
	const active = render();
	ok('the zone is a third of the width', near(rects[0].w, W / 3), rects[0].w);
	const xs = active.pts.map(p => p.x);
	ok('anchors are drawn through the split axis',
		near(xs[0], 0) && near(xs[1], W / 6) && near(xs[xs.length - 1], W), xs.map(x => x.toFixed(1)).join(','));
	ok('a segment crossing the split is cut there', xs.some(x => near(x, W / 3, 1e-3)), xs.map(x => x.toFixed(1)).join(','));
	ok('  and the anchor past it lands on the extraction side', xs.some(x => near(x, W * 2 / 3)));
	let increasing = true;
	for (let i = 1; i < xs.length; i++) if (!(xs[i] > xs[i - 1])) increasing = false;
	ok('the path only moves rightwards', increasing);
	// The pieces either side of the cut must meet, and meet smoothly: the tangent
	// direction in data space is continuous, so both sides agree on the pressure slope
	// once each is divided by its own zone's stretch.
	const cut = active.pts.findIndex(p => near(p.x, W / 3, 1e-3));
	const before = active.pts[cut], after = active.pts[cut + 1];
	const slopeIn = (before.y - before.c2.y) / ((before.x - before.c2.x) / (1 / 3 / 0.5));
	const slopeOut = (after.c1.y - before.y) / ((after.c1.x - before.x) / (2 / 3 / 0.5));
	ok('  and the two pieces agree on the pressure slope at the cut', near(slopeIn, slopeOut, 1e-6),
		slopeIn.toFixed(4) + ' vs ' + slopeOut.toFixed(4));

	// Gridlines every 24ml: 24ml sits in pre-infusion, 96ml in extraction.
	sb.crosshairX = -1;
	render();
	const grid = lines.filter(l => l.y === H).map(l => l.x);
	ok('gridlines follow the axis', grid.some(x => near(x, (24 / 80) * W / 3)) &&
		grid.some(x => near(x, W / 3 + ((96 - 80) / 80) * W * 2 / 3)), grid.map(x => x.toFixed(1)).join(','));
}

console.log('\n-- pointer --');
{
	setup();
	sb.startEdit(ev(W * 2 / 3, H * 0.2));
	ok('the anchor past the split is grabbed where it is drawn', sb.draggingAnchorIndex === 2, sb.draggingAnchorIndex);
	sb.endEdit(ev(W * 2 / 3, H * 0.2));

	setup();
	sb.startEdit(ev(W / 4, H * 0.9));
	const added = sb.activeProfiles[0].controlPoints[4];
	ok('a point added in the pre-infusion zone gets its millilitre position', added && near(added.x, 0.375), added && added.x);
	sb.endEdit(ev(W / 4, H * 0.9));

	setup();
	sb.moveEdit(ev(1000, H / 2));
	ok('the cursor reads the axis, not the raw pixel', near(sb.crosshairX, 0.5 + (1000 / W - 1 / 3) / (2 / 3) * 0.5), sb.crosshairX);
	ok('  and the readout sits over the pointer', near(parseFloat(tooltip.style.left), 1000), tooltip.style.left);
	ok('  quoting the millilitres there', /\b140 ml/.test(tooltip.textContent), tooltip.textContent);

	// A handle is dragged at its anchor's own scale: 100px out from an extraction-side
	// anchor is 100 / (1200 * 4/3) of the volume.
	setup();
	const cp = sb.activeProfiles[0].controlPoints[2];
	sb.activePointIndex = 2;
	sb.draggingHandle = 'out';
	sb.moveEdit(ev(W * 2 / 3 + 100, (1 - cp.y) * H));
	ok('an out-handle drag is measured on the extraction scale', near(cp.cpxOut, 100 / (W * 4 / 3)), cp.cpxOut);
	sb.draggingHandle = null;
}

console.log(fail === 0 ? '\nall checks passed' : '\n' + fail + ' check(s) failed');
process.exit(fail ? 1 : 0);
