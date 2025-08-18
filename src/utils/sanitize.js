function redactDbUrl(url) {
  if (typeof url !== 'string') return url;
  try {
    const u = new URL(url);
    if (u.password) u.password = '******';
    if(u.username) u.username = '******';
    return u.toString();
  } catch {
    return '***';
  }
}

function stripSecrets(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const copy = JSON.parse(JSON.stringify(obj));
  if (copy.databaseUrl) copy.databaseUrl = redactDbUrl(copy.databaseUrl);
  return copy;
}

module.exports = { redactDbUrl, stripSecrets };
