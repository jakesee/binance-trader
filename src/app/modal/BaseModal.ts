export class BaseModal {

    constructor() {
    }

    /**
     * 
     * @param arg  to be cloned
     */
    cloneDeep<T>(arg: T): T {
        return JSON.parse(JSON.stringify(arg));
    }

}