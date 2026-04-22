let emptyProfiles = [];
for (let ii = 0; ii < 5; ii++) {
	emptyProfiles.push({
		name: 'test' + (ii + 1),
		volume: 240,
		time: 0,
		volLim: 0,
		pressureArray: Array(240).fill("0.0"),
		controlPoints: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
	})
}


var hasGraphed = 0;

var readProfiles = [];
var activeProfiles = emptyProfiles;


var labelarray = Array(240).fill(0);
for (let s = 0; s < 240; s++) {
	labelarray[s] = s + 1;
}

function douglasPeucker(pts, epsilon) {
	if (pts.length < 3) return pts.slice();
	let maxDist = 0, maxIdx = 0;
	const start = pts[0], end = pts[pts.length - 1];
	const dx = end.x - start.x, dy = end.y - start.y;
	const len = Math.sqrt(dx * dx + dy * dy);
	for (let i = 1; i < pts.length - 1; i++) {
		let dist;
		if (len === 0) {
			const ex = pts[i].x - start.x, ey = pts[i].y - start.y;
			dist = Math.sqrt(ex * ex + ey * ey);
		} else {
			const t = ((pts[i].x - start.x) * dx + (pts[i].y - start.y) * dy) / (len * len);
			const px = start.x + t * dx - pts[i].x;
			const py = start.y + t * dy - pts[i].y;
			dist = Math.sqrt(px * px + py * py);
		}
		if (dist > maxDist) { maxDist = dist; maxIdx = i; }
	}
	if (maxDist > epsilon) {
		const left = douglasPeucker(pts.slice(0, maxIdx + 1), epsilon);
		const right = douglasPeucker(pts.slice(maxIdx), epsilon);
		return left.slice(0, -1).concat(right);
	}
	return [{ x: pts[0].x, y: pts[0].y }, { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y }];
}

function arrayToControlPoints(profileIndex) {
	const profile = activeProfiles[profileIndex];
	const vol = Math.ceil(parseInt(profile.volume));
	if (vol < 2) {
		profile.controlPoints = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
		return;
	}
	const pts = [];
	for (let i = 0; i < vol; i++) {
		pts.push({ x: i / (vol - 1), y: Math.max(0, Math.min(1, parseFloat(profile.pressureArray[i]) / 10)) });
	}
	profile.controlPoints = douglasPeucker(pts, 0.02);
}

function deriveArray(profileIndex) {
	const profile = activeProfiles[profileIndex];
	const vol = Math.ceil(parseInt(profile.volume));
	const pts = [...profile.controlPoints].sort((a, b) => a.x - b.x);
	for (let i = 0; i < 240; i++) {
		if (i >= vol) { profile.pressureArray[i] = "0.0"; continue; }
		const t = vol === 1 ? 0 : i / (vol - 1);
		let lo = pts[0], hi = pts[pts.length - 1];
		for (let j = 0; j < pts.length - 1; j++) {
			if (pts[j].x <= t && pts[j + 1].x >= t) { lo = pts[j]; hi = pts[j + 1]; break; }
		}
		const frac = hi.x === lo.x ? 0 : (t - lo.x) / (hi.x - lo.x);
		const pressure = (lo.y + (hi.y - lo.y) * frac) * 10;
		profile.pressureArray[i] = Math.max(0, Math.min(10, Math.round(pressure * 10) / 10));
	}
}

var activeProfileIndex = 0;
const PROFILE_COLORS = ['#FFBE86', '#FFE156', '#33E9CE', '#FFB5C2', '#3777FF'];
var draggingPointIndex = -1;
var hoveredPointIndex = -1;
var fileVersionValue = 2;

