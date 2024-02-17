/** @typedef {import ('neo4j-driver').Session} Session */
/** @typedef {import ('./service.mjs').Service} Service */
/** @typedef {import ('./budget.mjs').Budget} Budget */
/** @typedef {import ('../lib/types.mjs').AccountType} AccountType */
/** @typedef {import ('../lib/types.mjs').AccountRecord} AccountRecord */
/** @typedef {import ('../lib/types.mjs').BalanceInfo} BalanceInfo */

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

const LOAD_TRANSACTIONS = `
MATCH (account:Account)<-[relationship]-(transaction:Transaction)
WHERE
    account.uuid = $account_id AND
    transaction.date >= date($start) AND
    transaction.date < date($start) + $period
RETURN relationship, transaction
`;

const LOAD_WITHDRAWAL_BALANCE_PRIOR_TO = `
MATCH (account:Account)<-[:WITHDRAWAL]-(transaction:Transaction)
WHERE
    account.uuid = $account_id AND
    transaction.date < date($start)
RETURN round(sum(transaction.amount), 2) AS total
`;

const LOAD_DEPOSIT_BALANCE_PRIOR_TO = `
MATCH (account:Account)<-[:DEPOSIT]-(transaction:Transaction)
WHERE
    account.uuid = $account_id AND
    transaction.date < date($start)
RETURN round(sum(transaction.amount), 2) AS total
`;

const LOAD_WITHDRAWAL_BALANCE_WITHIN = `
MATCH (account:Account)<-[:WITHDRAWAL]-(transaction:Transaction)
WHERE
    account.uuid = $account_id AND
    transaction.date >= date($start) AND
    transaction.date < date($start) + $period
RETURN round(sum(transaction.amount), 2) AS total
`;

const LOAD_DEPOSIT_BALANCE_WITHIN = `
MATCH (account:Account)<-[:DEPOSIT]-(transaction:Transaction)
WHERE
    account.uuid = $account_id AND
    transaction.date >= date($start) AND
    transaction.date < date($start) + $period
RETURN round(sum(transaction.amount), 2) AS total
`;

const LOAD_CLEARED_WITHDRAWALS_BALANCE_WITHIN = `
MATCH (account:Account)<-[:WITHDRAWAL]-(transaction:Transaction)
WHERE
    account.uuid = $account_id AND
    transaction.date >= date($start) AND
    transaction.date < date($start) + $period AND
    transaction.cleared
RETURN round(sum(transaction.amount), 2) AS total
`;

const LOAD_PENDING_WITHDRAWALS_BALANCE_WITHIN = `
MATCH (account:Account)<-[:WITHDRAWAL]-(transaction:Transaction)
WHERE
    account.uuid = $account_id AND
    transaction.date >= date($start) AND
    transaction.date < date($start) + $period AND
    NOT transaction.cleared AND
    transaction.scheduled
RETURN round(sum(transaction.amount), 2) AS total
`;

const LOAD_CLEARED_DEPOSITS_BALANCE_WITHIN = `
MATCH (account:Account)<-[:DEPOSIT]-(transaction:Transaction)
WHERE
    account.uuid = $account_id AND
    transaction.date >= date($start) AND
    transaction.date < date($start) + $period AND
    transaction.cleared
RETURN round(sum(transaction.amount), 2) AS total
`;

const LOAD_PENDING_DEPOSITS_BALANCE_WITHIN = `
MATCH (account:Account)<-[:DEPOSIT]-(transaction:Transaction)
WHERE
    account.uuid = $account_id AND
    transaction.date >= date($start) AND
    transaction.date < date($start) + $period AND
    NOT transaction.cleared AND
    transaction.scheduled
RETURN round(sum(transaction.amount), 2) AS total
`;

const LOAD_CLEARED_DEPOSITS_BALANCE_PRIOR = `
MATCH (account:Account)<-[:DEPOSIT]-(transaction:Transaction)
WHERE
    account.uuid = $account_id AND
    transaction.date < date($start) AND
    transaction.cleared
RETURN round(sum(transaction.amount), 2) AS total
`;

