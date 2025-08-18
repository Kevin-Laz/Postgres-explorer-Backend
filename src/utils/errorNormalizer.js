const { AppError } = require('../errors');
const { stripSecrets } = require('./sanitize');

// ———————————————————————————————————————————————————————————
// Mapeo semántico para SQLSTATE de Postgres
// ———————————————————————————————————————————————————————————
const PG_CODE_MAP = {
  '23505': { code: 'unique_violation',        hint: 'El valor ya existe para una restricción UNIQUE.' },
  '23503': { code: 'foreign_key_violation',   hint: 'No existe el registro referenciado o viola la relación.' },
  '23502': { code: 'not_null_violation',      hint: 'Proporcione un valor distinto de NULL para la columna indicada.' },
  '23514': { code: 'check_violation',         hint: 'El valor no cumple la restricción CHECK.' },
  '22P02': { code: 'invalid_text_representation', hint: 'Tipo/representación de dato inválida. Convierta/castee el valor.' },
  '42703': { code: 'undefined_column',        hint: 'La columna no existe. Revise el nombre o sincronice el esquema.' },
  '42P01': { code: 'undefined_table',         hint: 'La tabla no existe. Revise el nombre o cree la tabla previamente.' },
  '42P07': { code: 'duplicate_table',         hint: 'La tabla ya existe.' },
  '42701': { code: 'duplicate_column',        hint: 'La columna ya existe en la tabla.' },
  '42830': { code: 'invalid_foreign_key',     hint: 'La FK no es válida (tipos incompatibles o columna destino inválida).' },
  '42804': { code: 'datatype_mismatch',       hint: 'Tipos incompatibles entre columnas o conversión. Alinee tipos o use CAST/USING.' },
  '40P01': { code: 'deadlock_detected',       hint: 'Se detectó interbloqueo. Reintente la operación.' },
};

// ———————————————————————————————————————————————————————————
// Mapeo semántico para errores Prisma (P20xx)
// ———————————————————————————————————————————————————————————
const PRISMA_CODE_MAP = {
  'P2002': { code: 'unique_violation',       hint: 'El valor ya existe para una restricción UNIQUE.' },
  'P2003': { code: 'foreign_key_violation',  hint: 'Fallo de restricción de clave foránea.' },
  'P2011': { code: 'not_null_violation',     hint: 'Fallo de restricción NOT NULL.' },
  'P2025': { code: 'not_found',              hint: 'El registro no existe para la condición dada.' },
  'P2004': { code: 'check_violation',        hint: 'Fallo de restricción CHECK.' },
  'P2010': { code: 'raw_query_failed',       hint: 'Fallo en consulta raw. Ver código SQLSTATE en meta.code.' },
};

function basePayload({ code = 'internal_error', message = 'Error interno del servidor', status = 500, hint = null, target = null, details = null, requestId = null }) {
  return {
    status,
    body: {
      error: true,
      code,
      message,
      hint,
      target,
      details,
      requestId
    }
  };
}

function isSqlState(s) {
  return typeof s === 'string' && /^[0-9A-Z]{5}$/.test(s);
}

// ———————————————————————————————————————————————————————————
// Extrae un target (tabla/columna/constraint) si viene del driver o prisma
// ———————————————————————————————————————————————————————————
function extractTarget(err) {
  const target = {};
  if (err?.table) target.table = err.table;
  if (err?.column) target.column = err.column;
  if (err?.constraint) target.constraint = err.constraint;

  // Prisma meta
  if (err?.meta?.target) target.constraint = err.meta.target;
  if (err?.meta?.field_name) target.column = err.meta.field_name;
  if (err?.meta?.modelName) target.table = err.meta.modelName;

  // Intento por texto (constraint "xxxxx")
  if (!target.constraint && typeof (err?.message || err?.detail) === 'string') {
    const name = parseConstraintFromMessage(err.message || err.detail);
    if (name) target.constraint = name;
  }

  return Object.keys(target).length ? target : null;
}

/** Busca constraint "name" en el mensaje */
function parseConstraintFromMessage(msg = '') {
  const m = msg.match(/constraint\s+"([^"]+)"/i);
  return m ? m[1] : null;
}

