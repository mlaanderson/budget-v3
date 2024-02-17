import { WebSocketServer, WebSocket } from "ws";
import UserManager from "../backend/user.mjs";

/** @typedef {{ id: string, method?: string, error?: boolean, arguments: Array<any> }} TransactionMessage */
/** @typedef {import ('../lib/types.mjs').UserData} UserData */


class BudgetClient {
    /**
     * 
     * @param {BudgetService} server 
     * @param {WebSocket} socket 
     */
    constructor(server, socket) {
        /** @type {BudgetService} */
        this.__server = server;
        
        /** @type {WebSocket} */
        this.__socket = socket;

        /** @type {UserData} */
        this.__user = null;

        /** @type {UserManager} */
        this.__user_manager = new UserManager(this.__server.__service);

        this.__socket.addEventListener('message', this.__handleMessage.bind(this));

        /** @type {Object.<string, (...args: Array) => any} */
        this.__registered_methods = {
            IS_LOGGED_IN: () => this.__user !== null,
            LOGIN: this.login.bind(this)
        }
    }

    /**
     * Base message sending
     * @param {string} id 
     * @param {string} method 
     * @param  {...any} args 
     */
    __send(id, method, error=false, ...args) {
        // console.log('TX:', {
        //     id, method, error, arguments: args
        // })
        this.__socket.send(JSON.stringify({
            id, method, error, arguments: args
        }));
    }

    /**
     * 
     * @param {MessageEvent} event 
     */
    async __handleMessage(event) {
        try {
            /** @type {TransactionMessage} */
            let incoming = JSON.parse(event.data);
            // console.log('RX:', incoming);
            if (!!incoming.id && !!incoming.method) {
                if (incoming.method.startsWith('ON_')) {
                    // handle event bind
                } else if (incoming.method.startsWith('OFF_')) {
                    // handle event unbind
                } else {
                    if (incoming.method in this.__registered_methods) {
                        try {
                            let result = await this.__registered_methods[incoming.method](...incoming.arguments);
                            this.__send(incoming.id, incoming.method, false, result);
                        } catch (err) {
                            console.error(`Error calling ${incoming.method}: ${err}`)
                        }
                    } else {
                        console.error('Unregistered method:', incoming.method);
                        this.__send(incoming.id, incoming.method, true, `Unregistered method: ${incoming.method}`);
                    }
                }
            } else {
                console.error('Invalid message:', event.data);
            }
        } catch {
            console.error('Invalid message:', event.data);
        }
    }

    async login(username, password) {
        this.__user = await this.__user_manager.login(username, password);
        return this.__user;
    }
}

class BudgetService {
    constructor() {
        /** @type {WebSocketServer} */
        this.__wsServer = new WebSocketServer({ noServer: true });
        
        /** @type {Array<BudgetClient>} */
        this.__sockets = [];

        /** @type {import ('../backend/service.mjs').Service} */
        this.__service = null;
    }

    /**
     * 
     * @param {import ('http').IncomingMessage} request 
     * @param {import ('stream').Duplex} socket 
     * @param {Buffer} upgradeHead 
     */
    handleUpgrade(request, socket, upgradeHead) {
        console.log('UPGRADE');
        this.__wsServer.handleUpgrade(request, socket, upgradeHead, (ws) => {
            this.__sockets.push(new BudgetClient(this, ws));
            this.__wsServer.emit('connection', ws, request);
        });
    }
}

const wsServer = new BudgetService();


/**
 *
 * @param {import ('../backend/service.mjs').Service} service
 * @param {import ('http').Server} server 
 */
export default function WebSockets(service, server) {
    wsServer.__service = service;
    server.on('upgrade', (req, socket, head) => {
        wsServer.handleUpgrade(req, socket, head);
    });
}