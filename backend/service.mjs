/**
 * @typedef {import('neo4j-driver').AuthToken} AuthToken
 * @typedef {import('neo4j-driver').AuthTokenManager} AuthTokenManager
 * @typedef {import('neo4j-driver').Config} Config
 * @typedef {import('neo4j-driver').Driver} Driver
 */

import neo4j, { Session, session } from 'neo4j-driver';
const MIN_POOL_SIZE = 10;
const MAX_POOL_SIZE = 100;

/**
 * 
 * @param {Service} service 
 * @param {Session} session 
 */
function SessionPoolProxy(service, session) {
    return new Proxy(session, {
        apply(target, thisArg, args) {
            if (target.name === 'close') {
                console.log('closing session');
                // free up this session
                service.free(this);
                // keep the function signature
                return Promise.resolve();
            } else if (target.name === 'kill') {
                return session.close();
            } else {
                return target(...args).bind(thisArg);
            }
        },
        get(target, property) {
            if (property === 'kill') {
                return session.close;
            }
            return target[property];
        }
    });
}

const CONFIGURATIONS = [
    `CREATE CONSTRAINT username IF NOT EXISTS FOR (user:User) REQUIRE (user.email) IS UNIQUE`,
    `CREATE CONSTRAINT budgetname IF NOT EXISTS FOR (budget:Budget) REQUIRE (budget.owner, budget.name) IS UNIQUE`,
]

/**
 * @typedef {{use: () => Session}} Service
 */
class Service {
    /**
     * 
     * @param {string} url 
     * @param {string} database
     * @param {AuthToken | AuthTokenManager | undefined} authToken 
     * @param {Config | undefined} config 
     */
    constructor(url, database, authToken, config) {
        /** @type {Driver} */
        this.__driver = neo4j.driver(url, authToken, config);
        /** @type {string} */
        this.__database = database;

        /** @type {Array<Session>} */
        this.__pool = [];
        /** @type {Array<Session>} */
        this.__inuse = [];

        // prepopulate the pool with 10
        for (let n = 0; n < MIN_POOL_SIZE; n++) {
            let session = new SessionPoolProxy(this, this.__driver.session({ database }));
            this.__pool.push(session);
        }

        // do the basic server configuration
        this.__configured = false;
        /** @type {Array<() => void} */
        this.__loader = [];
        this.__config()
    }

    async __config() {
        try {
            let session = this.use();
            for (let configuration of CONFIGURATIONS) {
                await session.run(configuration);
            }
            this.__configured = true;
            this.__loader.forEach(loader => loader(this.__configured));
        } catch (error) {
            console.error(error);
            this.__loader.forEach(loader => loader(false));
        }
    }

    /**
     * 
     * @returns {Promise<boolean>}
     */
    configured() {
        if (this.__configured) return Promise.resolve(true);
        return new Promise(resolve => {
            this.__loader.push(resolve);
        })
    }

    /**
     * Moves an item from 
     * @param {Session} item 
     */
    free(item) {
        let idx = this.__inuse.indexOf(item);
        if (idx >= 0) {
            this.__inuse.splice(idx, 1);
            this.__pool.push(item);
        }

        // remove any excess
        let removed = this.__pool.splice(MIN_POOL_SIZE);
        removed.forEach(session => session.kill());
    }

    /**
     * @returns {Session}
     */
    use() {
        if ((this.__pool.length > 0) && (this.__inuse.length < MAX_POOL_SIZE)) {
            let session = this.__pool.pop();
            this.__inuse.push(session);
            return session;
        } else if (this.__inuse.length < MAX_POOL_SIZE) {
            let session = SessionPoolProxy(this, this.__driver.session({ database: this.__database }));
            this.__inuse.push(session);
            return session;
        }
        throw Error('Reached maximum pool size');
    }

    async close() {
        for (let session of this.__pool) {
            await session.close();
        }
        for (let session of this.__inuse) {
            await session.close();
        }
        this.__pool.splice(0);
        this.__inuse.splice(0);

        await this.__driver.close();
    }
}

export default Service;