function addElements() {
	const profileList = document.getElementById('profile-list');
	const canvasArea = document.getElementById('canvas-area');
	const editorHeader = document.getElementById('editor-header');

	for (let n = 0; n < 5; n++) {
		// Profile list item
		const item = document.createElement('div');
		item.className = 'profile-item' + (n === activeProfileIndex ? ' active' : '');
		item.id = 'profile-item-' + (n + 1);

		const dot = Object.assign(document.createElement('div'), { className: 'profile-dot' });
		dot.style.background = PROFILE_COLORS[n];

		const nameSpan = Object.assign(document.createElement('span'), {
			className: 'profile-name',
			id: 'profile-list-name-' + (n + 1),
			textContent: activeProfiles[n].name || ('Profile ' + (n + 1)),
		});
		const volSpan = Object.assign(document.createElement('span'), {
			className: 'profile-vol',
			id: 'profile-list-vol-' + (n + 1),
			textContent: activeProfiles[n].volume + 'ml',
		});

		item.appendChild(dot);
		item.appendChild(nameSpan);
		item.appendChild(volSpan);
		item.addEventListener('click', (function(idx) { return function() { setActiveProfile(idx); }; })(n));
		profileList.appendChild(item);

		// Canvas wrapper
		const wrap = Object.assign(document.createElement('div'), {
			className: 'editor-canvas-wrap',
			id: 'canvas-wrap-' + (n + 1),
		});
		wrap.style.display = n === 0 ? 'flex' : 'none';

		const canvas = Object.assign(document.createElement('canvas'), {
			id: 'editor-canvas-' + (n + 1),
			width: 1200,
			height: 400,
		});
		canvas.addEventListener('mousedown', startEdit);
		canvas.addEventListener('mousemove', moveEdit);
		canvas.addEventListener('mouseup', endEdit);
		canvas.addEventListener('mouseleave', endEdit);
		canvas.addEventListener('dblclick', removePoint);

		const hint = Object.assign(document.createElement('span'), {
			className: 'canvas-hint',
			textContent: 'click to add · drag to move · dbl-click to remove',
		});

		wrap.appendChild(canvas);
		wrap.appendChild(hint);
		canvasArea.appendChild(wrap);
	}

	// Editor header inputs (shared, reflect active profile)
	editorHeader.innerHTML = `
		<div class="field-group">
			<span class="field-label">Name</span>
			<input class="field-input name-input" id="nameBox" type="text" placeholder="NAME" maxlength="8">
		</div>
		<div class="field-group">
			<span class="field-label">Volume</span>
			<input class="field-input num-input" id="volBox" type="number" min="4" max="240">
			<span class="unit-label">ml</span>
		</div>
		<div class="field-group">
			<span class="field-label">Time</span>
			<input class="field-input num-input" id="timeBox" type="number" min="0">
			<span class="unit-label">s</span>
		</div>
		<div class="limit-row">
			<input type="checkbox" id="limCheck">
			<label for="limCheck">Limit to volume</label>
		</div>
	`;

	document.getElementById('nameBox').addEventListener('change', profileInputUpdate);
	document.getElementById('volBox').addEventListener('change', profileInputUpdate);
	document.getElementById('timeBox').addEventListener('change', profileInputUpdate);
	document.getElementById('limCheck').addEventListener('change', profileInputUpdate);

	console.debug("All elements loaded");
}

function setActiveProfile(n) {
	activeProfileIndex = n;

	for (let i = 0; i < 5; i++) {
		document.getElementById('profile-item-' + (i + 1)).classList.toggle('active', i === n);
		document.getElementById('canvas-wrap-' + (i + 1)).style.display = i === n ? 'flex' : 'none';
	}

	const profile = activeProfiles[n];
	document.getElementById('nameBox').value = profile.name;
	document.getElementById('volBox').value = profile.volume;
	document.getElementById('timeBox').value = profile.time;
	document.getElementById('limCheck').checked = !!profile.volLim;

	drawCanvas(n);
}

function profileInputUpdate() {
	const n = activeProfileIndex;
	const profile = activeProfiles[n];

	const name = document.getElementById('nameBox').value.toUpperCase().substring(0, 8);
	const volume = Math.min(240, Math.max(4, parseInt(document.getElementById('volBox').value) || 240));
	const time = parseInt(document.getElementById('timeBox').value) || 0;
	const volLim = document.getElementById('limCheck').checked;

	document.getElementById('nameBox').value = name;
	document.getElementById('volBox').value = volume;

	profile.name = name;
	profile.volume = volume;
	profile.time = time;
	profile.volLim = volLim ? 1 : 0;

	document.getElementById('timeBox').value = time;

	document.getElementById('profile-list-name-' + (n + 1)).textContent = name || ('Profile ' + (n + 1));
	document.getElementById('profile-list-vol-' + (n + 1)).textContent = volume + 'ml';

	drawCanvas(n);
	graphIt(activeProfiles);
}

