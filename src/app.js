const { Redis } = require('@upstash/redis');
require('dotenv').config();
const express = require('express');
const { idempotencyUpstash } = require('./middlewares/idempotencyUpstash');
const requestContext = require('./middlewares/requestContext');
const errorHandler = require('./middlewares/errorHandler');
const cors = require('cors');
const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(requestContext);

// Upstash Redis
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Idempotencia: Solo en rutas mutantes
app.use(['/schema/commands', '/tables', '/keys', '/data'], idempotencyUpstash(redis, {
  ttlMs: 10 * 60 * 1000,  // 10 min
  waitMs: 1500,           // breve espera si hay otro request ejecutando
  pollEveryMs: 120
}));

// Rutas
const tablesRoutes = require('./routes/tables.route');
const dataRoutes = require('./routes/data.route');
const queryRoutes = require('./routes/query.route');
const keysRoutes = require('./routes/keys.route');
const connectionRoutes = require('./routes/connection.route');
const schemaRoutes = require('./routes/schema.route');


app.use('/tables', tablesRoutes);
app.use('/data', dataRoutes);
app.use('/query', queryRoutes);
app.use('/keys', keysRoutes);
app.use('/connection', connectionRoutes);
app.use('/schema', schemaRoutes);

app.use(errorHandler);

module.exports = app;
