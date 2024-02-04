
// import fs from 'fs/promises';

// let budget_text = await fs.readFile('./budget-2024-02-02.json');
// let budget_data = JSON.parse(budget_text);
// console.log(JSON.stringify(budget_data.accounts.budget.transactions, null, 4));

import Service from './backend/service.mjs';
import UserManager from './backend/user.mjs';
import Budget from './backend/budget.mjs';
import { auth } from 'neo4j-driver'
import Transaction from './backend/transaction.mjs';

const service = new Service('neo4j://localhost', 'neo4j', auth.basic('neo4j', 'I love my daughter.'));
await service.configured();
const userManager = new UserManager(service);

async function shutdown() {
    console.log('\nShutting down...');
    await service.close();
    process.exit();
}

process.on('SIGTERM', shutdown);
process.on('SIGBREAK', shutdown);
process.on('SIGINT', shutdown);

let user = await userManager.get('michael@anderson-clan.org');
const budget = new Budget(service, user, 'Family Budget');

await budget.loaded();
let periods = await budget.getPeriodDates('2024-05-04');
console.log(periods);
// let account = await budget.getAccount('Family Checking');
// let transaction = await account.createTransaction('2024-02-05', -23.14, 'Personal', 'Mad Money--Kari', null, null, false, false, false, '');
// console.log(transaction.__data);

await shutdown();