function drawCanvas(profileIndex) {
	const canvas = document.getElementById('editor-canvas-' + (profileIndex + 1));
	if (!canvas) return;
	const ctx = canvas.getContext('2d');
	ctx.save();
	const w = canvas.width;
	const h = canvas.height;
	const profile = activeProfiles[profileIndex];
	const vol = Math.ceil(parseInt(profile.volume));
	const color = PROFILE_COLORS[profileIndex];
	const pts = [...(profile.controlPoints || [{ x: 0, y: 0 }, { x: 1, y: 0 }])].sort((a, b) => a.x - b.x);

	ctx.clearRect(0, 0, w, h);

	// Pre-infusion zone (~first 18ml)
	const preW = Math.min(w, (18 / vol) * w);
	ctx.fillStyle = 'rgba(55, 119, 255, 0.05)';
	ctx.fillRect(0, 0, preW, h);

	// Horizontal grid lines (0–10 bar)
	for (let bar = 0; bar <= 10; bar++) {
		const y = h - (bar / 10) * h;
		ctx.strokeStyle = bar === 0 ? '#dde3ec' : '#eaeff5';
		ctx.lineWidth = bar === 0 ? 1.5 : 1;
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(w, y);
		ctx.stroke();
		if (bar > 0 && bar < 10) {
			ctx.fillStyle = '#c8d0dc';
			ctx.font = '14px system-ui';
			ctx.fillText(bar, 6, y - 4);
		}
	}

	// Vertical grid lines (every 24ml)
	for (let ml = 24; ml < vol; ml += 24) {
		const x = (ml / (vol - 1)) * w;
		ctx.strokeStyle = '#eaeff5';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(x, 0);
		ctx.lineTo(x, h);
		ctx.stroke();
	}

	if (pts.length < 2) { ctx.restore(); return; }

	function cpX(p) { return p.x * w; }
	function cpY(p) { return (1 - p.y) * h; }

	function buildPath() {
		ctx.moveTo(cpX(pts[0]), cpY(pts[0]));
		for (let i = 1; i < pts.length; i++) {
			const x0 = cpX(pts[i - 1]), y0 = cpY(pts[i - 1]);
			const x1 = cpX(pts[i]),     y1 = cpY(pts[i]);
			ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
		}
		ctx.lineTo(cpX(pts[pts.length - 1]), cpY(pts[pts.length - 1]));
	}

	const r = parseInt(color.slice(1, 3), 16);
	const g = parseInt(color.slice(3, 5), 16);
	const b = parseInt(color.slice(5, 7), 16);

	// Fill under curve
	ctx.beginPath();
	buildPath();
	ctx.lineTo(w, h);
	ctx.lineTo(0, h);
	ctx.closePath();
	ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.15)';
	ctx.fill();

	// Stroke curve
	ctx.beginPath();
	buildPath();
	ctx.strokeStyle = color;
	ctx.lineWidth = 2.5;
	ctx.lineJoin = 'round';
	ctx.lineCap = 'round';
	ctx.stroke();

	// Control point handles — iterate insertion-order so index i matches hoveredPointIndex
	profile.controlPoints.forEach(function(cp, i) {
		const cx = cp.x * w;
		const cy = (1 - cp.y) * h;
		const radius = i === hoveredPointIndex ? 8 : 5;
		ctx.beginPath();
		ctx.arc(cx, cy, radius, 0, Math.PI * 2);
		ctx.fillStyle = '#fff';
		ctx.fill();
		ctx.strokeStyle = color;
		ctx.lineWidth = 2;
		ctx.stroke();
	});

	ctx.restore();
}

function startEdit(e) {
	const canvas = e.currentTarget;
	const rect = canvas.getBoundingClientRect();
	const scaleX = canvas.width / rect.width;
	const scaleY = canvas.height / rect.height;
	const mx = (e.clientX - rect.left) * scaleX;
	const my = (e.clientY - rect.top) * scaleY;
	const profile = activeProfiles[activeProfileIndex];
	const HIT = 12 * scaleX;

	const idx = profile.controlPoints.findIndex(function(cp) {
		return Math.hypot(cp.x * canvas.width - mx, (1 - cp.y) * canvas.height - my) < HIT;
	});

	if (idx >= 0) {
		draggingPointIndex = idx;
	} else {
		profile.controlPoints.push({
			x: Math.max(0, Math.min(1, mx / canvas.width)),
			y: Math.max(0, Math.min(1, 1 - my / canvas.height)),
		});
		draggingPointIndex = profile.controlPoints.length - 1;
	}

	drawCanvas(activeProfileIndex);
	graphIt(activeProfiles);
}

