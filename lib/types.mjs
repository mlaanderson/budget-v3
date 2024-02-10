/**
 * @typedef {import ('neo4j-driver').Duration} Duration
 * @typedef {import ('neo4j-driver').Date} DbDate
 * @typedef {{ deposits: number, withdrawals: number, total: number, cleared: number, pending: number }} BalanceRecord
 * @typedef {{ prior: BalanceRecord, current: BalanceRecord }} BalanceInfo
 * @typedef {`${string}-${string}${string}`} DateString
 * @typedef {{ name: string, email: string, password: string }} UserData
 * @typedef {{ name: string, owner: string, uuid: string, period: Duration, start: DbDate, theme: string }} BudgetRecord
 * @typedef {'Checking'|'Savings'|'Credit'|'Investment'|'Other'} AccountType
 * @typedef {{ name: string, account_number: string, routing_number: string, type: AccountType }} AccountRecord
 * @typedef {{ date: DbDate, amount: number, category: string, memo: string, transfer: string,
 * check: string, scheduled: boolean, cleared: boolean, cash: boolean, notes: string }} TransactionRecord
 */