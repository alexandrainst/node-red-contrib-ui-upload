'use strict';

function html(config) {
	const jsonConfig = JSON.stringify(config);
	return String.raw`
<style>
.ui_upload {
	height: 100%;
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	justify-content: space-evenly;
}
.ui_upload p.title {
	background: transparent !important;
	font-size: 175%;
	text-align: center;
	width: 99%;
}
.ui_upload > progress {
	width: 90%;
}
.ui_upload.done > progress {
	display: none;
}
.ui_upload > p.result {
	font-size: 150%;
}
.ui_upload:not(.done) > p.result {
	display: none;
}
.ui_upload > button {
	background: transparent;
	border: 0;
	font-size: xx-large;
	margin: 0;
	padding: 0;
}
.ui_upload > button[disabled] {
	filter: grayscale(1) brightness(1.5);
}
</style>

<div id="ui_upload-{{unique}}" class="ui_upload"
	ng-init='init(` + jsonConfig + `)'
	style="width:{{width}}"
	ng-on-dragleave="ondragleave($event)" ng-on-dragenter="ondragenter($event)"
	ng-on-dragover="ondragover($event)" ng-on-drop="ondrop($event)">
	<p class="title">{{title}}</p>
	<progress value="0" max="100"></progress>
	<p class="result">✔️ <small>0s</small></p>
	<input type="file" ng-on-change="onchange($event)" name="ui_upload-filename" accept="{{accept}}" />
	<button class="play" ng-click="playClick($event)" disabled="disabled">▶️</button>
	<button class="stop" ng-click="stopClick($event)" disabled="disabled">⏹️</button>
</div>
`;
}

// NB: This function goes through a toString + eval by Node-RED Dashboard, so no scope
function initController($scope, events) {
	$scope.init = function (config) {
		$scope.config = config;
		$scope.unique = $scope.$eval('$id');
		$scope.title = config.title || config.name || 'Upload';
		$scope.accept = '' + config.accept;
		$scope.chunkCallback = null;
		$scope.downstreamReady = false;
		// TODO: Find a cleaner approach for the width
		$scope.width = (Math.max(config.width || 12, 4) * 52.5) + 'px';
	};

	$scope.$watch('msg', function (msg) {
		// Message received from back-end
		if (msg && msg.tick && !$scope.stop && !$scope.pause) {
			if ($scope.chunkCallback) {
				$scope.chunkCallback.f($scope.chunkCallback.e);
			} else {
				$scope.downstreamReady = true;
			}
		}
	});

	function sendFile(file) {
		const div = document.getElementById('ui_upload-' + $scope.unique);
		div.classList.remove('done');
		const progress = div.querySelector('progress');
		$scope.stop = false;
		$scope.downstreamReady = true;

		delete $scope.duration;
		const startTime = Date.now() - 1;
		const chunk = 1024 * Math.max($scope.config.chunk || 1024, 1);
		const count = Math.ceil(file.size / chunk);
		const partsId = file.name + ';' + file.size + ';' + Date.now();
		let partsIndex = -1;
		let loaded = 0;

		let blob;
		const fileReader = new FileReader();
		fileReader.onload = function (e) {
			if ($scope.stop) {
				// Send special paquet to inform the rest of the pipeline
				$scope.send({
					file: {
						lastModified: file.lastModified,
						name: file.name,
						size: file.size,
						type: file.type,
					},
					parts: {
						id: partsId,
						type: 'string',
						ch: '',
						index: partsIndex + 1,
						count: partsIndex + 2,
						chunk: chunk,
						abort: true,
					},
					payload: '',
				});
				$scope.stopClick();
				return;
			} else if (!$scope.chunkCallback && ($scope.pause || !$scope.downstreamReady)) {
				$scope.chunkCallback = { f: fileReader.onload, e: e };
				return;
			}
			partsIndex++;
			$scope.chunkCallback = false;
			$scope.downstreamReady = false;
			$scope.send({
				file: {
					lastModified: file.lastModified,
					name: file.name,
					size: file.size,
					type: file.type,
				},
				parts: {
					id: partsId,
					type: 'string',
					ch: '',
					index: partsIndex,
					count: count,
					chunk: chunk,
				},
				payload: e.target.result,
				complete: partsIndex + 1 >= count ? true : undefined,
			});
			loaded += chunk;
			progress.value = 100 * loaded / file.size;
			if (loaded <= file.size) {
				blob = file.slice(loaded, loaded + chunk);
				if ($scope.config.transfer === 'text') {
					fileReader.readAsText(blob, 'Windows-1252');
				} else {
					fileReader.readAsArrayBuffer(blob);
				}
			} else {
				loaded = file.size;
				$scope.duration = Math.ceil((Date.now() - startTime) / 1000);
				$scope.stopClick();
			}
		};

		blob = file.slice(0, chunk);
		if ($scope.config.transfer === 'text') {
			// NB: Can only be a single-byte encoding / ASCII, so no Unicode / UTF-8!
			fileReader.readAsText(blob, 'Windows-1252');
		} else {
			fileReader.readAsArrayBuffer(blob);
		}
	}

	let backgroundColor = '';

	$scope.ondragleave = function (e) {
		e.preventDefault();
		e.stopPropagation();
		const div = e.currentTarget;
		div.style.background = backgroundColor;
	};

	$scope.ondragenter = function (e) {
		e.preventDefault();
		e.stopPropagation();
	};

	$scope.ondragover = function (e) {
		e.preventDefault();
		e.stopPropagation();
		const div = e.currentTarget;
		backgroundColor |= div.style.background;
		div.style.background = '#55E';
	};

	$scope.ondrop = function (e) {
		const dataTransfer = e.dataTransfer || e.originalEvent.dataTransfer;
		if (dataTransfer && dataTransfer.files && dataTransfer.files.length > 0) {
			e.preventDefault();
			e.stopPropagation();
			$scope.stopClick(e);
			const div = e.currentTarget;
			div.style.background = '#5E5';
			setTimeout(function () { div.style.background = backgroundColor; }, 300);
			const input = div.querySelector('input');
			input.files = dataTransfer.files;
			div.querySelector('.play').innerHTML = '⏸️';
			div.querySelector('.play').disabled = false;
			div.querySelector('.stop').disabled = false;
			sendFile(dataTransfer.files[0]);
		}
	};

	$scope.playClick = function (e) {
		const div = document.getElementById('ui_upload-' + $scope.unique);
		if ($scope.pause) {
			div.querySelector('.play').innerHTML = '⏸️';
			$scope.pause = false;
			$scope.chunkCallback.f($scope.chunkCallback.e);
		} else if (!$scope.stop) {
			$scope.pause = true;
			div.querySelector('.play').innerHTML = '▶️';
		} else {
			$scope.stopClick(e);
			const input = div.querySelector('input');
			if (input.files && input.files.length > 0) {
				div.querySelector('.play').innerHTML = '⏸️';
				div.querySelector('.play').disabled = false;
				div.querySelector('.stop').disabled = false;
				sendFile(input.files[0]);
			}
		}
	};

	$scope.stopClick = function (e) {
		$scope.stop = true;
		$scope.pause = false;
		$scope.downstreamReady = false;
		$scope.chunkCallback = null;
		const div = document.getElementById('ui_upload-' + $scope.unique);
		div.querySelector('progress').value = 0;
		if ($scope.duration) {
			div.classList.add('done');
			div.querySelector('p.result > small').innerHTML = '' + $scope.duration + 's';
		}
		div.querySelector('.play').innerHTML = '▶️';
		div.querySelector('.play').disabled = false;
		div.querySelector('.stop').disabled = true;
	};

	$scope.onchange = function (e) {
		$scope.stopClick(e);
	};
}

