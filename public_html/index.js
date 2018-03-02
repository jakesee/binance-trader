var app = angular.module('platform', []); // create angular app

app.controller('dashboard', ($scope) => {

	$scope.ticker = {};
	$scope.portfolio = {};

	// connect to nodejs and get ticker stream
	var socket = io('http://localhost:3000');

	socket.on('portfolio', (data) => {
		data.forEach((balance) => {
			balance.symbol = balance.asset + 'BTC'
			if(balance.asset in $scope.portfolio) balance.gain = $scope.portfolio[balance.asset].gain;
			$scope.portfolio[balance.asset] = balance;
		})
		$scope.$apply();
		console.log($scope.portfolio);
	});

	socket.on('ticker', (data) => {
		var symbol = data.symbol;
		var asset = symbol.substring(0, symbol.length - 3);
		var balance = $scope.portfolio[asset];
		var gain = data.currentClose / balance.weightedAveragePrice;
		data.deviationFromMean = data.currentClose / data.weightedAveragePrice
		$scope.portfolio[asset].gain = gain;
		$scope.ticker[symbol] = data;
		$scope.$apply();
	});

	var updateGain = function() {
		var symbol = data.symbol;
		var asset = symbol.substring(0, symbol.length - 3);
		var balance = $scope.portfolio[asset];
		var gain = data.currentClose / balance.weightedAveragePrice;
		data.deviationFromMean = data.currentClose / data.weightedAveragePrice
		$scope.portfolio[asset].gain = gain;
		$scope.ticker[symbol] = data;
	}
});