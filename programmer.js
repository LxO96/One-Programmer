let emptyProfiles = [];
for (let ii =0; ii<5;ii++){
	emptyProfiles.push({
		name:'test'+ (ii+1),
		volume: 240,
		time: 0,
		pressureArray: Array(60).fill("0.0"),
	})
}


var hasGraphed = 0;

var readProfiles = [];
var activeProfiles=emptyProfiles;


var labelarray = Array(60).fill(0);
for (let s = 0; s < 61; s++) {
	labelarray[s] = s * 4;
}

function addElements() {
	
	for (let n = 0; n < 5; n++) {
		const newHeading = document.createElement('h1');
		const newTextbox = Object.assign(document.createElement('input'),{
			id: 'nameBox'+(n+1),
			type:'text',
			placeholder:'name',
			pattern: "[A-Z ]+",
			title: 'Allcaps',
		})
		const newVolbox = Object.assign(document.createElement('input'),{
			id: 'volBox'+(n+1),
			type:'number',
			placeholder: 'volume',
			value: '240',
			max:'240',
			min:'4'
		})
		const newTimbox = Object.assign(document.createElement('input'),{
			id: 'timeBox'+(n+1),
			type:'number',
			placeholder: 'time',
			value: '30',
			min:'0'
		})


		var textToAdd = document.createTextNode('Profile '+(n+1));
		newHeading.appendChild(textToAdd);
		const newThing = Object.assign(document.createElement('div'), {
			id: 'profile' + (n+1),
		});
		newThing.appendChild(newHeading);
		newThing.appendChild(newTextbox);
		newThing.appendChild(newVolbox);
		newThing.appendChild(newTimbox);
		newThing.appendChild(document.createElement('br'));
		newThing.appendChild(Object.assign(document.createElement('div'), {
			id: 'rangeBoxes'+n,
		}));

		let divToFill = document.getElementById("putsDiv");

		divToFill.appendChild(newThing);
		const inputBox = document.getElementById('rangeBoxes'+n);

		for (let m = 0; m < 60; m++) {
			const newInput = Object.assign(document.createElement('input'), {
				id: 'in' + (n+1) + ":" + (m+1),
				type: 'range',
				
			});
			inputBox.appendChild(newInput);
		}

		for (let m = 0; m < 25; m++) {
			const newVLine = Object.assign(document.createElement('div'), {
				id: 'vLine' + (n+1) + ":" + m,
				type: 'range',
				
			});
			const newVtext =Object.assign(document.createElement('div'), {
				id: 'vLine' + (n+1) + ":" + m,
				type: 'range',
				
			});
			inputBox.appendChild(newVLine);
		}

		
		for (let m = 0; m < 11; m++) {
			const newLine = Object.assign(document.createElement('hr'), {
				id: 'hLine' + (m+1),
			});
			const newBar = Object.assign(document.createElement('h3'), {
				id: 'barText'+ (m+1),
			});
			newBar.textContent =(10-m +' bar');
			inputBox.appendChild(newLine);
			inputBox.appendChild(newBar);
		}
		
		
	}
	console.log("All inputs loaded");
	fixranges();
}

function fixranges(){
	let ranges=document.querySelectorAll('[id^="in"]');
	for(const inputRange of ranges){
		inputRange.min="0.0";
		inputRange.max="10.0";
		inputRange.step="0.1";
		inputRange.value="0.0";
		inputRange.addEventListener("change", sliderUpdate);
	}
	
	let texts=document.querySelectorAll('[type="text"]');

	for(const inputTexts of texts){
		inputTexts.addEventListener("change", textUpdate);
	}

	let vLines=document.querySelectorAll('[id*="vLine"]');

	for(let i=0; i<25;i++){
		vLines[i].style.left = 100*i/24+'%';
		vLines[i+25].style.left = 100*i/24+'%';
		vLines[i+50].style.left = 100*i/24+'%';
		vLines[i+75].style.left = 100*i/24+'%';
		vLines[i+100].style.left = 100*i/24+'%';
	}


	let values=document.querySelectorAll('[type="number"]');
		for(const inputValues of values){
			inputValues.addEventListener("change", textUpdate);
		}
	
		document.getElementById('bigOutButton').addEventListener("click",writeOut);
		console.log("all inputs done") 
}