/**
 * Return an incoming node ID if the node has any input wired to it, false otherwise.
 * If filter callback is not null, then this function filters incoming nodes.
 */
function findInputNodeId(toNode, filter = null) {
	if (toNode && toNode._flow && toNode._flow.global) {
		const allNodes = toNode._flow.global.allNodes;
		for (const fromNodeId of Object.keys(allNodes)) {
			const fromNode = allNodes[fromNodeId];
			if (fromNode && fromNode.wires) {
				for (const wireId of Object.keys(fromNode.wires)) {
					const wire = fromNode.wires[wireId];
					for (const toNodeId of wire) {
						if (toNode.id === toNodeId && (!filter || filter(fromNode))) {
							return fromNode.id;
						}
					}
				}
			}
		}
	}
	return false;
}

module.exports = function (RED) {
	let ui;

	function uiUpload(config) {
		const node = this;	// jshint ignore:line

		// Declare the ability of this node to consume ticks from downstream for back-pressure
		node.tickConsumer = true;
		let tickDownstreamId;

		try {
			if (!ui) {
				// load Dashboard API
				ui = RED.require('node-red-dashboard')(RED);
			}

			RED.nodes.createNode(node, config);
			if (!config || !config.group) {
				return;
			}

			// Defined in https://github.com/node-red/node-red-dashboard/blob/39b095586bdbd517ffbce1efff35227283edda4c/index.js
			const done = ui.addWidget({
				node: node,
				format: html(config),
				templateScope: 'local',
				group: config.group,
				order: config.order,
				height: Math.max(config.height || 5, 3),
				emitOnlyNewValues: false,
				forwardInputMessages: false,
				storeFrontEndInputAsState: false,
				persistantFrontEndValue: false,

				// callback to prepare the message that is emitted to the front-end
				beforeEmit: function (msg, value) {
					return { msg };
				},

				// callback to prepare the message that is sent to the output
				beforeSend: function (msg, orig) {
					if (tickDownstreamId === undefined) {
						// Search for any output node handling ticks for back-pressure,
						// or any input node (which must take this responsability)
						tickDownstreamId = findInputNodeId(node, (n) => n && n.tickConsumer) || findInputNodeId(node);
					}
					if (!tickDownstreamId) {
						// If there is no tick provider downstream, send default tick for back-pressure
						node.receive({ tick: true });
					}
					if (orig) {
						return orig.msg;
					}
				},

				// callback to initialize in controller
				initController: initController,
			});
			node.on('close', done);
		} catch (ex) {
			console.error(ex);
		}
	}

	RED.nodes.registerType('ui_upload', uiUpload);
};
