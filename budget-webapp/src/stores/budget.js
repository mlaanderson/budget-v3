import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import BudgetClient from './budgetSocket';

export const useBudgetStore = defineStore('budget', () => {
    const client = new BudgetClient();

    const count = ref(0)
    const doubleCount = computed(() => count.value * 2)
    function increment() {
        count.value++
    }

    async function loggedIn() {
        return await client.isLoggedIn();
    }

    async function login(username, password) {
        return await client.login(username, password);
    }

    return { count, doubleCount, increment, loggedIn, login }
});
