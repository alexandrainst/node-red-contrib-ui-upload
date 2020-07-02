function html(config) {
	const jsonConfig = JSON.stringify(config);
	return String.raw`
<style>
.ui-upload {
	height: 100%;
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	justify-content: space-evenly;
}
.ui-upload p {
	background: transparent !important;
	font-size: larger;
	text-align: center;
	width: 99%;
}
.ui-upload progress {
	width: 90%;
}
.ui-upload button {
	background: transparent;
	border: 0;
	font-size: xx-large;
	margin: 0;
	padding: 0;
}
.ui-upload button[disabled] {
	filter: grayscale(1) brightness(1.5);
}
</style>

<div id="ui-upload-{{unique}}" class="ui-upload"
	ng-init='init(` + jsonConfig + `)'
	ng-on-dragleave="ondragleave($event)" ng-on-dragenter="ondragenter($event)"
	ng-on-dragover="ondragover($event)" ng-on-drop="ondrop($event)">
	<p>{{title}}</p>
	<progress value="0" max="100"></progress>
	<input type="file" ng-on-change="onchange($event)" name="ui-upload-filename" />
	<button class="play" ng-click="playClick($event)" disabled="disabled">▶️</button>
	<button class="stop" ng-click="stopClick($event)" disabled="disabled">⏹️</button>
</div>
`;
}

//NB: This function goes through a toString + eval by Node-RED Dashboard, so no scope
function initController($scope, events) {

	$scope.init = function (config) {
		$scope.config = config;
		$scope.unique = $scope.$eval('$id');
		$scope.title = config.title || config.name || 'Upload';
		$scope.chunkCallback = null;
		$scope.chunkWelcome = false;
	};

	$scope.$watch('msg', function (msg) {
		//Message received from back-end
		if (msg && msg.payload && msg.payload.tick && !$scope.stop && !$scope.pause) {
			if ($scope.chunkCallback) {
				$scope.chunkCallback.f($scope.chunkCallback.e);
			} else {
				$scope.chunkWelcome = true;
			}
		}
	});

	function sendFile(file) {
		const div = document.getElementById('ui-upload-' + $scope.unique);
		const progress = div.querySelector('progress');
		$scope.stop = false;
		$scope.chunkWelcome = true;

		const chunk = 1024 * Math.max($scope.config.chunk || 1024, 1);
		const id = file.name + ';' + file.size + ';' + Date.now();
		const count = Math.ceil(file.size / chunk);
		let loaded = 0;
		let i = -1;

		const fileReader = new FileReader();
		fileReader.onload = function (e) {
			i++;
			if ($scope.stop) {
				//Send special paquet to inform the rest of the pipeline
				$scope.send({
					file: {
						lastModified: file.lastModified,
						name: file.name,
						size: file.size,
						type: file.type,
					},
					parts: {
						id: id,
						type: 'string',
						ch: '',
						index: i,
						count: i + 1,
						chunk: chunk,
						abort: true,
					},
					payload: '',
				});
				$scope.stopClick();
				return;
			} else if (!$scope.chunkCallback && ($scope.pause || !$scope.chunkWelcome)) {
				$scope.chunkCallback = { f: fileReader.onload, e: e };
				return;
			}
			$scope.chunkCallback = false;
			$scope.chunkWelcome = false;
			$scope.send({
				file: {
					lastModified: file.lastModified,
					name: file.name,
					size: file.size,
					type: file.type,
				},
				parts: {
					id: id,
					type: 'string',
					ch: '',
					index: i,
					count: count,
					chunk: chunk,
				},
				payload: e.target.result,
			});
			loaded += chunk;
			progress.value = 100 * loaded / file.size;
			if (loaded <= file.size) {
				blob = file.slice(loaded, loaded + chunk);
				fileReader.readAsBinaryString(blob);
			} else {
				loaded = file.size;
				$scope.stopClick();
			}
		};
		let blob = file.slice(0, chunk);
		fileReader.readAsBinaryString(blob);
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
		const div = document.getElementById('ui-upload-' + $scope.unique);
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
		$scope.chunkWelcome = false;
		$scope.chunkCallback = null;
		const div = document.getElementById('ui-upload-' + $scope.unique);
		div.querySelector('progress').value = 0;
		div.querySelector('.play').innerHTML = '▶️';
		div.querySelector('.play').disabled = false;
		div.querySelector('.stop').disabled = true;
	};

	$scope.onchange = function (e) {
		$scope.stopClick(e);
	};
}

/**
 * Return true if the node has any input wired to it, false otherwise.
 */
function nodeHasInput(node) {
	if (node && node._flow && node._flow.global) {
		const allNodes = node._flow.global.allNodes;
		for (const node2Id of Object.keys(allNodes)) {
			const node2 = allNodes[node2Id];
			if (node2.wires) {
				for (const wireId of Object.keys(node2.wires)) {
					const wire = node2.wires[wireId];
					for (const nodeId of wire) {
						if (node.id === nodeId) {
							return true;
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
		const node = this;

		try {
			if (!ui) {
				// load Dashboard API
				ui = RED.require('node-red-dashboard')(RED);
			}

			RED.nodes.createNode(node, config);
			const hasInput = nodeHasInput(node);

			//Defined in https://github.com/node-red/node-red-dashboard/blob/39b095586bdbd517ffbce1efff35227283edda4c/index.js
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

				//callback to prepare the message that is emitted to the front-end
				beforeEmit: function (msg, value) {
					return { msg: msg };
				},

				//callback to prepare the message that is sent to the output
				beforeSend: function (msg, orig) {
					if (!hasInput) {
						//Send default tick for back-pressure
						node.receive({
							payload: {
								tick: true,
							},
						});
					}
					if (orig) {
						return orig.msg;
					}
				},

				//callback to initialize in controller
				initController: initController,
			});
			node.on('close', done);
		}
		catch (ex) {
			console.error(ex);
		}
	}

	RED.nodes.registerType('ui-upload', uiUpload);
};
