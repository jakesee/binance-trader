// open *:3000 to accept sockets
var log = require('loglevel');
log.setLevel(process.env.audit);
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
http.listen(3000, () => {
	console.log('Listening on *:3001');
});

var binance = require('./binance.js');
binance = new binance(io);

// io.on('connection', (socket) => { 
// 	binance.getPortfolio().then((data) => {
// 		console.log('emit', data);
// 		socket.emit('portfolio', data);
// 	});
// });
// io.on('disconnect', (socket) => { binance.removeSocket(socket); });

binance.run();
var trader = require('./trader.js');
trader = new trader(binance);
trader.start();