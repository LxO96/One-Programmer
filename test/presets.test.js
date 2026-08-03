// The five starting profiles. They have to be valid espresso shots, survive the same
// monotonicity rules a hand-drawn curve does, and export cleanly without ever being
// touched in the editor.
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = path.join(__dirname, '..');

const sb = {
	window: { devicePixelRatio: 1, matchMedia: () => ({ matches: false }),
		localStorage: { getItem: () => null, setItem() {}, removeItem() {} } },
	document: { addEventListener() {}, querySelectorAll: () => [], getElementById: () => null },
	console: { debug() {} },
};
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(DIR, 'settings.js'), 'utf8'), sb);
vm.runInContext(fs.readFileSync(path.join(DIR, 'programmer.js'), 'utf8'), sb);
sb.loadSettings();

const PRESETS = vm.runInContext('PRESET_PROFILES', sb);
const DEFAULT_PRE = vm.runInContext('DEFAULT_PRE_INFUSION_ML', sb);
const PUMP_TO_CUP = 120 / 36;

let fail = 0;
function ok(n, c, d) { if (!c) fail++; console.log((c ? 'PASS  ' : 'FAIL  ') + n + (d !== undefined ? '   -> ' + d : '')); }

// Worst backwards step in x across the whole path — negative means the curve folds.
function worstBacktrack(points) {
	const pts = [...points].sort((a, b) => a.x - b.x);
	let worst = 0;
	for (let i = 0; i < pts.length - 1; i++) {
		const p0 = pts[i], p3 = pts[i + 1];
		const p1x = p0.x + p0.cpxOut, p2x = p3.x - p3.cpxIn;
		let prev = p0.x;
		for (let s = 1; s <= 300; s++) {
			const t = s / 300, mt = 1 - t;
			const x = mt*mt*mt*p0.x + 3*mt*mt*t*p1x + 3*mt*t*t*p2x + t*t*t*p3.x;
			worst = Math.min(worst, x - prev);
			prev = x;
		}
	}
	return worst;
}

console.log('-- the placeholder profiles are gone --');
{
	const src = fs.readFileSync(path.join(DIR, 'programmer.js'), 'utf8');
	ok('no test1..test5 placeholders left', !/'test' \+ \(ii \+ 1\)/.test(src));
	ok('five presets defined', PRESETS.length === 5, PRESETS.length);
	ok('the app opens on them', sb.activeProfiles.length === 5 &&
		sb.activeProfiles[0].name === PRESETS[0].name, sb.activeProfiles[0].name);
	ok('names are distinct', new Set(PRESETS.map(p => p.name)).size === 5);
	ok('names fit the 8-char field the exporter writes',
		PRESETS.every(p => p.name.length <= 8 && p.name === p.name.toUpperCase()),
		PRESETS.map(p => p.name).join(','));
}

console.log('\n-- each preset is a plausible shot --');
for (const preset of PRESETS) {
	const cup = (preset.volume / PUMP_TO_CUP).toFixed(0);
	const bars = preset.stops.map(s => s[1]);
	const mls = preset.stops.map(s => s[0]);
	ok(preset.name + ': volume within the machine\'s range',
		preset.volume >= 4 && preset.volume <= 240, preset.volume + 'ml (≈' + cup + 'ml out)');
	ok('  a sane espresso size in the cup', +cup >= 15 && +cup <= 65, cup + 'ml out');
	ok('  pressures inside 0–10 bar', bars.every(b => b >= 0 && b <= 10), bars.join('/'));
	ok('  peaks somewhere in real brewing pressure', Math.max(...bars) >= 7.5, Math.max(...bars));
	ok('  starts gentle rather than slamming the puck', bars[0] <= 3, bars[0]);
	ok('  stops are ordered and inside the volume',
		mls.every((m, i) => m >= 0 && m < preset.volume && (i === 0 || m > mls[i - 1])), mls.join('/'));
}

console.log('\n-- built curves are valid --');
for (let i = 0; i < 5; i++) {
	const p = sb.activeProfiles[i];
	const name = PRESETS[i].name;
	ok(name + ': control points built', p.controlPoints.length === PRESETS[i].stops.length,
		p.controlPoints.length);
	ok('  curve never folds back', worstBacktrack(p.controlPoints) >= -1e-9,
		worstBacktrack(p.controlPoints).toExponential(2));
	ok('  every anchor inside the canvas',
		p.controlPoints.every(c => c.x >= 0 && c.x <= 1 && c.y >= 0 && c.y <= 1));
	ok('  anchors keep clear of each other',
		p.controlPoints.every((a, ai) => p.controlPoints.every((b, bi) =>
			ai === bi || Math.abs(a.x - b.x) > 1e-9)));
}

console.log('\n-- the sampled curve matches the stops it was built from --');
for (let i = 0; i < 5; i++) {
	const preset = PRESETS[i];
	const pts = [...sb.activeProfiles[i].controlPoints].sort((a, b) => a.x - b.x);
	let worst = 0, at = '';
	for (const [ml, bar] of preset.stops) {
		const got = sb.sampleCurveAtX(pts, ml / (preset.volume - 1)) * 10;
		if (Math.abs(got - bar) > worst) { worst = Math.abs(got - bar); at = ml + 'ml'; }
	}
	ok(preset.name + ': curve passes through its stops', worst < 0.05,
		'worst ' + worst.toFixed(3) + ' bar at ' + at);
}

console.log('\n-- presets export without being touched --');
{
	for (let i = 0; i < 5; i++) sb.deriveArray(i);
	const txt = sb.getTextFile(2);
	const vals = txt.split('\r').filter(l => /^\s*\d+:/.test(l)).map(l => parseFloat(l.split(':')[1]));
	ok('every profile block written', (txt.match(/TYPE:P/g) || []).length === 5);
	ok('preset names survive into the file',
		PRESETS.every(p => txt.includes('NAME:' + p.name)), PRESETS.map(p => p.name).join(','));
	ok('all exported pressures in range', vals.every(v => v >= 0 && v <= 10));
	ok('  and not all zero, i.e. the curves actually made it', vals.some(v => v > 5));

	// Past a profile's own volume the machine gets zeros, not a stale tail.
	const short = sb.activeProfiles.findIndex(p => p.volume < 240);
	const arr = sb.activeProfiles[short].pressureArray;
	ok('beyond a short profile\'s volume the array is zeroed',
		arr.slice(sb.activeProfiles[short].volume).every(v => parseFloat(v) === 0),
		'volume ' + sb.activeProfiles[short].volume);
}

console.log('\n-- the default pre-infusion suits the presets --');
{
	// The default is what the machine itself pre-infuses for, so it is a fact about the
	// hardware rather than a preference. What the presets must respect is that a
	// profile shorter than the pre-infusion has no extraction phase at all.
	ok('default is within the machine\'s range', DEFAULT_PRE > 0 && DEFAULT_PRE <= 240, DEFAULT_PRE);
	for (const p of PRESETS) {
		ok(p.name + ' is longer than the pre-infusion',
			p.volume > DEFAULT_PRE, p.volume + 'ml vs ' + DEFAULT_PRE + 'ml pre-infusion');
	}
	ok('  so every preset has an extraction phase to speak of',
		PRESETS.every(p => p.volume - DEFAULT_PRE >= 15),
		PRESETS.map(p => p.name + ':' + (p.volume - DEFAULT_PRE)).join(' '));
}

console.log(fail === 0 ? '\nall checks passed' : '\n' + fail + ' check(s) failed');
process.exit(fail ? 1 : 0);
