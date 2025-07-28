require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Rutas
const tablesRoutes = require('./routes/tables.route');
const dataRoutes = require('./routes/data.route');
const queryRoutes = require('./routes/query.route');
const keysRoutes = require('./routes/keys.route');
const connectionRoutes = require('./routes/connection.route');

app.use('/tables', tablesRoutes);
app.use('/data', dataRoutes);
app.use('/query', queryRoutes);
app.use('/keys', keysRoutes);
app.use('/connection', connectionRoutes);

const errorHandler = require('./middlewares/errorHandler');
app.use(errorHandler);

module.exports = app;
