'use strict';

var _ = require('lodash');
var columnify = require('columnify');
var wait = require('wait-for-stuff');
var tick = require('animation-loops');

var binance = require('binance');
const rest = new binance.BinanceRest({
	key: process.env.key,
	secret: process.env.secret,
	timeout: 15000,
	recvWindow: 10000,
	disableBeautification: false,
});

const binanceWS = new binance.BinanceWS();

binanceWS.onKline('VENBTC', '1m', (data) => {
	console.log(data);
});

rest.account((err, data) => { });

console.log(process.env);