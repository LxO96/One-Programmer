// Global editor settings, overlay modals and canvas zone labels.
//
// These settings are machine-wide, shared by all five profiles, and are a visual
// guide only: the v1/v2 export format has no pre-infusion field, so nothing here
// travels to the machine.

const SETTINGS_KEY = 'cremOne.settings';
const WELCOME_KEY = 'cremOne.welcomeSeen';
// Pump millilitres, not what reaches the cup — see PUMP_TO_CUP in programmer.js. An
// 18g puck soaks up roughly 36ml before it starts giving anything back, so ~30ml is
// about what it takes to wet it through without pushing the shot. That is a quarter
// of the 120ml default profile, which is also what it looks like on the graph.
const DEFAULT_PRE_INFUSION_ML = 30;
const MAX_PRE_INFUSION_ML = 240;

var appSettings = { preInfusionMl: DEFAULT_PRE_INFUSION_ML };

// The page is usually opened straight off disk over file://, where some browsers
// treat the origin as opaque and throw on any localStorage access. Persistence is
// never allowed to break the editor, so both accessors degrade to in-memory only.
function storageGet(key) {
	try { return window.localStorage.getItem(key); }
	catch (e) { return null; }
}

function storageSet(key, value) {
	try { window.localStorage.setItem(key, value); return true; }
	catch (e) { return false; }
}

function storageRemove(key) {
	try { window.localStorage.removeItem(key); return true; }
	catch (e) { return false; }
}

// Single validation choke point, applied on load as well as on input — a corrupt
// or hand-edited stored value must not produce a zone wider than the canvas.
function clampPreInfusion(v) {
	if (v === '' || v === null || v === undefined) return DEFAULT_PRE_INFUSION_ML;
	const n = Math.round(Number(v));
	if (!isFinite(n)) return DEFAULT_PRE_INFUSION_ML;
	return Math.max(0, Math.min(MAX_PRE_INFUSION_ML, n));
}

function loadSettings() {
	const raw = storageGet(SETTINGS_KEY);
	if (raw) {
		try {
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed === 'object') {
				appSettings.preInfusionMl = clampPreInfusion(parsed.preInfusionMl);
				return appSettings;
			}
		} catch (e) {
			// Corrupt JSON — fall through to defaults rather than failing startup.
		}
	}
	appSettings.preInfusionMl = DEFAULT_PRE_INFUSION_ML;
	return appSettings;
}

function saveSettings() {
	storageSet(SETTINGS_KEY, JSON.stringify(appSettings));
}

function getPreInfusionMl() { return appSettings.preInfusionMl; }

function setPreInfusionMl(v) {
	appSettings.preInfusionMl = clampPreInfusion(v);
	saveSettings();
	return appSettings.preInfusionMl;
}

function hasSeenWelcome() { return storageGet(WELCOME_KEY) === '1'; }
function markWelcomeSeen() { storageSet(WELCOME_KEY, '1'); }
function resetWelcome() { storageRemove(WELCOME_KEY); }


// ── Canvas zone labels ──

// Faint watermark centred in a zone. Skipped when the zone is too narrow to hold
// the text, so a full-width profile doesn't clip "PRE-INFUSION" into a stub and a
// zero-length pre-infusion draws no label at all.
function drawZoneLabel(ctx, text, x0, x1, h) {
	const zoneW = x1 - x0;
	if (zoneW <= 0) return false;
	const label = text.toUpperCase();
	const size = Math.max(11, Math.min(20, zoneW / 9));
	ctx.save();
	ctx.font = '700 ' + size + 'px system-ui, sans-serif';
	// Ignored by older browsers; set before measureText so the fit check counts it.
	ctx.letterSpacing = '0.18em';
	const tw = ctx.measureText(label).width;
	if (tw > zoneW - 16) { ctx.restore(); return false; }
	ctx.fillStyle = 'rgba(20, 30, 48, 0.07)';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(label, x0 + zoneW / 2, h / 2);
	ctx.restore();
	return true;
}


// ── Modals ──

var openModalId = null;

