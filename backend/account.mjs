/** @typedef {import ('neo4j-driver').Session} Session */
/** @typedef {import ('./service.mjs').Service} Service */
/** @typedef {import ('./budget.mjs').Budget} Budget */
/** @typedef {import ('../lib/types.mjs').AccountType} AccountType */
/** @typedef {import ('../lib/types.mjs').AccountRecord} AccountRecord */

import { randomUUID } from "crypto";
import NObject from "./nobject.mjs";
import { Neo4jError } from "neo4j-driver";
import Transaction from "./transaction.mjs";

const LOAD_ACCOUNT = `
MATCH (budget:Budget)<-[:FOR]-(account:Account)
WHERE
    budget.uuid = $budget_uuid AND
    account.name = $name
RETURN account
`;

const CREATE_ACCOUNT = `
MATCH (budget:Budget)
WHERE budget.uuid = $budget_uuid
CREATE (account:Account {
    name: $name,
    account_number: $account_number,
    routing_number: $routing_number,
    type: $type,
    uuid: $uuid
}), (account)-[:FOR]->(budget)
RETURN account
`;

/**
 * @typedef {{
 * id: string,
 * service: Service,
 * session: Session,
 * createTransaction: (date: string, amount: number, category: string, memo: string, transfer: string,
 * check: string, transfer: string, scheduled: boolean, cleared: boolean, cash: boolean, notes: string) => Promise<Transaction>
 * }} Account
 */
class Account extends NObject {
    /**
     * Loads or creates an account
     * @param {Budget} budget 
     * @param {string} name 
     * @param {string} account_number 
     * @param {string} routing_number 
     * @param {AccountType} type 
     */
    constructor(budget, name, account_number = null, routing_number = null, type = 'Checking') {
        super(budget.service, budget, name, account_number, routing_number, type);
    }

    /**
     * 
     * @param {Budget} budget 
     * @param {string} name 
     * @param {string} account_number 
     * @param {string} routing_number 
     * @param {AccountType} type 
     * @protected
     */
    async load(budget, name, account_number, routing_number, type) {
        this.__budget = budget;

        /** @type {AccountRecord} */
        this.__data = await this.loadOrCreateSingle(LOAD_ACCOUNT, CREATE_ACCOUNT, 'account', {
            budget_uuid: budget.id,
            uuid: randomUUID(),
            name,
            account_number,
            routing_number,
            type
        });

        super.load();
    }

    get id() {
        return this.__data ? this.__data.uuid : null;
    }
    
    /**
     * Creates a new transation in this account
     * @param {string} date 
     * @param {number} amount 
     * @param {string} category 
     * @param {string} memo 
     * @param {string} check 
     * @param {string} transfer
     * @param {boolean} scheduled 
     * @param {boolean} cleared 
     * @param {boolean} cash 
     * @param {string} notes 
     * @returns {Promise<Transaction>}
     */
    async createTransaction(date, amount, category, memo, check, transfer, scheduled, cleared, cash, notes) {
        let result = new Transaction(this, null, date, amount, category, memo, check, transfer, scheduled, cleared, cash, notes);
        await result.loaded();
        return result;
    }
}

export default Account;