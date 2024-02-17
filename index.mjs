import http from 'http';
import express from 'express';
import https from 'https';
import morgan from 'morgan';
import bodyParser from 'body-parser';
import session from 'express-session';
import connectSqlite3 from 'connect-sqlite3';

import Service from './backend/service.mjs';
import { auth } from 'neo4j-driver'
import WebSockets from './websockets/index.mjs';

const DEBUG = true;
const service = new Service('neo4j://localhost', 'neo4j', auth.basic('neo4j', 'I love my daughter.'));
await service.configured();

async function shutdown() {
    console.log('\nShutting down...');
    await service.close();
    process.exit();
}

process.on('SIGTERM', shutdown);
process.on('SIGBREAK', shutdown);
process.on('SIGINT', shutdown);

const app = express();

// Common logging
app.use(morgan('common'));

// body parser middle ware with json decoding
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// allow cross origin in debug
if (DEBUG) {
    app.use((req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
        res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:5173');
        res.setHeader('Access-Control-Allow-Headers', 'Connection,Content-Length,Content-Encoding,Content-Type,Cookie,Date,Etag,Keep-Alive,Set-Cookie,X-Powered-By');
        next();
    });
}

// setup the session
const SqliteStore = connectSqlite3(session);
app.use(session({
    store: new SqliteStore({
        table: 'sessions',
        db: 'sessions.sqlite',
        dir: '.',
        concurrentDB: false
    }),
    secret: 'fat orange cat',
    resave: true,
    saveUninitialized: false
}));

// serve static files
app.use('/', express.static('budget-webapp/dist'));



// start the server
WebSockets(service, http.createServer(app).listen(8080, () => {
    console.log('Server listening on 8080');
}));