function moveEdit(e) {
	const canvas = e.currentTarget;
	const rect = canvas.getBoundingClientRect();
	const scaleX = canvas.width / rect.width;
	const scaleY = canvas.height / rect.height;
	const mx = (e.clientX - rect.left) * scaleX;
	const my = (e.clientY - rect.top) * scaleY;
	const profile = activeProfiles[activeProfileIndex];

	if (draggingPointIndex >= 0) {
		profile.controlPoints[draggingPointIndex] = {
			x: Math.max(0, Math.min(1, mx / canvas.width)),
			y: Math.max(0, Math.min(1, 1 - my / canvas.height)),
		};
		drawCanvas(activeProfileIndex);
		graphIt(activeProfiles);
	} else {
		const HIT = 16 * scaleX;
		const prev = hoveredPointIndex;
		hoveredPointIndex = profile.controlPoints.findIndex(function(cp) {
			return Math.hypot(cp.x * canvas.width - mx, (1 - cp.y) * canvas.height - my) < HIT;
		});
		if (hoveredPointIndex !== prev) drawCanvas(activeProfileIndex);
	}
}

function endEdit() {
	draggingPointIndex = -1;
	hoveredPointIndex = -1;
	drawCanvas(activeProfileIndex);
}

function removePoint(e) {
	const canvas = e.currentTarget;
	const rect = canvas.getBoundingClientRect();
	const scaleX = canvas.width / rect.width;
	const scaleY = canvas.height / rect.height;
	const mx = (e.clientX - rect.left) * scaleX;
	const my = (e.clientY - rect.top) * scaleY;
	const profile = activeProfiles[activeProfileIndex];
	if (profile.controlPoints.length <= 2) return;

	const HIT = 12 * scaleX;
	const idx = profile.controlPoints.findIndex(function(cp) {
		return Math.hypot(cp.x * canvas.width - mx, (1 - cp.y) * canvas.height - my) < HIT;
	});

	if (idx >= 0) {
		profile.controlPoints.splice(idx, 1);
		hoveredPointIndex = -1;
		drawCanvas(activeProfileIndex);
		graphIt(activeProfiles);
	}
}


function getFileVersion(versionVal) {
	if (versionVal === undefined) versionVal = fileVersionValue;
	fileVersionValue = versionVal > 1.5 ? 2 : 1;
	document.getElementById('ver1').classList.toggle('active', fileVersionValue === 1);
	document.getElementById('ver2').classList.toggle('active', fileVersionValue === 2);
}

function setFileVersion(v) {
	fileVersionValue = v;
	document.getElementById('ver1').classList.toggle('active', v === 1);
	document.getElementById('ver2').classList.toggle('active', v === 2);
}



var myChart;


function fixDropAera() {
	var dropArea = document.getElementById('drop-area');

	// Prevent default drag behaviors
	['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
		dropArea.addEventListener(eventName, preventDefaults, false);
		document.body.addEventListener(eventName, preventDefaults, false);
	});

	// Highlight drop area when file is dragged over it
	['dragenter', 'dragover'].forEach(eventName => {
		dropArea.addEventListener(eventName, highlight, false);
	});

	// Unhighlight drop area when file is dragged out of it
	['dragleave', 'drop'].forEach(eventName => {
		dropArea.addEventListener(eventName, unhighlight, false);
	});

	// Handle dropped files
	dropArea.addEventListener('drop', handleDrop, false);

	function preventDefaults(e) {
		e.preventDefault();
		e.stopPropagation();
	}

	function highlight() {
		dropArea.classList.add('highlight');
	}
	function unhighlight() {
		dropArea.classList.remove('highlight');
	}

	function handleDrop(e) {
		var dt = e.dataTransfer;
		var files = dt.files;

		handleFiles(files);
	}
}


