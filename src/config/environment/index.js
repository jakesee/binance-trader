/*jshint esnext: true */
/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global require, module, process*/

(function () {
    'use strict';

    var config = require('config');
    process.env.NODE_ENV = process.env.NODE_ENV || 'development';

    module.exports = {
        port: config.get('port'),
        key: process.env.key || config.get('key'),
        secret: process.env.secret || config.get('secret'),
        audit: process.env.audit || config.get('audit')
    };

})();
