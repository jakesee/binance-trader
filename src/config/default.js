module.exports = {
  "logLevel": "debug",
  "exchange": "binance",
  "quote": "USDT",
  "symbols": ["BTCUSDT", "VETUSDT", "LTCUSDT"],
  "default": {
    "bag": {
        "quantity": NaN,
        "cost": NaN
    },
    "frequency": 5000,
    "indicator": {
        "kline": {
          "interval": "1m"
        },
        "bb": {
          "period": 20,
          "stdDev": 2
        },
        "macd": {
          "fastPeriod": 12,
          "slowPeriod": 26,
          "signalPeriod": 9
        },
        "rsi": {
          "period": 14
        },
        "ema": {
          "fastPeriod": 9,
          "slowPeriod": 26
        }
    },
    "strategy": {
        "buy": {
          "enabled": true,
          "minCost": 200,
          "maxCost": 350,
          "maxBuySpread": 0.02,
          "trail": 0.0009,
          "bb": {
              "enabled": false,
              "reference": "lowbb",
              "trigger": -0.003
          },
          "macd": {
              "enabled": false,
              "trigger": -0.003
          },
          "rsi": {
              "enabled": true,
              "trigger": 34
          },
          "emaspread": {
              "enabled": true,
              "trigger": -0.004
          },
          "emafast": {
              "enabled": false,
              "trigger": -0.016
          },
          "emaslow": {
              "enabled": true,
              "trigger": -0.016
          },
          "loss": {
              "enabled": false,
              "trigger": -7
          },
          "orderbook": {
            "enabled": false,
            "upperBound": 1.02,
            "lowerBound": 1.02
          }
        },
        "sell": {
          "enabled": true,
          "trail": 0.0015,
          "gain": {
              "enabled": true,
              "target": 1.016
          }
        },
        "dca": {
          "enabled": false,
          "levels": [-0.345, -0.045, -0.045, -0.055, -0.055]
        }
   
      }
  },
  "LTCUSDT": {
    "strategy": {
        "buy": {
          "enabled": true,
          "minCost": 200,
          "maxCost": 350,
          "maxBuySpread": 0.02,
          "trail": 0.0007,
          "rsi": {
              "enabled": true,
              "trigger": 34
          },
          "emaspread": {
            "enabled": true,
            "trigger": -0.003
          },
          "emaslow": {
              "enabled": true,
              "trigger": -0.010
          }
        },
        "sell": {
          "enabled": true,
          "trail": 0.0007,
          "gain": {
              "enabled": true,
              "target": 1.016
          }
        },
        "dca": {
          "enabled": false,
          "levels": [-0.345, -0.045, -0.045, -0.055, -0.055]
        }
    }
  },
  "BTCUSDT": {
    "strategy": {
        "buy": {
          "enabled": true,
          "minCost": 200,
          "maxCost": 200,
          "maxBuySpread": 0.02,
          "trail": 0.0007,
          "rsi": {
              "enabled": true,
              "trigger": 34
          },
          "emaspread": {
            "enabled": true,
            "trigger": -0.003
          },
          "emaslow": {
              "enabled": true,
              "trigger": -0.010
          }
        },
        "sell": {
          "enabled": true,
          "trail": 0.0007,
          "gain": {
              "enabled": true,
              "target": 1.016
          }
        },
        "dca": {
          "enabled": false,
          "levels": [-0.345, -0.045, -0.045, -0.055, -0.055]
        }
    }
  }
}