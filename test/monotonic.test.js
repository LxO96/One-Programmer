// Loads the real programmer.js into a stubbed-DOM sandbox and checks that the
// bezier path stays a function of x (one pressure per volume), that asymmetric
// handles work, and that anchors stay distinct.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const SRC = path.join(__dirname, '..', 'programmer.js');

const sandbox = {
	document: { addEventListener() {}, getElementById() { return null; } },
	window: {},
	console: { debug() {} },
	Chart: function() {},
	getPreInfusionMl: () => 80,
	drawZoneLabel: () => false,
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(SRC, 'utf8'), sandbox);
const P = sandbox.makePoint;

// Samples x(t) across every segment; returns the worst backwards step.
function worstBacktrack(points) {
	const pts = [...points].sort((a, b) => a.x - b.x);
	let worst = 0;
	for (let i = 0; i < pts.length - 1; i++) {
		const p0 = pts[i], p3 = pts[i + 1];
		const p1x = p0.x + p0.cpxOut, p2x = p3.x - p3.cpxIn;
		let prev = p0.x;
		for (let s = 1; s <= 200; s++) {
			const t = s / 200, mt = 1 - t;
			const x = mt*mt*mt*p0.x + 3*mt*mt*t*p1x + 3*mt*t*t*p2x + t*t*t*p3.x;
			worst = Math.min(worst, x - prev);
			prev = x;
		}
	}
	return worst;
}

// Handles are collinear when both offset vectors point the same way.
function collinearity(points) {
	let worst = 0;
	for (const p of points) {
		const lo = Math.hypot(p.cpxOut, p.cpyOut), li = Math.hypot(p.cpxIn, p.cpyIn);
		if (lo < 1e-9 || li < 1e-9) continue;
		const cross = (p.cpxOut / lo) * (p.cpyIn / li) - (p.cpyOut / lo) * (p.cpxIn / li);
		const dot   = (p.cpxOut / lo) * (p.cpxIn / li) + (p.cpyOut / lo) * (p.cpyIn / li);
		worst = Math.max(worst, Math.abs(cross), Math.abs(1 - dot));
	}
	return worst;
}

let failures = 0;
function ok(name, cond, detail) {
	if (!cond) failures++;
	console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail !== undefined ? '   -> ' + detail : ''));
}
function check(name, points) {
	const profile = { controlPoints: points };
	sandbox.enforceMonotonicHandles(profile);
	const w = worstBacktrack(profile.controlPoints);
	ok(name, w >= -1e-9, 'worst backwards step ' + w.toExponential(3));
}

// ── monotonicity ──
check('negative out-handle', [P(0, 0.2, -0.3, 0.1), P(1, 0.8, 0.1, 0)]);
check('overshooting handle', [P(0, 0.2, 0.9, 0.3), P(0.3, 0.9, 0.2, 0), P(1, 0.4, 0.1, 0)]);
check('crossed handles', [P(0, 0.1, 0.35, 0.2), P(0.4, 0.7, 0.35, 0.2), P(1, 0.3, 0.05, 0)]);

const tight = [P(0, 0, 0, 0), P(0.9, 0.8, 0, 0), P(0.95, 0.2, 0, 0), P(1, 0.1, 0, 0)];
tight.forEach((p, i) => {
	const h = sandbox.catmullRomHandles(tight, i);
	p.cpxIn = h.cpx; p.cpyIn = h.cpy; p.cpxOut = h.cpx; p.cpyOut = h.cpy;
});
check('uneven spacing from import', tight);

// Asymmetric but collinear, the shape dragHandle actually produces.
function asym(x, y, dirX, dirY, inLen, outLen) {
	const L = Math.hypot(dirX, dirY), ux = dirX / L, uy = dirY / L;
	return { x: x, y: y, cpxIn: ux * inLen, cpyIn: uy * inLen, cpxOut: ux * outLen, cpyOut: uy * outLen };
}

