const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildSortClause,
  buildWhereClause,
} = require("../src/admin/backend/queryBuilder");

test("buildSortClause uses fallback when sort is missing", () => {
  const sql = buildSortClause({}, new Set(["id"]), "id DESC");
  assert.equal(sql, "ORDER BY id DESC");
});

test("buildSortClause ignores unknown columns", () => {
  const sql = buildSortClause({ _sort: "unknown,id", _order: "ASC,DESC" }, new Set(["id"]), "id DESC");
  assert.equal(sql, "ORDER BY id ASC");
});

test("buildWhereClause builds q and typed operators", () => {
  const { whereSql, params } = buildWhereClause(
    {
      q: "abc",
      id_gte: 10,
      name_like: "john",
      role_ne: "tool",
      ignored: "x",
    },
    new Set(["id", "name", "role"]),
    ["name", "role"],
  );

  assert.equal(
    whereSql,
    "WHERE (LOWER(name) LIKE LOWER(?) OR LOWER(role) LIKE LOWER(?)) AND id >= ? AND LOWER(name) LIKE LOWER(?) AND role != ?",
  );
  assert.deepEqual(params, ["%abc%", "%abc%", "10", "%john%", "tool"]);
});

test("buildWhereClause returns empty for unsupported filters", () => {
  const result = buildWhereClause({ x: "1", y_like: "2" }, new Set(["id"]), ["id"]);
  assert.equal(result.whereSql, "");
  assert.deepEqual(result.params, []);
});
