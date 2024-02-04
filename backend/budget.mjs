/** @typedef {import ('neo4j-driver').Session} Session */
/** @typedef {import ('./service.mjs').Service} Service */
/** @typedef {import ('../lib/types.mjs').UserData} UserData */
/** @typedef {import ('../lib/types.mjs').BudgetRecord} BudgetRecord */
/** @typedef {import ('neo4j-driver').Duration} Duration */
/** @typedef {import ('neo4j-driver').Date} DbDate */

import NObject from "./nobject.mjs";
import { randomUUID } from "crypto";
import { Duration, Neo4jError } from "neo4j-driver";
import Account from "./account.mjs";

const CREATE_BUDGET = `
MATCH (user:User) WHERE user.email = $email
CREATE (budget:Budget {
    name: $name,
    owner: $email,
    start: date($start),
    theme: $theme,
    period: duration($period),
    uuid: $uuid
}), (budget)-[:OWNER]->(user)
RETURN budget
`;

const LOAD_OWNED_BUDGET = `
MATCH (budget:Budget)-[:OWNER]->(user:User) 
WHERE 
    budget.name = $name AND 
    user.email = $email
RETURN budget
`;

const GET_ACCOUNTS = `
MATCH (budget:Budget)<-[:FOR]-(account:Account)
WHERE
    budget.uuid = $uuid
RETURN account
`;

const GET_PERIOD_COUNT_DAYS = `
MATCH (budget:Budget) 
WHERE budget.uuid = $uuid 
RETURN duration.inDays(budget.start, date($date)) AS days
`;

const GET_PERIOD_COUNT_MONTHS = `
MATCH (budget:Budget) 
WHERE budget.uuid = $uuid 
RETURN duration.between(budget.start, date($date)) AS months
`;

const GET_DATES = `
MATCH (budget:Budget) 
WHERE budget.uuid = $uuid 
RETURN 
    budget.start + budget.period * ($periods - 1) as previous,
    budget.start + budget.period * $periods as current,
    budget.start + budget.period * ($periods + 1) as next
`;

/**
 * @typedef {{
 * session: Session,
 * service: Service,
 * id: string,
 * loaded: () => Promise<boolean>
 * }} Budget
 */
class Budget extends NObject {
    /**
     * 
     * @param {Service} service 
     * @param {UserData} user
     * @param {string} name
     * @param {start} string
     * @param {string} theme
     * @param {period} string
     */
    constructor(service, user, name, start, theme='default', period='P2W') {
        super(service, user, name, start, theme, period);
    }

    async load(user, name, start, theme, period) {
        this.__user = user;
        /** @type {BudgetRecord} */
        this.__data = await this.loadOrCreateSingle(LOAD_OWNED_BUDGET, CREATE_BUDGET, 'budget', {
            email: this.__user.email,
            name,
            start,
            theme,
            period,
            uuid: randomUUID()
        });
       
        super.load();
    }

    get user() {
        return {...this.__user};
    }

    get id() {
        return this.__data ? this.__data.uuid : null;
    }

    /**
     * Get the account names associated with this budget
     * @returns {Promise<Array<string>>}
     */
    async getAccountNames() {
        let query = await this.session.run(GET_ACCOUNTS, { uuid: this.id });
        return query.records.map(rec => rec.get('account').properties.name);
    }

    /**
     * Loads an account
     * @param {string} name 
     * @returns {Promise<Account>}
     */
    async getAccount(name) {
        let account = new Account(this, name);
        await account.loaded();
        return account;
    }

    /**
     * Creates an account and returns it
     * @param {string} name 
     * @param {import("./account.mjs").AccountType} type 
     * @param {string} account_number 
     * @param {string} routing_number 
     * @returns {Promise<Account>}
     */
    async createAccount(name, type = 'Checking', account_number = null, routing_number = null) {
        let account = new Account(this, name, account_number, routing_number, type);
        await account.loaded();
        return account;
    }

    /** @type {string} */
    get owner() {
        return this.__data ? this.__data.owner : null;
    }

    /** @type {Duration} */
    get period() {
        return this.__data ? this.__data.period : null;
    }

    get name() {
        return this.__data ? this.__data.name : null;
    }

    get start() {
        return this.__data ? this.__data.start : null;
    }

    get theme() {
        return this.__data ? this.__data.theme : null;
    }

    async getPeriodDates(date) {
        if (date === undefined) {
            date = new Date().toISOString().substring(0, 10);
        }

        let query;
        let periods;

        if (this.period.days > 0) {
            query = await this.session.run(GET_PERIOD_COUNT_DAYS, {
                uuid: this.id,
                date
            });
            if (query.records.length !== 1) {
                return [];
            }
            /** @type {Duration} */
            let days = query.records[0].get('days');

            periods = days.days / this.period.days;
        } else if (this.period.months > 0) {
            query = await this.session.run(GET_PERIOD_COUNT_MONTHS, {
                uuid: this.id,
                date
            });
            if (query.records.length !== 1) {
                return [];
            }
            /** @type {Duration} */
            let months = query.records[0].get('months');

            periods = months.months / this.period.months;
        }

        console.log(periods)

        query = await this.session.run(GET_DATES, {uuid: this.id, periods});
        return {
            previous: query.records[0].get('previous').toStandardDate().toISOString().substring(0,10), 
            current: query.records[0].get('current').toStandardDate().toISOString().substring(0,10), 
            next: query.records[0].get('next').toStandardDate().toISOString().substring(0,10)
        };
    }
}

export default Budget;