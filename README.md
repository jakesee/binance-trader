# binance-trader
This is a trading bot that triggers buy and sell orders based on price and technical indicator triggers set by the user.

_While the author(s) of this trading bot is using this application to automate trades, this application will not guarantee profits. Please use this application at your own risk._

# Crypto Exchange
Currently only Binance is supported.

# Installation
## Core Requirements
* NodeJS
* TypeScript
* npm

## Production
This application is designed to run on heroku.

* Set up environment variables on Heroku
 * audit - values allowed: "trace", "debug", "warn", "info"
 * key - the Binance API key
 * secret - the Binance API secret key
 * NODE_ENV - "heroku"
* Then simply push to Heroku and it should automatically run npm install.

## Development or running locally
Instead of environment variables, the values are defined in src/config/secret.json. Simply replace the values to your own.
To build, run: npm run build

## Testing
No tests at the moment. (Yes, very bad. You are warned!)

# Organisation
* app.ts - entry point of application
* binance.ts - provides exchange data and functionality
* trader.ts - takes care of the act of trading by taking data from exchange and applying calculations to make trade decisions
* symbol.ts - data structure to hold state and config of traded symbol
* config/default.json - user settings for running the bot
* configurator.ts - prepares the config for each symbol based on user settings

# Configuration
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
