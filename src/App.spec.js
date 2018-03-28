"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const supertest = require("supertest");
const App_1 = require("./App");
describe('App', () => {
    it('works', () => supertest(App_1.default)
        .get('/')
        .expect('Content-Type', /json/)
        .expect(200));
});
//# sourceMappingURL=App.spec.js.map