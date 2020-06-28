# node-red-contrib-ui-upload

[Node-RED Dashboard](https://github.com/node-red/node-red-dashboard) UI widget node for **uploading** a file content by Socket.io streaming.

Supports: browse for file or drag & drop; pause & resume, replay; custom chunk size.

Screenshot in the Node-RED Dashboard:

![Node-RED Dashboard upload widget](doc/dashboard.png)

In a Node-RED flow, this *Upload node* can advantageously be connected to some standard nodes such as:
* *Split node* using the option *Handle as a stream of messages*: to read one line at a time (works well, also for very large uploaded files)
* *Join node* using the *automatic* mode: to reassemble the uploaded chunks into one single message / string (only for relatively small uploaded files, which can fit in memory)

Example: [flows.json](doc/flows.json)

![Node-RED flow](doc/flow.png)

License: [Apache 2.0](LICENSE.md), 2020.

Originally made by [Alexandre Alapetite](https://alexandra.dk/alexandre.alapetite) at the [Alexandra Institute](https://alexandra.dk).
