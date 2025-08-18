const { randomUUID } = require('crypto');

module.exports = function requestContext(req, res, next) {
  const reqId = req.headers['x-request-id'] || randomUUID();
  req.requestId = String(reqId);
  res.setHeader('x-request-id', req.requestId);
  next();
};
