// Two behaviours: switching profiles eases the millilitre axis instead of jumping
// between differing profile lengths, and the clear actions destroy data only after a
// confirmation that was actually accepted.
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = path.join(__dirname, '..');

let strokes = [];
function stubCtx() {
	let cur = null;
	const c = {
		save() {}, restore() {}, clearRect() {}, closePath() {}, fill() {}, fillRect() {},
		fillText() {}, roundRect() {}, arc() {}, setLineDash() {}, scale() {}, translate() {},
		beginPath() { cur = { pts: [] }; },
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

const W = 1200, H = 400;
let ctx = stubCtx();
// A DOM stub rich enough for the confirm dialog: elements remember their text and
// hidden state, and clicks dispatch to registered listeners.
function el(id) {
	return { id: id, textContent: '', hidden: true, value: '', style: {}, _l: {},
		className: id === 'confirm-modal' ? 'modal' : '',
		classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
		addEventListener(ev, fn) { (this._l[ev] = this._l[ev] || []).push(fn); },
		click() { (this._l.click || []).forEach(f => f.call(this, { preventDefault() {} })); } };
}
const nodes = {};
function node(id) { return (nodes[id] = nodes[id] || el(id)); }

const canvas = {
	width: W, height: H, getContext: () => ctx,
	getBoundingClientRect: () => ({ width: W, height: H, left: 0, top: 0 }),
	addEventListener() {},
};
const backdrop = node('modal-backdrop');
backdrop.querySelectorAll = () => Object.keys(nodes).filter(k => k.endsWith('-modal')).map(node);

let rafQueue = [];
const sb = {
	window: { devicePixelRatio: 1, matchMedia: () => ({ matches: false }),
		localStorage: { getItem: () => null, setItem() {}, removeItem() {} } },
	document: {
		addEventListener() {},
		querySelectorAll: () => [],
		getElementById: id => (id.startsWith('editor-canvas') ? canvas : node(id)),
	},
	console: { debug() {} },
	// Frames are pumped by hand so progress can be inspected at chosen instants.
	requestAnimationFrame: fn => { rafQueue.push(fn); return rafQueue.length; },
};
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(DIR, 'settings.js'), 'utf8'), sb);
vm.runInContext(fs.readFileSync(path.join(DIR, 'programmer.js'), 'utf8'), sb);
sb.loadSettings();
sb.initOverlays();

const P = sb.makePoint;
const SWITCH_MS = vm.runInContext('SWITCH_MS', sb);
let fail = 0;
function ok(n, c, d) { if (!c) fail++; console.log((c ? 'PASS  ' : 'FAIL  ') + n + (d !== undefined ? '   -> ' + d : '')); }

// The sandbox's own clock. It must be this and not Node's performance.now(): the
// sandbox has no `performance`, so the source falls back to Date.now(), and mixing the
// two epochs makes every animation look long finished.
function nowStub() { return sb.nowMs(); }
function pumpFrames(n) {
	for (let i = 0; i < n && rafQueue.length; i++) { const q = rafQueue; rafQueue = []; q.forEach(f => f()); }
}
function render(idx) { strokes = []; ctx = stubCtx(); sb.drawCanvas(idx); return strokes; }
// The rightmost point any curve reaches — the visible length of the axis in use.
function span(idx) { return Math.max(...render(idx).map(s => s.pts[s.pts.length - 1].x)); }

console.log('-- switching eases the axis instead of jumping --');
{
	sb.activeProfiles.forEach((p, i) => {
		p.controlPoints = [P(0, 0.1, 0.05, 0), P(0.5, 0.7, 0.05, 0), P(1, 0.3, 0.05, 0)];
	});
	sb.activeProfiles[0].volume = 70;
	sb.activeProfiles[1].volume = 200;
	sb.activeProfileIndex = 0;
	sb.switchAnim = null;

	ok('axis is the profile\'s own volume when settled', sb.axisVolume(0) === 70, sb.axisVolume(0));

	sb.startProfileSwitch(0, 1);
	ok('a switch between different lengths animates', sb.switchAnim !== null);
	ok('  starting from the outgoing profile\'s axis, not the incoming one',
		Math.abs(sb.axisVolume(1) - 70) < 1.5, sb.axisVolume(1));

	// Walk the clock across the transition and confirm the axis moves monotonically
	// from one volume to the other rather than snapping.
	const samples = [];
	const t0 = sb.switchAnim.start;
	for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
		sb.switchAnim.start = t0 - frac * SWITCH_MS;
		samples.push(sb.axisVolume(1));
	}
	sb.switchAnim.start = t0;
	ok('axis sweeps from the old volume to the new',
		Math.abs(samples[0] - 70) < 1.5 && Math.abs(samples[4] - 200) < 1.5,
		samples.map(v => v.toFixed(1)).join(' -> '));
	ok('  monotonically, with no jump back',
		samples.every((v, i) => i === 0 || v >= samples[i - 1] - 1e-9));
	ok('  and eased rather than linear', Math.abs(samples[1] - 102.5) > 4,
		'quarter-way at ' + samples[1].toFixed(1) + ', linear would be 102.5');

	// The two profiles cross-fade rather than one popping off and the other on.
	sb.switchAnim.start = t0 - 0.5 * SWITCH_MS;
	const outgoing = sb.profileEmphasis(1, 0), incoming = sb.profileEmphasis(1, 1);
	ok('mid-switch both profiles are part-emphasised',
		outgoing > 0.2 && outgoing < 0.8 && incoming > 0.2 && incoming < 0.8,
		'out ' + outgoing.toFixed(2) + ', in ' + incoming.toFixed(2));
	ok('  and they sum to one, so total weight is constant',
		Math.abs(outgoing + incoming - 1) < 1e-9);
	ok('an uninvolved profile stays a ghost', sb.profileEmphasis(1, 3) === 0);

	// Anchors and handles are suppressed while the axis is moving.
	sb.activePointIndex = 1;
	strokes = []; ctx = stubCtx();
	sb.drawCanvas(1);
	const knobs = strokes.filter(s => s.pts.length === 0);
	ok('no anchors or handles drawn mid-switch', knobs.length === 0, knobs.length);

	sb.switchAnim.start = t0 - 2 * SWITCH_MS;
	pumpFrames(3);
	ok('the animation ends', sb.switchAnim === null);
	ok('  landing on the incoming profile\'s own axis', sb.axisVolume(1) === 200, sb.axisVolume(1));
	ok('  with full emphasis on it', sb.profileEmphasis(1, 1) === 1);
}