// Asymmetric handles must survive clamping without folding.
check('long in, short out', [
	asym(0, 0.1, 1, 0.6, 0.1, 0.45),
	asym(0.5, 0.9, 1, 0.4, 0.4, 0.02),
	asym(1, 0.2, 1, 0, 0.05, 0.05),
]);

// ── asymmetric handle dragging ──
{
	const cp = P(0.5, 0.5, 0.2, 0);
	sandbox.dragHandle(cp, 'out', 0.8, 0.7);
	const outLen = Math.hypot(cp.cpxOut, cp.cpyOut);
	const inLen = Math.hypot(cp.cpxIn, cp.cpyIn);
	ok('dragging out sets its own length', Math.abs(outLen - Math.hypot(0.3, 0.2)) < 1e-9, outLen);
	ok('opposite handle keeps its length', Math.abs(inLen - 0.2) < 1e-9, inLen);
	ok('lengths are now independent', Math.abs(outLen - inLen) > 1e-6, outLen + ' vs ' + inLen);
	ok('handles stay collinear', collinearity([cp]) < 1e-9, collinearity([cp]));
}
{
	const cp = P(0.5, 0.5, 0.3, 0);
	sandbox.dragHandle(cp, 'in', 0.2, 0.2);
	const inLen = Math.hypot(cp.cpxIn, cp.cpyIn);
	const outLen = Math.hypot(cp.cpxOut, cp.cpyOut);
	ok('dragging in sets its own length', Math.abs(inLen - Math.hypot(0.3, 0.3)) < 1e-9, inLen);
	ok('out handle keeps its length', Math.abs(outLen - 0.3) < 1e-9, outLen);
	ok('handles stay collinear after in-drag', collinearity([cp]) < 1e-9);
}
{
	const cp = P(0.5, 0.5, 0.2, 0);
	sandbox.dragHandle(cp, 'out', 5, 5);
	ok('handle length is capped', Math.hypot(cp.cpxOut, cp.cpyOut) <= 0.5 + 1e-9,
		Math.hypot(cp.cpxOut, cp.cpyOut));
}
{
	const cp = P(0.5, 0.5, 0.2, 0);
	const before = JSON.stringify(cp);
	sandbox.dragHandle(cp, 'out', 0.5, 0.5);   // zero-length drag, no direction
	ok('zero-length drag leaves the tangent alone', JSON.stringify(cp) === before);
}

// Clamping must not break collinearity — it may only shorten handles.
{
	const profile = { controlPoints: [
		asym(0, 0.1, 1, 0.4, 0.1, 0.48),      // out-handle massively overshoots
		asym(0.2, 0.9, 1, 0.3, 0.45, 0.1),    // in-handle overshoots backwards
		asym(1, 0.2, 1, 0.1, 0.05, 0.05),
	] };
	sandbox.enforceMonotonicHandles(profile);
	ok('clamping preserves collinearity', collinearity(profile.controlPoints) < 1e-9,
		collinearity(profile.controlPoints));
	ok('clamping kept the asymmetry',
		Math.abs(Math.hypot(profile.controlPoints[0].cpxOut, profile.controlPoints[0].cpyOut)
			- Math.hypot(profile.controlPoints[0].cpxIn, profile.controlPoints[0].cpyIn)) > 1e-6);
}

// Flattening a backwards-pointing tangent must keep both handles aligned.
{
	const profile = { controlPoints: [
		asym(0, 0.5, -1, 0.5, 0.2, 0.4),      // tangent points backwards in x
		asym(1, 0.5, 1, 0, 0.1, 0.1),
	] };
	sandbox.enforceMonotonicHandles(profile);
	const p = profile.controlPoints[0];
	ok('backwards tangent flattened to vertical', p.cpxOut === 0 && p.cpxIn === 0,
		p.cpxOut + ',' + p.cpxIn);
	ok('flattening preserves collinearity', collinearity(profile.controlPoints) < 1e-9);
	ok('flattening keeps the asymmetry',
		Math.abs(Math.abs(p.cpyOut) - Math.abs(p.cpyIn)) > 1e-6, p.cpyOut + ' vs ' + p.cpyIn);
}

