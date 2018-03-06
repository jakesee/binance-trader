export class BaseModal {

    constructor() {
    }

    /**
     * 
     * @param arg  to be cloned
     */
    cloneDeep<T>(arg: T): T {
        if (!!arg) {
            return JSON.parse(JSON.stringify(arg));
        } else {
            return arg;
        }
    }
}