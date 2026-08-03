// Touch input: hit targets grow for fingers, handle knobs stay clear of a
// finger-sized anchor, and labels thin out on a phone-width canvas. Also asserts the
// static requirements a mobile layout depends on.
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = path.join(__dirname, '..');

let texts = [];
function stubCtx() {
	const c = {
		save() {}, restore() {}, clearRect() {}, closePath() {}, fill() {}, fillRect() {},
		beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, roundRect() {},
		bezierCurveTo() {}, setLineDash() {}, scale() {}, translate() {},
		fillText: s => texts.push(s),
		measureText: s => ({ width: s.length * 6 }),
		font: '', fillStyle: '', strokeStyle: '', lineWidth: 0, lineJoin: '', lineCap: '',
		textAlign: '', textBaseline: '', letterSpacing: '',
	};
	return c;
}

// `coarse` decides what matchMedia('(pointer: coarse)') reports at load time.
function load(coarse, width, height) {
	let ctx = stubCtx();
	const canvas = {
		width: width, height: height,
		getContext: () => ctx,
		getBoundingClientRect: () => ({ width: width, height: height, left: 0, top: 0 }),
		addEventListener() {},
		captured: null,
		setPointerCapture(id) { this.captured = id; },
		releasePointerCapture() { this.captured = null; },
	};
	const tooltip = { textContent: '', style: {}, offsetWidth: 100,
		classList: { add() {}, remove() {}, contains: () => false } };
	const sb = {
		window: {
			devicePixelRatio: 2,
			matchMedia: q => ({ matches: /pointer:\s*coarse/.test(q) ? coarse : false }),
			localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
		},
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
	sb.__canvas = canvas;
	sb.__resetCtx = () => { texts = []; ctx = stubCtx(); };
	return sb;
}

let fail = 0;
function ok(n, c, d) { if (!c) fail++; console.log((c ? 'PASS  ' : 'FAIL  ') + n + (d !== undefined ? '   -> ' + d : '')); }

console.log('-- static mobile requirements --');
{
	const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
	const css = fs.readFileSync(path.join(DIR, 'proggStyle.css'), 'utf8');
	ok('viewport meta present', /name=["']viewport["']/.test(html));
	ok('  scaled to device width', /width=device-width/.test(html));
	ok('  and does not block pinch-zoom',
		!/user-scalable\s*=\s*no/.test(html) && !/maximum-scale\s*=\s*1/.test(html));
	ok('canvas opts out of browser touch gestures', /touch-action:\s*none/.test(css));
	ok('body height tracks the dynamic viewport', /height:\s*100dvh/.test(css));
	ok('  with a vh fallback before it',
		css.indexOf('height: 100vh') < css.indexOf('height: 100dvh'));
	ok('a narrow-screen breakpoint exists', /@media\s*\(max-width:\s*820px\)/.test(css));
	ok('  stacking the panels', /#app\s*\{\s*flex-direction:\s*column/.test(css));
	ok('  and giving the graph a real height',
		/\.editor-canvas-wrap\s*\{[^}]*height:\s*54vh/.test(css));
	ok('a coarse-pointer breakpoint exists', /@media\s*\(pointer:\s*coarse\)/.test(css));
	ok('  with 16px inputs so iOS does not zoom on focus',
		/@media\s*\(pointer:\s*coarse\)[\s\S]*?\.field-input\s*\{[^}]*font-size:\s*16px/.test(css));
}

console.log('\n-- hit targets grow on touch --');
{
	const mouse = load(false, 1200, 400);
	const touch = load(true, 1200, 400);
	ok('mouse starts in mouse mode', mouse.lastPointerType === 'mouse', mouse.lastPointerType);
	ok('a coarse pointer is detected before the first event',
		touch.lastPointerType === 'touch', touch.lastPointerType);
	ok('touch targets are larger', touch.touchSized(12) > mouse.touchSized(12),
		touch.touchSized(12) + ' vs ' + mouse.touchSized(12));
	ok('  and near the 44px platform guideline', touch.touchSized(12) * 2 >= 44,
		touch.touchSized(12) * 2);
	ok('knobs are pushed further out on touch', touch.minHandleDrawPx() > mouse.minHandleDrawPx(),
		touch.minHandleDrawPx() + ' vs ' + mouse.minHandleDrawPx());
	// The whole point: a knob must sit outside the anchor's own grab radius, or one
	// would swallow the other and the point could never be both moved and bent.
	ok('  far enough to clear the finger-sized anchor',
		touch.minHandleDrawPx() > touch.touchSized(12),
		touch.minHandleDrawPx() + ' > ' + touch.touchSized(12));
	ok('mouse geometry is unchanged', mouse.minHandleDrawPx() === 26 && mouse.touchSized(12) === 12);
}

console.log('\n-- the pointer type follows the device in use --');
{
	const sb = load(false, 1200, 400);
	const P = sb.makePoint;
	sb.activeProfiles[0].controlPoints = [P(0, 0, 0.1, 0), P(0.5, 0.5, 0.1, 0), P(1, 0, 0.1, 0)];
	sb.activeProfileIndex = 0;

	const ev = (x, y, type) => ({ currentTarget: sb.__canvas, clientX: x, clientY: y,
		pointerId: 1, button: 0, pointerType: type });

	sb.startEdit(ev(600, 200, 'touch'));
	ok('a touch event switches to touch sizing', sb.lastPointerType === 'touch');
	sb.endEdit(ev(600, 200, 'touch'));
	sb.startEdit(ev(600, 200, 'mouse'));
	ok('a mouse event switches back', sb.lastPointerType === 'mouse');
	sb.endEdit(ev(600, 200, 'mouse'));

	// dblclick carries no pointerType, so it must inherit rather than reset.
	sb.startEdit(ev(600, 200, 'touch'));
	sb.endEdit(ev(600, 200, 'touch'));
	sb.removePoint({ currentTarget: sb.__canvas, clientX: 600, clientY: 200 });
	ok('double-tap keeps finger-sized removal', sb.lastPointerType === 'touch', sb.lastPointerType);
	ok('  and actually removed the point', sb.activeProfiles[0].controlPoints.length === 2,
		sb.activeProfiles[0].controlPoints.length);
}

console.log('\n-- a finger can grab a collapsed handle --');
{
	const sb = load(true, 390, 300);        // phone-width canvas
	const P = sb.makePoint;
	const prof = sb.activeProfiles[0];
	prof.controlPoints = [P(0, 0, 0.1, 0), P(0.5, 0.5, 0.00002, 0), P(1, 0, 0.1, 0)];
	sb.activeProfileIndex = 0;
	sb.activePointIndex = 1;
	const ev = (x, y) => ({ currentTarget: sb.__canvas, clientX: x, clientY: y,
		pointerId: 1, button: 0, pointerType: 'touch' });

	const ax = 195, ay = 150;
	sb.startEdit(ev(ax + sb.minHandleDrawPx(), ay));
	ok('tapping the drawn knob grabs the handle', sb.draggingHandle === 'out', sb.draggingHandle);
	sb.endEdit(ev(ax + sb.minHandleDrawPx(), ay));

	sb.activePointIndex = 1;
	sb.startEdit(ev(ax, ay));
	ok('tapping the anchor still grabs the anchor',
		sb.draggingHandle === null && sb.draggingAnchorIndex === 1,
		sb.draggingHandle + '/' + sb.draggingAnchorIndex);
	sb.endEdit(ev(ax, ay));
}

console.log('\n-- labels thin out on a narrow canvas --');
{
	const wide = load(false, 1200, 400);
	const P = wide.makePoint;
	const shape = () => [P(0, 0.1, 0.05, 0), P(0.25, 0.8, 0.05, 0), P(0.5, 0.6, 0.05, 0),
		P(0.75, 0.7, 0.05, 0), P(1, 0.3, 0.05, 0)];
	const count = (sb, activeIdx) => {
		sb.activeProfiles[0].controlPoints = shape();
		sb.activeProfileIndex = 0;
		sb.activePointIndex = activeIdx;
		sb.hoveredPointIndex = -1;
		sb.crosshairX = -1;
		sb.__resetCtx();
		sb.drawCanvas(0);
		return texts.filter(t => / bar · /.test(t)).length;
	};
	ok('a desktop canvas labels every point', count(wide, -1) === 5, count(wide, -1));

	const narrow = load(true, 390, 300);
	ok('a phone canvas labels none when nothing is selected', count(narrow, -1) === 0,
		count(narrow, -1));
	ok('  and only the selected one when there is one', count(narrow, 2) === 1, count(narrow, 2));

	// Few enough points to fit, so the thinning must not kick in.
	const few = load(true, 390, 300);
	few.activeProfiles[0].controlPoints = [P(0, 0.1, 0.05, 0), P(0.5, 0.8, 0.05, 0), P(1, 0.3, 0.05, 0)];
	few.activeProfileIndex = 0;
	few.activePointIndex = -1;
	few.hoveredPointIndex = -1;
	few.crosshairX = -1;
	few.__resetCtx();
	few.drawCanvas(0);
	ok('a sparse phone canvas still labels everything',
		texts.filter(t => / bar · /.test(t)).length === 3,
		texts.filter(t => / bar · /.test(t)).length);
}

console.log('\n-- the hint matches the input device --');
{
	for (const [coarse, want] of [[true, 'tap'], [false, 'click']]) {
		const sb = load(coarse, 390, 300);
		const hints = [];
		sb.document.createElement = () => ({ style: {}, classList: { toggle() {} },
			appendChild() {}, addEventListener() {} });
		// addElements needs far more DOM than is worth stubbing; check the branch directly.
		const src = fs.readFileSync(path.join(DIR, 'programmer.js'), 'utf8');
		ok('hint has a ' + want + ' wording available',
			new RegExp("'" + want + " to add").test(src));
	}
	const src = fs.readFileSync(path.join(DIR, 'programmer.js'), 'utf8');
	ok('and it is chosen by pointer type',
		/lastPointerType === 'touch'\s*\n?\s*\?\s*'tap to add/.test(src));
}


console.log('\n-- double-tap removes a point without any dblclick event --');
{
	// The bug: removal hung entirely off `dblclick`, which mobile browsers do not
	// reliably synthesise once touch-action:none suppresses double-tap zoom. These
	// cases fire pointer events only — no dblclick — which is what a phone really did.
	const sb = load(true, 800, 400);
	const P = sb.makePoint;
	const prof = sb.activeProfiles[0];
	sb.activeProfileIndex = 0;

	const reset = () => {
		prof.controlPoints = [P(0, 0.1, 0.05, 0), P(0.5, 0.7, 0.05, 0), P(1, 0.3, 0.05, 0)];
		sb.activePointIndex = -1;
		sb.lastTap = null;
		sb.lastTouchRemoveAt = -Infinity;
	};
	// Anchor 1 sits at (400, 120) on an 800x400 canvas.
	const AX = 400, AY = 120;
	const tap = (x, y) => {
		const ev = t => ({ currentTarget: sb.__canvas, clientX: x, clientY: y,
			pointerId: 1, button: 0, pointerType: 'touch' });
		sb.startEdit(ev()); sb.endEdit(ev());
	};

	reset();
	tap(AX, AY);
	ok('one tap selects rather than removes',
		prof.controlPoints.length === 3 && sb.activePointIndex === 1,
		prof.controlPoints.length + ' points, active ' + sb.activePointIndex);

	tap(AX, AY);
	ok('a second tap removes it — with no dblclick involved',
		prof.controlPoints.length === 2, prof.controlPoints.length + ' points');

	// An unhurried but deliberate double-tap still counts. 380ms is past the ~300ms
	// browsers use for double-tap-to-zoom, which is why that threshold is the wrong one
	// to borrow for a considered action on a small target.
	reset();
	tap(AX, AY);
	sb.lastTap.time -= 380;
	tap(AX, AY);
	ok('an unhurried double-tap still removes', prof.controlPoints.length === 2,
		prof.controlPoints.length + ' points');

	// A slow second tap is two separate taps, not a double-tap.
	reset();
	tap(AX, AY);
	sb.lastTap.time -= 5000;
	tap(AX, AY);
	ok('a slow second tap does not remove', prof.controlPoints.length === 3,
		prof.controlPoints.length + ' points');

	// Fingers wobble; the second tap does not have to land on the same pixel.
	reset();
	tap(AX, AY);
	tap(AX + 15, AY + 12);
	ok('a wobbly second tap still removes', prof.controlPoints.length === 2,
		prof.controlPoints.length + ' points');

	// Two quick taps on *different* anchors are not a double-tap.
	reset();
	tap(AX, AY);              // anchor 1
	tap(800, 280);            // anchor 2, at the right edge
	ok('quick taps on two different anchors remove neither',
		prof.controlPoints.length === 3, prof.controlPoints.length + ' points');
	ok('  and the second one is simply selected', sb.activePointIndex === 2,
		sb.activePointIndex);

	// Tapping empty space adds a point, so a double-tap there must not then delete it.
	reset();
	tap(AX + 60, AY + 60);
	ok('a tap on empty space adds a point', prof.controlPoints.length === 4,
		prof.controlPoints.length + ' points');
	tap(AX + 60, AY + 60);
	ok('  and tapping it again leaves it alone rather than undoing the add',
		prof.controlPoints.length === 4, prof.controlPoints.length + ' points');

	// Dragging then tapping must not read as a double-tap.
	reset();
	const ev = (x, y) => ({ currentTarget: sb.__canvas, clientX: x, clientY: y,
		pointerId: 1, button: 0, pointerType: 'touch' });
	sb.startEdit(ev(AX, AY));
	sb.moveEdit(ev(AX + 90, AY + 40));
	sb.endEdit(ev(AX + 90, AY + 40));
	const movedX = prof.controlPoints[1].x;
	sb.startEdit(ev(AX + 90, AY + 40));
	sb.endEdit(ev(AX + 90, AY + 40));
	ok('drag then tap does not remove', prof.controlPoints.length === 3,
		prof.controlPoints.length + ' points');
	ok('  and the drag still moved the point', Math.abs(movedX - 0.5) > 0.05, movedX.toFixed(3));

	// The floor still holds: two points cannot become one.
	reset();
	prof.controlPoints = [P(0, 0.1, 0.05, 0), P(1, 0.3, 0.05, 0)];
	tap(0, 360); tap(0, 360);
	ok('double-tapping cannot go below two points', prof.controlPoints.length === 2,
		prof.controlPoints.length + ' points');

	// If a browser sends BOTH our tap pair and a synthesised dblclick, only one goes.
	reset();
	tap(AX, AY); tap(AX, AY);
	ok('the tap pair removed one', prof.controlPoints.length === 2);
	sb.removePoint({ currentTarget: sb.__canvas, clientX: AX, clientY: AY });
	ok('  and a trailing dblclick is ignored', prof.controlPoints.length === 2,
		prof.controlPoints.length + ' points');

	// Mouse users keep native double-click, which respects the OS speed setting.
	reset();
	sb.lastPointerType = 'mouse';
	sb.removePoint({ currentTarget: sb.__canvas, clientX: AX, clientY: AY });
	ok('mouse double-click still removes', prof.controlPoints.length === 2,
		prof.controlPoints.length + ' points');
}


console.log(fail === 0 ? '\nall checks passed' : '\n' + fail + ' check(s) failed');
process.exit(fail ? 1 : 0);
