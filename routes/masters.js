import { Router } from 'express';
import sql from 'mssql';
import { getPool } from '../db.js';
import { safeParseJSON } from '../config.js';

const router = Router();

// Master Configurations
const configs = {
  offices: {
    t1: 'dbo.OfficeMaster', t2: 'dbo.Offices', prefix: 'off',
    cols: (b) => ({ name: b.name, type: b.type || 'branch', code: b.code, location: b.location, phone: b.phone })
  },
  divisions: {
    t1: 'dbo.DivisionMaster', t2: 'dbo.Divisions', prefix: 'div',
    cols: (b) => ({ name: b.name, code: b.code, description: b.description })
  },
  positions: {
    t1: 'dbo.PositionMaster', t2: 'dbo.Positions', prefix: 'pos',
    cols: (b) => ({ name: b.name, level: b.level ?? 1 })
  },
  'item-masters': {
    t1: 'dbo.ItemMasters', t2: 'dbo.ItemMasters', prefix: 'itm',
    cols: (b) => {
      const priceVal = b.defaultUnitPrice ?? b.unitPrice ?? b.price ?? 0;
      const price = Number(priceVal) || 0;
      return {
        code: b.code || '',
        name: b.name || '',
        category: b.category || '',
        unit: b.unit || '',
        defaultUnitPrice: price,
        unitPrice: price,
        price: price,
        description: b.description || '',
        spec: b.spec || '',
        minStock: Number(b.minStock || 0),
        currentStock: Number(b.currentStock || 0)
      };
    },
    mapGet: (r) => (r.recordset || []).map(row => {
      const priceVal = row.defaultUnitPrice ?? row.DefaultUnitPrice ?? row.unitPrice ?? row.UnitPrice ?? row.price ?? row.Price ?? 0;
      const numPrice = Number(priceVal) || 0;
      return {
        id: row.id,
        code: row.code || row.Code || '',
        name: row.name || row.Name || '',
        category: row.category || row.Category || '',
        unit: row.unit || row.Unit || '',
        defaultUnitPrice: numPrice,
        unitPrice: numPrice,
        description: row.description || row.Description || '',
        spec: row.spec || row.Spec || '',
        minStock: Number(row.minStock ?? row.MinStock ?? 0),
        currentStock: Number(row.currentStock ?? row.CurrentStock ?? 0)
      };
    })
  },
  'approval-flows': {
    t1: 'dbo.ApprovalFlows', t2: 'dbo.ApprovalFlows', prefix: 'flow',
    cols: (b) => ({
      name: b.name, description: b.description, targetApplicationType: b.targetApplicationType || 'all',
      stepsJson: JSON.stringify(b.steps || []), isDefault: !!b.isDefault
    }),
    mapGet: (r) => (r.recordset || []).map(row => ({
      id: row.id, name: row.name, description: row.description || '',
      targetApplicationType: row.targetApplicationType || 'all',
      steps: safeParseJSON(row.stepsJson, []), isDefault: row.isDefault === 1 || row.isDefault === true
    }))
  }
};

// Helper to inspect actual table columns in SQL Server to avoid "Invalid column name" errors
async function getTableColumns(pool, tableName) {
  try {
    const rawName = tableName.replace(/^dbo\./i, '').replace(/[\[\]]/g, '');
    const res = await pool.request()
      .input('tableName', sql.VarChar, rawName)
      .query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tableName`);
    if (res.recordset && res.recordset.length > 0) {
      return new Set(res.recordset.map(r => r.COLUMN_NAME.toLowerCase()));
    }
  } catch (_) {}
  return null;
}

// Generic DB Query Builder with Column Filtering
async function upsertRecord(pool, t1, t2, id, data) {
  const t1Cols = await getTableColumns(pool, t1);
  const t2Cols = (t1 === t2) ? t1Cols : await getTableColumns(pool, t2);

  const executeUpsertForTable = async (table, colsSet) => {
    let filteredEntries = Object.entries(data);
    if (colsSet && colsSet.size > 0) {
      filteredEntries = filteredEntries.filter(([k]) => colsSet.has(k.toLowerCase()));
    }
    if (filteredEntries.length === 0) return;

    const keys = filteredEntries.map(([k]) => k);
    const sets = keys.map(k => `${k} = @${k}`).join(', ');
    const columns = ['id', ...keys].join(', ');
    const values = ['@id', ...keys.map(k => `@${k}`)].join(', ');

    const sqlQuery = `
      IF OBJECT_ID('${table}', 'U') IS NOT NULL
      BEGIN
        IF EXISTS (SELECT 1 FROM ${table} WHERE id = @id) UPDATE ${table} SET ${sets} WHERE id = @id;
        ELSE INSERT INTO ${table} (${columns}) VALUES (${values});
      END`;

    const req = pool.request().input('id', sql.VarChar, id);
    for (const [k, v] of filteredEntries) {
      if (typeof v === 'number') req.input(k, Number.isInteger(v) ? sql.Int : sql.Decimal(18, 2), v);
      else if (typeof v === 'boolean') req.input(k, sql.Bit, v ? 1 : 0);
      else req.input(k, k.toLowerCase().includes('json') ? sql.NVarChar(sql.MAX) : sql.NVarChar, v || '');
    }
    await req.query(sqlQuery);
  };

  await executeUpsertForTable(t1, t1Cols);
  if (t2 && t1 !== t2) {
    await executeUpsertForTable(t2, t2Cols);
  }
}

// Generate Router Endpoints
Object.entries(configs).forEach(([key, cfg]) => {
  const paths = [`/masters/${key}`, `/${key}`];
  const idPaths = [`/masters/${key}/:id`, `/${key}/:id`];

  // GET
  router.get(paths, async (req, res) => {
    try {
      const pool = await getPool();
      let result;
      try { result = await pool.request().query(`SELECT * FROM ${cfg.t1}`); }
      catch (_) { result = await pool.request().query(`SELECT * FROM ${cfg.t2}`); }
      res.json(cfg.mapGet ? cfg.mapGet(result) : (result.recordset || []));
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // POST & PUT
  const saveHandler = async (req, res) => {
    try {
      const body = req.body || {};
      const id = req.params.id || body.id || `${cfg.prefix}-${Date.now()}`;
      const pool = await getPool();
      await upsertRecord(pool, cfg.t1, cfg.t2, id, cfg.cols(body));
      res.json({ success: true, id, ...body });
    } catch (err) { res.status(500).json({ error: err.message }); }
  };
  router.post(paths, saveHandler);
  router.put(idPaths, saveHandler);

  // DELETE
  router.delete(idPaths, async (req, res) => {
    try {
      const id = req.params.id;
      const pool = await getPool();
      await pool.request().input('id', sql.VarChar, id).query(`
        IF OBJECT_ID('${cfg.t1}', 'U') IS NOT NULL DELETE FROM ${cfg.t1} WHERE id = @id;
        IF OBJECT_ID('${cfg.t2}', 'U') IS NOT NULL AND '${cfg.t1}' <> '${cfg.t2}' DELETE FROM ${cfg.t2} WHERE id = @id;
      `);
      res.json({ success: true, id });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
});

export default router;