function graphIt(profiles) {
	var ctx = document.getElementById('myChart');
	const data = {
		labels: labelarray,
		datasets: [{
			label: 'Dataset 1',
			data: profiles[0].pressureArray,
			borderColor: '#FFBE86',
			backgroundColor: '#FFBE86',
			tension: 0.4,
		}, {
			label: 'Dataset 2',
			data: profiles[1].pressureArray,
			borderColor: '#FFE156',
			backgroundColor: '#FFE156',
			tension: 0.4,
		}, {
			label: 'Dataset 3',
			data: profiles[2].pressureArray,
			borderColor: '#33E9CE',
			backgroundColor: '#33E9CE',
			tension: 0.4,
		}, {
			label: 'Dataset 4',
			data: profiles[3].pressureArray,
			borderColor: '#FFB5C2',
			backgroundColor: '#FFB5C2',
			tension: 0.4,
		}, {
			label: 'Dataset 5',
			data: profiles[4].pressureArray,
			borderColor: '#3777FF',
			backgroundColor: '#3777FF',
			tension: 0.4,
		}]
	};

	


	const config = {
		type: 'line',
		data: data,
		options: {
			responsive: true,
			maintainAspectRatio: true,
			scales: {
				y: {
					suggestedMin: 0,
					suggestedMax: 10,
					title: {
						display: true,
						text: 'Pressure \n bar'
					}
				},
				x: {
					title: {
						display: true,
						text: 'Volume ml'
					}
				},
			}
		},
		plugins:[]
	};



	if (hasGraphed) {
		let highestVol = Math.max.apply(Math, profiles.map(function (o) {
			return o.volume;
		}));
		myChart.data.labels = labelarray.slice(0, -(240 - highestVol) - 1);
		myChart.data.datasets = [{
			label: "1: " + profiles[0].name,
			data: profiles[0].pressureArray,
			borderColor: '#FFBE86',
			backgroundColor: '#FFBE86',
			tension: 0.4,
		}, {
			label: "2: " + profiles[1].name,
			data: profiles[1].pressureArray,
			borderColor: '#FFE156',
			backgroundColor: '#FFE156',
			tension: 0.4,
		}, {
			label: "3: " + profiles[2].name,
			data: profiles[2].pressureArray,
			borderColor: '#33E9CE',
			backgroundColor: '#33E9CE',
			tension: 0.4,
		}, {
			label: "4: " + profiles[3].name,
			data: profiles[3].pressureArray,
			borderColor: '#FFB5C2',
			backgroundColor: '#FFB5C2',
			tension: 0.4,
		}, {
			label: "5: " + profiles[4].name,
			data: profiles[4].pressureArray,
			borderColor: '#3777FF',
			backgroundColor: '#3777FF',
			tension: 0.4,
		}];

		myChart.update();
	} else {
		myChart = new Chart(ctx, config);
		hasGraphed = 1;
	}
};


// run after page load
document.addEventListener("DOMContentLoaded", function(event) {
	graphIt(emptyProfiles);
	addElements();
	setActiveProfile(0);

	document.getElementById('ver1').addEventListener('click', function() { setFileVersion(1); });
	document.getElementById('ver2').addEventListener('click', function() { setFileVersion(2); });
	document.getElementById('settingNum').addEventListener('input', function() {
		document.getElementById('outputFileSmoothness').textContent = this.value;
	});

	const fileInput = document.getElementById("fileElem");
	fileInput.addEventListener('change', function() { handleFiles(this.files); });

	getFileVersion(2);
	fixDropAera();
	document.getElementById('bigOutButton').addEventListener("click", writeOut);
});

