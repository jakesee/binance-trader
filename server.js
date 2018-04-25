// var tick = require(tick);
var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);

server.listen(4434, ()=> console.log('listening'));
app.use(express.static(__dirname + '/dist'));

app.get('/', function (req, res) {
  var index = path.join(__dirname, '/dist/index.html')
  res.sendfile(index);
});

io.on('connection', function (socket) {
  socket.emit('news', { hello: 'world' });
  socket.on('my other event', function (data) {
    console.log(data);
  });
});

setInterval(() => io.emit('time', new Date().toTimeString()), 1000);