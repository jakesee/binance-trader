"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class BaseModal {
    constructor() {
    }
    /**
     *
     * @param arg  to be cloned
     */
    cloneDeep(arg) {
        if (!!arg) {
            return JSON.parse(JSON.stringify(arg));
        }
        else {
            return arg;
        }
    }
}
exports.BaseModal = BaseModal;
//# sourceMappingURL=BaseModal.js.map