console.log('\n-- interrupting a switch picks up where the axis is --');
{
	sb.switchAnim = null;
	sb.activeProfiles[0].volume = 70;
	sb.activeProfiles[1].volume = 200;
	sb.activeProfiles[4].volume = 120;

	sb.startProfileSwitch(0, 1);              // 70 -> 200
	sb.switchAnim.start = nowStub() - 0.5 * SWITCH_MS;
	const midway = sb.axisVolume(1);
	ok('half way through the first switch', midway > 100 && midway < 170, midway.toFixed(1));

	sb.startProfileSwitch(1, 4);              // interrupt: -> 120
	ok('the new switch starts from the axis as it stands, not from 200',
		Math.abs(sb.switchAnim.fromVol - midway) < 1.5,
		sb.switchAnim.fromVol.toFixed(1) + ' vs ' + midway.toFixed(1));
	ok('  and heads for the new profile\'s volume', sb.switchAnim.toVol === 120, sb.switchAnim.toVol);
	ok('  so the axis does not jump on the frame it is interrupted',
		Math.abs(sb.axisVolume(4) - midway) < 1.5, sb.axisVolume(4).toFixed(1));

	sb.switchAnim.start = nowStub() - 2 * SWITCH_MS;
	pumpFrames(3);
	ok('  and it still lands on the new profile', sb.axisVolume(4) === 120, sb.axisVolume(4));
}

console.log('\n-- equal-length profiles need no animation --');
{
	sb.switchAnim = null;
	sb.activeProfiles[2].volume = 120;
	sb.activeProfiles[3].volume = 120;
	sb.activeProfileIndex = 2;
	sb.startProfileSwitch(2, 2);
	ok('switching to the same profile does nothing', sb.switchAnim === null);
	sb.startProfileSwitch(-1, 3);
	ok('the first paint does not animate from nowhere', sb.switchAnim === null);
}

console.log('\n-- ghosts are more muted than before --');
{
	const COLORS = vm.runInContext('PROFILE_COLORS', sb);
	const parse = s => s.match(/[\d.]+/g).map(Number);
	const chroma = c => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
	let allQuieter = true, allVisible = true, orderKept = true;
	for (const hex of COLORS) {
		const g = parse(sb.ghostColor(hex));
		const src = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
		// Against the previous 0.5 mix / 0.8 alpha, both must have come down.
		if (chroma(g) >= chroma(src) * 0.45) allQuieter = false;
		if (chroma(g) < 8 || g[3] > 0.75) allVisible = false;
		const ord = c => [0, 1, 2].sort((a, b) => c[b] - c[a]).join('');
		if (ord(g) !== ord(src)) orderKept = false;
	}
	ok('every ghost is well under half its original chroma', allQuieter);
	ok('  but still carries visible colour', allVisible);
	ok('  with its hue ordering intact under a neutral grey', orderKept);
	ok('full emphasis returns the pure profile colour',
		sb.curveColor(COLORS[4], 1) === 'rgba(55,119,255,1)', sb.curveColor(COLORS[4], 1));
}

