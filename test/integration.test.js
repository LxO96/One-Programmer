// Loads settings.js + programmer.js together, exactly as the page does, and drives
// drawCanvas through a stub canvas to confirm the zone wiring.
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = path.join(__dirname, '..');

let fills = [], texts = [];
function stubCtx() {
	const c = {
		save() {}, restore() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
		closePath() {}, stroke() {}, fill() {}, arc() {}, roundRect() {}, bezierCurveTo() {},
		setLineDash() {}, scale() {}, translate() {},
		fillText: (s, x, y) => texts.push({ s, x, y }),
		fillRect: (x, y, w, h) => fills.push({ x, y, w, h }),
		measureText: s => ({ width: s.length * parseFloat((c.font.match(/(\d+(\.\d+)?)px/) || [0, 12])[1]) * 0.62 }),
		font: '', fillStyle: '', strokeStyle: '', lineWidth: 0, lineJoin: '', lineCap: '',
		textAlign: '', textBaseline: '', letterSpacing: '',
	};
	return c;
}

let ctx = stubCtx();
const canvas = {
	width: 1200, height: 400,
	getContext: () => ctx,
	getBoundingClientRect: () => ({ width: 1200, height: 400, left: 0, top: 0 }),
	addEventListener() {},
};
const store = new Map();
const sb = {
	window: {
		devicePixelRatio: 1,
		localStorage: {
			getItem: k => (store.has(k) ? store.get(k) : null),
			setItem: (k, v) => store.set(k, String(v)),
			removeItem: k => store.delete(k),
		},
	},
	document: {
		addEventListener() {},
		querySelectorAll: () => [],
		getElementById: id => (id.startsWith('editor-canvas') ? canvas : null),
	},
	console: { debug() {} },
	Chart: function() {},
};
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(DIR, 'settings.js'), 'utf8'), sb);
vm.runInContext(fs.readFileSync(path.join(DIR, 'programmer.js'), 'utf8'), sb);

let fail = 0;
function ok(n, c, d) { if (!c) fail++; console.log((c ? 'PASS  ' : 'FAIL  ') + n + (d !== undefined ? '   -> ' + d : '')); }

function render() {
	fills = []; texts = []; ctx = stubCtx();
	sb.drawCanvas(0);
	return {
		zone: fills.find(f => f.x === 0 && f.y === 0 && f.h === 400),
		labels: texts.map(t => t.s).filter(s => /^[A-Z-]+$/.test(s) && s.length > 4),
	};
}

sb.loadSettings();
// Taken from the module so tuning the default is a source change, not a test rewrite.
// Evaluated inside the context because a top-level `const` is a lexical binding and
// never becomes a property of the sandbox object the way `var` and functions do.
const D = vm.runInContext('DEFAULT_PRE_INFUSION_ML', sb);
ok('default pre-infusion matches the module default', sb.getPreInfusionMl() === D, D);
// The default mirrors the machine's own pre-infusion length, so the only thing to
// assert here is that it is a usable value on the 0–240ml axis.
ok('  and is within the machine\'s volume range', D > 0 && D <= 240, D);

// The zone maths below is expressed against a 240ml axis, so pin the volume rather
// than inheriting whatever the preset profiles happen to use.
sb.activeProfiles[0].volume = 240;

let r = render();
ok('both zone labels drawn by default',
	r.labels.includes('PRE-INFUSION') && r.labels.includes('EXTRACTION'), r.labels.join(','));
ok('zone width matches the default over the profile volume',
	Math.abs(r.zone.w - 1200 * D / 240) < 0.5, r.zone.w);

sb.setPreInfusionMl(160);
r = render();
ok('zone widens with the setting', Math.abs(r.zone.w - 1200 * 160 / 240) < 0.5, r.zone.w);
ok('setting persisted', store.get('cremOne.settings') === '{"preInfusionMl":160}', store.get('cremOne.settings'));

sb.setPreInfusionMl(0);
r = render();
ok('zero pre-infusion draws no left zone', r.zone.w === 0, r.zone.w);
ok('zero pre-infusion drops the PRE-INFUSION label', !r.labels.includes('PRE-INFUSION'), r.labels.join(','));
ok('zero pre-infusion keeps EXTRACTION', r.labels.includes('EXTRACTION'), r.labels.join(','));

sb.setPreInfusionMl(240);
r = render();
ok('full pre-infusion drops the EXTRACTION label', !r.labels.includes('EXTRACTION'), r.labels.join(','));

sb.setPreInfusionMl(80);
sb.activeProfiles[0].volume = 4;   // narrowest allowed profile
let threw = false;
try { r = render(); } catch (e) { threw = true; console.log(e.message); }
ok('tiny volume renders without error', !threw, 'labels: ' + (r.labels.join(',') || '(none)'));

console.log(fail === 0 ? '\nall checks passed' : '\n' + fail + ' failed');
process.exit(fail ? 1 : 0);
