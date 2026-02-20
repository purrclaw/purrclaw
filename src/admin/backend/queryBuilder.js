const RESERVED_QUERY_KEYS = new Set(["_start", "_end", "_sort", "_order"]);

function toNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function buildSortClause(query, allowedColumns, fallbackSort) {
  const sortRaw = typeof query._sort === "string" ? query._sort : "";
  const orderRaw = typeof query._order === "string" ? query._order : "";

  const sortColumns = sortRaw
    .split(",")
    .map((v) => v.trim())
    .filter((v) => allowedColumns.has(v));

  if (sortColumns.length === 0) {
    return `ORDER BY ${fallbackSort}`;
  }

  const orderValues = orderRaw
    .split(",")
    .map((v) => (v.trim().toUpperCase() === "DESC" ? "DESC" : "ASC"));

  const sortSql = sortColumns
    .map((column, index) => `${column} ${orderValues[index] || orderValues[0] || "ASC"}`)
    .join(", ");

  return `ORDER BY ${sortSql}`;
}

function buildWhereClause(query, allowedColumns, searchColumns = []) {
  const clauses = [];
  const params = [];

  for (const [rawKey, rawValue] of Object.entries(query || {})) {
    if (RESERVED_QUERY_KEYS.has(rawKey) || rawValue === undefined || rawValue === null) {
      continue;
    }

    if (rawKey === "q") {
      const value = String(rawValue).trim();
      if (!value || searchColumns.length === 0) {
        continue;
      }
      const searchClause = searchColumns.map((column) => `LOWER(${column}) LIKE LOWER(?)`).join(" OR ");
      clauses.push(`(${searchClause})`);
      for (let i = 0; i < searchColumns.length; i += 1) {
        params.push(`%${value}%`);
      }
      continue;
    }

    let operator = "eq";
    let column = rawKey;

    if (rawKey.endsWith("_like")) {
      operator = "like";
      column = rawKey.slice(0, -5);
    } else if (rawKey.endsWith("_ne")) {
      operator = "ne";
      column = rawKey.slice(0, -3);
    } else if (rawKey.endsWith("_gte")) {
      operator = "gte";
      column = rawKey.slice(0, -4);
    } else if (rawKey.endsWith("_lte")) {
      operator = "lte";
      column = rawKey.slice(0, -4);
    }

    if (!allowedColumns.has(column)) {
      continue;
    }

    const value = String(rawValue);
    if (operator === "like") {
      clauses.push(`LOWER(${column}) LIKE LOWER(?)`);
      params.push(`%${value}%`);
    } else if (operator === "ne") {
      clauses.push(`${column} != ?`);
      params.push(value);
    } else if (operator === "gte") {
      clauses.push(`${column} >= ?`);
      params.push(value);
    } else if (operator === "lte") {
      clauses.push(`${column} <= ?`);
      params.push(value);
    } else {
      clauses.push(`${column} = ?`);
      params.push(value);
    }
  }

  if (clauses.length === 0) {
    return { whereSql: "", params: [] };
  }

  return {
    whereSql: `WHERE ${clauses.join(" AND ")}`,
    params,
  };
}

async function runListQuery(db, query, config) {
  const {
    selectSql,
    countSql,
    allowedColumns,
    searchColumns,
    fallbackSort,
  } = config;

  const start = Math.max(0, toNumber(query._start, 0));
  const endRaw = toNumber(query._end, start + 10);
  const limit = Math.max(1, endRaw - start);

  const { whereSql, params } = buildWhereClause(query, allowedColumns, searchColumns);
  const sortSql = buildSortClause(query, allowedColumns, fallbackSort);

  const dataSql = `${selectSql} ${whereSql} ${sortSql} LIMIT ? OFFSET ?`;
  const rows = await db.all(dataSql, ...params, limit, start);

  const totalRow = await db.get(`${countSql} ${whereSql}`, ...params);
  const total = totalRow?.total ?? 0;

  return { rows, total };
}

module.exports = {
  toNumber,
  buildSortClause,
  buildWhereClause,
  runListQuery,
};
