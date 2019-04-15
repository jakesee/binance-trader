module.exports = {
  "logLevel": "debug",
  "exchange": "binance",
  "quote": "USDT",
  "symbols": ["VETUSDT", "LTCUSDT"],
  "default": {
    "bag": {
        "quantity": null,
        "cost": null
    },
    "frequency": 5000,
    "indicator": {
        "kline": {
          "interval": "3m"
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
          "minCost": 50,
          "maxCost": 150,
          "maxBuySpread": 0.02,
          "trail": 0.0015,
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
              "enabled": false,
              "trigger": -0.003
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
              "trigger": -7
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
          "enabled": true,
          "levels": [-0.035, -0.045, -0.045, -0.045, -0.055, -0.055]
        }
   
      }
  },
  "LTCUSDT": {
    "strategy": {
        "buy": {
          "enabled": true,
          "minCost": 50,
          "maxCost": 150,
          "maxBuySpread": 0.02,
          "trail": 0.0007,
          "rsi": {
              "enabled": true,
              "trigger": 34
          },
          "emaslow": {
              "enabled": true,
              "trigger": -0.008
          },
          "loss": {
              "trigger": -7
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
          "enabled": true,
          "levels": [-0.035, -0.045, -0.045, -0.045, -0.055, -0.055]
        }
    }
  }
}