const { AppError } = require('../errors');
const { stripSecrets } = require('./sanitize');

// ———————————————————————————————————————————————————————————
// Mapeo semántico para SQLSTATE de Postgres
// ———————————————————————————————————————————————————————————
const PG_CODE_MAP = {
  '23505': { code: 'unique_violation', hint: 'El valor ya existe para una restricción UNIQUE.' },
  '23503': { code: 'foreign_key_violation', hint: 'No existe el registro referenciado o viola la relación.' },
  '23502': { code: 'not_null_violation', hint: 'Proporcione un valor distinto de NULL para la columna indicada.' },
  '23514': { code: 'check_violation', hint: 'El valor no cumple la restricción CHECK.' },
  '22P02': { code: 'invalid_text_representation', hint: 'Tipo/representación de dato inválida. Convierta/castee el valor.' },
  '42703': { code: 'undefined_column', hint: 'La columna no existe. Revise el nombre o sincronice el esquema.' },
  '42P01': { code: 'undefined_table', hint: 'La tabla no existe. Revise el nombre o cree la tabla previamente.' },
  '42P07': { code: 'duplicate_table', hint: 'La tabla ya existe.' },
  '42701': { code: 'duplicate_column', hint: 'La columna ya existe en la tabla.' },
  '42830': { code: 'invalid_foreign_key', hint: 'La FK no es válida (tipos incompatibles o columna destino inválida).' },
  '40P01': { code: 'deadlock_detected', hint: 'Se detectó interbloqueo. Reintente la operación.' },
};

// ———————————————————————————————————————————————————————————
// Mapeo semántico para errores Prisma (P20xx)
// ———————————————————————————————————————————————————————————
const PRISMA_CODE_MAP = {
  'P2002': { code: 'unique_violation', hint: 'El valor ya existe para una restricción UNIQUE.' },
  'P2003': { code: 'foreign_key_violation', hint: 'Fallo de restricción de clave foránea.' },
  'P2011': { code: 'not_null_violation', hint: 'Fallo de restricción NOT NULL.' },
  'P2025': { code: 'not_found',           hint: 'El registro no existe para la condición dada.' },
  'P2004': { code: 'check_violation',     hint: 'Fallo de restricción CHECK.' },
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

  return Object.keys(target).length ? target : null;
}

function normalizeFromAppError(err, requestId) {
  const mapByClass = {
    ValidationError: { code: 'validation_error', status: 400 },
    DatabaseError:   { code: 'database_error',   status: 500 },
    NotFoundError:   { code: 'not_found',        status: 404 },
    UnauthorizedError: { code: 'unauthorized',   status: 401 },
    BadRequestError: { code: 'bad_request',      status: 400 },
    AppError:        { code: 'app_error',        status: err.statusCode || 500 },
  };
  const meta = mapByClass[err.name] || mapByClass.AppError;
  // campos opcionales en errores personalizados
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

function normalizeFromPrisma(err, requestId) {
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

function normalizeFromPostgres(err, requestId) {
  const m = PG_CODE_MAP[err.code] || {};
  const message = err.detail || err.message || 'Error de base de datos';
  // intenta enriquecer con columna si hay "null value in column ..." etc.
  const target = extractTarget(err);
  return basePayload({
    code: m.code || 'database_error',
    message,
    status: 400,
    hint: m.hint || null,
    target,
    details: {
      schema: err.schema || undefined,
      table: err.table || undefined,
      column: err.column || undefined,
      constraint: err.constraint || undefined
    },
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

/**
 * Función que maneja la normalización usado por el errorHandler
 */
function normalizeError(err, requestId) {
  // 1) Errores propios (AppError y derivados)
  if (err instanceof AppError) {
    return normalizeFromAppError(err, requestId);
  }

  // 2) Prisma KnownRequestError
  //   err.code = 'P2002' | ...  y err.meta con detalles
  if (err?.code && /^P\d{4}$/.test(err.code)) {
    return normalizeFromPrisma(err, requestId);
  }

  // 3) Postgres (SQLSTATE)
  //   err.code = '23505' | ...; err.table/column/constraint
  if (err?.code && /^[0-9A-Z]{5}$/.test(err.code)) {
    return normalizeFromPostgres(err, requestId);
  }

  // 4) Cualquier otro
  return normalizeUnknown(err, requestId);
}

module.exports = { normalizeError };
