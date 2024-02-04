/**
 * @typedef {import ('neo4j-driver').Duration} Duration
 * @typedef {import ('neo4j-driver').Date} DbDate
 * @typedef {{ name: string, email: string, password: string }} UserData
 * @typedef {{ name: string, owner: string, uuid: string, period: Duration, start: DbDate, theme: string }} BudgetRecord
 * @typedef {'Checking'|'Savings'|'Credit'|'Investment'|'Other'} AccountType
 * @typedef {{ name: string, account_number: string, routing_number: string, type: AccountType }} AccountRecord
 * @typedef {{ date: string, amount: number, category: string, memo: string, transfer: string,
 * check: string, transfer: string, scheduled: boolean, cleared: boolean, cash: boolean, notes: string }} TransactionRecord
 */