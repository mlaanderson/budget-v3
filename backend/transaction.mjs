/** @typedef {import ('neo4j-driver').Session} Session */
/** @typedef {import ('./service.mjs').Service} Service */
/** @typedef {import ('./budget.mjs').Budget} Budget */
/** @typedef {import ('./account.mjs').Account} Account */
/** @typedef {import ('../lib/types.mjs').TransactionRecord} TransactionRecord */

import { randomUUID } from 'crypto';
import NObject from './nobject.mjs';

const CREATE_TRANSACTION = `
MATCH (account:Account)
WHERE
    account.uuid = $account_id
CREATE (transaction:Transaction {
    date: $date,
    amount: round($amount, 2),
    category: $category,
    memo: $memo,
    check: $check,
    transfer: null,
    scheduled: $scheduled,
    cleared: $cleared,
    cash: $cash,
    notes: $notes,
    uuid: $uuid
}), (transaction)-[:WITHDRAWAL]->(account)
RETURN transaction
`;

const CREATE_TRANFER = `
MATCH (fromAcc:Account), (toAcc:Account)
WHERE
    fromAcc.id = $account_id AND
    toAcc.name = $transfer
CREATE (transaction:Transaction {
    date: $date,
    amount: round($amount, 2),
    category: $category,
    memo: $memo,
    check: $check,
    transfer: $transfer,
    scheduled: $scheduled,
    cleared: $cleared,
    cash: $cash,
    notes: $notes,
    uuid: $uuid
}), 
(transaction)-[:WITHDRAWAL]->(fromAcc),
(transaction)-[:DEPOSIT]->(toAcc)
RETURN transaction
`;

const LOAD_TRANSACTION = `
MATCH (account:Account)<-[relationship]-(transaction:Transaction)
WHERE
    account.uuid = $account_id AND
    transaction.uuid = $uuid
RETURN transaction, relationship
`;

/**
 * @typedef {{
 * id: string
 * }} Transaction
 */
class Transaction extends NObject {
    /**
     * 
     * @param {Account} account 
     * @param {string|Object.<string,any>} uuid
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
     */
    constructor(account, uuid, date, amount, category, memo, check, transfer, scheduled, cleared, cash, notes) {
        super(account.service, account, uuid, date, amount, category, memo, check, transfer, scheduled, cleared, cash, notes);
    }

    /**
     * 
     * @param {Account} account 
     * @param {string} uuid
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
     */
    async load(account, uuid, date, amount, category, memo, check, transfer, scheduled, cleared, cash, notes) {
        this.__account = account;
        if (!!uuid && (typeof uuid === 'object')) {
            /** @type {TransactionRecord} */
            this.__data = {...uuid};
        } else {
            if (!uuid) {
                uuid = randomUUID();
            }
            /** @type {TransactionRecord} */
            this.__data = await this.loadOrCreateSingle(LOAD_TRANSACTION, transfer ? CREATE_TRANFER : CREATE_TRANSACTION, 'transaction', {
                account_id: account.id,
                uuid,
                date,
                amount,
                category,
                memo,
                check,
                transfer,
                scheduled,
                cleared,
                cash,
                notes
            });
        }

        super.load();
    }


    get id() {
        return this.__data ? this.__data.uuid : null;
    }

    get date() {
        return this.__data ? this.__data.date.toStandardDate() : null;
    }

    get amount() {
        return this.__data ? this.__data.amount : 0;
    }

    get notes() {
        return this.__data ? this.__data.notes : '';
    }

    get scheduled() {
        return this.__data ? this.__data.scheduled : false;
    }

    get cleared() {
        return this.__data ? this.__data.cleared : false;
    }

    get category() {
        return this.__data ? this.__data.category : '';
    }

    get memo() {
        return this.__data ? this.__data.memo : '';
    }

    get cash() {
        return this.__data ? this.__data.cash : false;
    }
}

export default Transaction;