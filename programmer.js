let emptyProfiles = [];
for (let ii = 0; ii < 5; ii++) {
	emptyProfiles.push({
		name: 'test' + (ii + 1),
		volume: 240,
		time: 0,
		volLim: 0,
		pressureArray: Array(240).fill("0.0"),
	})
}


var hasGraphed = 0;

var readProfiles = [];
var activeProfiles = emptyProfiles;


var labelarray = Array(240).fill(0);
for (let s = 0; s < 240; s++) {
	labelarray[s] = s + 1;
}

var activeProfileIndex = 0;
const PROFILE_COLORS = ['#FFBE86', '#FFE156', '#33E9CE', '#FFB5C2', '#3777FF'];
var isPainting = false;
var lastPaintIndex = -1;
var lastPaintValue = 0;
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
		canvas.addEventListener('mousedown', startPaint);
		canvas.addEventListener('mousemove', continuePaint);
		canvas.addEventListener('mouseup', endPaint);
		canvas.addEventListener('mouseleave', endPaint);

		const hint = Object.assign(document.createElement('span'), {
			className: 'canvas-hint',
			textContent: 'click & drag to draw',
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

//function fixranges sets range limits and adds listners to neccesary ranges and textfeilds
function fixranges() {
	let ranges = document.querySelectorAll('[id^="in"]');
	for (const inputRange of ranges) {
		inputRange.min = "0.0";
		inputRange.max = "10.0";
		inputRange.step = "0.1";
		inputRange.value = "0.0";
		inputRange.addEventListener("change", sliderUpdate);
	}


	let texts = document.querySelectorAll('[type="text"]');
	for (const inputTexts of texts) {
		inputTexts.addEventListener("change", textUpdate);
	}


	let vLines = document.querySelectorAll('[id*="vLine"]');
	for (let i = 0; i < 25; i++) {
		vLines[i].style.left = 100 * i / 24 + '%';
		vLines[i + 25].style.left = 100 * i / 24 + '%';
		vLines[i + 50].style.left = 100 * i / 24 + '%';
		vLines[i + 75].style.left = 100 * i / 24 + '%';
		vLines[i + 100].style.left = 100 * i / 24 + '%';
	}

	let checkboxes = document.querySelectorAll('[type="checkbox"]');
	for (const inputCheckbox of checkboxes) {
		inputCheckbox.addEventListener("change", textUpdate);
	}


	let values = document.querySelectorAll('[type="number"]');
	for (const inputValues of values) {
		inputValues.addEventListener("change", textUpdate);
	}


	console.debug("all inputs done")
}


//function textUpdate updates the textboxes on change
function textUpdate(change) {
	console.debug("textupdate");

	for (let z = 0; z < 5; z++) {
		let profileName = document.getElementById('nameBox' + (z + 1)).value.toUpperCase();
		profileName = profileName.substring(0, 8);

		let volume = document.getElementById('volBox' + (z + 1)).value;
		let time = document.getElementById('timeBox' + (z + 1)).value;
		let volLim = document.getElementById('limCheck' + (z + 1)).checked;

		if (volume >= 240) {
			volume = 240;
		}
		activeProfiles[z].name = profileName;
		activeProfiles[z].volume = volume;
		activeProfiles[z].time = time;
		activeProfiles[z].volLim = volLim;

	}
	writeranges(activeProfiles);
}


//function writeranges updates all the ranges
function writeranges(profiles) {
	let ranges = [];

	for (let z = 0; z < 5; z++) {
		let highestRange = Math.ceil(parseInt(profiles[z].volume));  //finds index of highest range to be editable
		console.debug(highestRange);
		for (let x = 0; x < (highestRange); x++) {  //indexes over range up to highest range

			let specificIn = document.getElementById('in' + (z + 1) + ':' + (x + 1));
			specificIn.value = profiles[z].pressureArray[x];
			specificIn.style.display = 'inline-block';
			specificIn.style.width = 100 / (highestRange) + '%';
		}
		document.getElementById('nameBox' + (z + 1)).value = profiles[z].name;
		document.getElementById('volBox' + (z + 1)).value = profiles[z].volume;

		for (let x = (highestRange); x < 240; x++) {
			let specificIn = document.getElementById('in' + (z + 1) + ':' + (x + 1));
			specificIn.style.display = 'none';

			if ((activeProfiles[z].volLim) == 1) {
				console.debug("limited volume");
				profiles[z].pressureArray[x] = 0.0;
			}
		}

		let highestVolume = Math.ceil(parseInt(profiles[z].volume) / 10);

		for (let x = 0; x < 24; x++) {

			let specificV = document.getElementById('vLine' + (z + 1) + ':' + x);
			if (x > highestVolume) {
				specificV.style.display = 'none';

			} else {

				specificV.style.display = 'inline-block';
			}
			specificV.style.left = 100 * x / highestVolume + '%';

		}
		const infusiondiv = document.getElementById("infusiondiv" + (z + 1))
		let calcPreinfusionWidth = 18 / (highestRange / 240);
		if (calcPreinfusionWidth > 100) {
			calcPreinfusionWidth = 100;
		}
		infusiondiv.style = "width:" + calcPreinfusionWidth + "%";
	}
}

function getFileVersion(versionVal = -1.0) {
	if (versionVal == -1) {
		versionVal = document.getElementById("fileVersion").value;
	}
	if (versionVal > 1.5) {
		versionVal = 2.0;
	} else {
		versionVal = 1.0;
	}
	document.getElementById("fileVersion").value = versionVal;
	document.getElementById("outputFileVerson").innerHTML = versionVal;
}


function sliderUpdate(change) {
	let smothVal = document.getElementById("settingNum").value;
	document.getElementById("outputFileSmoothness").innerHTML = smothVal;
	smothVal = smothVal * 4
	let slug = change.currentTarget.id.substring(2);
	let i = slug.split(':').pop(); //profile point
	let n = slug.substr(0, slug.indexOf(':'));  //profile number
	let changeArray = [];
	let valueArray = [];

	for (let s = 0; s < Math.floor(smothVal / 2) * 2 + 1; s++) {
		if ((i - Math.floor(smothVal / 2) + s) < 1 || (i - Math.floor(smothVal / 2) + s) > 240) {
		} else {
			changeArray.push({
				idProb: 'in' + n + ':' + (i - Math.floor(smothVal / 2) + s),
				iIs: (i - Math.floor(smothVal / 2) + s),
			})
		}
	}

	for (range of changeArray) {
		let val = parseFloat(document.getElementById(range.idProb).value);
		let diff = (change.target.value - val);
		let indexDiff = Math.abs(i - parseInt(range.iIs));
		let adjustmentval = (indexDiff * -2 / smothVal + 1);
		let newVal = val + diff * adjustmentval;
		if (newVal < 0) {
			newVal = 0.0;
		}
		if (indexDiff != 0) {
			valueArray.push({
				newVal: Math.round(newVal * 10) / 10,
				iIs: range.iIs,
			});
		} else {
			valueArray.push({
				newVal: change.target.value,
				iIs: range.iIs,
			});
		}
	}
	for (profile of valueArray) {
		activeProfiles[(n - 1)].pressureArray[(profile.iIs - 1)] = parseFloat(profile.newVal);
	}

	console.debug(activeProfiles);
	writeranges(activeProfiles);
	graphIt(activeProfiles);
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
document.addEventListener("DOMContentLoaded", function (event) {

	graphIt(emptyProfiles);

	addElements();
	const fileInput = document.getElementById("fileElem");
	fileInput.addEventListener('change', function () {
		handleFiles(this.files);
	});
	getFileVersion();
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
				pressureArray: lines.slice(5 + (ofsets * j), ofsets - 1 + (ofsets * j))
			});

		}
		readProfiles = interpolateProfile(readProfiles, 240);
		// Display the read profiles in the console for debugging
		console.debug(readProfiles);
		// Call the 'graphIt' function with the read profiles
		graphIt(readProfiles);
		// Call the 'writeranges' function with the read profiles
		writeranges(readProfiles);
		// Set the 'activeProfiles' variable to the read profiles
		activeProfiles = readProfiles;
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
	console.debug("writing Out")
	const versionVal = document.getElementById("fileVersion").value;
	let finishedFile = getTextFile(versionVal);


	var file = new Blob([finishedFile], { type: 'text/plain; charset=utf-8' });
	if (window.navigator.msSaveOrOpenBlob) // IE10+
		window.navigator.msSaveOrOpenBlob(file, "IMPONE");
	else { // Others
		var a = document.createElement("a"),
			url = URL.createObjectURL(file);
		a.href = url;
		a.download = "IMPONE";
		document.body.appendChild(a);
		a.click();
		setTimeout(function () {
			document.body.removeChild(a);
			window.URL.revokeObjectURL(url);
		}, 0);
	}

	console.debug(finishedFile);
	console.debug(activeProfiles);
}
