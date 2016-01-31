
var breathingAlgorithm = {
	libraryCheck : function(){
		// the minimum version of jQuery we want
		var v = "1.3.2";
		var x;
		var startstop = 0;
		
		// check prior inclusion and version
		if (window.jQuery === undefined || window.jQuery.fn.jquery < v) {
			var done = false;
			var script = document.createElement("script");
			script.src = "http://ajax.googleapis.com/ajax/libs/jquery/" + v + "/jquery.min.js";
			script.onload = script.onreadystatechange = function(){
				if (!done && (!this.readyState || this.readyState == "loaded" || this.readyState == "complete")) {
					done = true;
					
				}
			};
			document.getElementsByTagName("head")[0].appendChild(script);
		} else {
		
		}
	},
	
	noiseLevelConst : 5000,		//Constant we add to noise level for fast on event TOF
	noiseOffConst:2000,			//Constant we add to noise level for fast off event
	noiseOffSlowConst:2000,			//Constant we add to noise level for fast off event
	onFastConstant : -0.4,		//Constant we multiply max variance to get minimum
	onFastNumOfVar : 4,			//Minimum variable to check if they pass windowCondition_2
	offSlowNumOfPow : 10,			//Minimum variable to check if they pass windowCondition_2
	offFastConst : 0.5,			//Off fast event constant to multiply with onFastConstant
	functionRunning : false,	//Tells if blow detection is on, if true we are exhaling
	ThrOnFast : 1,				//Threshold for our fast on event
	ThrOffFast : 1,				//Threshold for our fast off event
	ThrOffSlow : 1,					//Threshold for our slow off event
	maxVariance : 0,
	minVariance : 0,
	pow : 0,						//Sum of all frequency element data(b.frequencyBin) - power
	noiseLevel : -1,			//Noise level (room)
	pwVariance : 0,				//Our current variance 
	varOffVar : 0,
	sampleSize : 1024, // number of samples to collect before analyzing data
	fftSize : 1024, // must be power of two // **
	frequencyBin: new Array,	//Put all frequency element data in array
	countBlow : 0,			//Detected blow count for determining noise level calculation time
	windowArray : new Array,	//For variance storage FIFO for determining slow or fast event
	vcd : 0,					//For b.b.windowArray array size
	windowArray_2 : new Array,	//For variance storage when b.pow > b.ThrOnFast
	vcd_2 : 0,					//For b.b.windowArray_2 array size
	mainCondition : false,		//If b.pow > b.ThrOnFast - if true it is
	offFastVar : 0,
	offFastVarCount : 0,
	pcd : 0,					//Number of elements in arrays for slow events
	PowerWindow : new Array,	//Array for b.pow to help us calculate variance b.pwVariance
	pw : 0,
	
	run : function(pfu){
			
		
		
		//add your own parameters here
		
		this.pfu = pfu || {};
				
		if(this.pfu.runjQuery == true){
			breathingAlgorithm.libraryCheck();
		}
		
		if(this.pfu.onFNlc){//On event: noise level constant nl + ...
			b.noiseLevelConst = this.pfu.onFNlc;
		}
		
		if(this.pfu.onFvar){//On event number of variances to check
			b.onFastNumOfVar = this.pfu.onFvar;
		}
		
		if(this.pfu.onFCvar){//On event variable constant max.var * ...
			b.onFastConstant = this.pfu.onFCvar;
			b.onFastConstant = -1 * b.onFastConstant;
		}
					
		/*Notification microphone acces window, if allowed go to goStream function*/
		getUserMedia({audio:true}, goStream);
	}
};	
		var b = breathingAlgorithm;
		var sourceNode, analyserNode, javascriptNode;
		
		//Create audioContext
		window.AudioContext = window.AudioContext ||
							window.webkitAudioContext ||
							window.mozAudioContext ||
							window.oAudioContext ||	
							window.msAudioContext;
		
		var audioContext = new AudioContext();
		
		/*getUserMedia function def and prefix*/
		function getUserMedia(dictionary, callback){
			try{
				navigator.getUserMedia = navigator.getUserMedia ||
										navigator.webkitGetUserMedia ||
										navigator.mozGetUserMedia;
				
				navigator.getUserMedia(dictionary, callback, error);						
			}
			catch(e){
				alert('getUserMedia threw exception :' + e);
			}
		}
		
		/*Main function goStream for signal processing and exhalation algorithm process*/
		function goStream(stream){
			var frequencyArray; // array to hold frequency data
			
			// create the media stream from the audio input source (microphone)
			sourceNode = audioContext.createMediaStreamSource(stream);
			audioStream = stream;

			analyserNode   = audioContext.createAnalyser();
			
			analyserNode.smoothingTimeConstant = 0.3; // **
			analyserNode.fftSize = b.fftSize; // **

			javascriptNode = audioContext.createScriptProcessor(b.sampleSize, 1, 1);
			
			// setup the event handler that is triggered every time enough samples have been collected
			javascriptNode.onaudioprocess = function () {
				b.pow = 0;
								
				frequencyArray = new Uint8Array(analyserNode.frequencyBinCount);
				analyserNode.getByteFrequencyData(frequencyArray);
				
				//put in all frequencyArray data						
				for (var i = 0; i < frequencyArray.length; i++) {
					b.frequencyBin[i] = frequencyArray[i];		
				}
				
				//sum all data in array
				$.each(b.frequencyBin,function() {
					b.pow += this;				
				});
				
				//set noise level increase noise level and if current is > than saved then current is our new noise level(room)
				if(b.noiseLevel == -1){		//For very first input signal, just to set it on  
					b.noiseLevel = b.pow;
				}else{				//Setting noise level on off event and first 30 on event signals  
					if(b.pow < b.noiseLevel){
						b.noiseLevel = b.pow;
					}else if(b.pow > b.noiseLevel){
					
						if(b.countBlow < 30){
							b.noiseLevel = b.noiseLevel+10;			//noise level
						}else if(b.countBlow > 30){
							b.noiseLevel = b.noiseLevel+0;			//noise level
						}
					}
				}
				
				//Setting all thresholds for our on events
				b.ThrOnFast = Math.round(b.noiseLevel + b.noiseLevelConst);
				b.ThrOffFast = Math.round(b.noiseLevel + b.noiseOffConst);
				b.ThrOffSlow = Math.round(b.noiseLevel + b.noiseOffSlowConst);
				
				//Calculating variances - putting each b.pow in array and the sub current and one past
				b.PowerWindow[b.pw] = b.pow;
				if(b.pw > 0 && b.pw < 500){
					b.pwVariance = Math.round(b.PowerWindow[b.pw] - b.PowerWindow[b.pw-1]);
				}
				
				else if(b.pw > 500){
					b.pw = 0;
					b.PowerWindow.length = 0;
				}
				b.pw++;
				
				//Check if function for when exhalation is detected (on event) is running
				if(b.functionRunning == false){
					b.countBlow  = 0;
					breathingEvents.offRunning();
					onEvent(b.pow, b.pwVariance);
				}      
				
				//Check if function for when exhalation is not detected (off event) is running				
				else if(b.functionRunning == true){
					b.countBlow++;
					breathingEvents.onRunning();
					offEvent(b.pow, b.pwVariance);
				}
				
			}
			
			// Now connect the nodes together
			// Do not connect source node to destination - to avoid feedback
			sourceNode.connect(analyserNode);
			analyserNode.connect(javascriptNode);
			javascriptNode.connect(audioContext.destination);
			
		}
		
		//Error function
		function error(){
			alert('Stream generation failed');
		}
		
		//Events that are triggered on on and off event
		var doEvent = function(){
				return{
					stop: function(){
						breathingEvents.fireOffEvent();
					},
					
					start: function(){
						breathingEvents.fireOnEvent();
						b.functionRunning = true;
					}
				};
		}();
		
		//Function for checking if variances are in certen interval
		function CheckOn(value, index, ar) {
			if (value > b.minVariance && value < -1 * b.minVariance)
				return true;
			else
				return false;
		}
		
					
		/* ALGORITHM FOR DETECTING ON EVENTS */
		function onEvent(getTotal, getVariance){
			
		//FAST 
			//calculate max and min variance and set b.mainCondition on true when done
			if(getTotal > b.ThrOnFast && b.mainCondition == false){
					//when variance > 0 count max and set min variance
					if(getVariance > 0 && getVariance > b.maxVariance){
						b.maxVariance = getVariance;
						b.minVariance = Math.round(b.onFastConstant * b.maxVariance);
						b.varOffVar = b.minVariance*b.offFastConst;
					//when variance < 0 get first neg variance and set b.mainCondition
					}else if(getVariance < 0 && getVariance < b.maxVariance){
						b.mainCondition = true;
					}
			}
			
			//when we get max and min variances we check if next 4(onFastNumOfVar) variances are bigger than b.minVariance.
			else if(getTotal > b.ThrOnFast && b.mainCondition == true){
				b.windowArray[b.vcd] = getVariance;	
				if(b.vcd == b.onFastNumOfVar){
					if (b.windowArray.every(CheckOn)){
						b.functionRunning = true;
						
						doEvent.start();
					}
					else{
						b.mainCondition = false;
						b.vcd = 0;
						b.windowArray.length = 0;
						b.maxVariance = 0;
						b.minVariance = 0;
					}
				}
				else{
					b.vcd++;
				}
			}
		//SLOW
			
			if(b.pcd < 35){
				if(getTotal > b.ThrOnFast && getVariance > -3000){
					b.pcd ++;
				}else{
					b.pcd = 0;
				}
			}else{
				b.functionRunning = true;
				
				doEvent.start();
				b.pcd = 0;
			}
		}

		function CheckOff(value, index, ar) {
			if (value < b.ThrOffSlow)
				return true;
			else
				return false;
		}
		
		/* ALGORITHM FOR DETECTING OFF EVENTS */
		function offEvent(getOffTotal, getOffVariance){
			
			
			
			//get min variable of the previous 20 variables	
				if(b.offFastVarCount < 15){
					if(getOffVariance < b.offFastVar){
						b.offFastVar = getOffVariance;
					}b.offFastVarCount++;
				}else{
					b.offFastVarCount = 0;
				}
				
		//FAST
			if(getOffTotal < b.ThrOffFast && b.offFastVar < b.varOffVar)
			{	
				
				executeOffEv();
				
			}
			
		//SLOW
			//If the last 10 b.pow < b.ThrOnFast/2
			else if(getOffTotal < b.ThrOffFast && b.offFastVar > b.varOffVar){
			b.windowArray_2[b.vcd_2] = getOffTotal;
				if(b.vcd_2 == b.offSlowNumOfPow){
					if (b.windowArray_2.every(CheckOff)){
						
						executeOffEv();
					}else{}
					b.windowArray_2.splice(0, 1);
				}
				else{
					b.vcd_2++;
				}
			}
		
		}

		//function to be called if off event is triggered
		function executeOffEv(){
				b.vcd = 0;
				b.vcd_2=0;
				b.pw = 0;
				b.pcd = 0;
				b.maxVariance = 0;
				b.minVariance = 0;
				b.varOffVar = 0;
				b.mainCondition = false;
				b.windowArray.length = 0;
				b.windowArray_2.length = 0
				b.offFastVar = 0;
				b.offFastVarCount = 0;
				b.functionRunning = false;
				doEvent.stop();
		}
		
		

