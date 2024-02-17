<script>
import { useBudgetStore } from "@/stores/budget";

export default {
    setup() {
        const store = useBudgetStore();

        return { store }
    },

    data() {
        return {
            logged_in: false
        }
    },

    methods: {
        async login(username, password) {
            let user = await this.store.login(username, password);
            this.logged_in = !!user;
        }
    },

    created() {
        this.store.loggedIn().then(logged_in => this.logged_in = logged_in);
    }
}
</script>

<template>
    <div>{{logged_in}}</div>
    <div><button @click="login('michael@anderson-clan.org', 'kari55rene')">Login</button></div>
</template>

<style scoped>

</style>
