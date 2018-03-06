// /*jshint esnext: true */
// /*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
// /*global require, process, appConfig*/

// (function () {
//     'use strict';

//     // Loading the .env file
//     require('dotenv').config({
//         silent: true
//     });

//     require('./app/globalVars');

//     const port = appConfig.port;

//     // open *:3000 to accept sockets
//     var log = require('loglevel');
//     log.setLevel(process.env.audit);
//     var app = require('express')();
//     var http = require('http').Server(app);
//     var io = require('socket.io')(http);
    
//     let Exchange =  require('./exchanges/exchnage');

//     http.listen(port, () => {
//         console.log('Listening on *:', port);
//     });

//     let Binance = require('./app/exchanges/binance.js');
//     let binance = new Binance(io);

//     // io.on('connection', (socket) => { 
//     // 	binance.getPortfolio().then((data) => {
//     // 		console.log('emit', data);
//     // 		socket.emit('portfolio', data);
//     // 	});
//     // });
//     // io.on('disconnect', (socket) => { binance.removeSocket(socket); });

//     binance.run();
//     let Trader = require('./app/trader/trader.js');
//     let trader = new Trader(binance);
//     trader.start();

// })();
