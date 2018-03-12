import * as config from "config";
require('./dev.json');

export class Config {
    static readonly port = config.get('port');
    static readonly key = process.env.key || config.get('key');
    static readonly secret = process.env.secret || config.get('secret');
    static readonly audit = process.env.audit || config.get('audit');
}