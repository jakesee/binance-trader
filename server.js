const express = require('express');
const server = express();
const path = require('path');\
const SocketIO = require('socket.io');

server.use(express.static(__dirname + '/dist'));

var port = process.env.PORT || 4434;
var index = __dirname + '/dist/index.html';

server.listen(port);

server.get('/*', function(request, response) {
    response.sendFile(path.join(index));
});

console.log('Listening on', port);

const io = SocketIO(server);

io.on('connection', (socket) => {
    console.log('client connected');
    socket.on('disconnect', () => console.log('client disconnected'));
});

setInterval(() => io.emit('time', new Date().toTimeString()), 1000);