function openModal(id) {
	const backdrop = document.getElementById('modal-backdrop');
	if (!backdrop) return;
	// Every dialog in the backdrop is hidden and the requested one revealed, so adding
	// a dialog to the markup needs no matching list here.
	backdrop.querySelectorAll('.modal').forEach(function(el) {
		el.hidden = el.id !== id;
	});
	backdrop.hidden = false;
	openModalId = id;
}

function closeModal() {
	const backdrop = document.getElementById('modal-backdrop');
	if (!backdrop) return;
	backdrop.hidden = true;
	if (openModalId === 'welcome-modal') markWelcomeSeen();
	// Dismissing by any route — Cancel, ✕, Escape, the backdrop — must disarm a pending
	// destructive action rather than leaving it primed for the next dialog.
	pendingConfirm = null;
	openModalId = null;
}


// ── Confirmation for destructive actions ──

var pendingConfirm = null;

// opts: { title, message, confirmLabel, onConfirm }
function openConfirm(opts) {
	const title = document.getElementById('confirm-title');
	const text = document.getElementById('confirm-text');
	const button = document.getElementById('confirmButton');
	// Without the dialog present there is no way to ask, so the action does not happen.
	if (!title || !text || !button) return false;
	title.textContent = opts.title;
	text.textContent = opts.message;
	button.textContent = opts.confirmLabel || 'Confirm';
	pendingConfirm = opts.onConfirm;
	openModal('confirm-modal');
	return true;
}

// Bound once at startup rather than per-open, so repeated dialogs can't stack up
// listeners and fire an action several times.
function runPendingConfirm() {
	const fn = pendingConfirm;
	closeModal();          // clears pendingConfirm
	if (typeof fn === 'function') fn();
}

function openSettings() {
	const input = document.getElementById('preInfusionBox');
	if (input) input.value = getPreInfusionMl();
	openModal('settings-modal');
}

function preInfusionInputUpdate() {
	const input = document.getElementById('preInfusionBox');
	const value = setPreInfusionMl(input.value);
	input.value = value;
	if (typeof drawCanvas === 'function') drawCanvas(activeProfileIndex);
}

// The intro demos animate with SMIL, which CSS media queries can't reach, so
// prefers-reduced-motion has to be honoured here. Freezing rather than removing them
// leaves each diagram readable in its opening pose.
function applyReducedMotion() {
	if (!window.matchMedia) return;
	let reduced;
	try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
	catch (e) { return; }
	if (!reduced) return;
	document.querySelectorAll('.demo svg').forEach(function(svg) {
		if (svg.pauseAnimations) svg.pauseAnimations();
	});
}

function initOverlays() {
	loadSettings();
	applyReducedMotion();

	const settingsButton = document.getElementById('settingsButton');
	if (settingsButton) settingsButton.addEventListener('click', openSettings);

	const input = document.getElementById('preInfusionBox');
	if (input) {
		input.value = getPreInfusionMl();
		input.addEventListener('change', preInfusionInputUpdate);
		input.addEventListener('input', preInfusionInputUpdate);
	}

	document.querySelectorAll('[data-close-modal]').forEach(function(el) {
		el.addEventListener('click', closeModal);
	});

	const confirmButton = document.getElementById('confirmButton');
	if (confirmButton) confirmButton.addEventListener('click', runPendingConfirm);

	const showIntro = document.getElementById('showIntroAgain');
	if (showIntro) {
		showIntro.addEventListener('click', function(e) {
			e.preventDefault();
			resetWelcome();
			openModal('welcome-modal');
		});
	}

	const backdrop = document.getElementById('modal-backdrop');
	if (backdrop) {
		// Only a click on the backdrop itself dismisses; clicks inside the dialog bubble
		// up to here too and must not close it.
		backdrop.addEventListener('click', function(e) {
			if (e.target === backdrop) closeModal();
		});
	}

	document.addEventListener('keydown', function(e) {
		if (e.key === 'Escape' && openModalId) closeModal();
	});

	if (!hasSeenWelcome()) openModal('welcome-modal');
}

if (typeof document !== 'undefined' && document.addEventListener) {
	document.addEventListener('DOMContentLoaded', initOverlays);
}
