/** @typedef {import('./service.mjs').Service} Service */
/** @typedef {import('neo4j-driver').Session} Session */
/** @typedef {import('neo4j-driver').Result} Result */
/** @typedef {import('neo4j-driver').RecordShape} RecordShape */
/** @typedef {import('neo4j-driver').QueryResult} QueryResult */
/** @typedef {string | {text: string, parameters: Object.<string, any>}} Query */

class NObject {
    /**
     * 
     * @param {Service} service 
     * @param {Array<any>} args
     */
    constructor(service, ...args) {
        this.__service = service;
        this.__session = service.use();

        this.__loaded = false;
        /** @type {Array<() => void>} */
        this.__loader = [];
        this.load(...args);
    }

    /**
     * @protected
     */
    async load() { 
        this.__loaded = true;
        this.__loader.forEach(loader => loader(this.__loaded));
    }

    loaded() {
        if (this.__loaded) {
            return Promise.resolve(this.__loaded);
        }
        return new Promise(resolve => {
            this.__loader.push(resolve);
        });
    }

    /**
     * Attempts to load with the loadQuery, failing that creates a record and returns it
     * @param {string} loadQuery 
     * @param {string} createQuery 
     * @param {string} key 
     * @param {Object.<string, any>} parameters 
     * @returns {Promise<Object.<string, any>}
     */
    async loadOrCreateSingle(loadQuery, createQuery, key, parameters) {
        let query = await this.session.run(loadQuery, parameters);
        if (query.records.length > 0) {
            return query.records[0].get(key).properties;
        }
        try {
            query = await this.session.run(createQuery, parameters);
            if (query.records.length > 0) {
                return query.records[0].get(key).properties;
            }
        } catch (error) {
            if ((error instanceof Neo4jError) && (error.code === 'Neo.ClientError.Schema.ConstraintValidationFailed')) {
                return null;
            } else {
                throw error;
            }
        }
        return null;
    }

    get session() {
        return this.__session;
    }

    get service() {
        return this.__service;
    }

    async close() {
        return await this.__service.free(this.__session);
    }
}

export default NObject;