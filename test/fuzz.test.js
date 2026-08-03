// Randomized drag sequences through the real clampAnchorX / dragHandle /
// enforceMonotonicHandles, checking the curve never folds and handles stay collinear.
const fs = require('fs'), vm = require('vm'), path = require('path');
const SRC = path.join(__dirname, '..', 'programmer.js');
const sb = {
	document: { addEventListener() {}, getElementById() { return null; } },
	window: {}, console: { debug() {} }, Chart: function() {},
	getPreInfusionMl: () => 80, drawZoneLabel: () => false,
};
vm.createContext(sb);
vm.runInContext(fs.readFileSync(SRC, 'utf8'), sb);
const P = sb.makePoint;

function worst(points) {
	const pts = [...points].sort((a, b) => a.x - b.x);
	let w = 0;
	for (let i = 0; i < pts.length - 1; i++) {
		const p0 = pts[i], p3 = pts[i + 1];
		const p1x = p0.x + p0.cpxOut, p2x = p3.x - p3.cpxIn;
		let prev = p0.x;
		for (let s = 1; s <= 400; s++) {
			const t = s / 400, mt = 1 - t;
			const x = mt*mt*mt*p0.x + 3*mt*mt*t*p1x + 3*mt*t*t*p2x + t*t*t*p3.x;
			w = Math.min(w, x - prev); prev = x;
		}
	}
	return w;
}

// Handles are collinear when their unit vectors are parallel; cross product ~ 0.
function worstCollinearity(points) {
	let worst = 0;
	for (const p of points) {
		const lo = Math.hypot(p.cpxOut, p.cpyOut), li = Math.hypot(p.cpxIn, p.cpyIn);
		if (lo < 1e-9 || li < 1e-9) continue;
		const cross = (p.cpxOut / lo) * (p.cpyIn / li) - (p.cpyOut / lo) * (p.cpxIn / li);
		worst = Math.max(worst, Math.abs(cross));
	}
	return worst;
}

let bad = 0, worstSeen = 0, worstKink = 0, asymSeen = 0, overLong = 0;
for (let trial = 0; trial < 20000; trial++) {
	const n = 2 + Math.floor(Math.random() * 6);
	const prof = { controlPoints: [] };
	for (let i = 0; i < n; i++) prof.controlPoints.push(P(Math.random(), Math.random(), 0, 0));

	for (let k = 0; k < 25; k++) {
		const p = prof.controlPoints[Math.floor(Math.random() * n)];
		if (Math.random() < 0.5) {
			p.x = sb.clampAnchorX(prof, p, Math.random() * 1.4 - 0.2);
			p.y = Math.random();
		} else {
			sb.dragHandle(p, Math.random() < 0.5 ? 'out' : 'in',
				Math.random() * 1.6 - 0.3, Math.random() * 1.6 - 0.3);
		}
		sb.enforceMonotonicHandles(prof);
	}

	worstSeen = Math.min(worstSeen, worst(prof.controlPoints));
	worstKink = Math.max(worstKink, worstCollinearity(prof.controlPoints));
	for (const p of prof.controlPoints) {
		const lo = Math.hypot(p.cpxOut, p.cpyOut), li = Math.hypot(p.cpxIn, p.cpyIn);
		if (Math.abs(lo - li) > 1e-6) asymSeen++;
		if (lo > 0.5 + 1e-9 || li > 0.5 + 1e-9) overLong++;
	}
	const inRange = prof.controlPoints.every(p => p.x >= 0 && p.x <= 1);
	if (worst(prof.controlPoints) < -1e-9 || !inRange) bad++;
}

console.log('trials with a fold or out-of-range anchor:', bad);
console.log('worst backwards step across 20000 trials:', worstSeen);
console.log('worst handle kink (0 = perfectly collinear):', worstKink.toExponential(3));
console.log('handles exceeding the length cap:', overLong);
console.log('points that ended with asymmetric handle lengths:', asymSeen);
process.exit(bad === 0 && worstKink < 1e-9 && overLong === 0 ? 0 : 1);
