// A profile taken through the full import path and back out again:
//   pressureArray -> douglasPeucker -> control points -> sampled -> pressureArray
//
// This is the loop a file goes through when you open it, look at it and export it
// without touching anything, so error here is error the machine would actually see.
const fs = require('fs'), vm = require('vm'), path = require('path');

const sb = {
	document: { addEventListener() {}, querySelectorAll: () => [], getElementById: () => null },
	window: { devicePixelRatio: 1, matchMedia: () => ({ matches: false }),
		localStorage: { getItem: () => null, setItem() {}, removeItem() {} } },
	console: { debug() {} },
};
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'settings.js'), 'utf8'), sb);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'programmer.js'), 'utf8'), sb);
sb.loadSettings();

let fail = 0;
function ok(n, c, d) { if (!c) fail++; console.log((c ? 'PASS  ' : 'FAIL  ') + n + (d !== undefined ? '   -> ' + d : '')); }

// The simplifier's epsilon is 0.02 of full scale, i.e. 0.2 bar, and the curve is
// resampled on a 0.1 bar grid. Half a bar of drift on a smooth profile is the most
// that can be called faithful; beyond it the shape is being lost, not rounded.
const TOLERANCE = 0.5;

function roundTrip(label, fill) {
	const p = sb.activeProfiles[0];
	p.volume = 240;
	p.pressureArray = [];
	for (let i = 0; i < 240; i++) p.pressureArray[i] = fill(i).toFixed(1);
	const before = p.pressureArray.map(Number);

	sb.arrayToControlPoints(0);
	const points = p.controlPoints.length;
	sb.deriveArray(0);
	const after = p.pressureArray.map(Number);

	let maxErr = 0, at = 0;
	for (let i = 0; i < 240; i++) {
		const e = Math.abs(before[i] - after[i]);
		if (e > maxErr) { maxErr = e; at = i; }
	}

	ok(label + ': simplifies to a workable number of points', points >= 2 && points <= 40, points);
	ok('  survives the round trip within ' + TOLERANCE + ' bar', maxErr <= TOLERANCE,
		maxErr.toFixed(3) + ' bar at ' + at + 'ml');
	ok('  every value stays in 0–10 bar', after.every(v => v >= 0 && v <= 10));
	ok('  and the curve is single-valued in x',
		(function () {
			const pts = [...p.controlPoints].sort((a, b) => a.x - b.x);
			for (let i = 0; i < pts.length - 1; i++) {
				const p0 = pts[i], p3 = pts[i + 1];
				const p1x = p0.x + p0.cpxOut, p2x = p3.x - p3.cpxIn;
				let prev = p0.x;
				for (let s = 1; s <= 200; s++) {
					const t = s / 200, mt = 1 - t;
					const x = mt*mt*mt*p0.x + 3*mt*mt*t*p1x + 3*mt*t*t*p2x + t*t*t*p3.x;
					if (x - prev < -1e-9) return false;
					prev = x;
				}
			}
			return true;
		})());
	return maxErr;
}

roundTrip('smooth arch', i => 2 + 8 * Math.sin(i / 240 * Math.PI));
roundTrip('flat line', () => 6);
roundTrip('declining ramp', i => 9.5 - 5 * (i / 239));
roundTrip('step', i => (i < 120 ? 3 : 9));
roundTrip('at the ceiling', () => 10);
roundTrip('at the floor', () => 0);

// A file written by the exporter must read back as the same thing.
console.log('');
{
	// Every value the machine is ever handed must be a plausible pressure. This caught a
	// real defect: pressures were stored as strings, and resampling did
	// `lower + fraction * (upper - lower)`, where `+` on a string concatenates. A whole
	// number stringifies without a decimal point, so "9" + 0 became "90" — exported as
	// 90 bar. Only whole-number readings hit it, so it looked intermittent.
	const scan = version => {
		for (let i = 0; i < 5; i++) sb.deriveArray(i);
		const txt = sb.getTextFile(version);
		const values = [];
		for (const line of txt.split('\r')) {
			const m = /^\s*(\d+)\s*:\s*(-?[\d.]+)\s*$/.exec(line);
			if (m) values.push({ step: +m[1], bar: parseFloat(m[2]), line: line.trim() });
		}
		return values;
	};

	for (const version of [1, 2]) {
		const values = scan(version);
		const expected = version === 1 ? 60 : 240;
		ok('v' + version + ': writes ' + expected + ' steps per profile',
			values.length === expected * 5, values.length + ' values');
		const bad = values.filter(v => !(v.bar >= 0 && v.bar <= 10));
		ok('  every exported pressure is between 0 and 10 bar', bad.length === 0,
			bad.length ? bad.slice(0, 4).map(b => b.line).join('  ') : 'all in range');
		ok('  none are NaN', values.every(v => isFinite(v.bar)));
	}

	// Exporting must not alter what is on screen. Resampling used to write its result
	// straight back into activeProfiles, so writing a v1 file replaced the editor's
	// 240-sample arrays with 60.
	for (let i = 0; i < 5; i++) sb.deriveArray(i);
	const lengthsBefore = sb.activeProfiles.map(p => p.pressureArray.length).join(',');
	const firstBefore = sb.activeProfiles.map(p => p.pressureArray[10]).join(',');
	sb.getTextFile(1);
	ok('a v1 export leaves the in-memory arrays at full resolution',
		sb.activeProfiles.map(p => p.pressureArray.length).join(',') === lengthsBefore,
		sb.activeProfiles.map(p => p.pressureArray.length).join(','));
	ok('  and does not alter their values',
		sb.activeProfiles.map(p => p.pressureArray[10]).join(',') === firstBefore);

	// Exporting the same profiles twice must give the same file.
	for (let i = 0; i < 5; i++) sb.deriveArray(i);
	const once = sb.getTextFile(1);
	const twice = sb.getTextFile(1);
	ok('exporting twice gives an identical file', once === twice);
}


console.log('');
{
	for (let i = 0; i < 5; i++) sb.deriveArray(i);
	const written = sb.getTextFile(2);
	const reread = sb.parseProfileFile(written);
	ok('an exported file parses back in', reread.ok, reread.ok ? '' : reread.error);
	if (reread.ok) {
		ok('  with the same names',
			reread.profiles.map(p => p.name).join(',') === sb.activeProfiles.map(p => p.name).join(','),
			reread.profiles.map(p => p.name).join(','));
		ok('  the same volumes',
			reread.profiles.map(p => p.volume).join(',') === sb.activeProfiles.map(p => p.volume).join(','),
			reread.profiles.map(p => p.volume).join(','));
		let worst = 0;
		for (let i = 0; i < 5; i++) {
			for (let s = 0; s < 240; s++) {
				worst = Math.max(worst, Math.abs(
					reread.profiles[i].pressureArray[s] - parseFloat(sb.activeProfiles[i].pressureArray[s])));
			}
		}
		ok('  and identical pressures', worst < 1e-9, worst);
	}
}

console.log(fail === 0 ? '\nall checks passed' : '\n' + fail + ' check(s) failed');
process.exit(fail ? 1 : 0);
