/** @typedef {import('neo4j-driver').Session} Session */
/** @typedef {import('neo4j-driver').Result} Result */
/** @typedef {import('neo4j-driver').RecordShape} RecordShape */
/** @typedef {import('neo4j-driver').QueryResult} QueryResult */
/** @typedef {string | {text: string, parameters: Object.<string, any>}} Query */

class NObject {
    /**
     * 
     * @param {Session} session 
     */
    constructor(session) {
        this.__session = session;
    }

    get session() {
        return this.__session;
    }

    async close() {
        return await this.__session.close();
    }
}

export default NObject;