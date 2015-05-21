var fs = require('fs');

var slBaseOpts = {};

// base slicer options
slBaseOpts.rrwBaseOpts = {'slic3r':[
{section:'Printer Options', options: [
{opt:'--nozzle-diameter',name:'Diameter of nozzle in mm (default: 0.5) (MUST BE 0.N)',value:'0.5'},
{opt:'--print-center',name:'Coordinates in mm of the point to center the print around (default: 100,100)',value:'100.0,100.0'},
{opt:'--z-offset',name:'Additional height in mm to add to vertical coordinates, positive is above the bed surface (+/-, default: 0)',value:'0'},
{opt:'--gcode-flavor',name:'The type of G-code to generate (reprap/teacup/makerware/sailfish/mach3/no-extrusion, default: reprap)',value:['reprap','teacup','makerware','sailfish','mach3','no-extrusion']},
{opt:'--use-relative-e-distances',name:'Enable this to get relative E values (default: no)',value:['no','yes']},
{opt:'--use-firmware-retraction',name:'Enable firmware-controlled retraction using G10/G11 (default: no)',value:['no','yes']},
{opt:'--gcode-arcs',name:'Use G2/G3 commands for native arcs (experimental, not supported by all firmwares)',value:['no','yes']},
{opt:'--g0',name:'Use G0 commands for retraction (experimental, not supported by all firmwares)',value:['no','yes']},
{opt:'--gcode-comments',name:'Make G-code verbose by adding comments (default: no)',value:['no','yes']},
{opt:'--vibration-limit',name:'Limit the frequency of moves on X and Y axes (Hz, set zero to disable; default: 0)',value:'0'},
]},
{section:'Filament Options', options: [
{opt:'--filament-diameter',name:'Diameter in mm of your raw filament (default: 3)',value:'3'},
{opt:'--extrusion-multiplier',name:'Change this to alter the amount of plastic extruded. There should be very little need to change this value, which is only useful to compensate for filament packing (default: 1)',value:'1'},
{opt:'--temperature',name:'Extrusion temperature in degree Celsius, set 0 to disable (default: 200)',value:'200'},
{opt:'--first-layer-temperature',name:'Extrusion temperature for the first layer, in degree Celsius, set 0 to disable (default: same as temperature)',value:'200'},
{opt:'--bed-temperature',name:'Heated bed temperature in degree Celsius, set 0 to disable (default: 0)',value:'0'},
{opt:'--first-layer-bed-temperature',name:'Heated bed temperature for the first layer, in degree Celsius, set 0 to disable (default: same as bed-temperature)',value:'0'},
]},
{section:'Speed Options', options: [
{opt:'--travel-speed',name:'Speed of non-print moves in mm/s (default: 130)',value:'130'},
{opt:'--perimeter-speed',name:'Speed of print moves for perimeters in mm/s (default: 30)',value:'30'},
{opt:'--small-perimeter-speed',name:'Speed of print moves for small perimeters in mm/s or % over perimeter speed (default: 30)',value:'30'},
{opt:'--external-perimeter-speed',name:'Speed of print moves for the external perimeter in mm/s or % over perimeter speed (default: 70%)',value:'70%'},
{opt:'--infill-speed',name:'Speed of print moves in mm/s (default: 60)',value:'60'},
{opt:'--solid-infill-speed',name:'Speed of print moves for solid surfaces in mm/s or % over infill speed (default: 60)',value:'60'},
{opt:'--top-solid-infill-speed',name:'Speed of print moves for top surfaces in mm/s or % over solid infill speed (default: 50)',value:'50'},
{opt:'--support-material-speed',name:'Speed of support material print moves in mm/s (default: 60)',value:'60'},
{opt:'--support-material-interface-speed',name:'Speed of support material interface print moves in mm/s or % over support material speed (default: 100%)',value:'100%'},
{opt:'--bridge-speed',name:'Speed of bridge print moves in mm/s (default: 60)',value:'60'},
{opt:'--gap-fill-speed',name:'Speed of gap fill print moves in mm/s (default: 20)',value:'20'},
{opt:'--first-layer-speed',name:'Speed of print moves for bottom layer, expressed either as an absolute value or as a percentage over normal speeds (default: 30%)',value:'30%'},
]},
{section:'Acceleration Options', options: [
{opt:'--perimeter-acceleration',name:'Overrides firmware default acceleration for perimeters. (mm/s^2, set zero to disable; default: 0)',value:'0'},
{opt:'--infill-acceleration',name:'Overrides firmware default acceleration for infill. (mm/s^2, set zero to disable; default: 0)',value:'0'},
{opt:'--bridge-acceleration',name:'Overrides firmware default acceleration for bridges. (mm/s^2, set zero to disable; default: 0)',value:'0'},
{opt:'--first-layer-acceleration',name:'Overrides firmware default acceleration for first layer. (mm/s^2, set zero to disable; default: 0)',value:'0'},
{opt:'--default-acceleration',name:'Acceleration will be reset to this value after the specific settings above have been applied. (mm/s^2, set zero to disable; default: 0)',value:'0'},
]},
{section:'Accuracy Options', options: [
{opt:'--layer-height',name:'Layer height in mm (default: 0.3) (MUST BE 0.N)',value:'0.3'},
{opt:'--first-layer-height',name:'Layer height for first layer (mm or %, default: 0.35)',value:'.35'},
{opt:'--infill-every-layers',name:'Infill every N layers (default: 1)',value:'1'},
{opt:'--solid-infill-every-layers',name:'Force a solid layer every N layers (default: 0)',value:'0'},
]},
{section:'Print Options', options: [
{opt:'--perimeters',name:'Number of perimeters/horizontal skins (range: 0+, default: 3)',value:'3'},
{opt:'--top-solid-layers',name:'Number of solid layers to do for top surfaces (range: 0+, default: 3)',value:'3'},
{opt:'--bottom-solid-layers',name:'Number of solid layers to do for bottom surfaces (range: 0+, default: 3)',value:'3'},
{opt:'--fill-density',name:'Infill density (range: 0%-100%, default: 40%)',value:'40%'},
{opt:'--fill-angle',name:'Infill angle in degrees (range: 0-90, default: 45)',value:'45'},
{opt:'--fill-pattern',name:'Pattern to use to fill non-solid layers (default: honeycomb)',value:['3dhoneycomb','honeycomb','concentric','line','hilbertcurve','octagramspiral','flowsnake','rectilinear','archimedeanchords']},
{opt:'--solid-fill-pattern',name:'Pattern to use to fill solid layers (default: rectilinear)',value:['rectilinear','3dhoneycomb','honeycomb','concentric','line','hilbertcurve','octagramspiral','flowsnake','archimedeanchords']},
//{opt:'--start-gcode',name:'Load initial G-code from the supplied file. This will overwrite the default command (home all axes [G28]).',value:''},
//{opt:'--end-gcode',name:'Load final G-code from the supplied file. This will overwrite the default commands (turn off temperature [M104 S0], home X axis [G28 X], disable motors [M84]).',value:''},
//{opt:'--layer-gcode',name:'Load layer-change G-code from the supplied file (default: nothing).',value:''},
//{opt:'--toolchange-gcode',name:'Load tool-change G-code from the supplied file (default: nothing).',value:''},
{opt:'--seam-position',name:'Position of loop starting points (random/nearest/aligned, default: aligned).',value:['aligned','random','nearest']},
{opt:'--external-perimeters-first',name:'Reverse perimeter order. (default: no)',value:['no','yes']},
{opt:'--spiral-vase',name:'Experimental option to raise Z gradually when printing single-walled vases (default: no)',value:['no','yes']},
{opt:'--only-retract-when-crossing-perimeters',name:'Disable retraction when travelling between infill paths inside the same island. (default: no)',value:['no','yes']},
{opt:'--solid-infill-below-area',name:'Force solid infill when a region has a smaller area than this threshold (mm^2, default: 70)',value:'70'},
{opt:'--infill-only-where-needed',name:'Only infill under ceilings (default: no)',value:['no','yes']},
{opt:'--infill-first',name:'Make infill before perimeters (default: no)',value:['no','yes']},
]},
{section:'Quality Options', options: [
{opt:'--extra-perimeters',name:'Add more perimeters when needed (default: yes)',value:['yes','no']},
{opt:'--avoid-crossing-perimeters',name:'Optimize travel moves so that no perimeters are crossed (default: no)',value:['no','yes']},
{opt:'--thin-walls',name:'Detect single-width walls (default: yes)',value:['yes','no']},
{opt:'--overhangs',name:'Experimental option to use bridge flow, speed and fan for overhangs (default: yes)',value:['yes','no']},
]},
{section:'Support Material Options', options: [
{opt:'--support-material',name:'Generate support material for overhangs',value:['yes','no']},
{opt:'--support-material-threshold',name:'Overhang threshold angle (range: 0-90, set 0 for automatic detection, default: 0)',value:'0'},
{opt:'--support-material-pattern',name:'Pattern to use for support material (default: honeycomb)',value:['honeycomb','3dhoneycomb','concentric','line','hilbertcurve','octagramspiral','flowsnake','rectilinear','archimedeanchords']},
{opt:'--support-material-spacing',name:'Spacing between pattern lines (mm, default: 2.5)',value:'2.5'},
{opt:'--support-material-angle',name:'Support material angle in degrees (range: 0-90, default: 0)',value:'0'},
{opt:'--support-material-interface-layers',name:'Number of perpendicular layers between support material and object (0+, default: 3)',value:'3'},
{opt:'--support-material-interface-spacing',name:'Spacing between interface pattern lines (mm, set 0 to get a solid layer, default: 0)',value:'0'},
{opt:'--raft-layers',name:'Number of layers to raise the printed objects by (range: 0+, default: 0)',value:'0'},
{opt:'--support-material-enforce-layers',name:'Enforce support material on the specified number of layers from bottom, regardless of support-material and threshold (0+, default: 0)',value:'0'},
{opt:'--dont-support-bridges',name:'Experimental option for preventing support material from being generated under bridged areas (default: yes)',value:['yes','no']},
]},
{section:'Retraction Options', options: [
{opt:'--retract-length',name:'Length of retraction in mm when pausing extrusion (default: 1)',value:'1'},
{opt:'--retract-speed',name:'Speed for retraction in mm/s (default: 30)',value:'30'},
{opt:'--retract-restart-extra',name:'Additional amount of filament in mm to push after compensating retraction (default: 0)',value:'0'},
{opt:'--retract-before-travel',name:'Only retract before travel moves of this length in mm (default: 2)',value:'2'},
{opt:'--retract-lift',name:'Lift Z by the given distance in mm when retracting (default: 0)',value:'0'},
{opt:'--retract-layer-change',name:'Enforce a retraction before each Z move (default: yes)',value:['yes','no']},
{opt:'--wipe',name:'Wipe the nozzle while doing a retraction (default: no)',value:['no','yes']},
]},
{section:'Retraction Options for Multi-Extruder Setups', options: [
{opt:'--retract-length-toolchange',name:'Length of retraction in mm when disabling tool (default: 1)',value:'1'},
{opt:'--retract-restart-extra-toolchange',name:'Additional amount of filament in mm to push after switching tool (default: 0)',value:'0'},
]},
{section:'Cooling Options', options: [
{opt:'--cooling',name:'Enable fan and cooling control',value:['yes','no']},
{opt:'--min-fan-speed',name:'Minimum fan speed as % (default: 35)',value:'35'},
{opt:'--max-fan-speed',name:'Maximum fan speed as % (default: 100)',value:'100'},
{opt:'--bridge-fan-speed',name:'Fan speed to use when bridging as % (default: 100)',value:'100'},
{opt:'--fan-below-layer-time',name:'Enable fan if layer print time is below this approximate number of seconds (default: 60)',value:'60'},
{opt:'--slowdown-below-layer-time',name:'Slow down if layer print time is below this approximate number of seconds (default: 30)',value:'30'},
{opt:'--min-print-speed',name:'Minimum print speed (mm/s, default: 10)',value:'10'},
{opt:'--disable-fan-first-layers',name:'Disable fan for the first N layers (default: 1)',value:'1'},
{opt:'--fan-always-on',name:'Keep fan always on at min fan speed, even for layers that do not need cooling',value:['no','yes']},
]},
{section:'Skirt Options', options: [
{opt:'--skirts',name:'Number of skirts to draw (0+, default: 1)',value:'1'},
{opt:'--skirt-distance',name:'Distance in mm between innermost skirt and object (default: 6)',value:'6'},
{opt:'--skirt-height',name:'Height of skirts to draw (expressed in layers, 0+, default: 1)',value:'1'},
{opt:'--min-skirt-length',name:'Generate no less than the number of loops required to consume this length of filament on the first layer, for each extruder (mm, 0+, default: 0)',value:'0'},
{opt:'--brim-width',name:'Width of the brim that will get added to each object to help adhesion (mm, default: 0)',value:'0'},
]},
{section:'Transform Options', options: [
{opt:'--scale',name:'Factor for scaling input object (default: 1)',value:'1'},
{opt:'--rotate',name:'Rotation angle in degrees (0-360, default: 0)',value:'0'},
{opt:'--duplicate',name:'Number of items with auto-arrange (1+, default: 1)',value:'1'},
{opt:'--duplicate-grid',name:'Number of items with grid arrangement (default: 1,1)',value:'1,1'},
{opt:'--duplicate-distance',name:'Distance in mm between copies (default: 6)',value:'6'},
{opt:'--xy-size-compensation',name:'Grow/shrink objects by the configured absolute distance (mm, default: 0)',value:'0'},
]},
{section:'Sequential Printing Options', options: [
{opt:'--complete-objects',name:'When printing multiple objects and/or copies, complete each one before starting the next one; watch out for extruder collisions (default: no)',value:['no','yes']},
{opt:'--extruder-clearance-radius',name:'Radius in mm above which extruder will not collide with anything (default: 20)',value:'20'},
{opt:'--extruder-clearance-height',name:'Maximum vertical extruder depth; i.e. vertical distance from extruder tip and carriage bottom (default: 20)',value:'20'},
]},
{section:'Flow Options', options: [
{opt:'--extrusion-width',name:'Set extrusion width manually; it accepts either an absolute value in mm (like 0.65) or a percentage over layer height (like 200%)',value:''},
{opt:'--first-layer-extrusion-width',name:'Set a different extrusion width for first layer',value:''},
{opt:'--perimeter-extrusion-width',name:'Set a different extrusion width for perimeters',value:''},
{opt:'--external-perimeter-extrusion-width',name:'Set a different extrusion width for external perimeters',value:''},
{opt:'--infill-extrusion-width',name:'Set a different extrusion width for infill',value:''},
{opt:'--solid-infill-extrusion-width',name:'Set a different extrusion width for solid infill',value:''},
{opt:'--top-infill-extrusion-width',name:'Set a different extrusion width for top infill',value:''},
{opt:'--support-material-extrusion-width',name:'Set a different extrusion width for support material',value:''},
{opt:'--bridge-flow-ratio',name:'Multiplier for extrusion when bridging (> 0, default: 1)',value:''},
]},
{section:'Multiple Extruder Options', options: [
{opt:'--extruder-offset',name:'Offset of each extruder, if firmware does not handle the displacement (can be specified multiple times, default: 0x0)',value:'0x0'},
{opt:'--perimeter-extruder',name:'Extruder to use for perimeters (1+, default: 1)',value:'1'},
{opt:'--infill-extruder',name:'Extruder to use for infill (1+, default: 1)',value:'1'},
{opt:'--support-material-extruder',name:'Extruder to use for support material (1+, default: 1)',value:'1'},
{opt:'--support-material-interface-extruder',name:'Extruder to use for support material interface (1+, default: 1)',value:'1'},
{opt:'--ooze-prevention',name:'Drop temperature and park extruders outside a full skirt for automatic wiping (default: no)',value:['no','yes']},
{opt:'--ooze-prevention',name:'Drop temperature and park extruders outside a full skirt for automatic wiping (default: no)',value:['no','yes']},
{opt:'--standby-temperature-delta',name:'Temperature difference to be applied when an extruder is not active and ooze-prevention is enabled (default: -5)',value:'-5'},
]}

]};

