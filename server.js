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

var config = require('./config');
var serialport = require("serialport");
var SerialPort = serialport.SerialPort; // localize object constructor
var app = require('http').createServer(handler)
  , io = require('socket.io').listen(app)
  , fs = require('fs');
var static = require('node-static');
var EventEmitter = require('events').EventEmitter;
var url = require('url');
var qs = require('querystring');
var slBaseOpts = require('./slBaseOpts');
var util = require('util');

app.listen(config.webPort);
var fileServer = new static.Server('./i');

function handler (req, res) {

	//console.log('url request: '+req.url);

	fileServer.serve(req, res, function (err, result) {
		if (err) console.log('fileServer error: ',err);
	});
}

function ConvChar( str ) {
  c = {'<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&#039;',
       '#':'&#035;' };
  return str.replace( /[<&>'"#]/g, function(s) { return c[s]; } );
}

var sp = [];
var allPorts = [];

serialport.list(function (err, ports) {

	allPorts = ports;

	for (var i=0; i<ports.length; i++) {
	!function outer(i){

		sp[i] = {};
		sp[i].port = ports[i].comName;
		sp[i].q = [];
		sp[i].qCurrentMax = 0;
		sp[i].lastSerialWrite = [];
		sp[i].lastSerialReadLine = '';
		sp[i].handle = new SerialPort(ports[i].comName, {
			parser: serialport.parsers.readline("\n"),
			baudrate: config.serialBaudRate
		});
		sp[i].sockets = [];

		sp[i].handle.on("open", function() {

			console.log('connected to '+sp[i].port+' at '+config.serialBaudRate);

			// line from serial port
			sp[i].handle.on("data", function (data) {
				serialData(data, i);
			});

			// loop for temp every 5 seconds
			setInterval(function() {
				sp[i].handle.write("M105\n");
			}, 5000);

		});

	}(i)
	}

});

function emitToPortSockets(port, evt, obj) {
	for (var i=0; i<sp[port].sockets.length; i++) {
		sp[port].sockets[i].emit(evt, obj);
	}
}

function serialData(data, port) {
	// new line of data terminated with \n
	//console.log('got newline from serial: '+data);

	// handle M105
	if (data.indexOf('ok T:') == 0 || data.indexOf('T:') == 0) {
		emitToPortSockets(port, 'tempStatus', data);
		sp[port].lastSerialReadLine = data;
		return;
	}

	if (queuePause == 1) {
		// pause queue
		return;
	}

	data = ConvChar(data);

	if (data.indexOf('ok') == 0) {

		// run another line from the q
		sendFirstQ(port);

		// ok is green
		emitToPortSockets(port, 'serialRead', {'line':'<span style="color: green;">RESP: '+data+'</span>'});

		// remove first
		sp[port].lastSerialWrite.shift();

	} else if (data.indexOf('rs') == 0) {
		// handle resend
		// resend last
		sp[port].handle.write(sp[port].lastSerialWrite[-1]);

		console.log('rs (resend) from printer, resending');

	} else if (data.indexOf('!!') == 0) {

		// error is red
		emitToPortSockets(port, 'serialRead', {'line':'<span style="color: red;">RESP: '+data+'</span>'});

		// remove first
		sp[port].lastSerialWrite.shift();

		console.log('!! (error) from printer');

	} else {
		// other is grey
		emitToPortSockets(port, 'serialRead', {'line':'<span style="color: #888;">RESP: '+data+'</span>'});
	}

	if (sp[port].q.length == 0) {
		// reset max once queue is done
		sp[port].qCurrentMax = 0;
	}

	// update q status
	emitToPortSockets(port, 'qStatus', {'currentLength':sp[port].q.length, 'currentMax':sp[port].qCurrentMax});

	sp[port].lastSerialReadLine = data;

}

var currentSocketPort = {};

function sendFirstQ(port) {
	if (sp[port].q.length < 1) {
		// nothing to send
		return;
	}
	var t = sp[port].q.shift();

	// remove any comments after the command
	tt = t.split(';');
	t = tt[0];

	// trim it because we create the \n
	t = t.trim();
	if (t == '' || t.indexOf(';') == 0) {
		// this is a comment or blank line, go to next
		sendFirstQ(port);
		return;
	}
	//console.log('sending '+t+' ### '+sp[port].q.length+' current q length');
	// loop through all registered port clients
	for (var i=0; i<sp[port].sockets.length; i++) {
		sp[port].sockets[i].emit('serialRead', {'line':'<span style="color: black;">SEND: '+t+'</span>'});
	}
	sp[port].handle.write(t+"\n");
	sp[port].lastSerialWrite.push(t);
}

var queuePause = 0;
io.sockets.on('connection', function (socket) {

	socket.on('firstLoad', function(data) {
		// emit slic3r saved options to ui
		socket.emit('slOpts', slBaseOpts.rrwBaseOpts);
		socket.emit('config', config);
	});

	// emit all ports to ui
	socket.emit('ports', allPorts);

	// send presets
	fs.readFile('presets', function(err, cPresets) {
		if (err) {
			console.log('problem reading presets, using none');
			cPresets = {slic3r:[],cura:[]};
		} else {
			cPresets = JSON.parse(cPresets);
		}
		socket.emit('presets', {exists:-1,presets:cPresets});
	});

	socket.on('deletePreset', function(data) {
		// delete preset
		// format:
		// {slicerName:[{name:'preset_name',opts:[{o:'optName':v:'optValue'}]}],slicer2Name:[{name:'preset_name',opts:[{o:'optName':v:'optValue'}]}]}

		fs.readFile('presets', function(err, cPresets) {
			if (err) {
				console.log('problem reading presets, using none');
			} else {
				cPresets = JSON.parse(cPresets);
			}

			// check the cPresets[slicer] array to see if this named preset already exists
			for (c in cPresets[data.slicer]) {
				if (cPresets[data.slicer][c].name == data.name) {
					// found a match, delete it
					cPresets[data.slicer].splice(c,1);
				}
			}

			fs.writeFile('presets', JSON.stringify(cPresets), function(err) {
				if (err) {
					// return error
					socket.emit('serverError', 'error writing to presets');
				} else {
					socket.emit('presets', {exists:-1,presets:cPresets});
				}
			});

		});

	});

	socket.on('savePreset', function(data) {
		// save presets
		// format:
		// {slicerName:[{name:'preset_name',opts:[{o:'optName':v:'optValue'}]}],slicer2Name:[{name:'preset_name',opts:[{o:'optName':v:'optValue'}]}]}

		fs.readFile('presets', function(err, cPresets) {
			if (err) {
				console.log('problem reading presets, using none');
				cPresets = {slic3r:[],cura:[]};
			} else {
				cPresets = JSON.parse(cPresets);
			}

			// check the cPresets[slicer] array to see if this named preset already exists
			var exists = -1;
			for (c in cPresets[data.slicer]) {
				if (cPresets[data.slicer][c].name == data.name) {
					if (data.isNew) {
						// return error because that already exists
						socket.emit('serverError', 'that preset name is already used');
						return;
					} else {
						// found a match, update it
						cPresets[data.slicer][c].opts = data.opts;
						exists = c;
					}
				}
			}

			if (exists == -1) {
				// add as a new preset
				cPresets[data.slicer].push({name:data.name,opts:data.opts});
				// set for return value of new
				exists = -2;
			}

			fs.writeFile('presets', JSON.stringify(cPresets), function(err) {
				if (err) {
					// return error
					socket.emit('serverError', 'error writing to presets');
				} else {
					socket.emit('presets', {exists:exists,presets:cPresets});
				}
			});

		});

	});

	// stlUpload ArrayBuffer
	socket.on('stlUpload', function (data) {

		fs.open('workingStl.stl', 'w', function(err, fd) {
			if (err) {
				socket.emit('serverError', 'error opening file workingStl.stl');
			} else {
				fs.write(fd, data, 0, data.length, null, function(err) {
					fs.close(fd, function() {
						if (err) {
							socket.emit('serverError', 'error writing to workingStl.stl');
						} else {
							socket.emit('stlUploadSuccess', true);
						}
					});
				});
			}
		});

	});

	socket.on('slStart', function (data) {

		// setup slicer options
		var opts = [];

		if (data.slicer == 'slic3r') {
			for (c in data.opts) {
				//console.log(data.opts[c].o, data.opts[c].v);
				if (data.slicer == 'slic3r' && data.opts[c].v != '') {

					// Slic3r can set the options on the command line
					opts.push(data.opts[c].o);
					opts.push(data.opts[c].v);

				}
			}

		} else if (data.slicer == 'cura') {

			// setup command line options
			opts.push('-o');
			opts.push('workingStl.gcode');
			opts.push('-j');
			opts.push('currentCuraConfig.json');

			// CuraEngine has to use an external file

			// we need to sync write to currentCuraConfig.json (sampled from fdmprinter.json which is stored in slBaseOpts.fdmprinter)
			// then pass that as config to CuraEngine
			// we are just updating the default fdmprinter.json with the values from the web ui using the reverse of the process that
			// selects those options for the web ui in slBaseOpts.js

			// first create the json object for the file we will write
			// we are just copying the base options from fdmprinter.json
			var curaFdm = JSON.parse(JSON.stringify(slBaseOpts.fdmprinter));

			// this could be simple if there was a standard agreed upon format for options for each slicer
			// however that would never happen.  we could also just use Cura's standard json format as ours
			// but that would just result in having to parse things for other slicers.  what would make the most
			// sense would be for a command line based slicer to use command line based options as it was before this most
			// recent update to cura.  it seems it would be really simple to just have --optionCategory-optionName value
			// included in cura by just a loop like this allowing for command line options

			for (var da=0; da<data.opts.length; da++) {
				// this is a loop for each option sent by the interface

				// if it's string value is true or false, set it to boolean
				// no strings have a defined value of true or false if they are not boolean in cura
				if (data.opts[da].v == 'false') {
					data.opts[da].v = false;
				} else if (data.opts[da].v == 'true') {
					data.opts[da].v = true;
				}

				// first loop through each of machine_settings to find a match
				for (var daa in curaFdm.machine_settings) {
					if (daa == data.opts[da].o) {
						// match, update curaFdm
						curaFdm.machine_settings[daa]['default'] = data.opts[da].v;
					}
				}

				// next loop through each of categories to find a match
				for (var key in curaFdm.categories) {
					// and inside each category, loop through the settings
					//console.log('going through category '+key);
					for (var k in curaFdm.categories[key].settings) {
						if (k == data.opts[da].o) {
							// match
							//console.log('setting '+key+'.'+k);
							curaFdm.categories[key].settings[k]['default'] = data.opts[da].v;
						}
					}
				}
				//console.log('### finished loop for option '+data.opts[da].o+"\n");
			}

			// this is super strange, but some options don't do anything with cura
			// specifically the core defaults such as temperature

			// material_print_temperature and bed_temperature can be set to whatever, but cura still doesn't
			// put it at the start of the gcode file to warm up the printer
			// this makes no sense because you are setting these options, so why not use them?
			// we need to prepend this to machine_start_gcode
			curaFdm.machine_settings.machine_start_gcode['default'] = curaFdm.machine_settings.machine_start_gcode['default'] +"\r\nM109 S"+curaFdm.categories['material'].settings.material_print_temperature['default']+"\r\n";

			if (curaFdm.machine_settings.machine_heated_bed['default'] == true) {
				curaFdm.machine_settings.machine_start_gcode['default'] = curaFdm.machine_settings.machine_start_gcode['default'] +"\r\nM190 S"+curaFdm.categories['material'].settings.material_bed_temperature['default']+"\r\n";
			}

			// EVEN WORSE, ON TOP OF NOT PUTTING THE SETTINGS INTO THE START AND END OF THE GCODE
			// CURA DOESN'T EVEN PUT THOSE FIELDS IN THE FILE
			// SO YOU HAVE TO THEN REOPEN THE FILE AFTER CURA HAS WRITTEN IT
			// AND PUT THE CORRECT START AND END VALUES THAT YOU ACTUALLY SET IN THE CURA CONFIG!!
			// GOOD THING FOR JAVASCRIPT BIND TO PASS EXTERNALLY SCOPED VARIABLES

			//console.log(util.inspect(curaFdm, false, null));

			// now sync write the updated options to a json file for CuraEngine to read
			fs.writeFileSync('./currentCuraConfig.json', JSON.stringify(curaFdm));

		}

		// add input file, currently the same for both slicers as last option
		opts.push('workingStl.stl');

		var ls = '';
		for (var i=0; i<opts.length; i++) {
			ls += ' '+opts[i];
		}

		//console.log(data.slicer + ' ' + ls);

		var spawn = require('child_process').spawn;

		if (data.slicer == 'slic3r') {
			var cmd = spawn('./runSl.sh', opts);
		} else if (data.slicer == 'cura') {
			var cmd = spawn('../CuraEngine/build/CuraEngine', opts);
		}

		cmd.stdout.on('data', function (data) {
			socket.emit('slStatus', 'Slicer status: '+data);
			socket.emit('serialRead', {'line':'<span style="color: green;">Slicer: '+data+'</span>'});
			console.log('Slicer stdout: ' + data);
		});

		cmd.stderr.on('data', function (data) {
			socket.emit('serialRead', {'line':'<span style="color: #888;">Slicer Error: '+data+'</span>'});
			console.log('Slicer stderr: ' + data);
		});

		cmd.on('close', function (code) {
			console.log('child process exited with code ' + code);
			// emit file
			if (code == 0) {
				// success

				// explained right under this, and earlier in the code
				if (this[1] == 'cura') {
					var srsly = fs.readFileSync('./workingStl.gcode');

					srsly = curaFdm.machine_settings.machine_start_gcode['default'] + srsly + curaFdm.machine_settings.machine_end_gcode['default'];

					fs.writeFileSync('./workingStl.gcode',srsly);
				}
				socket.emit('slDone', {'status':'success'});

			} else {
				socket.emit('slDone', {'status':'error'});
			}
		// here we have to bind curaFdm and the slicer being used so we can update the file with
		// the proper start and end gcode because curaengine doesn't use what you set in the settings file
		}.bind([curaFdm,data.slicer]));

	});

	socket.on('clearQ', function(data) {
		// clear the command queue
		sp[currentSocketPort[socket.id]].q = [];
		// update the status
		emitToPortSockets(currentSocketPort[socket.id], 'qStatus', {'currentLength':0, 'currentMax':0});
	});

	socket.on('pause', function(data) {
		// pause queue
		if (data == 1) {
			console.log('pausing queue');
			queuePause = 1;
		} else {
			console.log('unpausing queue');
			queuePause = 0;
			sendFirstQ(currentSocketPort[socket.id]);
		}
	});

	// print stl command
	socket.on('printStl', function (data) {

		var gc = '';

		// read workingStl.gcode
		fs.readFile('workingStl.gcode', 'utf8', function(err, fileData) {
			if (!err) {

				if (typeof currentSocketPort[socket.id] != 'undefined') {
					// split newlines
					var nl = fileData.split("\n");
					// add to queue
					sp[currentSocketPort[socket.id]].q = sp[currentSocketPort[socket.id]].q.concat(nl);
					// set qCurrentMax
					sp[currentSocketPort[socket.id]].qCurrentMax = nl.length;
					if (sp[currentSocketPort[socket.id]].q.length == nl.length) {
						// there was no previous q so write a line
						sendFirstQ(currentSocketPort[socket.id]);
					}


				} else {
					socket.emit('serverError', 'you must select a serial port');
				}

			} else {
				socket.emit('serverError', 'error reading file workingStl.gcode');
			}
		});

	});

	// gcode print
	socket.on('printGcode', function (data) {

		if (typeof currentSocketPort[socket.id] != 'undefined') {
			// split newlines
			var nl = data.line.split("\n");
			// add to queue
			sp[currentSocketPort[socket.id]].q = sp[currentSocketPort[socket.id]].q.concat(nl);
			// set qCurrentMax
			sp[currentSocketPort[socket.id]].qCurrentMax = nl.length;
			if (sp[currentSocketPort[socket.id]].q.length == nl.length) {
				// there was no previous q so write a line
				sendFirstQ(currentSocketPort[socket.id]);
			}

		} else {
			socket.emit('serverError', 'you must select a serial port');
		}

	});

	// lines fromweb ui
	socket.on('gcodeLine', function (data) {

		if (typeof currentSocketPort[socket.id] != 'undefined') {
			// valid serial port, safe to send
			// split newlines
			var nl = data.line.split("\n");
			// add to queue
			sp[currentSocketPort[socket.id]].q = sp[currentSocketPort[socket.id]].q.concat(nl);
			// add to qCurrentMax
			sp[currentSocketPort[socket.id]].qCurrentMax += nl.length;
			if (sp[currentSocketPort[socket.id]].q.length == nl.length) {
				// there was no previous q so write a line
				sendFirstQ(currentSocketPort[socket.id]);
			}

		} else {
			socket.emit('serverError', 'you must select a serial port');
		}

	});

	socket.on('disconnect', function() {

		if (typeof currentSocketPort[socket.id] != 'undefined') {
			for (var c=0; c<sp[currentSocketPort[socket.id]].sockets.length; c++) {
				if (sp[currentSocketPort[socket.id]].sockets[c].id == socket.id) {
					// remove old
					sp[currentSocketPort[socket.id]].sockets.splice(c,1);
				}
			}
		}

	});

	socket.on('usePort', function (data) {

		console.log('user wants to use port '+data);
		console.log('switching from '+currentSocketPort[socket.id]);

		if (typeof currentSocketPort[socket.id] != 'undefined') {
			for (var c=0; c<sp[currentSocketPort[socket.id]].sockets.length; c++) {
				if (sp[currentSocketPort[socket.id]].sockets[c].id == socket.id) {
					// remove old
					sp[currentSocketPort[socket.id]].sockets.splice(c,1);
				}
			}
		}

		if (typeof sp[data] != 'undefined') {
			currentSocketPort[socket.id] = data;
			sp[data].sockets.push(socket);
		} else {
			socket.emit('serverError', 'that serial port does not exist');
		}
		
	});

});