const LOAD_PENDING_DEPOSITS_BALANCE_PRIOR = `
MATCH (account:Account)<-[:DEPOSIT]-(transaction:Transaction)
WHERE
    account.uuid = $account_id AND
    transaction.date < date($start) AND
    NOT transaction.cleared AND
    transaction.scheduled
RETURN round(sum(transaction.amount), 2) AS total
`;

const LOAD_CLEARED_WITHDRAWALS_BALANCE_PRIOR = `
MATCH (account:Account)<-[:WITHDRAWAL]-(transaction:Transaction)
WHERE
    account.uuid = $account_id AND
    transaction.date < date($start) AND
    transaction.cleared
RETURN round(sum(transaction.amount), 2) AS total
`;

const LOAD_PENDING_WITHDRAWALS_BALANCE_PRIOR = `
MATCH (account:Account)<-[:WITHDRAWAL]-(transaction:Transaction)
WHERE
    account.uuid = $account_id AND
    transaction.date < date($start) AND
    NOT transaction.cleared AND
    transaction.scheduled
RETURN round(sum(transaction.amount), 2) AS total
`;

const GET_DAILY_WITHDRAWAL_BALANCES = `
UNWIND range(-14, 70) AS offs
UNWIND date($start) + duration({ days: offs }) AS balance_date
MATCH (account:Account)<-[:WITHDRAWAL]-(tr:Transaction)
WHERE
    account.uuid = $account_id AND
    tr.date <= balance_date
RETURN sum(tr.amount) AS total, balance_date AS date
`;

const GET_DAILY_DEPOSIT_BALANCES = `
UNWIND range(-14, 70) AS offs
UNWIND date($start) + duration({ days: offs }) AS balance_date
MATCH (account:Account)<-[:DEPOSIT]-(tr:Transaction)
WHERE
    account.uuid = $account_id AND
    tr.date <= balance_date
RETURN sum(tr.amount) AS total, balance_date AS date
`;

const BULK_IMPORT_FROM = `
MATCH (account:Account)
WHERE account.uuid = $uuid
UNWIND $transactions as map
CREATE 
    (transaction:Transaction), 
    (transaction)-[:WITHDRAWAL]->(account)
SET 
    transaction = map, 
    transaction.date = date(transaction.date),
    transaction.amount = abs(round(transaction.amount, 2))
RETURN transaction
`;

const BULK_IMPORT_TO = `
MATCH (account:Account)
WHERE account.uuid = $uuid
UNWIND $transactions as map
CREATE 
    (transaction:Transaction), 
    (transaction)-[:DEPOSIT]->(account)
SET 
    transaction = map, 
    transaction.date = date(transaction.date),
    transaction.amount = round(transaction.amount, 2)
RETURN transaction
`;

