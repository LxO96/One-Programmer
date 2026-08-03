// Loads the real settings.js into a stubbed-DOM sandbox and exercises the
// settings store, the storage fallbacks, and the zone-label fit logic.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const SRC = path.join(__dirname, '..', 'settings.js');
const CODE = fs.readFileSync(SRC, 'utf8');

function makeStorage(behaviour) {
	const map = new Map();
	if (behaviour === 'throws') {
		return {
			getItem() { throw new Error('opaque origin'); },
			setItem() { throw new Error('opaque origin'); },
			removeItem() { throw new Error('opaque origin'); },
		};
	}
	return {
		getItem: k => (map.has(k) ? map.get(k) : null),
		setItem: (k, v) => map.set(k, String(v)),
		removeItem: k => map.delete(k),
		_map: map,
	};
}

function load(behaviour) {
	const storage = makeStorage(behaviour);
	const sb = {
		window: { localStorage: storage },
		document: undefined,
		console: { debug() {} },
	};
	vm.createContext(sb);
	vm.runInContext(CODE, sb);
	return { sb, storage };
}

let failures = 0;
function ok(name, cond, detail) {
	if (!cond) failures++;
	console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail !== undefined ? '   -> ' + detail : ''));
}

// ── clamping ──
{
	const { sb } = load();
	// Read the default from the module rather than pinning a number here, so tuning it
	// is a one-line change in the source and not a test rewrite. It has to be evaluated
	// inside the context: a top-level `const` is a lexical binding and never becomes a
	// property of the sandbox object the way `var` and function declarations do.
	const D = vm.runInContext('DEFAULT_PRE_INFUSION_ML', sb);
	const cases = [
		[-50, 0], [0, 0], [80, 80], [240, 240], [999, 240],
		[12.6, 13], ['abc', D], ['', D], [null, D], [undefined, D],
		// Non-finite input is nonsense rather than "very large", so it defaults
		// rather than clamping to the maximum.
		[NaN, D], [Infinity, D], [-Infinity, D], ['120', 120],
	];
	for (const [input, expected] of cases) {
		const got = sb.clampPreInfusion(input);
		ok('clamp ' + String(input) + ' => ' + expected, got === expected, got);
	}
}

// ── persistence round-trip ──
{
	const { sb, storage } = load();
	sb.setPreInfusionMl(45);
	ok('value persisted to storage', storage._map.get('cremOne.settings') === '{"preInfusionMl":45}',
		storage._map.get('cremOne.settings'));

	const reloaded = load();
	reloaded.storage._map.set('cremOne.settings', '{"preInfusionMl":45}');
	reloaded.sb.loadSettings();
	ok('value survives reload', reloaded.sb.getPreInfusionMl() === 45, reloaded.sb.getPreInfusionMl());
}

// ── corrupt / hostile stored values ──
{
	for (const raw of ['not json at all', '{', 'null', '[]', '{"preInfusionMl":"garbage"}',
	                   '{"preInfusionMl":-9000}', '{"preInfusionMl":100000}', '{}']) {
		const { sb, storage } = load();
		storage._map.set('cremOne.settings', raw);
		let threw = false;
		try { sb.loadSettings(); } catch (e) { threw = true; }
		const v = sb.getPreInfusionMl();
		ok('corrupt ' + JSON.stringify(raw).slice(0, 28) + ' recovers', !threw && v >= 0 && v <= 240, v);
	}
}

// ── localStorage that throws on every access ──
{
	let threw = false;
	let value, saved, seen, expected;
	try {
		const { sb } = load('throws');
		expected = vm.runInContext('DEFAULT_PRE_INFUSION_ML', sb);
		sb.loadSettings();
		value = sb.getPreInfusionMl();
		saved = sb.setPreInfusionMl(120);
		seen = sb.hasSeenWelcome();
		sb.markWelcomeSeen();
		sb.resetWelcome();
	} catch (e) { threw = true; }
	ok('throwing storage never throws out', !threw);
	ok('throwing storage falls back to default', value === expected, value);
	ok('throwing storage still holds value in memory', saved === 120, saved);
	ok('throwing storage reports welcome unseen', seen === false, seen);
}

// ── welcome flag ──
{
	const { sb } = load();
	ok('welcome unseen initially', sb.hasSeenWelcome() === false);
	sb.markWelcomeSeen();
	ok('welcome seen after marking', sb.hasSeenWelcome() === true);
	sb.resetWelcome();
	ok('resetWelcome clears the flag', sb.hasSeenWelcome() === false);
}

// ── zone label fit logic ──
{
	const { sb } = load();
	// Stub 2D context: text width ~ 0.62 * fontSize per char, close enough to real.
	function stubCtx() {
		const c = {
			drawn: [],
			font: '', fillStyle: '', textAlign: '', textBaseline: '', letterSpacing: '',
			save() {}, restore() {},
			measureText(s) {
				const size = parseFloat((c.font.match(/(\d+(\.\d+)?)px/) || [0, 12])[1]);
				return { width: s.length * size * 0.62 };
			},
			fillText(s, x, y) { c.drawn.push({ s, x, y }); },
		};
		return c;
	}

	let c = stubCtx();
	ok('extraction label draws at full width', sb.drawZoneLabel(c, 'Extraction', 0, 900, 400) === true);
	ok('  and is centred', c.drawn.length === 1 && c.drawn[0].x === 450 && c.drawn[0].y === 200,
		JSON.stringify(c.drawn[0]));
	ok('  and is uppercased', c.drawn[0].s === 'EXTRACTION', c.drawn[0].s);

	c = stubCtx();
	ok('zero-width zone draws nothing', sb.drawZoneLabel(c, 'Pre-infusion', 0, 0, 400) === false
		&& c.drawn.length === 0);

	c = stubCtx();
	ok('negative-width zone draws nothing', sb.drawZoneLabel(c, 'Pre-infusion', 500, 400, 400) === false
		&& c.drawn.length === 0);

	c = stubCtx();
	ok('too-narrow zone is skipped rather than clipped',
		sb.drawZoneLabel(c, 'Pre-infusion', 0, 60, 400) === false && c.drawn.length === 0);

	c = stubCtx();
	const wide = sb.drawZoneLabel(c, 'Pre-infusion', 0, 400, 400);
	ok('roomy pre-infusion zone draws', wide === true && c.drawn[0].s === 'PRE-INFUSION');
}

console.log(failures === 0 ? '\nall checks passed' : '\n' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
