# binance-trader

# Installation
sudo npm install yarn -g
yarn install
create .env file with api key and secret 
configure settings in config/default.json file

# Run
* In dev : npm run dev
* in prod : npm start

heroku local:run node app

# Organisation
* app.js - entry point of application
* binance.js - provides exchange data and functionality
* trader.js - takes care of the act of trading by taking data from exchange and applying calculations to make trade decisions
* symbol.js - data structure to hold state and config of traded symbol
* config/default.json - user settings for running the bot
* configurator.js - prepares the config for each symbol based on user settings

# Configuration
* for dev  please update the developmenet.json or env vars
* for prod please update producation.json or env vars

## Buying Strategies
* single ema and price spread
* ema slow and fast spread
* macd
* rsi
* bollinger bands
* dca

## Selling Strategy
* percentage gain

# Warning
Bot will sell everything in your bag that are not locked in any open orders.
