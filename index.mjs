
// import fs from 'fs/promises';

// let budget_text = await fs.readFile('./budget-2024-02-02.json');
// let budget_data = JSON.parse(budget_text);
// console.log(JSON.stringify(budget_data.accounts.budget.transactions, null, 4));

import Service from './backend/service.mjs';
import UserManager from './backend/user.mjs';
import Budget from './backend/budget.mjs';
import { auth } from 'neo4j-driver'

const service = new Service('neo4j://localhost', 'neo4j', auth.basic('neo4j', 'I love my daughter.'));
await service.config();
const userManager = new UserManager(service.use());
// const budget = new Budget(service.use());

async function shutdown() {
    console.log('\nShutting down...');
    await service.close();
    process.exit();
}

process.on('SIGTERM', shutdown);
process.on('SIGBREAK', shutdown);
process.on('SIGINT', shutdown);

let user = await userManager.get('michael@anderson-clan.org');
// let budget = new Budget(service.use(), user, 'Family Budget');
// await budget.loaded();

let budgets = await userManager.getBudgetNames(user.email);

console.log(budgets);

await shutdown();