// Function to handle selected files
function handleFiles(fileList) {
	// Get the number of files selected
	const numFiles = fileList.length;
	// Display the number of files in the console
	console.debug("Read: " + numFiles + " files.");
	// Create a new FileReader object to read the contents of the file
	let reader = new FileReader();

	// Event handler when the file is successfully loaded
	reader.onload = (e) => {
		// Get the file content as a string
		let file = e.target.result;
		file = file.replaceAll('\n', "");
		var lines = file.split('\r');

		// Determine the value of 'ofsets' based on the number of lines in the file
		const inputVersion = (lines.length < 400) ? 1 : 2;
		const ofsets = (inputVersion < 2) ? 66 : 246;


		console.debug(lines);
		readProfiles = [];

		// Loop through each set of data in the file
		for (let i = 0; i < 5; i++) {
			// Process each line of data for a given set
			lines[2 + i * ofsets] = lines[2 + i * ofsets].substring(5);
			lines[3 + i * ofsets] = parseInt(lines[3 + i * ofsets].substring(3));
			lines[4 + i * ofsets] = parseInt(lines[4 + i * ofsets].substring(5));
			for (let l = 5; l < ofsets - 1; l++) {
				lines[l + i * ofsets] = parseFloat(lines[l + i * ofsets].substring(4));
			}
		}

		// Read profile data and store it in the 'readProfiles' array
		for (let j = 0; j < 5; j++) {
			console.debug("Reading profile" + (j + 1))
			readProfiles.push({
				name: lines[2 + (ofsets * j)],
				volume: lines[3 + (ofsets * j)],
				time: lines[4 + (ofsets * j)],
				volLim: 0,
				pressureArray: lines.slice(5 + (ofsets * j), ofsets - 1 + (ofsets * j))
			});

		}
		readProfiles = interpolateProfile(readProfiles, 240);
		console.debug(readProfiles);
		activeProfiles = readProfiles;
		graphIt(activeProfiles);
		for (let i = 0; i < 5; i++) {
			arrayToControlPoints(i);
			document.getElementById('profile-list-name-' + (i + 1)).textContent = activeProfiles[i].name || ('Profile ' + (i + 1));
			document.getElementById('profile-list-vol-' + (i + 1)).textContent = activeProfiles[i].volume + 'ml';
			drawCanvas(i);
		}
		setActiveProfile(activeProfileIndex);
	};

	// Read the contents of the first selected file as text
	reader.readAsText(fileList[0]);
}

function interpolateProfile(originalProfiles, wantedLenght) {
	for (o = 0; o < 5; o++) {
		const profile = originalProfiles[o].pressureArray;
		newProfile = interpolateArray(profile, wantedLenght);
		originalProfiles[o].pressureArray = newProfile;
	}
	return originalProfiles;
}

function interpolateArray(originalArray, targetLength) {
	const originalLength = originalArray.length;
	const ratio = (originalLength - 1) / (targetLength - 1);
	const interpolatedArray = [];

	for (let i = 0; i < targetLength; i++) {
		const index = i * ratio;
		const lowerIndex = Math.floor(index);
		const upperIndex = Math.ceil(index);

		if (lowerIndex === upperIndex) {
			interpolatedArray.push(originalArray[lowerIndex]);
		} else {
			const lowerValue = originalArray[lowerIndex];
			const upperValue = originalArray[upperIndex];
			const fraction = index - lowerIndex;
			const interpolatedValue = lowerValue + fraction * (upperValue - lowerValue);
			interpolatedArray.push(interpolatedValue);
		}
	}

	return interpolatedArray;
}


function getTextFile(fileVersion = 1) {
	let finFile = "";
	let mlPerStep = 4;
	if (fileVersion == 2) {
		mlPerStep = 1;
		outPutProfiles = interpolateProfile(activeProfiles, 240);
	} else {
		outPutProfiles = interpolateProfile(activeProfiles, 60);
	}
	let steps = Math.floor(240 / mlPerStep);

	for (o = 0; o < 5; o++) {
		let volumeTxt = "";
		let timeTxt = "";
		let start = "TYPE:P\rINDEX: " + o + "\rNAME:" + outPutProfiles[o].name + "\r";
		volumeTxt = "ML:" + String(outPutProfiles[o].volume).padStart(4, " ") + "\r"
		timeTxt = "TIME:" + String(outPutProfiles[o].time).padStart(4, " ") + "\r"
		let arrayTxt = "";
		for (ee = 0; ee < steps; ee++) {
			estring = ee.toString();
			arrayTxt = arrayTxt.concat(estring.padStart(3, " ") + ":" + (parseFloat(outPutProfiles[o].pressureArray[ee]).toFixed(1)).padStart(4, " ") + "\r");
		}
		arrayTxt = arrayTxt.concat("\r\n")
		finFile = finFile.concat(start, volumeTxt, timeTxt, arrayTxt);
	}
	return finFile;
}

function writeOut() {
	console.debug("writing Out");
	for (let i = 0; i < 5; i++) deriveArray(i);
	let finishedFile = getTextFile(fileVersionValue);

	var file = new Blob([finishedFile], { type: 'text/plain; charset=utf-8' });
	var a = document.createElement("a");
	var url = URL.createObjectURL(file);
	a.href = url;
	a.download = "IMPONE";
	document.body.appendChild(a);
	a.click();
	setTimeout(function() {
		document.body.removeChild(a);
		window.URL.revokeObjectURL(url);
	}, 0);

	console.debug(finishedFile);
}
