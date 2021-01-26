/*

    RepRapWeb - A Web Based 3d Printer Controller
    Copyright (C) 2021 Andrew Hodel

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
var http = require('http');

// test for webcam
config.showWebCam = false;

http.get('http://127.0.0.1:8080', function(res) {
	// valid response, enable webcam
	console.log('enabling webcam');
	config.showWebCam = true;
}).on('socket', function(socket) {
	// 2 second timeout on this socket
	socket.setTimeout(2000);
	socket.on('timeout', function() {
		this.abort();
	});
}).on('error', function(e) {
	console.log('Got error: '+e.message+' not enabling webcam')
});

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

serialport.list().then(function(ports) {

	allPorts = ports;

	console.log(ports);

	for (var i=0; i<ports.length; i++) {
	!function outer(i){

		sp[i] = {};
		sp[i].port = ports[i].path;
		sp[i].q = [];
		sp[i].qCurrentMax = 0;
		sp[i].lastSerialWrite = [];
		sp[i].lastSerialReadLine = '';
		// read on the parser
		sp[i].handle = new serialport.parsers.Readline({delimiter: '\n'});
		// 1 means clear to send, 0 means waiting for response
		sp[i].port = new serialport(ports[i].path, {
			baudRate: config.serialBaudRate
		});
		// write on the port
		sp[i].port.pipe(sp[i].handle);
		sp[i].sockets = [];

		sp[i].handle.on("open", function() {

			console.log('connected to '+sp[i].port+' at '+config.serialBaudRate);

			// loop for temp every 5 seconds
			setInterval(function() {
				sp[i].handle.write("M105\n");
			}, 5000);

		});

		// line from serial port
		sp[i].handle.on("data", function (data) {
			serialData(data, i);
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

	// handle M105 and wait for temp responses for Sprinter-simple-right
	if (data.indexOf('E0') == 0) {
		emitToPortSockets(port, 'tempStatus', data);
		sp[port].lastSerialReadLine = data;
		return;
	}

	// handle M105 for typical Marlin/RepRap data
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
		emitToPortSockets(port, 'consoleDisplay', {c:0,l:data});

		// remove first
		sp[port].lastSerialWrite.shift();

	} else if (data.indexOf('rs') == 0) {
		// handle resend
		// resend last
		sp[port].handle.write(sp[port].lastSerialWrite[-1]);

		console.log('rs (resend) from printer, resending');

	} else if (data.indexOf('!!') == 0) {

		// error is red
		emitToPortSockets(port, 'consoleDisplay', {c:1,l:data});

		// remove first
		sp[port].lastSerialWrite.shift();

		console.log('!! (error) from printer');

	} else {
		// other is grey
		emitToPortSockets(port, 'consoleDisplay', {c:2,l:data});
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
		sp[port].sockets[i].emit('consoleDisplay', {c:3,l:'SEND: '+t});
	}
	sp[port].handle.write(t+"\n");
	sp[port].lastSerialWrite.push(t);
}

var queuePause = 0;

var sessIdToSocketId = [];
function checkForExistingSess(sessId, socket) {

	console.log('checking for existing session');

	// loop through the sessId's to see if this one already exists
	for (r in sessIdToSocketId) {
		if (sessIdToSocketId[r].sessId == sessId) {

			// check if old socket.id has an entry in currentSocketPort
			if (typeof(currentSocketPort[sessIdToSocketId[r].socketId]) != undefined) {
				console.log('existing session found using port '+currentSocketPort[sessIdToSocketId[r].socketId]);
				// the old socket had a serial port, set the new socket.id to use the old serial port
				currentSocketPort[socket.id] = currentSocketPort[sessIdToSocketId[r].socketId];

				// add the socket to the serial port
				sp[currentSocketPort[sessIdToSocketId[r].socketId]].sockets.push(socket);

				// update the sessIdToSocketId entry
				sessIdToSocketId[r].socketId = socket.id;
			}

		}
	}

}

io.sockets.on('connection', function (socket) {

	console.log('connection event for socket.id', socket.id);

	socket.on('sessId', function(data) {
		// this means that the client reconnected
		// so we need to set the proper socket id for this sessId
		checkForExistingSess(data, socket);
	});

	socket.on('firstLoad', function(data) {

		// emit slic3r saved options to ui
		socket.emit('slOpts', slBaseOpts);
		socket.emit('config', config);

		// emit all ports to ui
		socket.emit('ports', allPorts);

		// set the sessId alongside this socket id
		sessIdToSocketId.push({sessId:data, socketId:socket.id});

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
		// slicer options
		// make options string
		var opts = [];

		if (data.slicer == 'cura') {
			opts.push('slice');
		} else if (data.slicer == 'slic3r') {
		}

		//console.log(opts);

		// cura needs to load the default options with -j from a json file
		// options passed after the -j option with -s have priority
		if (data.slicer == 'cura') {
			opts.push('-j');
			opts.push('./fdmprinter.def.json');
		}

		for (c in data.opts) {
			//console.log(data.opts[c].o, data.opts[c].v);
			if (data.slicer == 'slic3r' && data.opts[c].v != '') {
				opts.push(data.opts[c].o);
				opts.push(data.opts[c].v);
			} else if (data.slicer == 'cura') {
				opts.push('-s');
				opts.push(data.opts[c].o+'='+data.opts[c].v);
			}

		}

		if (data.slicer == 'cura') {
			opts.push('-o');
			opts.push('workingStl.gcode');
			opts.push('-l');
		}

		opts.push('workingStl.stl');

		var spawn = require('child_process').spawn;

		if (data.slicer == 'slic3r') {
			var cmd = spawn('./runSl.sh', opts);
		} else if (data.slicer == 'cura') {
			var cmd = spawn('../CuraEngine/build/CuraEngine', opts);
		}

		//console.log(data);
		//console.log(opts);
		
		var stdout = '';
		var stderr = '';

		cmd.stdout.on('data', function (data) {
			stdout += data;
		});

		cmd.stderr.on('data', function (data) {
			stderr += data;
		});

		cmd.on('close', function (code) {
			console.log('child process exited with code ' + code);

			socket.emit('slStatus', 'Slicer status: '+stdout);
			socket.emit('consoleDisplay', {c:0,l:'Slicer Output (stdout): '+stdout});

			if (this.data.slicer == 'cura' && stderr.indexOf('[WARNING]') > -1) {
				// cura provides all options via a WARNING sent to stderr
				// which makes very little sense and should be in stdout
				socket.emit('consoleDisplay', {c:2,l:'These are the Cura Slicer Options, which CuraEngine sends to stderr: '+stderr});
			} else {
				socket.emit('consoleDisplay', {c:2,l:'Slicer Error (stderr): '+stderr});
			}
			console.log('stdout: ' + stdout);
			console.log('stderr: ' + stderr);

			// emit slDone with status
			if (code == 0) {
				// success
				socket.emit('slDone', {'status':'success'});

			} else {
				socket.emit('slDone', {'status':'Slic3r error'});
			}
		}.bind({data: data}));

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

		if (typeof currentSocketPort[socket.id] != 'undefined') {
			console.log('currentSocketPort is defined, removing old one');
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
