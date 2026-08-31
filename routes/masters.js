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
    cols: (b) => ({
      code: b.code, name: b.name, category: b.category, unit: b.unit,
      unitPrice: b.unitPrice || b.price || 0, description: b.description, spec: b.spec,
      minStock: b.minStock || 0, currentStock: b.currentStock || 0
    }),
    mapGet: (r) => (r.recordset || []).map(row => ({
      id: row.id, code: row.code || '', name: row.name || '', category: row.category || '',
      unit: row.unit || '', unitPrice: row.unitPrice || row.price || 0, description: row.description || '',
      spec: row.spec || '', minStock: row.minStock || 0, currentStock: row.currentStock || 0
    }))
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

// Generic DB Query Builder
async function upsertRecord(pool, t1, t2, id, data) {
  const keys = Object.keys(data);
  const sets = keys.map(k => `${k} = @${k}`).join(', ');
  const columns = ['id', ...keys].join(', ');
  const values = ['@id', ...keys.map(k => `@${k}`)].join(', ');

  const sqlQuery = `
    IF OBJECT_ID('${t1}', 'U') IS NOT NULL
    BEGIN
      IF EXISTS (SELECT 1 FROM ${t1} WHERE id = @id) UPDATE ${t1} SET ${sets} WHERE id = @id;
      ELSE INSERT INTO ${t1} (${columns}) VALUES (${values});
    END
    IF OBJECT_ID('${t2}', 'U') IS NOT NULL AND '${t1}' <> '${t2}'
    BEGIN
      IF EXISTS (SELECT 1 FROM ${t2} WHERE id = @id) UPDATE ${t2} SET ${sets} WHERE id = @id;
      ELSE INSERT INTO ${t2} (${columns}) VALUES (${values});
    END`;

  const req = pool.request().input('id', sql.VarChar, id);
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'number') req.input(k, Number.isInteger(v) ? sql.Int : sql.Decimal(18, 2), v);
    else if (typeof v === 'boolean') req.input(k, sql.Bit, v ? 1 : 0);
    else req.input(k, k.toLowerCase().includes('json') ? sql.NVarChar(sql.MAX) : sql.NVarChar, v || '');
  }
  await req.query(sqlQuery);
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
