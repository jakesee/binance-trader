"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config = require("config");
// require('./dev.json');
class Config {
}
Config.port = config.get('port');
Config.key = process.env.key || config.get('key');
Config.secret = process.env.secret || config.get('secret');
Config.audit = process.env.audit || config.get('audit');
exports.Config = Config;
//# sourceMappingURL=index.js.map