/** Extrae tipos incompatibles "uuid and integer" → { left:'uuid', right:'integer' } */
function parseTypesMismatch(msg = '') {
  const m = msg.match(/incompatible types:\s*([a-zA-Z0-9_\s]+)\s+and\s+([a-zA-Z0-9_\s]+)/i);
  if (!m) return null;
  return { left: m[1].trim(), right: m[2].trim() };
}

/** ───────────────────────────────────────────────────────────────
 *  NORMALIZADORES
 *  ───────────────────────────────────────────────────────────── */
function normalizeFromAppError(err, requestId) {
  const mapByClass = {
    ValidationError:   { code: 'validation_error', status: 400 },
    DatabaseError:     { code: 'database_error',   status: 500 },
    NotFoundError:     { code: 'not_found',        status: 404 },
    UnauthorizedError: { code: 'unauthorized',     status: 401 },
    BadRequestError:   { code: 'bad_request',      status: 400 },
    AppError:          { code: 'app_error',        status: err.statusCode || 500 },
  };
  const meta = mapByClass[err.name] || mapByClass.AppError;

  return basePayload({
    code: err.code || meta.code,
    message: err.message || 'Error',
    status: err.statusCode || meta.status,
    hint: err.hint || null,
    target: err.target || null,
    details: err.details || null,
    requestId
  });
}

function normalizeFromPostgres(err, requestId) {
  const map = PG_CODE_MAP[err.code] || {};
  const message = err.detail || err.message || 'Error de base de datos';
  const target = extractTarget(err);

  const details = {
    schema: err.schema || undefined,
    table: err.table || undefined,
    column: err.column || undefined,
    constraint: err.constraint || undefined
  };

  // enriquecer con tipos si están en el texto
  const mismatch = parseTypesMismatch(err.detail || err.message || '');
  if (mismatch) details.mismatch = mismatch;

  return basePayload({
    code: map.code || 'database_error',
    message,
    status: 400,
    hint: map.hint || null,
    target,
    details,
    requestId
  });
}

function normalizeFromPrisma(err, requestId) {
  // Caso especial: P2010 (raw query failed) → transportar SQLSTATE si viene en meta.code
  if (err?.code === 'P2010' && isSqlState(err?.meta?.code)) {
    // Construimos un "pseudo error" PG para reutilizar el normalizador PG
    const pseudoPg = {
      code: err.meta.code,
      message: err.meta.message || err.message,
      detail: err.meta.message || undefined,
      // intentar extraer constraint y tipos del texto
      constraint: parseConstraintFromMessage(err.meta.message || err.message || undefined),
    };
    const out = normalizeFromPostgres(pseudoPg, requestId);
    // agrega meta original saneada
    out.body.details = {
      ...(out.body.details || {}),
      prisma: stripSecrets(err.meta) || undefined
    };
    return out;
  }

  // Resto de códigos Prisma
  const m = PRISMA_CODE_MAP[err.code] || {};
  return basePayload({
    code: m.code || 'database_error',
    message: err.message || 'Error de base de datos',
    status: 400,
    hint: m.hint || null,
    target: extractTarget(err),
    details: stripSecrets(err.meta) || null,
    requestId
  });
}

function normalizeUnknown(err, requestId) {
  return basePayload({
    code: 'internal_error',
    message: err?.message || 'Error interno del servidor',
    status: 500,
    hint: null,
    target: null,
    details: null,
    requestId
  });
}

// Punto único usado por errorHandler
function normalizeError(err, requestId) {
  // 1) Errores propios
  if (err instanceof AppError) return normalizeFromAppError(err, requestId);

  // 2) Prisma KnownRequestError (Pxxxx)
  if (err?.code && /^P\d{4}$/.test(err.code)) return normalizeFromPrisma(err, requestId);

  // 3) Postgres (SQLSTATE)
  if (err?.code && /^[0-9A-Z]{5}$/.test(err.code)) return normalizeFromPostgres(err, requestId);

  // 4) Cualquier otro
  return normalizeUnknown(err, requestId);
}

module.exports = { normalizeError };
