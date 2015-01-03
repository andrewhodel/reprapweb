/*

    RepRapWeb - A Web Based 3d Printer Controller
    Copyright (C) 2014 Andrew Hodel

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
    WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
    MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
    ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
    WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
    ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
    OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.

*/

$(document).ready(function() {

	var socket = io.connect(''); // socket.io init
	var gCodeToSend = null; // if uploaded file is gcode
	var localPresets = []; // locally stored presets
	var defaultSlicer = 'cura';
	var baseSlOpts;

	socket.emit('firstLoad', 1);

	var canvas = document.getElementById('renderArea');
	var viewer = new JSC3D.Viewer(canvas);
	viewer.setParameter('InitRotationX', 0);
	viewer.setParameter('InitRotationY', 0);
	viewer.setParameter('InitRotationZ', 0);
	viewer.setParameter('ModelColor', '#228B22');
	viewer.setParameter('BackgroundColor1', '#FFFFFF');
	viewer.setParameter('BackgroundColor2', '#FFFFFF');
	viewer.setParameter('Renderer', 'webgl');
	viewer.setRenderMode('textureflat');
	viewer.init();

	viewer.onloadingcomplete = function() {
		// update object size from viewer.scene.aabb
		var a = viewer.scene.aabb;
		var x = Math.round(a.maxX-a.minX);
		var y = Math.round(a.maxY-a.minY);
		var z = Math.round(a.maxZ-a.minZ);
		$('#modelDimensions').html('Model Dimensions: X:'+x+' Y:'+y+' Z:'+z);
	}

	$('#modelTop').on('click', function() {
		viewer.resetScene();
		viewer.update();
	});

	$('#modelFront').on('click', function() {
		viewer.resetScene();
		viewer.rotate(-90,0,0);
		viewer.update();
	});

	$('#modelSide').on('click', function() {
		viewer.resetScene();
		viewer.rotate(-90,90,0);
		viewer.update();
	});

	socket.on('serverError', function (data) {
		alert(data);
	});

	socket.on('ports', function (data) {
		//console.log('ports event',data);
		$('#choosePort').html('<option val="no">Select a serial port</option>');
		for (var i=0; i<data.length; i++) {
			$('#choosePort').append('<option value="'+i+'">'+data[i].comName+':'+data[i].pnpId+'</option>');
		}
		if (data.length == 1) {
			// select first and only
			$('#choosePort').val('0');
			$('#choosePort').change();
		}
	});

	$('#useSlicr').on('click', function() {
		defaultSlicer = 'slic3r';
		loadBaseSlOpts();
		$('#slNameOpts').html('Slic3r Options');
		$('#useSlicr').addClass('disabled');
		$('#useCura').removeClass('disabled');
		loadPresetsForSlicer()
	});

	$('#useCura').on('click', function() {
		defaultSlicer = 'cura';
		loadBaseSlOpts();
		$('#slNameOpts').html('Cura Options');
		$('#useCura').addClass('disabled');
		$('#useSlicr').removeClass('disabled');
		loadPresetsForSlicer()
	});

	function loadBaseSlOpts() {
		$('#slOptsValues').html('');
		// data.slic3r & data.cura
		var baseOpts = baseSlOpts[defaultSlicer];
		for (var i in baseOpts) {
			// add section header
			$('#slOptsValues').append('<h5>'+baseOpts[i].section+'</h5>');
			for (var c in baseOpts[i].options) {
				// add option input
				var s = '<p>';
				if (typeof baseOpts[i].options[c].value == 'object') {
					// select
					s += '<select name="slOptsArray-'+baseOpts[i].options[c].opt+'"><option></option>';
					for (var l in baseOpts[i].options[c].value) {
						s += '<option>'+baseOpts[i].options[c].value[l]+'</option>';
					}
					s += '</select>';
				} else if (baseOpts[i].options[c].value.length > 20) {
					// textarea
					s += '<textarea style="width: 80%; height: 100px;" name="slOptsArray-'+baseOpts[i].options[c].opt+'">'+baseOpts[i].options[c].value+'</textarea><br />';
				} else {
					// text
					s += '<input type="text" name="slOptsArray-'+baseOpts[i].options[c].opt+'" size="5" value="'+baseOpts[i].options[c].value+'" />';
				}
				// add option name/desc
				s += ' '+baseOpts[i].options[c].name+'</p>'
				$('#slOptsValues').append(s);
			}
		}

		// change handler
		$('[name|="slOptsArray"]').change(function(e) {
			// an option has been changed
			//console.log('chg',e.target.name);
			// change color of that field to indicate change has been made
			$('[name="'+e.target.name+'"]').css('color','red');
			if ($('#selectPreset').val() > 0) {
				// enable Update Preset
				$('#updatePreset').removeClass('disabled');
			}
		});
	}

	// load slicer options from server
	socket.on('slOpts', function (data) {
		baseSlOpts = data;
		loadBaseSlOpts();
	});

	// slicer status update
	socket.on('slStatus', function (data) {
		$('#mainStatus').html(data);
	});

	// called when slicing is finished
	socket.on('slDone', function (data) {
		if (data.status == 'success') {
			$('#sendToPrinter').removeClass('disabled');
			$('#mainStatus').html('Slicer Finished Processing, Ready to Print...');
			$('#sliceModal').modal('toggle');
			gCodeToSend = null;
		} else {
			$('#mainStatus').html('Error in STL->GCODE Process, retry...');
		}
		$('#processStl').removeClass('disabled');
		$('#slActivity').hide();
		$('#processStl').html('Process STL -> GCODE');
	});

	// create new preset
	$('#newPreset').on('click', function() {

		if ($('#newPresetName').val() == '') {
			alert('You must type a name for a preset to save it.');
			return;
		}

		var opts = [];
		jQuery.each($('[name|="slOptsArray"]').serializeArray(), function( c, field ) {
			field.name = field.name.slice(12);
			//console.log(field.name, field.value);
			opts.push({o:field.name, v:field.value});
		});

		socket.emit('savePreset', {'slicer':defaultSlicer, 'name': $('#newPresetName').val(), 'opts': opts, isNew:true});

		// clear field
		$('#newPresetName').val('');

		// reset changed options color to black
		$('[name|="slOptsArray"]').css('color','black');

	});

	// update selected preset
	$('#updatePreset').on('click', function() {

		if ($('#selectPreset option:selected').val() == 0) {
			// this is the slicer presets option, can't be updated
			alert('select a preset to update first');
		}

		var opts = [];
		jQuery.each($('[name|="slOptsArray"]').serializeArray(), function( c, field ) {
			field.name = field.name.slice(12);
			//console.log(field.name, field.value);
			opts.push({o:field.name, v:field.value});
		});

		socket.emit('savePreset', {'slicer':defaultSlicer, 'name': $('#selectPreset :selected').html(), 'opts': opts, isNew:false});

		// reset changed options color to black
		$('[name|="slOptsArray"]').css('color','black');

		// disable Update Preset
		$('#updatePreset').addClass('disabled');

	});

	// delete selected preset
	$('#deletePreset').on('click', function() {

		if ($('#selectPreset option:selected').val() == 0) {
			// this is the slicer presets option, can't be updated
			alert('select a preset to delete first');
		}

		socket.emit('deletePreset', {'slicer':defaultSlicer, 'name': $('#selectPreset :selected').html()});

		// disable Update and Delete Preset
		$('#updatePreset').addClass('disabled');
		$('#deletePreset').addClass('disabled');

	});

	// handle preset changes
	$('#selectPreset').on('change', function(e) {

		if ($('#selectPreset').val() > 0) {
			// this is a valid preset
			var preset = localPresets[defaultSlicer][Number($('#selectPreset').val())-1].opts;
			for (c in preset) {
				// update values
				$('[name="slOptsArray-'+preset[c].o+'"]').val(preset[c].v);
			}

			// reset changed options color to black
			$('[name|="slOptsArray"]').css('color','black');

			// enable Delete Preset
			$('#deletePreset').removeClass('disabled');

		} else {
			// disable Delete Preset
			$('#deletePreset').addClass('disabled');
		}
	});

	socket.on('presets', function (data) {
		// incoming presets
		localPresets = data.presets;
		loadPresetsForSlicer(data.exists);
	});

	function loadPresetsForSlicer(exists) {

		// {slicerName:[{name:'preset_name',opts:[{o:'optName':v:'optValue'}]}],slicer2Name:[{name:'preset_name',opts:[{o:'optName':v:'optValue'}]}]}
		$('#selectPreset').html('<option value="0">'+defaultSlicer+' presets</option>');
		for (c in localPresets[defaultSlicer]) {
			$('#selectPreset').append('<option value="'+(Number(c)+Number(1))+'">'+localPresets[defaultSlicer][c].name+'</option>');
		}

		//console.log('exists: '+exists);

		if (exists == -2) {
			// select newly created preset (last as it was added)
			$('#selectPreset').val($('#selectPreset option').last().val());
		} else if (exists >= 0) {
			// select updated preset
			$('#selectPreset option').each(function() {
				if (Number($(this).val()) == Number(exists)+1) {
					// set selected to this option
					$(this).prop('selected', true);
				}
			});
		}
		// exists == -1 if this is the first load or delete

	}

	socket.on('qStatus', function (data) {
		var pct = 100-((data.currentLength/data.currentMax)*100);
		if (isNaN(pct)) { pct = 0; }
		$('#qStatus').html(Math.round(pct*100)/100+'%');
		var hWidth = Number($('#qStatusHolder').width());
		$('#qStatus').css('width',(pct*hWidth/100)+'px');
	});

	socket.on('serialRead', function (data) {
		if ($('#console p').length > 300) {
			// remove oldest if already at 300 lines
			$('#console p').first().remove();
		}
		$('#console').append('<p>'+data.line+'</p>');
		$('#console').scrollTop($("#console")[0].scrollHeight - $("#console").height());
	});

	socket.on('stlUploadSuccess', function (data) {
		$('#mainStatus').html('Status: STL file uploaded, please set STL->GCODE options and process...');
		$('#processStl').removeClass('disabled');
		$('#sliceStl').removeClass('disabled');
		$('#inputGcode').addClass('disabled');
	});

	$('#processStl').on('click', function() {

		// cura send mm parameters *1000 so .4mm should be 400, 3mm should be 3000
		// each param here needs to be modified before sending to cura
		var curaModifiers = {layerThickness:1000,initialLayerThickness:1000,filamentDiameter:1000,posx:1000,posy:1000,extrusionWidth:1000,retractionAmount:1000,skirtDistance:1000,retractionZHop:1000};

		// send vars from slOptsArray
		var opts = [];
		jQuery.each($('[name|="slOptsArray"]').serializeArray(), function( c, field ) {
			field.name = field.name.slice(12);
			//console.log(field.name, field.value);
			var skip = 0;

			// cura handles some settings logic in the client
			if (defaultSlicer == 'cura') {
				if (field.name == 'bedTemp' || field.name == 'printTemp') {
					// printTemp and bedTemp are added to startCode and not set directly
					skip = 1;
				}
				if (field.name == 'startCode') {
					// add bedTemp and printTemp to startCode
					var prepend = "M140 S" + $('[name="slOptsArray-bedTemp"]').val() + "\nM109 TO S" + $('[name="slOptsArray-printTemp"]').val() + "\n" + "M190 S" + $('[name="slOptsArray-bedTemp"]').val() + "\n";
					opts.push({o:field.name, v:prepend+field.value});
					skip = 1;
				}
				if (field.name == 'fillDensity') {
					// set values which account for fill density
					if (field.value == 0) {
						opts.push({o:'sparseInfillLineDistance', v:'-1'});
					} else if (field.value == 100) {
						opts.push({o:'sparseInfillLineDistance', v:$('[name="slOptsArray-extrusionWidth"]').val()});
						opts.push({o:'downSkinCount', v:'10000'});
						opts.push({o:'upSkinCount', v:'10000'});
					} else {
						opts.push({o:'sparseInfillLineDistance', v:$('[name="slOptsArray-extrusionWidth"]').val()*100*1000/field.value});
					}
					skip = 1;
				}
				if (field.name == 'inset0Speed') {
					// set inner and outer perimter to this value
					opts.push({o:'inset0Speed', v:field.value});
					opts.push({o:'insetXSpeed', v:field.value});
					skip = 1;
				}
				if (field.name == 'supportType') {
					skip = 1;
				}
				if (field.name == 'platformAdhesionType') {
					if (field.value == 'Brim') {
						// just set skirtDistance to 0 and skirtLineCount to N
						opts.push({o:'skirtDistance', v:'0'});
						opts.push({o:'skirtLineCount', v:'10'});
					} else if (field.value == 'Raft') {
						opts.push({o:'skirtDistance', v:'0'});
						opts.push({o:'skirtLineCount', v:'0'});
						opts.push({o:'raftMargin', v:'5000'});
						opts.push({o:'raftLineSpacing', v:'3000'});
						opts.push({o:'raftBaseThickness', v:'300'});
						opts.push({o:'raftBaseLinewidth', v:'1000'});
						opts.push({o:'raftInterfaceThickness', v:'270'});
						opts.push({o:'raftInterfaceLinewidth', v:'400'});
						opts.push({o:'raftInterfaceLineSpacing', v:'800'});
						opts.push({o:'raftAirGapLayer0', v:'220'});
						opts.push({o:'raftBaseSpeed', v:'20'});
						opts.push({o:'raftFanSpeed', v:'100'});
						opts.push({o:'raftSurfaceThickness', v:'270'});
						opts.push({o:'raftSurfaceLinewidth', v:$('[name="slOptsArray-extrusionWidth"]').val()*1000});
						opts.push({o:'raftSurfaceLineSpacing', v:$('[name="slOptsArray-extrusionWidth"]').val()*1000*.9});
						opts.push({o:'raftSurfaceLayers', v:'2'});
						opts.push({o:'raftSurfaceSpeed', v:'20'});
					}
					skip = 1;
				}

			}

			// if we haven't set skip
			if (skip == 0) {
				// test if option already exists in opts
				var alreadySet = 0;
				for (c in opts) {
					if (opts[c].o == field.name) {
						// this option has already been set
						alreadySet = 1;
					}
				}
				if (alreadySet == 0) {
					if (defaultSlicer == 'cura' && typeof curaModifiers[field.name] != 'undefined') {
						// multiply value by modifier
						opts.push({o:field.name, v:curaModifiers[field.name]*field.value});
					} else {
						opts.push({o:field.name, v:field.value});
					}
				}
			}
		});

		for (c in opts) {
			//console.log(opts[c].o+': '+opts[c].v);
		}

		socket.emit('slStart', {slicer:defaultSlicer,opts:opts});
		$('#sendToPrinter').addClass('disabled');
		$('#processStl').addClass('disabled');
		$('#sliceStl').addClass('disabled');
		$('#mainStatus').html('Status: Starting STL->GCODE Process');
		$('#slActivity').show();
		$('#processStl').html('Processing STL -> GCODE');
	});

	$('#choosePort').on('change', function() {
		// select port
		socket.emit('usePort', $('#choosePort').val());		
	});

	$('#sendCommand').on('click', function() {
		socket.emit('gcodeLine', { line: $('#command').val() });
		$('#command').val('');
	});

	// shift enter for send command
	$('#command').keydown(function (e) {
		if (e.shiftKey) {
			var keyCode = e.keyCode || e.which;
			if (keyCode == 13) {
				// we have shift + enter
				$('#sendCommand').click();
				// stop enter from creating a new line
				e.preventDefault();
			}
		}
	});

	$('#xM').on('click', function() {
		socket.emit('gcodeLine', { line: 'G91\nG1 X-1\nG90' });
	});

	$('#xMTen').on('click', function() {
		socket.emit('gcodeLine', { line: 'G91\nG1 X-10\nG90' });
	});

	$('#xP').on('click', function() {
		socket.emit('gcodeLine', { line: 'G91\nG1 X1\nG90' });
	});

	$('#xPTen').on('click', function() {
		socket.emit('gcodeLine', { line: 'G91\nG1 X10\nG90' });
	});

	$('#yP').on('click', function() {
		socket.emit('gcodeLine', { line: 'G91\nG1 Y1\nG90' });
	});

	$('#yPTen').on('click', function() {
		socket.emit('gcodeLine', { line: 'G91\nG1 Y10\nG90' });
	});

	$('#yM').on('click', function() {
		socket.emit('gcodeLine', { line: 'G91\nG1 Y-1\nG90' });
	});

	$('#yMTen').on('click', function() {
		socket.emit('gcodeLine', { line: 'G91\nG1 Y-10\nG90' });
	});

	$('#zP').on('click', function() {
		socket.emit('gcodeLine', { line: 'G91\nG1 Z1\nG90' });
	});

	$('#zPTen').on('click', function() {
		socket.emit('gcodeLine', { line: 'G91\nG1 Z10\nG90' });
	});

	$('#zM').on('click', function() {
		socket.emit('gcodeLine', { line: 'G91\nG1 Z-1\nG90' });
	});

	$('#zMTen').on('click', function() {
		socket.emit('gcodeLine', { line: 'G91\nG1 Z-10\nG90' });
	});

	$('#g28').on('click', function() {
		socket.emit('gcodeLine', { line: 'G28' });
	});

	$('#g29').on('click', function() {
		socket.emit('gcodeLine', { line: 'G29' });
	});

	$('#pause').on('click', function() {
		if ($('#pause').html() == 'Pause') {
			// pause queue on server
			socket.emit('pause', 1);
			$('#pause').html('Unpause');
			$('#clearQ').removeClass('disabled');
		} else {
			socket.emit('pause', 0);
			$('#pause').html('Pause');
			$('#clearQ').addClass('disabled');
		}
	});

	$('#stop').on('click', function() {
		if ($('#pause').html() == 'Pause') {
			// pause queue on server
			socket.emit('pause', 1);
			$('#pause').html('Unpause');
			$('#clearQ').removeClass('disabled');
		} else {
			socket.emit('pause', 0);
			$('#pause').html('Pause');
			$('#clearQ').addClass('disabled');
		}
		// if paused let user clear the command queue
		socket.emit('clearQ', 1);
		// must clear queue first, then unpause (click) because unpause does a sendFirstQ on server
		$('#pause').click();
		$('#inputGcode').removeClass('disabled');
		$('#inputStl').removeClass('disabled');
		$('#sendToPrinter').addClass('disabled');
		$('#sliceStl').addClass('disabled');
		$('#stop').addClass('disabled');
		
		
	});

	$('#clearQ').on('click', function() {
		// if paused let user clear the command queue
		socket.emit('clearQ', 1);
		// must clear queue first, then unpause (click) because unpause does a sendFirstQ on server
		$('#pause').click();
		$('#sendToPrinter').removeClass('disabled');
		$('#sliceStl').removeClass('disabled');
		$('#inputGcode').removeClass('disabled');
		$('#inputStl').removeClass('disabled');
		
	});

	$('#sendToPrinter').on('click', function() {
		$('#sendToPrinter').addClass('disabled');
		$('#sliceStl').addClass('disabled');
		$('#inputGcode').addClass('disabled');
		$('#inputStl').addClass('disabled');
		$('#stop').removeClass('disabled');
		$('#mainStatus').html('Status: Printing');
		
		if (gCodeToSend) {
			// !null
			socket.emit('printGcode', { line: gCodeToSend });
		} else {
			// print stl
			socket.emit('printStl', true);
		}
	});

	$('#extrudeMM').on('click', function() {
		socket.emit('gcodeLine', { line: 'G91\nG1 F'+$('#extrudeSpeed').val()+' E'+$('#extrudeValue').val()+'\nG90' });
	});

	$('#extrudeTempSet').on('click', function() {
		socket.emit('gcodeLine', { line: 'M104 S'+$('#extrudeTemp').val() });
	});

	$('#extrudeTempOff').on('click', function() {
		socket.emit('gcodeLine', { line: 'M104 S0' });
	});

	$('#bedTempSet').on('click', function() {
		socket.emit('gcodeLine', { line: 'M140 S'+$('#bedTemp').val() });
	});

	$('#bedTempOff').on('click', function() {
		socket.emit('gcodeLine', { line: 'M140 S0' });
	});

	// handle uploads
	if (window.FileReader) {

		var reader = new FileReader ();
		var ABreader = new FileReader ();

		// gcode upload
		var fileInputGcode = document.getElementById('fileInputGcode');
		fileInputGcode.addEventListener('change', function(e) {
			reader.onloadend = function (ev) {
				// load gcode-viewer
				//openGCodeFromText(this.result);
				gCodeToSend = this.result;
				$('#fileStatus').html('File Loaded: '+fileInputGcode.value+' as GCODE');
				$('#mainStatus').html('Status: GCODE for '+fileInputGcode.value+' loaded and ready to print...');
				$('#sendToPrinter').removeClass('disabled');
				$('#sliceStl').addClass('disabled');
				$('#inputStl').addClass('disabled');
			};
			reader.readAsText(fileInputGcode.files[0]);
		});

		// stl upload
		var fileInputStl = document.getElementById('fileInputStl');
		fileInputStl.addEventListener('change', function(e) {
			// for local display
			reader.onloadend = function (ev) {
				viewer.replaceSceneFromBinaryString(this.result);
				viewer.update();
				$('#fileStatus').html('File Loaded: '+fileInputStl.value+' as STL');
				$('#mainStatus').html('Status: '+fileInputStl.value+' uploading to slicer...');
			}
			reader.readAsBinaryString(fileInputStl.files[0]);

			// send AB to server
			ABreader.onloadend = function (ev) {
				socket.emit('stlUpload', this.result);
			}
			ABreader.readAsArrayBuffer(fileInputStl.files[0]);

		});

	} else {
		alert('your browser is too old to upload files, get the latest Chromium or Firefox');
	}

	socket.on('posStatus', function(data) {
			var pos = data.split(/[X,Y,Z,E," ",:]/);
			$('#xPOS').html(pos[2]);
			$('#yPOS').html(pos[5]);
			$('#zPOS').html(pos[8]);
			$('#ePOS').html(pos[11]);

		}

	);
	
	// temperature
	socket.on('tempStatus', function(data) {
		if (data.indexOf('ok') == 0 || data.indexOf('T') == 0) {
			// this is a normal temp status

			var fs = data.split(/[TB]/);
			var t = fs[1].split('/');
			var b = fs[2].split('/');
			t[0] = t[0].slice(1);
			b[0] = b[0].slice(1);
			for (var i=0; i<2; i++) {
				t[i] = t[i].trim();
				b[i] = b[i].trim();
			}
			// t[0] = extruder temp, t[1] = extruder set temp
			// b[0] = bed temp, b[1] = bed set temp
			$('#eTC').html(t[0]+'°C');
			$('#eTS').html(t[1]+'°C');
			$('#bTC').html(b[0]+'°C');
			$('#bTS').html(b[1]+'°C');
			// Code here to plot the progress bars
			var prgse1 = ((t[0] / 250) * 100);
			document.getElementById('pgse1').style.width= prgse1 +'%';
			var prgse1 = ((b[0] / 120) * 100);
			document.getElementById('pgsbed').style.width= prgse1 +'%';
						
 
		} else {
			// this is a waiting temp status
			// get extruder temp
			var eT = data.split('T');
			eT = eT[1].split('E');
			eT = eT[0].slice(1);
			eT = eT.trim();
			$('#eTC').html(eT+'C');
		}
	});

});