console.log('\n-- clearing asks first --');
{
	sb.switchAnim = null;
	sb.activeProfileIndex = 0;
	const shaped = () => [P(0, 0.1, 0.05, 0), P(0.4, 0.9, 0.05, 0), P(1, 0.4, 0.05, 0)];
	sb.activeProfiles.forEach(p => { p.controlPoints = shaped(); p.pressureArray = Array(240).fill('7.0'); });
	const before = sb.activeProfiles.map(p => p.controlPoints.length);
	// Whatever the volume happens to be here, clearing must not touch it.
	const nameBefore = sb.activeProfiles[0].name, volBefore = sb.activeProfiles[0].volume;

	sb.confirmClearActive();
	ok('a dialog opens rather than clearing immediately', sb.openModalId === 'confirm-modal',
		sb.openModalId);
	ok('  naming the profile at risk', /CLASSIC|the current profile/.test(node('confirm-text').textContent),
		node('confirm-text').textContent.slice(0, 60) + '…');
	ok('  and warning it cannot be undone', /cannot be undone/i.test(node('confirm-text').textContent));
	ok('  with a labelled confirm button', node('confirmButton').textContent === 'Clear profile',
		node('confirmButton').textContent);
	ok('nothing is destroyed while the dialog is open',
		sb.activeProfiles.every((p, i) => p.controlPoints.length === before[i]));

	// Cancelling must leave everything alone and disarm the action.
	sb.closeModal();
	ok('cancelling closes the dialog', sb.openModalId === null);
	ok('  destroys nothing', sb.activeProfiles.every((p, i) => p.controlPoints.length === before[i]));
	node('confirmButton').click();
	ok('  and a later click on the stale button does nothing',
		sb.activeProfiles.every((p, i) => p.controlPoints.length === before[i]),
		sb.activeProfiles.map(p => p.controlPoints.length).join(','));

	// Confirming clears exactly one profile.
	sb.confirmClearActive();
	node('confirmButton').click();
	ok('confirming flattens the active profile', sb.activeProfiles[0].controlPoints.length === 2,
		sb.activeProfiles[0].controlPoints.length);
	ok('  to zero bar throughout', sb.activeProfiles[0].controlPoints.every(c => c.y === 0));
	ok('  zeroing its exported array',
		sb.activeProfiles[0].pressureArray.every(v => parseFloat(v) === 0));
	ok('  keeping its name and volume untouched',
		sb.activeProfiles[0].name === nameBefore && sb.activeProfiles[0].volume === volBefore,
		sb.activeProfiles[0].name + '/' + sb.activeProfiles[0].volume
			+ ' was ' + nameBefore + '/' + volBefore);
	ok('  and leaving the other four alone',
		sb.activeProfiles.slice(1).every(p => p.controlPoints.length === 3));
	ok('  and dismissing the dialog', sb.openModalId === null);
	ok('  and dropping the selected point', sb.activePointIndex === -1);
}

console.log('\n-- clear all asks separately --');
{
	sb.activeProfiles.forEach(p => { p.controlPoints = [P(0, 0.1, 0.05, 0), P(0.4, 0.9, 0.05, 0), P(1, 0.4, 0.05, 0)]; });
	sb.confirmClearAll();
	ok('a dialog opens', sb.openModalId === 'confirm-modal');
	ok('  warning that every profile goes', /all five/i.test(node('confirm-text').textContent),
		node('confirm-text').textContent.slice(0, 70) + '…');
	ok('  and that it cannot be undone', /cannot be undone/i.test(node('confirm-text').textContent));
	ok('nothing cleared yet', sb.activeProfiles.every(p => p.controlPoints.length === 3));

	sb.closeModal();
	ok('cancelling spares all five', sb.activeProfiles.every(p => p.controlPoints.length === 3));

	sb.confirmClearAll();
	node('confirmButton').click();
	ok('confirming flattens all five', sb.activeProfiles.every(p => p.controlPoints.length === 2));
	ok('  every one at zero bar',
		sb.activeProfiles.every(p => p.controlPoints.every(c => c.y === 0)));
	ok('  names and volumes survive',
		sb.activeProfiles.map(p => p.name).join(',') === 'CLASSIC,SHORT,LUNGO,BLOOM,DECLINE',
		sb.activeProfiles.map(p => p.name).join(','));

	// A cleared editor must still export a valid file.
	for (let i = 0; i < 5; i++) sb.deriveArray(i);
	const txt = sb.getTextFile(2);
	const vals = txt.split('\r').filter(l => /^\s*\d+:/.test(l)).map(l => parseFloat(l.split(':')[1]));
	ok('a cleared editor still exports', (txt.match(/TYPE:P/g) || []).length === 5);
	ok('  as all zeros', vals.every(v => v === 0), vals.filter(v => v !== 0).length + ' non-zero');
}

console.log('\n-- the markup carries the controls --');
{
	const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
	const css = fs.readFileSync(path.join(DIR, 'proggStyle.css'), 'utf8');
	ok('clear buttons present', /id="clearButton"/.test(html) && /id="clearAllButton"/.test(html));
	ok('confirm dialog present', /id="confirm-modal"/.test(html));
	ok('  announced as an alertdialog', /role="alertdialog"/.test(html));
	ok('  with a cancel that closes', /class="modal-secondary" data-close-modal/.test(html));
	ok('destructive styling exists', /\.danger-btn/.test(css) && /\.modal-danger/.test(css));
}

console.log(fail === 0 ? '\nall checks passed' : '\n' + fail + ' check(s) failed');
process.exit(fail ? 1 : 0);
