// Runs every *.test.js in this directory and summarises the result.
//
//   node test/run.js            all of them
//   node test/run.js ghosts     only files whose name contains "ghosts"
//
// There is no test framework and no dependency to install. Each file loads the real
// browser source into a `vm` context with a stubbed DOM and canvas, so the tests
// exercise the shipped code rather than a copy of it, and exits non-zero on failure.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const filter = process.argv[2];
const files = fs.readdirSync(__dirname)
	.filter(f => f.endsWith('.test.js'))
	.filter(f => !filter || f.includes(filter))
	.sort();

if (files.length === 0) {
	console.error(filter ? 'No test files match "' + filter + '".' : 'No test files found.');
	process.exit(1);
}

const verbose = process.env.VERBOSE === '1';
let failed = 0;
const started = Date.now();

for (const file of files) {
	const label = file.replace(/\.test\.js$/, '');
	process.stdout.write(label.padEnd(16));

	const run = spawnSync(process.execPath, [path.join(__dirname, file)], { encoding: 'utf8' });
	const output = (run.stdout || '') + (run.stderr || '');

	if (run.status === 0) {
		// Each file prints one PASS line per assertion; report the count rather than
		// the wall of text.
		const passes = (output.match(/^PASS/gm) || []).length;
		console.log('ok' + (passes ? '   ' + passes + ' checks' : ''));
		if (verbose) console.log(indent(output));
	} else {
		failed++;
		console.log('FAILED');
		// A failing run always prints its detail, verbose or not — that is the whole
		// point of the run.
		console.log(indent(output));
	}
}

function indent(text) {
	return text.trimEnd().split('\n').map(l => '    ' + l).join('\n');
}

const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log('');
console.log(failed === 0
	? files.length + ' files passed in ' + seconds + 's'
	: failed + ' of ' + files.length + ' files FAILED in ' + seconds + 's');
process.exit(failed === 0 ? 0 : 1);
