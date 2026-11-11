import { Router } from 'express';
import sql from 'mssql';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from '../db.js';
import { safeParseJSON } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const MAINTENANCE_CONFIGS_FILE = path.join(DATA_DIR, 'maintenance_office_configs.json');

function loadLocalMaintenanceConfigs() {
  try {
    if (fs.existsSync(MAINTENANCE_CONFIGS_FILE)) {
      const raw = fs.readFileSync(MAINTENANCE_CONFIGS_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed to load maintenance_office_configs.json:', e);
  }
  return [];
}

function saveLocalMaintenanceConfigs(configsList) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(MAINTENANCE_CONFIGS_FILE, JSON.stringify(configsList, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save maintenance_office_configs.json:', e);
  }
}

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
    cols: (b) => ({ name: b.name, code: b.code || '', level: b.level ?? 1, description: b.description || '' })
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

// 保守日報 拠点別カスタム様式・設定 (Maintenance Daily Report Office Configurations)
const maintConfigPaths = ['/masters/maintenance-configs', '/maintenance-configs'];
const maintConfigIdPaths = ['/masters/maintenance-configs/:officeName', '/maintenance-configs/:officeName'];

router.get(maintConfigPaths, async (req, res) => {
  try {
    const pool = await getPool();
    if (pool) {
      try {
        const queryRes = await pool.request()
          .input('key', sql.NVarChar(100), 'maintenance_office_configs')
          .query(`SELECT settingValue FROM dbo.SystemSettings WHERE settingKey = @key`);
        if (queryRes.recordset && queryRes.recordset.length > 0) {
          const val = safeParseJSON(queryRes.recordset[0].settingValue, null);
          if (Array.isArray(val)) {
            return res.json(val);
          }
        }
      } catch (_) {}
    }
    const local = loadLocalMaintenanceConfigs();
    return res.json(local);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const normalizeOfficeBase = (raw) => {
  if (!raw) return '';
  return String(raw).trim().replace(/(支店|営業所|本社|出張所|事務所|センター)$/, '').trim();
};

const saveMaintConfigHandler = async (req, res) => {
  try {
    const body = req.body;
    let list = loadLocalMaintenanceConfigs();
    if (!Array.isArray(list)) list = [];

    // SQL Server dbo.SystemSettings に既存リストがあれば優先取得してマージ元とする
    try {
      const pool = await getPool();
      if (pool) {
        const queryRes = await pool.request()
          .input('key', sql.NVarChar(100), 'maintenance_office_configs')
          .query(`SELECT settingValue FROM dbo.SystemSettings WHERE settingKey = @key`);
        if (queryRes.recordset && queryRes.recordset.length > 0) {
          const dbVal = safeParseJSON(queryRes.recordset[0].settingValue, null);
          if (Array.isArray(dbVal) && dbVal.length > 0) {
            list = dbVal;
          }
        }
      }
    } catch (_) {}

    if (Array.isArray(body)) {
      list = body;
    } else if (body && (body.officeId || body.officeName || body.id)) {
      const officeName = body.officeName || req.params.officeName || body.id;
      const officeId = body.officeId || undefined;
      const normName = normalizeOfficeBase(officeName);

      const index = list.findIndex(c =>
        (officeId && c.officeId && String(c.officeId) === String(officeId)) ||
        (body.id && c.id === body.id) ||
        c.officeName === officeName ||
        (normName && normalizeOfficeBase(c.officeName) === normName)
      );

      const newConfig = {
        ...(index >= 0 ? list[index] : {}),
        ...body,
        officeId: officeId || (index >= 0 ? list[index].officeId : undefined),
        officeName,
        id: body.id || (officeId ? `cfg-office-${officeId}` : `cfg-office-${officeName}`),
        updatedAt: new Date().toISOString()
      };
      if (index >= 0) {
        list[index] = newConfig;
      } else {
        list.push(newConfig);
      }
    }

    saveLocalMaintenanceConfigs(list);

    // SQL Server dbo.SystemSettings にも非同期・耐障害保存
    try {
      const pool = await getPool();
      if (pool) {
        await pool.request().query(`
          IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SystemSettings' AND schema_id = SCHEMA_ID('dbo'))
          BEGIN
            CREATE TABLE dbo.SystemSettings (
              settingKey NVARCHAR(100) PRIMARY KEY,
              settingValue NVARCHAR(MAX) NOT NULL,
              updatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );
          END
        `);
        await pool.request()
          .input('key', sql.NVarChar(100), 'maintenance_office_configs')
          .input('value', sql.NVarChar(sql.MAX), JSON.stringify(list))
          .query(`
            MERGE dbo.SystemSettings AS target
            USING (SELECT @key AS settingKey) AS source
            ON (target.settingKey = source.settingKey)
            WHEN MATCHED THEN UPDATE SET settingValue = @value, updatedAt = SYSUTCDATETIME()
            WHEN NOT MATCHED THEN INSERT (settingKey, settingValue, updatedAt) VALUES (@key, @value, SYSUTCDATETIME());
          `);
      }
    } catch (_) {}

    res.json({ success: true, configs: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

router.post(maintConfigPaths, saveMaintConfigHandler);
router.put(maintConfigPaths, saveMaintConfigHandler);
router.put(maintConfigIdPaths, saveMaintConfigHandler);

export default router;