function textUpdate(change){
	for(let z=0;z<5; z++){
		let profileName=document.getElementById('nameBox'+(z+1)).value.toUpperCase();
		profileName=profileName.substring(0,8);
		
		let volume =document.getElementById('volBox'+(z+1)).value;
		let time=document.getElementById('timeBox'+(z+1)).value;

		if(volume>=240){
			volume=240;
		}
		activeProfiles[z].name=profileName;
		activeProfiles[z].volume=volume;
		activeProfiles[z].time=time;

	}
	writeranges(activeProfiles);
}


function writeranges(profiles){
	let ranges=[];
	
	for(let z=0;z<5; z++){
		let highestRange=Math.ceil(parseInt(profiles[z].volume)/4);
		console.log(highestRange);
		for(let x=0;x<(highestRange);x++){
			
			let specificIn=document.getElementById('in'+(z+1)+':'+(x+1));
			specificIn.value=profiles[z].pressureArray[x];
			specificIn.style.display = 'inline-block';
			specificIn.style.width= 100/(highestRange)+'%';
		}
		document.getElementById('nameBox'+(z+1)).value=profiles[z].name;
		document.getElementById('volBox'+(z+1)).value=profiles[z].volume;

		for(let x=(highestRange);x<60;x++){
			let specificIn=document.getElementById('in'+(z+1)+':'+(x+1));
			specificIn.style.display = 'none';
		}

		let highestVolume=Math.ceil(parseInt(profiles[z].volume)/10);

		for(let x=0;x<24;x++){

			let specificV=document.getElementById('vLine'+(z+1)+':'+x);
			if(x>highestVolume){
				specificV.style.display = 'none';
			} else{
				specificV.style.display = 'inline-block';
			}
			specificV.style.left = 100*x/highestVolume+'%';
			
		}
	}

}

function sliderUpdate(change){
	let smothVal=document.getElementById("settingNum").value;
	let slug = change.currentTarget.id.substring(2);
	let i=slug.split(':').pop(); //profile point
	let n=slug.substr(0, slug.indexOf(':'));  //profile number
	let changeArray=[];
	let valueArray=[];

	for(let s=0; s<Math.floor(smothVal/2)*2+1;s++){
		if((i-Math.floor(smothVal/2)+s)<1 || (i-Math.floor(smothVal/2)+s)>59){

		}else{
			changeArray.push({
				idProb:'in'+ n +':'+(i-Math.floor(smothVal/2)+s),
				iIs:(i-Math.floor(smothVal/2)+s),
			})
		}
		
		
	}

	for (range of changeArray){
		let val=parseFloat(document.getElementById(range.idProb).value);
		let diff=(change.target.value-val);
		let indexDiff= Math.abs(i-parseInt(range.iIs));
		let adjustmentval=(indexDiff*-2/smothVal+1);
		let newVal=val+diff*adjustmentval;
		if (newVal<0){
			newVal=0.0;
		}

		if(indexDiff!=0){
			valueArray.push({newVal: Math.round(newVal*10)/10,
				iIs:range.iIs,
			});
		}else{
			valueArray.push({newVal: change.target.value ,
				iIs:range.iIs,
			});
		}
		
	}

	for (profile of valueArray){
		activeProfiles[(n-1)].pressureArray[(profile.iIs-1)]=parseFloat(profile.newVal);
	}
	
	console.log(activeProfiles);
	writeranges(activeProfiles);
	graphIt(activeProfiles);
}

var myChart;