// here we get cura base options from the fdmprinter.json file that comes with CuraEngine
fs.readFile('fdmprinter.json', function(err, d) {
	if (err) {
		console.log('problem reading fdmprinter.json');
	} else {
		var cfdm = JSON.parse(d);

		// add fdmprinter.json to slBaseOpts
		slBaseOpts.fdmprinter = cfdm;

		// init cura rrwBaseOpts
		slBaseOpts.rrwBaseOpts['cura'] = [];

		// machine settings
		//console.log(cfdm.machine_settings);

		var cms = {'section':'Machine Settings',options:[]};

		//cms.options.push({opt:'',name:'',value:''});
		cms.options.push({opt:'machine_width',name:'Width - Build Surface Width',value:'230'});
		cms.options.push({opt:'machine_height',name:'Height - Build Surface Height',value:'230'});
		cms.options.push({opt:'machine_heated_bed',name:'Heated Bed',value:['true','false']});
		cms.options.push({opt:'machine_center_is_zero',name:'Center is Zero',value:['true','false']});
		cms.options.push({opt:'machine_nozzle_size',name:'Nozzle Size',value:'0.4'});
		cms.options.push({opt:'machine_start_gcode',name:'Start GCODE - this is prepended to the gcode output',value:'G28 ; Home\nG1 Z15.0 F6000 ;move the platform down 15mm\n;Prime the extruder\nG92 E0\nG1 F200 E3\nG92 E0'});
		cms.options.push({opt:'machine_end_gcode',name:'End GCODE - this is appended to the gcode output',value:'M104 S0\nM140 S0\n;Retract the filament\nG92 E1\nG1 E-1 F300\nG28 X0 Y0\nM84'});

		slBaseOpts.rrwBaseOpts['cura'].push(cms);

		for (var key in cfdm.categories) {
			//console.log('###'+cfdm.categories[key].label+'###');

			// create section object
			var s = {'section':cfdm.categories[key].label,options:[]};

			for (var k in cfdm.categories[key].settings) {
				//console.log(cfdm.categories[key].settings[k].label + ' ' + cfdm.categories[key].settings[k].default + ' - ' + cfdm.categories[key].settings[k].description + "\n");
				// there are children here

				// add options to section
				if (cfdm.categories[key].settings[k].type == 'boolean') {
					// just true and false
					if (cfdm.categories[key].settings[k].default == true) {
						// set true as default
						s.options.push({opt:k,name:cfdm.categories[key].settings[k].label + ' - ' + cfdm.categories[key].settings[k].description,value:['true','false']});
					} else {
						// set false as default
						s.options.push({opt:k,name:cfdm.categories[key].settings[k].label + ' - ' + cfdm.categories[key].settings[k].description,value:['false','true']});
					}
				} else if (cfdm.categories[key].settings[k].type == 'enum') {
					var te = [];
					// add default as first enum
					te.push(cfdm.categories[key].settings[k].default);
					
					// loop through enum options, adding all except default as it has already been added
					for (var ff=0; ff<cfdm.categories[key].settings[k].options.length; ff++) {
						if (cfdm.categories[key].settings[k].options[ff] != cfdm.categories[key].settings[k].default) {
							// add it to te
							te.push(cfdm.categories[key].settings[k].options[ff]);
						}
					}

					// add it
					s.options.push({opt:k,name:cfdm.categories[key].settings[k].label + ' - ' + cfdm.categories[key].settings[k].description,value:te});
				} else {
					// otherwise it is a number, just add it
					s.options.push({opt:k,name:cfdm.categories[key].settings[k].label + ' - ' + cfdm.categories[key].settings[k].description,value:cfdm.categories[key].settings[k].default});
				}

			}

			// add section
			slBaseOpts.rrwBaseOpts['cura'].push(s);

		}

	}

	//console.log(slBaseOpts.rrwBaseOpts['cura']);

});

// export slBaseOpts
module.exports = slBaseOpts;
