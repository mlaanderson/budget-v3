
/** @typedef {{ id: string, method?: string, error?: boolean, arguments: Array<any> }} TransactionMessage */
/** @typedef {{resolve: (...args: Array<any>) => void, reject: (...args: Array<any>) => void}} ResponseHandler */
/** @typedef {{event: string, resolve: (...args: Array<any>) => void, reject: (...args: Array<any>) => void}} EventHandler */

class BudgetClient {
    constructor() {
        /** @type {Object.<string, ResponseHandler>} */
        this.__response_waiters = {};

        /** @type {Object.<string, EventHandler>} */
        this.__event_listeners = {};

        this.__initialize();
    }

    async __initialize() {
        if (process.env.NODE_ENV == "development") {
            this.__socket = new WebSocket('ws://localhost:8080');
        } else {
            this.__socket = new WebSocket(`${location.protocol === 'https' ? 'wss' : 'ws'}://${location.host}`);
        }

        this.__socket.addEventListener('close', this.__handleClose.bind(this));
        this.__socket.addEventListener('error', this.__handleError.bind(this));
        this.__socket.addEventListener('message', this.__handleMessage.bind(this));
        this.__socket.addEventListener('open', this.__handleOpen.bind(this));

        this.__logged_in = await this.isLoggedIn();
    }

    /**
     * 
     * @param {CloseEvent} event 
     */
    __handleClose(event) {
        if (!event.wasClean) {
            // start back up after a small delay
            setTimeout(() => {
                this.__initialize();
            }, 100);
        }
    }

    /**
     * 
     * @param {ErrorEvent} event 
     */
    __handleError(event) {
        console.error(event.error);
    }

    /**
     * 
     * @param {Event} event 
     */
    __handleOpen(event) {
        console.log('WebSocket connection is open')
    }

    /**
     * 
     * @param {MessageEvent} event 
     */
    __handleMessage(event) {
        try {
            /** @type {TransactionMessage} */
            let incoming = JSON.parse(event.data);
            if (!!incoming.id && (incoming.id in this.__response_waiters)) {
                // pass the message to the waiting event
                // console.log('RX:', incoming);
                if (incoming.error) {
                    this.__response_waiters[incoming.id].reject(...incoming.arguments);
                } else {
                    this.__response_waiters[incoming.id].resolve(...incoming.arguments);
                }
                delete this.__response_waiters[incoming.id];
            } else if (!!incoming.id && (incoming.id in this.__event_listeners)) {
                if (incoming.error) {
                    this.__event_listeners[incoming.id].reject(...incoming.arguments);
                } else {
                    this.__event_listeners[incoming.id].resolve(...incoming.arguments);
                }
            } else {
                console.warn('Invalid or unregistered data received:', incoming);
            }
        } catch (err) {
            console.error('Invalid message:', event.data, err);
        }
    }

    /**
     * 
     * @param {string} id 
     * @param {string} method 
     * @param  {...any} args 
     */
    __send(id, method, args) {
        // console.log('TX:', {id, method, arguments: args});
        this.__socket.send(JSON.stringify({
            id, method, arguments: args
        }));
    }

    /**
     * 
     * @param {string} method 
     * @param  {...any} args 
     * @returns {Promise<Array>}
     */
    __call(method, ...args) {
        return new Promise((resolve, reject) => {
            let id = crypto.randomUUID();
            this.__response_waiters[id] = { resolve, reject };
            this.__send(id, method, args);
        });
    }

    /**
     * Add an event listener
     * @param {string} event 
     * @param {(...args: Array) => void} listener 
     * @param {...any} args
     */
    on(event, listener, ...args) {
        let id = crypto.randomUUID();
        this.__event_listeners[id] = { event: event, resolve: listener, reject: () => {} };
        this.__send(id, `ON_${event}`, args);
    }

    /**
     * Removes all event listeners with the same event name and optionally the same listener
     * @param {string} event 
     * @param {(...args: Array) => void} listener 
     */
    off(event, listener) {
        // find the ids
        /** @type {Array<string>} */
        let ids;
        if (listener) {
            ids = Object.values(this.__event_listeners)
                .filter(handler => (handler.event === event) && (handler.listener === listener))
                .map(handler => {
                    for (let id in this.__event_listeners) {
                        if (this.__event_listeners[id] === handler) {
                            return id;
                        }
                    }
                });
        } else {
            ids = Object.values(this.__event_listeners)
                .filter(handler => (handler.event === event))
                .map(handler => {
                    for (let id in this.__event_listeners) {
                        if (this.__event_listeners[id] === handler) {
                            return id;
                        }
                    }
                });
        }
        for (let id of ids) {
            this.__send(id, `OFF_${this.__event_listeners[id].event}`);
            delete this.__event_listeners[id];
        }
    }

    /**
     * Listens for an event to fire once
     * @param {string} event 
     * @param {(...args: Array) => void} listener 
     * @param  {...any} args 
     */
    once(event, listener, ...args) {
        let internal_listener = (...args) => {
            listener(...args);
            this.off(event, internal_listener);
        }
        this.on(event, listener, ...args);
    }

    /**
     * Verifies if the user is logged in
     * @returns {Promise<boolean>}
     */
    async isLoggedIn() {
        try {
            let result = await this.__call('IS_LOGGED_IN');
            return !!result;
        } catch {
            return false;
        }
    }

    /**
     * Logs the user in
     * @param {string} username 
     * @param {string} password 
     */
    async login(username, password) {
        try {
            let result = await this.__call('LOGIN', username, password);
            this.__logged_in = !!result;
            return result;
        } catch {
            return null;
        }
    }
}

export default BudgetClient;