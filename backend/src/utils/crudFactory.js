const express = require('express');
const db = require('../config/db');
const ApiError = require('./apiError');
const asyncHandler = require('./asyncHandler');

function parsePagination(query) {
  const limit = Math.min(Math.max(Number(query.limit || 50), 1), 200);
  const page = Math.max(Number(query.page || 1), 1);
  const offset = (page - 1) * limit;

  return { limit, page, offset };
}

function pickAllowedFields(body, allowedColumns) {
  return allowedColumns.filter((column) => Object.prototype.hasOwnProperty.call(body, column));
}

function buildWhere(resource, query) {
  const allowedFilters = [resource.primaryKey, ...resource.columns];
  const clauses = [];
  const values = [];

  for (const [key, value] of Object.entries(query)) {
    if (['page', 'limit', 'orderBy', 'order'].includes(key) || value === undefined || value === '') {
      continue;
    }

    if (!allowedFilters.includes(key)) {
      continue;
    }

    values.push(value);
    clauses.push(`${key} = $${values.length}`);
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    values
  };
}

function buildOrder(resource, query) {
  const allowed = [resource.primaryKey, ...resource.columns];
  const orderBy = allowed.includes(query.orderBy) ? query.orderBy : resource.primaryKey;
  const order = String(query.order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  return `ORDER BY ${orderBy} ${order}`;
}

function createCrudRouter(resource) {
  const router = express.Router();
  const selectColumns = resource.defaultSelect || '*';

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { limit, page, offset } = parsePagination(req.query);
      const { whereSql, values } = buildWhere(resource, req.query);
      const orderSql = buildOrder(resource, req.query);
      const dataParams = [...values, limit, offset];

      const [dataResult, countResult] = await Promise.all([
        db.query(
          `SELECT ${selectColumns} FROM ${resource.table} ${whereSql} ${orderSql} LIMIT $${values.length + 1} OFFSET $${
            values.length + 2
          }`,
          dataParams
        ),
        db.query(`SELECT COUNT(*)::int AS total FROM ${resource.table} ${whereSql}`, values)
      ]);

      res.json({
        ok: true,
        data: dataResult.rows,
        pagination: {
          page,
          limit,
          total: countResult.rows[0].total
        }
      });
    })
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const result = await db.query(
        `SELECT ${selectColumns} FROM ${resource.table} WHERE ${resource.primaryKey} = $1`,
        [req.params.id]
      );

      if (!result.rowCount) {
        throw new ApiError(404, 'Registro no encontrado');
      }

      res.json({ ok: true, data: result.rows[0] });
    })
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const fields = pickAllowedFields(req.body, resource.columns);

      if (!fields.length) {
        throw new ApiError(400, 'No se enviaron campos validos');
      }

      const placeholders = fields.map((_, index) => `$${index + 1}`);
      const values = fields.map((field) => req.body[field]);
      const result = await db.query(
        `INSERT INTO ${resource.table} (${fields.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING ${selectColumns}`,
        values
      );

      res.status(201).json({ ok: true, data: result.rows[0] });
    })
  );

  router.put(
    '/:id',
    asyncHandler(async (req, res) => {
      const fields = pickAllowedFields(req.body, resource.columns);

      if (!fields.length) {
        throw new ApiError(400, 'No se enviaron campos validos');
      }

      const setSql = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
      const values = fields.map((field) => req.body[field]);
      values.push(req.params.id);

      const result = await db.query(
        `UPDATE ${resource.table} SET ${setSql} WHERE ${resource.primaryKey} = $${values.length} RETURNING ${selectColumns}`,
        values
      );

      if (!result.rowCount) {
        throw new ApiError(404, 'Registro no encontrado');
      }

      res.json({ ok: true, data: result.rows[0] });
    })
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const result = await db.query(
        `DELETE FROM ${resource.table} WHERE ${resource.primaryKey} = $1 RETURNING ${resource.primaryKey}`,
        [req.params.id]
      );

      if (!result.rowCount) {
        throw new ApiError(404, 'Registro no encontrado');
      }

      res.json({ ok: true, data: result.rows[0] });
    })
  );

  return router;
}

module.exports = createCrudRouter;
