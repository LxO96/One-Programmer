// The Chart.js overview panel is gone; the other four profiles are now drawn greyed
// out behind the one being edited. They must line up by millilitre, not be stretched
// to the canvas width, and must never interfere with editing the active profile.
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = path.join(__dirname, '..');

let strokes = [];   // one entry per stroke(), holding the path built for it
function stubCtx() {
	let cur = null;
	const c = {
		save() {}, restore() {}, clearRect() {}, closePath() {}, fill() {}, fillRect() {},
		fillText() {}, roundRect() {}, arc() {}, setLineDash() {}, scale() {}, translate() {},
		beginPath() { cur = { pts: [], style: null, width: null }; },
		moveTo(x, y) { if (cur) cur.pts.push({ x, y }); },
		lineTo(x, y) { if (cur) cur.pts.push({ x, y }); },
		bezierCurveTo(a, b, d, e, x, y) { if (cur) cur.pts.push({ x, y }); },
		stroke() { if (cur) { cur.style = c.strokeStyle; cur.width = c.lineWidth; strokes.push(cur); } },
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
};
const sb = {
	window: { devicePixelRatio: 1, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } },
	document: {
		addEventListener() {}, querySelectorAll: () => [],
		getElementById: id => (id.startsWith('editor-canvas') ? canvas : null),
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

// Each background profile now keeps a muted version of its own colour, so the set of
// ghost styles is derived from the source rather than pinned to one grey.
const PROFILE_COLORS = vm.runInContext('PROFILE_COLORS', sb);
const GHOST_STYLES = PROFILE_COLORS.map(c => sb.ghostColor(c));
const isGhost = s => GHOST_STYLES.includes(s.style);

function rgba(str) {
	const m = str.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
	return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
}
function hexRgb(hex) {
	return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
}
// Distance from the grey axis — how much colour a value still carries.
function chroma(c) { return Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b); }

function render(idx) {
	strokes = []; ctx = stubCtx();
	sb.drawCanvas(idx);
	return {
		ghosts: strokes.filter(isGhost),
		others: strokes.filter(s => !isGhost(s)),
	};
}

// Give each profile a distinct shape so a stretched ghost is distinguishable from an
// aligned one.
function seed() {
	sb.activeProfiles.forEach((p, i) => {
		p.volume = 240;
		p.controlPoints = [P(0, 0.1 * i, 0.05, 0), P(0.5, 0.4 + 0.1 * i, 0.05, 0), P(1, 0.2, 0.05, 0)];
	});
}

console.log('-- the Chart.js overview is gone --');
{
	const src = fs.readFileSync(path.join(DIR, 'programmer.js'), 'utf8');
	const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
	const css = fs.readFileSync(path.join(DIR, 'proggStyle.css'), 'utf8');
	ok('no Chart.js references left in the script', !/graphIt|myChart|hasGraphed|labelarray|new Chart/.test(src));
	ok('no overview markup left', !/graphbox|myChart|Overview/i.test(html));
	ok('no Chart.js CDN script left', !/chart\.js/i.test(html));
	ok('no overview styles left', !/graphbox|myChart/.test(css));
	// The editor must not have lost anything else along the way.
	ok('editor entry points intact',
		typeof sb.drawCanvas === 'function' && typeof sb.writeOut === 'function' &&
		typeof sb.handleFiles === 'function' && typeof sb.deriveArray === 'function');
}

console.log('\n-- ghost curves --');
{
	sb.activeProfileIndex = 0;
	sb.activePointIndex = -1;
	sb.crosshairX = -1;
	seed();

	const r = render(0);
	ok('four ghosts drawn, one per other profile', r.ghosts.length === 4, r.ghosts.length);
	ok('ghosts are thinner than the active curve',
		r.ghosts.every(g => g.width === 1.5) && r.others.some(s => s.width === 2.5));
	// Ghosts keep their identity: each carries its own profile's hue, muted.
	ok('every ghost has a different colour', new Set(r.ghosts.map(g => g.style)).size === 4,
		r.ghosts.map(g => g.style).join(' | '));
	ok('  and none of them is the active profile\'s',
		!r.ghosts.some(g => g.style === sb.ghostColor(PROFILE_COLORS[0])));
	for (let i = 1; i < 5; i++) {
		const src = hexRgb(PROFILE_COLORS[i]);
		const got = rgba(sb.ghostColor(PROFILE_COLORS[i]));
		ok('profile ' + (i + 1) + ' keeps some of its colour', chroma(got) > 8,
			'chroma ' + chroma(got));
		ok('  but is muted against the original', chroma(got) < chroma(src),
			chroma(got) + ' < ' + chroma(src));
		// Hue is preserved when the channel ordering survives the blend — e.g. a blue
		// stays blue-dominant rather than drifting toward the grey it is mixed with.
		const order = c => [['r', c.r], ['g', c.g], ['b', c.b]].sort((a, b) => b[1] - a[1]).map(x => x[0]).join('');
		ok('  with its hue ordering intact', order(got) === order(src), order(got) + ' vs ' + order(src));
		ok('  and drawn translucent', got.a > 0 && got.a < 1, got.a);
	}

	ok('the active profile is not drawn as a ghost',
		!r.ghosts.some(g => Math.abs(g.pts[0].y - (1 - 0) * H) < 1e-9 && g.pts.length === 3 &&
			Math.abs(g.pts[1].y - (1 - 0.4) * H) < 1e-9));

	// Ghost 0 is profile 1 (y offsets 0.1 / 0.5). Its midpoint must land at 0.5 * W.
	const g0 = r.ghosts[0];
	ok('same-volume ghost spans the full width', Math.abs(g0.pts[g0.pts.length - 1].x - W) < 1e-9,
		g0.pts[g0.pts.length - 1].x);
	ok('  with its midpoint at mid-canvas', Math.abs(g0.pts[1].x - W / 2) < 1e-9, g0.pts[1].x);
	ok('  and its own pressures, not the active profile\'s',
		Math.abs(g0.pts[1].y - (1 - 0.5) * H) < 1e-9, g0.pts[1].y);
}

console.log('\n-- ghosts share the millilitre axis --');
{
	seed();
	// Editing a 120ml profile: a 240ml profile covers twice the volume, so it should
	// run to twice the canvas width and be clipped, not squeezed to fit.
	sb.activeProfiles[0].volume = 120;
	const r = render(0);
	const g0 = r.ghosts[0];
	const k = (240 - 1) / (120 - 1);
	ok('a longer profile overruns the right edge', g0.pts[g0.pts.length - 1].x > W,
		g0.pts[g0.pts.length - 1].x.toFixed(1));
	ok('  by exactly the volume ratio', Math.abs(g0.pts[g0.pts.length - 1].x - W * k) < 1e-9,
		(g0.pts[g0.pts.length - 1].x / W).toFixed(4) + ' vs ' + k.toFixed(4));
	// The point of aligning by millilitre: an anchor at 60ml in a 240ml profile must
	// land on the same canvas x as an anchor at 60ml in the 120ml profile being edited.
	sb.activeProfiles[0].controlPoints = [P(0, 0.2, 0, 0), P(60 / 119, 0.7, 0, 0), P(1, 0.3, 0, 0)];
	sb.activeProfiles[1].controlPoints = [P(0, 0.4, 0, 0), P(60 / 239, 0.9, 0, 0), P(1, 0.5, 0, 0)];
	const aligned = render(0);
	const ghost60 = aligned.ghosts[0].pts[1].x;
	const active60 = aligned.others.find(s => s.width === 2.5).pts[1].x;
	ok('60ml lands at the same x on both curves', Math.abs(ghost60 - active60) < 1e-9,
		ghost60.toFixed(3) + ' vs ' + active60.toFixed(3));
	ok('  at the x the volume gridlines use', Math.abs(active60 - (60 / 119) * W) < 1e-9,
		active60.toFixed(3));

	// The reverse: a shorter profile stops short of the right edge.
	seed();
	sb.activeProfiles[0].volume = 240;
	sb.activeProfiles[1].volume = 60;
	const r2 = render(0);
	const short = r2.ghosts[0];
	ok('a shorter profile stops short of the right edge',
		short.pts[short.pts.length - 1].x < W, short.pts[short.pts.length - 1].x.toFixed(1));
	ok('  again by the volume ratio',
		Math.abs(short.pts[short.pts.length - 1].x - W * (59 / 239)) < 1e-9,
		short.pts[short.pts.length - 1].x.toFixed(1));
}

console.log('\n-- ghosts stay out of the way --');
{
	seed();
	// A profile with no usable curve must be skipped rather than throwing or drawing junk.
	sb.activeProfiles[1].controlPoints = [P(0, 0.5, 0, 0)];       // single point
	sb.activeProfiles[2].controlPoints = null;
	sb.activeProfiles[3].volume = 1;                               // no width to map onto
	let threw = false;
	let r;
	try { r = render(0); } catch (e) { threw = true; console.log('  ' + e.message); }
	ok('degenerate profiles do not break the draw', !threw);
	ok('  and are simply skipped', r && r.ghosts.length === 1, r && r.ghosts.length);

	// Switching profiles re-renders: whichever is active is the one excluded.
	seed();
	sb.activeProfileIndex = 3;
	const r3 = render(3);
	ok('editing a different profile still leaves four ghosts', r3.ghosts.length === 4, r3.ghosts.length);
	ok('  and the newly active one is drawn in colour instead',
		r3.others.some(s => s.width === 2.5));

	// Ghosts are cosmetic: they must not affect hit-testing or the exported values.
	seed();
	sb.activeProfileIndex = 0;
	const ev = (x, y) => ({ currentTarget: canvas, clientX: x, clientY: y, pointerId: 1, button: 0 });
	sb.startEdit(ev(600, 240));   // profile 0's mid anchor is at (600, 0.6*400 = 240)
	ok('the active profile\'s anchor is still what gets grabbed',
		sb.draggingAnchorIndex === 1, sb.draggingAnchorIndex);
	ok('  and no extra point was created', sb.activeProfiles[0].controlPoints.length === 3,
		sb.activeProfiles[0].controlPoints.length);
	sb.endEdit(ev(600, 240));

	sb.deriveArray(1);
	const p1 = sb.activeProfiles[1].pressureArray;
	ok('export values come from each profile\'s own curve',
		Math.abs(parseFloat(p1[0]) - 1.0) < 0.05, p1[0]);
}

console.log(fail === 0 ? '\nall checks passed' : '\n' + fail + ' check(s) failed');
process.exit(fail ? 1 : 0);