function graphIt(profiles) {
	var ctx = document.getElementById('myChart').getContext('2d');
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
			plugins: {
				legend: {
					position: 'top',
				},
				title: {
					display: true,
					text: 'Chart.js Line Chart'
				}
			},
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
		}
	};


	if (hasGraphed) {
		let highestVol = Math.max.apply(Math, profiles.map(function (o) {
			return o.volume;
		}));
		myChart.data.labels = labelarray.slice(0, -(240 - highestVol) / 4 - 1);
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

document.addEventListener("DOMContentLoaded", function (event) {

	graphIt(emptyProfiles);

	addElements();
	const inputElement = document.getElementById("fileElem");
	inputElement.addEventListener("change", handleFiles, false);

	function handleFiles() {
		const fileList = this.files;
		const numFiles = fileList.length;
		console.log("Read: " + numFiles + " files.");
		let reader = new FileReader();

		reader.onload = (e) => {
			let file = e.target.result;
			file = file.replaceAll('\n', "");
			var lines = file.split('\r');
			console.log(lines);
			readProfiles=[];

			for (let i = 0; i < 5; i++) {
				lines[2 + i * 66] = lines[2 + i * 66].substring(5);
				lines[3 + i * 66] = parseInt(lines[3 + i * 66].substring(3));
				lines[4 + i * 66] = parseInt(lines[4 + i * 66].substring(5));
				for (let k = 5; k < 15; k++) {
					lines[k + i * 66] = parseFloat(lines[k + i * 66].substring(3));
				}
				for (let l = 15; l < 65; l++) {
					lines[l + i * 66] = parseFloat(lines[l + i * 66].substring(4));
				}
			};

			for (let j = 0; j < 5; j++) {
				console.log("Reading profile" + (j + 1))
				readProfiles.push({
					name: lines[2 + (66 * j)],
					volume: lines[3 + (66 * j)],
					time: lines[4 + (66 * j)],
					pressureArray: lines.slice(5 + (66 * j), 65 + (66 * j))
				});
			};
			console.log(readProfiles);
			graphIt(readProfiles);
			writeranges(readProfiles);
			activeProfiles=readProfiles;
		}

		reader.readAsText(fileList[0]);
	}
});





function getTextFile(){
	let finFile= "";

	for (o=0;o<5;o++){
		let volumeTxt="";
		let timeTxt="";
		let start="TYPE:P\rINDEX: "+o+"\rNAME:"+activeProfiles[o].name+"\r";
		if(activeProfiles[o].volume<10){
			volumeTxt="ML:   "+activeProfiles[o].volume+"\r";
		}else if(activeProfiles[o].volume<100){
			volumeTxt="ML:  "+activeProfiles[o].volume+"\r";
		}else{
			volumeTxt="ML: "+activeProfiles[o].volume+"\r";
		}
		if(activeProfiles[o].time<10){
			timeTxt="TIME:   "+activeProfiles[o].time+"\r";
		}else if(activeProfiles[o].time<100){
			timeTxt="TIME:  "+activeProfiles[o].time+"\r";
		}else{
			timeTxt="TIME: "+activeProfiles[o].time+"\r";
		}
		let arrayTxt="";
		for(ee=0; ee<60;ee++){
			if(ee<10){
				if(activeProfiles[o].pressureArray[ee]<10){
					arrayTxt=arrayTxt.concat(' '+ee+': '+parseFloat(activeProfiles[o].pressureArray[ee]).toFixed(1)+"\r");

				}else{
					arrayTxt=arrayTxt.concat(" "+ee+":"+parseFloat(activeProfiles[o].pressureArray[ee]).toFixed(1)+"\r");
				}
			}else{
				if(activeProfiles[o].pressureArray[ee]<10){
					arrayTxt=arrayTxt.concat(ee+": "+parseFloat(activeProfiles[o].pressureArray[ee]).toFixed(1)+"\r");
				}else{
					arrayTxt=arrayTxt.concat(ee+":"+parseFloat(activeProfiles[o].pressureArray[ee]).toFixed(1)+"\r");
				}

			}
			
		}
		arrayTxt=arrayTxt.concat("\r\n")
		finFile=finFile.concat(start,volumeTxt,timeTxt,arrayTxt);
	}

	
	return finFile;
}

function writeOut(){
	console.log("writing Out")
	let finishedFile=getTextFile();
	

	var file = new Blob([finishedFile], {type: 'text/plain; charset=utf-8'});
    if (window.navigator.msSaveOrOpenBlob) // IE10+
        window.navigator.msSaveOrOpenBlob(file, "IMPONE");
    else { // Others
        var a = document.createElement("a"),
                url = URL.createObjectURL(file);
        a.href = url;
        a.download = "IMPONE";
        document.body.appendChild(a);
        a.click();
        setTimeout(function() {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);  
        }, 0); 
    }


	console.log(finishedFile);
	console.log(activeProfiles);
}