/**
 * @typedef {{
 * id: string,
 * budget: Budget,
 * name: string,
 * account_number: string,
 * routing_number: string,
 * type: AccountType,
 * service: Service,
 * session: Session,
 * loaded: () => Promise<boolean>,
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

    get budget() {
        return this.__budget;
    }

    get name() {
        return this.__data ? this.__data.name : null;
    }

    get account_number() {
        return this.__data ? this.__data.account_number : null;
    }

    get routing_number() {
        return this.__data ? this.__data.routing_number : null;
    }

    get type() {
        return this.__data ? this.__data.type : null;
    }

    get periodInfo() {
        return {
            account_id: this.id,
            start: this.budget.periods.current,
            period: this.budget.period
        }
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

    async loadTransactions() {
        let query = await this.session.run(LOAD_TRANSACTIONS, this.periodInfo);

        return query.records.map(rec => {
            let data = rec.get('transaction').properties;
            // if this is the account for a withdrawal, invert the amount
            if (rec.get('relationship').type === 'WITHDRAWAL') {
                data.amount = data.amount * -1; 
            }
            return new Transaction(this, data);
        });
    }

    /**
     * 
     * @returns {Promise<BalanceInfo>}
     */
    async loadBalances() {
        let queryPriorDeposits = await this.session.run(LOAD_DEPOSIT_BALANCE_PRIOR_TO, this.periodInfo);
        let queryPriorWithdrawals = await this.session.run(LOAD_WITHDRAWAL_BALANCE_PRIOR_TO, this.periodInfo);
        let queryPriorClearedWithdrawals = await this.session.run(LOAD_CLEARED_WITHDRAWALS_BALANCE_PRIOR, this.periodInfo);
        let queryPriorClearedDeposits = await this.session.run(LOAD_CLEARED_DEPOSITS_BALANCE_PRIOR, this.periodInfo);
        let queryPriorPendingWithdrawals = await this.session.run(LOAD_PENDING_WITHDRAWALS_BALANCE_PRIOR, this.periodInfo)
        let queryPriorPendingDeposits = await this.session.run(LOAD_PENDING_DEPOSITS_BALANCE_PRIOR, this.periodInfo)

        let queryCurrentDeposits = await this.session.run(LOAD_DEPOSIT_BALANCE_WITHIN, this.periodInfo);
        let queryCurrentWithdrawals = await this.session.run(LOAD_WITHDRAWAL_BALANCE_WITHIN, this.periodInfo);
        let queryCurrentClearedWithdrawals = await this.session.run(LOAD_CLEARED_WITHDRAWALS_BALANCE_WITHIN, this.periodInfo);
        let queryCurrentClearedDeposits = await this.session.run(LOAD_CLEARED_DEPOSITS_BALANCE_WITHIN, this.periodInfo);
        let queryCurrentPendingWithdrawals = await this.session.run(LOAD_PENDING_WITHDRAWALS_BALANCE_WITHIN, this.periodInfo)
        let queryCurrentPendingDeposits = await this.session.run(LOAD_PENDING_DEPOSITS_BALANCE_WITHIN, this.periodInfo)

        /**
         * @type {BalanceInfo}
         */
        let result = {
            prior: { 
                deposits: queryPriorDeposits.records[0].get('total'),
                withdrawals: queryPriorWithdrawals.records[0].get('total'),
                cleared: queryPriorClearedDeposits.records[0].get('total') - queryPriorClearedWithdrawals.records[0].get('total'),
                pending: queryPriorPendingDeposits.records[0].get('total') - queryPriorPendingWithdrawals.records[0].get('total')
            },
            current: {
                deposits: queryCurrentDeposits.records[0].get('total'),
                withdrawals: queryCurrentWithdrawals.records[0].get('total'),
                cleared: queryCurrentClearedDeposits.records[0].get('total') - queryCurrentClearedWithdrawals.records[0].get('total'),
                pending: queryCurrentPendingDeposits.records[0].get('total') - queryCurrentPendingWithdrawals.records[0].get('total')
            }
        }

        result.prior.total = result.prior.deposits - result.prior.withdrawals;
        result.current.total = result.current.deposits - result.current.withdrawals + result.prior.total;

        return result;
    }

    async loadDailyBalances() {
        let queryWithdrawalBalances = await this.session.run(GET_DAILY_WITHDRAWAL_BALANCES, this.periodInfo);
        let queryDepositBalances = await this.session.run(GET_DAILY_DEPOSIT_BALANCES, this.periodInfo);

        return queryWithdrawalBalances.records.map((rec,idx) => {
            return {
                date: rec.get('date').toStandardDate(),
                withdrawals: rec.get('total'),
                deposits: queryDepositBalances.records[idx].get('total'),
                balance: queryDepositBalances.records[idx].get('total') - rec.get('total')
            }
        })
    }

    /**
     * 
     * @param {Array<import("./transaction.mjs").TransactionRecord>} transactions 
     */
    async importBulkTransactions(transactions) {
        let withdrawals = transactions.filter(tr => tr.amount <= 0);
        let deposits = transactions.filter(tr => tr.amount > 0);
        
        let query = await this.session.run(BULK_IMPORT_FROM,  { uuid: this.id, transactions: withdrawals });
        
        let result = query.records.map(rec => rec.get('transaction').properties);
        
        query = await this.session.run(BULK_IMPORT_TO, { uuid: this.id, transactions: deposits });
        result.push(...query.records.map(rec => rec.get('transaction').properties));

        return result;
    }
}

export default Account;