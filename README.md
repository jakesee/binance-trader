# binance-trader

# Installation
npm install
create .env file with api key and secret
configure settings in config/default.json file
heroku local:run node app

# Organisation
* app.js - entry point of application
* binance.js - provides exchange data and functionality
* trader.js - takes care of the act of trading by taking data from exchange and applying calculations to make trade decisions
* symbol.js - data structure to hold state and config of traded symbol
* config/default.json - user settings for running the bot
* configurator.js - prepares the config for each symbol based on user settings

# Buying Strategies
* single ema and price spread
* ema slow and fast spread
* macd
* rsi
* bollinger bands
* dca

# Selling Strategy
* percentage gain