// ── anchor spacing ──
{
	const prof = { controlPoints: [P(0, 0, 0, 0), P(0.5, 0.5, 0, 0), P(1, 0, 0, 0)] };
	let allOk = true;
	for (const target of [1.0, 0.0, 0.5, -0.4, 1.7, 0.502]) {
		const moved = sandbox.clampAnchorX(prof, prof.controlPoints[1], target);
		const gaps = prof.controlPoints.filter(p => p !== prof.controlPoints[1]).map(p => Math.abs(p.x - moved));
		const good = Math.min(...gaps) > 0 && moved >= 0 && moved <= 1;
		if (!good) allOk = false;
		console.log((good ? 'PASS  ' : 'FAIL  ') + 'clampAnchorX  drag to ' + target + ' -> ' + moved);
	}
	if (!allOk) failures++;
}

// ── drag survives leaving the canvas (the "point drops at the top" bug) ──
{
	const canvas = {
		width: 1200, height: 400,
		captured: null,
		setPointerCapture(id) { this.captured = id; },
		releasePointerCapture(id) { if (this.captured !== id) throw new Error('not captured'); this.captured = null; },
		getBoundingClientRect: () => ({ width: 1200, height: 400, left: 0, top: 0 }),
	};
	sandbox.drawCanvas = function() {};
	sandbox.graphIt = function() {};
	sandbox.hideTooltip = function() {};
	sandbox.showTooltip = function() {};
	sandbox.activeProfileIndex = 0;
	const profile = sandbox.activeProfiles[0];
	profile.controlPoints = [P(0, 0, 0.1, 0), P(0.5, 0.5, 0.1, 0), P(1, 0, 0.1, 0)];

	const ev = (x, y) => ({ currentTarget: canvas, clientX: x, clientY: y, pointerId: 7, button: 0 });

	sandbox.startEdit(ev(600, 200));            // grab the middle anchor
	ok('pointer captured on drag start', canvas.captured === 7, canvas.captured);
	ok('anchor grabbed', sandbox.draggingAnchorIndex === 1, sandbox.draggingAnchorIndex);

	sandbox.moveEdit(ev(600, 0));               // drag to the very top
	ok('anchor pinned to top', profile.controlPoints[1].y === 1, profile.controlPoints[1].y);

	sandbox.hoverOut();                         // cursor leaves the canvas
	ok('drag survives leaving the canvas', sandbox.draggingAnchorIndex === 1, sandbox.draggingAnchorIndex);

	sandbox.moveEdit(ev(700, 120));             // come back down, still dragging
	ok('still tracking after re-entry', Math.abs(profile.controlPoints[1].x - 700 / 1200) < 1e-9,
		profile.controlPoints[1].x);
	ok('  and follows y too', Math.abs(profile.controlPoints[1].y - (1 - 120 / 400)) < 1e-9,
		profile.controlPoints[1].y);

	sandbox.endEdit(ev(700, 120));
	ok('capture released on drop', canvas.captured === null, canvas.captured);
	ok('drag cleared on drop', sandbox.draggingAnchorIndex === -1);
	ok('active point kept so handles stay visible', sandbox.activePointIndex === 1, sandbox.activePointIndex);

	// Hover-out with no drag in progress should still clear hover chrome.
	sandbox.hoveredPointIndex = 2;
	sandbox.hoverOut();
	ok('hoverOut clears hover when idle', sandbox.hoveredPointIndex === -1, sandbox.hoveredPointIndex);

	// A non-primary button must not start a drag or capture the pointer.
	canvas.captured = null;
	sandbox.startEdit({ currentTarget: canvas, clientX: 600, clientY: 200, pointerId: 8, button: 2 });
	ok('right-click does not start a drag', canvas.captured === null && sandbox.draggingAnchorIndex === -1);
}

console.log(failures === 0 ? '\nall checks passed' : '\n' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
