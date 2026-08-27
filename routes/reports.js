import { Router } from 'express';
import sql from 'mssql';
import path from 'path';
import fs from 'fs';
import { getPool } from '../db.js';
import { dataDir } from '../config.js';

const router = Router();
const workReportsPath = path.join(dataDir, 'work_reports.json');

function loadWorkReportsFromFile() {
  if (!fs.existsSync(workReportsPath)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(workReportsPath, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];
  }
}

function saveWorkReportsToFile(items) {
  try {
    fs.writeFileSync(workReportsPath, JSON.stringify(items, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save work reports to file:', e);
  }
}

// 日報・週報一覧取得 API (Users テーブルと完全マージして author オブジェクトを確実に返却)
router.get(['/work-reports', '/daily-reports', '/reports'], async (req, res) => {
  try {
    const pool = await getPool();
    let reports = [];

    // 1. 全ユーザー情報を取得してマップ化
    const usersMap = new Map();
    try {
      if (pool) {
        const usersRes = await pool.request().query('SELECT id, name, department, office, division, avatarUrl FROM dbo.Users');
        for (const u of (usersRes.recordset || [])) {
          usersMap.set(String(u.id), {
            id: String(u.id),
            name: u.name || '社員',
            department: u.department || u.division || '',
            avatarUrl: u.avatarUrl || ''
          });
        }
      }
    } catch (uErr) {
      console.warn('Users lookup warning in WorkReports:', uErr.message);
    }

    // 2. SQL Server から WorkReports を取得
    let dbSuccess = false;
    try {
      if (pool) {
        const result = await pool.request().query('SELECT * FROM dbo.WorkReports');
        if (result.recordset) {
          reports = result.recordset.map(row => {
            const authId = String(row.author_id || row.authorId || 'u1');
            const supId = row.supervisor_id || row.supervisorId ? String(row.supervisor_id || row.supervisorId) : undefined;
            const rawDate = row.week_start_date || row.weekStartDate || row.report_date || row.reportDate || row.date || row.createdAt;
            const weekDate = rawDate ? (typeof rawDate === 'string' ? rawDate.slice(0, 10) : new Date(rawDate).toISOString().slice(0, 10)) : undefined;
            const weekLbl = row.week_label || row.weekLabel || (weekDate ? `${weekDate}週` : undefined);
            const achieve = row.achievements !== undefined ? row.achievements : (row.results || '');
            const contItems = row.continued_items !== undefined ? row.continued_items : (row.ongoingProjects || '');
            const nxtPlans = row.next_week_plans !== undefined ? row.next_week_plans : (row.tomorrowPlan || '');
            const feed = row.review_feedback !== undefined ? row.review_feedback : (row.feedbackComment || '');
            const reviewedAt = row.reviewed_at || row.reviewedAt || null;
            const updatedAt = row.updated_at || row.updatedAt || row.createdAt || null;
            
            const authorUser = usersMap.get(authId) || {
              id: authId,
              name: row.authorName || '社員',
              department: row.authorDepartment || row.department || '',
              avatarUrl: row.authorAvatarUrl || ''
            };
            const supervisorUser = supId ? (usersMap.get(supId) || { id: supId, name: row.supervisorName || '' }) : undefined;

            let mData = undefined;
            const rawM = row.maintenance_data ?? row.maintenanceData ?? row.Maintenance_Data;
            if (rawM) {
              try { mData = typeof rawM === 'string' ? JSON.parse(rawM) : rawM; } catch (e) {}
            }
            let cData = undefined;
            const rawC = row.construction_data ?? row.constructionData ?? row.Construction_Data;
            if (rawC) {
              try { cData = typeof rawC === 'string' ? JSON.parse(rawC) : rawC; } catch (e) {}
            }
            let sData = undefined;
            const rawS = row.sales_data ?? row.salesData ?? row.Sales_Data;
            if (rawS) {
              try { sData = typeof rawS === 'string' ? JSON.parse(rawS) : rawS; } catch (e) {}
            }

            return {
              id: String(row.id),
              author_id: authId,
              supervisor_id: supId,
              reportType: row.report_type || row.reportType || (mData ? 'maintenance_daily' : 'weekly'),
              reportDate: weekDate,
              date: weekDate,
              week_start_date: weekDate,
              week_label: weekLbl,
              tasks: row.tasks || row.content || '',
              achievements: achieve,
              issues: row.issues || '',
              continued_items: contItems,
              next_week_plans: nxtPlans,
              status: row.status || 'submitted',
              review_feedback: feed,
              reviewed_at: reviewedAt,
              createdAt: row.createdAt,
              updated_at: updatedAt,
              authorId: authId,
              author: authorUser,
              authorName: authorUser.name,
              authorDepartment: authorUser.department,
              authorAvatarUrl: authorUser.avatarUrl,
              supervisorName: supervisorUser ? supervisorUser.name : undefined,
              weekStartDate: weekDate,
              weekLabel: weekLbl,
              department: authorUser.department,
              results: achieve,
              ongoingProjects: contItems,
              tomorrowPlan: nxtPlans,
              supervisorId: supId,
              supervisor: supervisorUser,
              feedbackComment: feed,
              submittedAt: row.submittedAt || (row.status === 'submitted' ? row.createdAt : undefined),
              reviewedAt: reviewedAt,
              updatedAt: updatedAt,
              maintenanceData: mData,
              constructionData: cData,
              salesData: sData
            };
          });
          dbSuccess = true;
        }
      }
    } catch (dbErr) {
      console.warn('DB WorkReports lookup error, falling back to file:', dbErr.message);
    }

    // 3. DB取得できなかった場合のファイルフォールバック
    if (!dbSuccess || reports.length === 0) {
      const fileReports = loadWorkReportsFromFile();
      if (fileReports.length > 0) {
        reports = fileReports.map(r => {
          const authId = String(r.author_id || r.authorId || 'u1');
          const authorUser = usersMap.get(authId) || r.author || {
            id: authId,
            name: r.authorName || '社員',
            department: r.authorDepartment || r.department || '',
            avatarUrl: r.authorAvatarUrl || ''
          };
          return {
            ...r,
            authorId: authId,
            author_id: authId,
            author: authorUser,
            authorName: authorUser.name,
            authorDepartment: authorUser.department,
            authorAvatarUrl: authorUser.avatarUrl
          };
        });
      }
    }

    // 4. クエリフィルタリング
    const { authorId, author_id, supervisorId, supervisor_id, department, reportType, status, weekStartDate, week_start_date } = req.query;
    const targetAuthor = author_id || authorId;
    const targetSupervisor = supervisor_id || supervisorId;
    const targetWeekStart = week_start_date || weekStartDate;

    if (targetAuthor) {
      reports = reports.filter(r => r.author_id === String(targetAuthor) || r.authorId === String(targetAuthor));
    }
    if (targetSupervisor) {
      reports = reports.filter(r => r.supervisor_id === String(targetSupervisor) || r.supervisorId === String(targetSupervisor));
    }
    if (department) {
      reports = reports.filter(r => r.department === String(department));
    }
    if (reportType) {
      reports = reports.filter(r => r.reportType === String(reportType));
    }
    if (status) {
      reports = reports.filter(r => r.status === String(status));
    }
    if (targetWeekStart) {
      reports = reports.filter(r => r.week_start_date === String(targetWeekStart) || r.weekStartDate === String(targetWeekStart));
    }

    reports.sort((a, b) => {
      const timeA = new Date(a.week_start_date || a.createdAt || 0).getTime();
      const timeB = new Date(b.week_start_date || b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 日報・週報 作成 / 登録 API
router.post(['/work-reports', '/daily-reports', '/reports'], async (req, res) => {
  try {
    const data = req.body || {};
    const pool = await getPool();
    const id = data.id && !data.id.startsWith('r-temp-') ? data.id : ('rep_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
    
    const author_id = String(data.author_id || data.authorId || (data.author && data.author.id) || 'u1');
    const authorName = data.authorName || (data.author && data.author.name) || '社員';
    const authorDepartment = data.authorDepartment || data.department || (data.author && data.author.department) || '';
    const supervisor_id = data.supervisor_id || data.supervisorId || (data.supervisor && data.supervisor.id) || null;
    const rawWeekDate = data.week_start_date || data.weekStartDate || data.date || data.reportDate || new Date().toISOString().slice(0, 10);
    const formattedWeekDate = rawWeekDate ? new Date(rawWeekDate) : new Date();
    const week_start_date_str = rawWeekDate ? new Date(rawWeekDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    const week_label = data.week_label || data.weekLabel || (week_start_date_str ? `${week_start_date_str}週` : '');
    const tasks = data.tasks || data.content || '';
    const achievements = data.achievements !== undefined ? data.achievements : (data.results || '');
    const issues = data.issues || '';
    const continued_items = data.continued_items !== undefined ? data.continued_items : (data.ongoingProjects || '');
    const next_week_plans = data.next_week_plans !== undefined ? data.next_week_plans : (data.tomorrowPlan || '');
    const repStatus = data.status || (data.isSubmitting ? 'submitted' : 'draft');
    const review_feedback = data.review_feedback !== undefined ? data.review_feedback : (data.feedbackComment || '');

    const report_type = data.report_type || data.reportType || 'weekly';
    const report_date = data.report_date || data.reportDate || data.date || null;
    const department = data.department || authorDepartment || null;
    const maintenance_data_str = data.maintenance_data ? (typeof data.maintenance_data === 'string' ? data.maintenance_data : JSON.stringify(data.maintenance_data)) : (data.maintenanceData ? JSON.stringify(data.maintenanceData) : null);
    const construction_data_str = data.construction_data ? (typeof data.construction_data === 'string' ? data.construction_data : JSON.stringify(data.construction_data)) : (data.constructionData ? JSON.stringify(data.constructionData) : null);
    const sales_data_str = data.sales_data ? (typeof data.sales_data === 'string' ? data.sales_data : JSON.stringify(data.sales_data)) : (data.salesData ? JSON.stringify(data.salesData) : null);

    // 1. SQL Server 保存
    try {
      if (pool) {
        await pool.request()
          .input('id', sql.NVarChar, String(id))
          .input('author_id', sql.NVarChar, author_id)
          .input('supervisor_id', sql.NVarChar, supervisor_id)
          .input('report_type', sql.NVarChar, report_type)
          .input('report_date', sql.Date, report_date ? new Date(report_date) : null)
          .input('department', sql.NVarChar, department)
          .input('week_start_date', sql.Date, formattedWeekDate)
          .input('week_label', sql.NVarChar, week_label)
          .input('tasks', sql.NVarChar, tasks)
          .input('achievements', sql.NVarChar, achievements)
          .input('issues', sql.NVarChar, issues)
          .input('continued_items', sql.NVarChar, continued_items)
          .input('next_week_plans', sql.NVarChar, next_week_plans)
          .input('status', sql.NVarChar, repStatus)
          .input('review_feedback', sql.NVarChar, review_feedback)
          .input('maintenance_data', sql.NVarChar, maintenance_data_str)
          .input('construction_data', sql.NVarChar, construction_data_str)
          .input('sales_data', sql.NVarChar, sales_data_str)
          .query(`
            MERGE dbo.WorkReports AS target 
            USING (SELECT @id AS id) AS source ON (target.id = source.id) 
            WHEN MATCHED THEN 
              UPDATE SET author_id = @author_id, supervisor_id = @supervisor_id, report_type = @report_type, 
                         report_date = @report_date, department = @department, week_start_date = @week_start_date, 
                         week_label = @week_label, tasks = @tasks, achievements = @achievements, issues = @issues, 
                         continued_items = @continued_items, next_week_plans = @next_week_plans, status = @status, 
                         review_feedback = @review_feedback, maintenance_data = @maintenance_data, 
                         construction_data = @construction_data, sales_data = @sales_data, updated_at = SYSDATETIMEOFFSET() 
            WHEN NOT MATCHED THEN 
              INSERT (id, author_id, supervisor_id, report_type, report_date, department, week_start_date, week_label, 
                      tasks, achievements, issues, continued_items, next_week_plans, status, review_feedback, 
                      maintenance_data, construction_data, sales_data, createdAt, updated_at) 
              VALUES (@id, @author_id, @supervisor_id, @report_type, @report_date, @department, @week_start_date, @week_label, 
                      @tasks, @achievements, @issues, @continued_items, @next_week_plans, @status, @review_feedback, 
                      @maintenance_data, @construction_data, @sales_data, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
          `);

        if (repStatus === 'submitted' && supervisor_id && supervisor_id !== author_id) {
          try {
            const notifId = 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
            await pool.request()
              .input('notifId', sql.NVarChar, notifId)
              .input('user_id', sql.NVarChar, String(supervisor_id))
              .input('sender_id', sql.NVarChar, String(author_id))
              .input('type', sql.NVarChar, 'work_report')
              .input('title', sql.NVarChar, `【週報】${authorName}さんより提出`)
              .input('contents', sql.NVarChar, `${week_label || '最新'}の週報が提出されました。確認をお願いします。`)
              .input('target_id', sql.NVarChar, String(id))
              .query('INSERT INTO dbo.notifications (id, user_id, sender_id, type, title, contents, target_id, is_read, created_at) VALUES (@notifId, @user_id, @sender_id, @type, @title, @contents, @target_id, 0, SYSDATETIMEOFFSET())');
          } catch (_) {}
        }
      }
    } catch (dbErr) {
      console.warn('SQL Server Report insert warning:', dbErr.message);
    }

    // 2. ファイルキャッシュにもバックアップ
    try {
      const fileReports = loadWorkReportsFromFile();
      const existingIdx = fileReports.findIndex(r => r.id === id);
      const reportPayload = {
        id,
        author_id,
        authorId: author_id,
        authorName,
        authorDepartment,
        author: { id: author_id, name: authorName, department: authorDepartment, avatarUrl: data.authorAvatarUrl || '' },
        supervisor_id,
        supervisorId: supervisor_id,
        reportType: report_type,
        week_start_date: week_start_date_str,
        weekStartDate: week_start_date_str,
        week_label,
        weekLabel: week_label,
        tasks,
        achievements,
        results: achievements,
        issues,
        continued_items,
        ongoingProjects: continued_items,
        next_week_plans,
        tomorrowPlan: next_week_plans,
        status: repStatus,
        review_feedback,
        feedbackComment: review_feedback,
        maintenanceData: data.maintenanceData,
        constructionData: data.constructionData,
        salesData: data.salesData,
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (existingIdx >= 0) {
        fileReports[existingIdx] = { ...fileReports[existingIdx], ...reportPayload };
      } else {
        fileReports.unshift(reportPayload);
      }
      saveWorkReportsToFile(fileReports);
    } catch (_) {}

    res.status(201).json({ success: true, id, message: '日報・週報保存完了' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put(['/work-reports/:id', '/daily-reports/:id', '/reports/:id'], async (req, res) => {
  req.body.id = req.params.id;
  return router.handle({ ...req, method: 'POST', url: '/work-reports' }, res);
});

// 上長レビュー・確認 API
router.post(['/work-reports/:id/review', '/daily-reports/:id/review'], async (req, res) => {
  try {
    const { feedbackComment, review_feedback, reviewerUserId, reviewerName } = req.body || {};
    const pool = await getPool();
    const comment = review_feedback !== undefined ? review_feedback : (feedbackComment || '');
    const reportId = String(req.params.id);

    let author_id = null;
    let week_label = '';

    if (pool) {
      const repRes = await pool.request()
        .input('id', sql.NVarChar, reportId)
        .query('SELECT * FROM dbo.WorkReports WHERE id = @id');
      const existing = (repRes.recordset && repRes.recordset[0]) || {};
      author_id = existing.author_id || existing.authorId;
      week_label = existing.week_label || existing.weekLabel || '';

      await pool.request()
        .input('id', sql.NVarChar, reportId)
        .input('review_feedback', sql.NVarChar, comment)
        .query("UPDATE dbo.WorkReports SET status = 'reviewed', review_feedback = @review_feedback, reviewed_at = SYSDATETIMEOFFSET(), updated_at = SYSDATETIMEOFFSET() WHERE id = @id");

      if (author_id) {
        try {
          const notifId = 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
          const titleStr = `【週報】${reviewerName || '上長'}が週報を確認しました`;
          const contentsStr = `${week_label || ''}の週報が確認されました。${comment ? (`コメント: 「${comment}」`) : ''}`;
          await pool.request()
            .input('notifId', sql.NVarChar, notifId)
            .input('user_id', sql.NVarChar, String(author_id))
            .input('sender_id', sql.NVarChar, reviewerUserId ? String(reviewerUserId) : null)
            .input('type', sql.NVarChar, 'work_report_review')
            .input('title', sql.NVarChar, titleStr)
            .input('contents', sql.NVarChar, contentsStr)
            .input('target_id', sql.NVarChar, reportId)
            .query('INSERT INTO dbo.notifications (id, user_id, sender_id, type, title, contents, target_id, is_read, created_at) VALUES (@notifId, @user_id, @sender_id, @type, @title, @contents, @target_id, 0, SYSDATETIMEOFFSET())');
        } catch (_) {}
      }
    }

    res.json({ success: true, message: '確認・レビュー完了' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 削除 API
router.delete(['/work-reports/:id', '/daily-reports/:id', '/reports/:id'], async (req, res) => {
  try {
    const pool = await getPool();
    if (pool) {
      await pool.request().input('id', sql.NVarChar, String(req.params.id)).query('DELETE FROM dbo.WorkReports WHERE id = @id');
    }
    const fileReports = loadWorkReportsFromFile().filter(r => r.id !== req.params.id);
    saveWorkReportsToFile(fileReports);
    res.json({ success: true, message: '削除完了' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
