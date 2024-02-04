/** @typedef {import ('neo4j-driver').Session} Session */
/** @typedef {import ('./service.mjs').Service} Service */
/** @typedef {import ('../lib/types.mjs').UserData} UserData */
import NObject from "./nobject.mjs";
import { HashPassword } from "../lib/secure.mjs";
import { Neo4jError } from "neo4j-driver";

const CREATE_USER = `
CREATE (user:User {
    name: $name,
    email: $email,
    password: $password
})
RETURN user
`;

const VALIDATE_USER = `
MATCH (user:User {
    email: $email,
    password: $password
})
RETURN user
`;

const GET_USER = `
MATCH (user:User {
    email: $email
})
RETURN user
`;

const GET_OWNED_BUDGETS = `
MATCH (budget:Budget)-[:OWNER]->(user:User)
WHERE
    user.email = $email
RETURN budget
`;

class UserManager extends NObject {
    /**
     * 
     * @param {Service} service 
     */
    constructor(service) {
        super(service);
    }

    /**
     * Creates a new user
     * @param {string} email 
     * @param {string} password 
     * @param {string} name 
     * @returns {Promise<UserData | null>}
     */
    async create(email, password, name) {
        if (/^[a-f0-9]{64}$/.test(password) === false) {
            // hash the clear text
            password = HashPassword(password);
        }
        try {
            let query_result = await this.session.run(CREATE_USER, { email, password, name });
            if (query_result.records.length === 1) {
                /** @type {UserData} */
                let result = query_result.records[0].get('user').properties;
                delete result.password;
                return result;
            }
        } catch (error) {
            // if the user already exists, return null
            if ((error instanceof Neo4jError) && (error.code === 'Neo.ClientError.Schema.ConstraintValidationFailed')) {
                return null;
            }
            throw error;
        }
        return null;
    }

    /**
     * Gets a user whose email and password match the passed parameters or null
     * @param {string} email 
     * @param {string} password 
     * @returns {Promise<UserData | null>}
     */
    async login(email, password) {
        if (/^[a-f0-9]{64}$/.test(password) === false) {
            // hash the clear text
            password = HashPassword(password);
        }
        let query_result = await this.session.run(VALIDATE_USER, { email, password });
        if (query_result.records.length === 1) {
            /** @type {UserData} */
            let result = query_result.records[0].get('user').properties;
            delete result.password;
            return result;
        }
        return null;
    }

    
    /**
     * Gets a user by email or null
     * @param {string} email 
     * @returns {Promise<UserData | null>}
     */
    async get(email) {
        let query_result = await this.session.run(GET_USER, { email });
        if (query_result.records.length === 1) {
            /** @type {UserData} */
            let result = query_result.records[0].get('user').properties;
            delete result.password;
            return result;
        }
        return null;
    }

    /**
     * Gets a list of budgets owned by this user
     * @param {string} email 
     * @returns {Promise<Array<string>>}
     */
    async getBudgetNames(email) {
        let query_result = await this.session.run(GET_OWNED_BUDGETS, { email });

        return query_result.records.map(rec => rec.get('budget').properties.name);
    }
}

export default UserManager;