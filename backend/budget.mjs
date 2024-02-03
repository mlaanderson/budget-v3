/** @typedef {import './nobject.mjs'.Session} Session */
/** @typedef {import ('../lib/types.mjs').UserData} UserData */

import NObject from "./nobject.mjs";
import { Neo4jError } from "neo4j-driver";

const CREATE_BUDGET = `
MATCH (user:User) WHERE user.email = $email
CREATE (budget:Budget {
    name: $name,
    owner: $email,
    theme: $theme,
    period: $period
}), (budget)-[:OWNER]->(user)
RETURN budget
`;

const LOAD_OWNED_BUDGET = `
MATCH (budget:Budget)-[:OWNER]->(user:User) 
WHERE 
    budget.name = $name AND 
    user.email = $email
RETURN budget
`;

class Budget extends NObject {
    /**
     * 
     * @param {Session} session 
     * @param {UserData} user
     * @param {string} name
     * @param {string} theme
     * @param {period} string
     */
    constructor(session, user, name, theme='default', period='2 weeks') {
        super(session);

        this.__user = user;
        this.__loaded = false;
        this.__loader = () => {};
        this.__data = null;

        this.__load(name, theme, period);
    }

    async __load(name, theme, period) {
        let query = await this.session.run(LOAD_OWNED_BUDGET, { email: this.__user.email, name });
        if (query.records.length === 1) {
            this.__data = query.records[0].get('budget').properties;
        } else {
            try {
                query = await this.session.run(CREATE_BUDGET, {
                    email: this.__user.email,
                    name,
                    theme,
                    period
                });
                if (query.records.length === 1) {
                    this.__data = query.records[0].get('budget').properties;
                }
            } catch (error) {
                if ((error instanceof Neo4jError) && (error.code === 'Neo.ClientError.Schema.ConstraintValidationFailed')) {
                    this.__data = null;
                } else {
                    throw error;
                }
            }
        }
        if (this.__data) {
            this.__loaded = true;
        }
        this.__loader(this.__loaded);
    }

    /**
     * 
     * @returns {Promise<boolean>}
     */
    loaded() {
        if (this.__loaded) {
            return Promise.resolve(true);
        } else {
            return new Promise((resolve, reject) => {
                this.__loader = resolve;
            });
        }
    }

}

export default Budget;