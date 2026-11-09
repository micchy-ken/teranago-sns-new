import { useState, useCallback } from 'react';
import { API_BASE_URL } from '../config/api';
import { fetchWithRetry } from '../utils/fetchWithRetry';
import { DailyReport, User } from '../types';
import { triggerPushNotification } from '../utils/pushNotifications';
import { dispatchNotificationEmail } from '../utils/emailNotificationDispatcher';
import { getLocalDateStr } from '../utils/dateUtils';

export interface UseReportManagementOptions {
  currentUser: User | null;
  usersList: User[];
  onRecordError?: (source: string, msg: string) => void;
  onClearError?: (source: string) => void;
}

export function useReportManagement({
  currentUser,
  usersList,
  onRecordError,
  onClearError,
}: UseReportManagementOptions) {
  const [reports, setReports] = useState<DailyReport[]>([]);

  const refetchReports = useCallback(async (currentUsers = usersList) => {
    try {
      let response = await fetchWithRetry(`${API_BASE_URL}/work-reports`, {
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) {
        response = await fetchWithRetry(`${API_BASE_URL}/daily-reports`, {
          headers: { 'Accept': 'application/json' }
        });
      }
      if (!response.ok) {
        response = await fetchWithRetry(`${API_BASE_URL}/reports`, {
          headers: { 'Accept': 'application/json' }
        });
      }
      if (!response.ok) {
        throw new Error(`HTTP status ${response.status}`);
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        let deletedReportIds: string[] = [];
        try {
          const stored = localStorage.getItem('deleted_report_ids');
          if (stored) deletedReportIds = JSON.parse(stored);
        } catch (_) {}

        const mapped = data
          .filter((r: any) => !deletedReportIds.includes(String(r.id)))
          .map((r: any) => {
            const authorUser = currentUsers.find(u => u.id === r.authorId) || r.author || currentUser;
            const supervisorUser = r.supervisorId ? (currentUsers.find(u => u.id === r.supervisorId) || r.supervisor) : undefined;
            let parsedTasks = r.tasks || '';
            let parsedResults = r.results || '';
            let parsedIssues = r.issues || '';
            let parsedOngoing = r.ongoingProjects || '';
            let parsedTomorrow = r.tomorrowPlan || '';
            if (r.content && (!r.tasks || !r.results)) {
              if (r.content.startsWith('{')) {
                try {
                  const p = JSON.parse(r.content);
                  parsedTasks = p.tasks || parsedTasks;
                  parsedResults = p.results || parsedResults;
                  parsedIssues = p.issues || parsedIssues;
                  parsedOngoing = p.ongoingProjects || parsedOngoing;
                  parsedTomorrow = p.tomorrowPlan || parsedTomorrow;
                } catch (_) {}
              } else {
                parsedTasks = r.content;
              }
            }
            let mData = r.maintenanceData || r.maintenance_data || r.Maintenance_Data;
            if (typeof mData === 'string') {
              try { mData = JSON.parse(mData); } catch (_) {}
              if (typeof mData === 'string') {
                try { mData = JSON.parse(mData); } catch (_) {}
              }
            }

            let cData = r.constructionData || r.construction_data || r.Construction_Data;
            if (typeof cData === 'string') {
              try { cData = JSON.parse(cData); } catch (_) {}
              if (typeof cData === 'string') {
                try { cData = JSON.parse(cData); } catch (_) {}
              }
            }

            let sData = r.salesData || r.sales_data || r.Sales_Data;
            if (typeof sData === 'string') {
              try { sData = JSON.parse(sData); } catch (_) {}
              if (typeof sData === 'string') {
                try { sData = JSON.parse(sData); } catch (_) {}
              }
            }

            return {
              id: String(r.id),
              author: authorUser,
              authorId: authorUser?.id || r.authorId || r.author_id,
              reportType: r.reportType || r.report_type || (r.weekStartDate || r.week_start_date ? 'weekly' : 'daily'),
              date: r.date || r.reportDate || r.report_date || (r.createdAt ? String(r.createdAt).substring(0, 10) : ''),
              weekStartDate: r.weekStartDate || r.week_start_date,
              weekLabel: r.weekLabel || r.week_label,
              department: r.department || authorUser?.department || '',
              tasks: parsedTasks,
              results: parsedResults,
              issues: parsedIssues,
              ongoingProjects: parsedOngoing,
              tomorrowPlan: parsedTomorrow,
              supervisorId: r.supervisorId || r.supervisor_id,
              supervisor: supervisorUser,
              status: r.status || 'submitted',
              feedbackComment: r.feedbackComment || r.feedback_comment || '',
              maintenanceData: mData,
              constructionData: cData,
              salesData: sData,
              submittedAt: r.submittedAt || r.submitted_at,
              reviewedAt: r.reviewedAt || r.reviewed_at,
              createdAt: r.createdAt || r.created_at || new Date().toISOString()
            };
          });
        setReports(mapped);
        onClearError?.('reports');
      }
    } catch (err: any) {
      console.warn('Failed to load reports from API:', err);
      onRecordError?.('reports', `日報・週報取得エラー: ${err?.message || '接続エラー'}`);
    }
  }, [currentUser, usersList, onClearError, onRecordError]);

  const getReportTypeLabel = (type?: string, isWeeklyFallback = true) => {
    if (type === 'maintenance_daily' || type === 'maintenance') return '保守日報';
    if (type === 'sales_daily') return '営業日報';
    if (type === 'construction_daily') return '工務日報';
    if (type === 'daily') return '日報';
    if (type === 'weekly') return '週報';
    return isWeeklyFallback ? '週報' : '日報';
  };

  const handleAddReport = useCallback(async (reportData: {
    reportType?: any;
    date?: string;
    weekStartDate?: string;
    weekLabel?: string;
    department?: string;
    tasks: string;
    results: string;
    issues: string;
    ongoingProjects?: string;
    tomorrowPlan?: string;
    supervisorId?: string;
    status?: any;
  }) => {
    if (!currentUser) return;
    const tempId = `rep_${Date.now()}`;
    const targetSupervisor = reportData.supervisorId ? usersList.find(u => u.id === reportData.supervisorId) : undefined;
    const resolvedType = reportData.reportType || ((reportData as any).maintenanceData ? 'maintenance_daily' : (reportData.weekStartDate ? 'weekly' : 'daily'));
    const newReport: DailyReport = {
      id: tempId,
      author: currentUser,
      reportType: resolvedType,
      date: reportData.date || getLocalDateStr(new Date()),
      weekStartDate: reportData.weekStartDate,
      weekLabel: reportData.weekLabel,
      department: reportData.department || currentUser.department || '総務',
      tasks: reportData.tasks,
      results: reportData.results,
      issues: reportData.issues,
      ongoingProjects: reportData.ongoingProjects || '',
      tomorrowPlan: reportData.tomorrowPlan || '',
      supervisorId: reportData.supervisorId,
      supervisor: targetSupervisor,
      status: reportData.status || 'submitted',
      submittedAt: reportData.status === 'submitted' ? new Date().toISOString() : undefined,
      maintenanceData: (reportData as any).maintenanceData,
      constructionData: (reportData as any).constructionData,
      salesData: (reportData as any).salesData,
      createdAt: new Date().toISOString(),
    };
    setReports(prev => [newReport, ...prev]);

    // 週報・日報・保守日報提出時のプッシュ通知送信 (下書き以外)
    if (newReport.status === 'submitted') {
      const typeLabel = getReportTypeLabel(newReport.reportType);
      const dateLabel = newReport.reportType === 'weekly' ? (newReport.weekLabel || `${newReport.weekStartDate}週`) : newReport.date;
      
      // 上長が指定されている場合は上長宛、未指定の場合は同部署の承認者または管理者宛
      if (newReport.supervisorId && newReport.supervisorId !== currentUser.id) {
        triggerPushNotification({
          targetUserId: newReport.supervisorId,
          excludeUserId: currentUser.id,
          title: `📝 ${typeLabel}提出: ${currentUser.name}さん`,
          body: `${dateLabel}の${typeLabel}が提出されました。確認をお願いします。`,
          url: `/?tab=daily_report&reportId=${tempId}`,
          tag: `report-${tempId}`
        });

        const supervisorUser = usersList.find(u => u.id === newReport.supervisorId);
        if (supervisorUser) {
          dispatchNotificationEmail([supervisorUser], {
            category: 'inspection',
            categoryLabel: '点検・報告書',
            title: `${typeLabel}提出: ${currentUser.name}さん`,
            actorName: currentUser.name,
            details: [
              { label: '報告種別', value: typeLabel },
              { label: '対象日付', value: dateLabel },
              { label: '提出者', value: currentUser.name },
            ],
            mainContent: newReport.results || newReport.tasks,
            pathParams: `tab=daily_report&reportId=${tempId}`,
          }, currentUser);
        }
      } else {
        // 同部署の管理職/リーダーまたは全管理者に通知
        const approvers = usersList.filter(u => 
          u.id !== currentUser.id && 
          (u.role === 'admin' || (u.role as any) === 'manager' || (u.division === currentUser.division && ['課長', '部長', '所長', 'リーダー'].some(pos => u.position?.includes(pos))))
        );
        if (approvers.length > 0) {
          triggerPushNotification({
            targetUserIds: approvers.map(u => u.id),
            excludeUserId: currentUser.id,
            title: `📝 ${typeLabel}提出: ${currentUser.name}さん`,
            body: `${dateLabel}の${typeLabel}が提出されました。確認をお願いします。`,
            url: `/?tab=daily_report&reportId=${tempId}`,
            tag: `report-${tempId}`
          });

          dispatchNotificationEmail(approvers, {
            category: 'inspection',
            categoryLabel: '点検・報告書',
            title: `${typeLabel}提出: ${currentUser.name}さん`,
            actorName: currentUser.name,
            details: [
              { label: '報告種別', value: typeLabel },
              { label: '対象日付', value: dateLabel },
              { label: '提出者', value: currentUser.name },
            ],
            mainContent: newReport.results || newReport.tasks,
            pathParams: `tab=daily_report&reportId=${tempId}`,
          }, currentUser);
        }
      }
    }

    try {
      const payload = {
        id: tempId,
        authorId: currentUser.id,
        author_id: currentUser.id,
        reportType: resolvedType,
        report_type: resolvedType,
        reportDate: reportData.date,
        date: reportData.date,
        weekStartDate: reportData.weekStartDate,
        weekLabel: reportData.weekLabel,
        department: reportData.department || currentUser.department || '総務',
        tasks: reportData.tasks,
        results: reportData.results,
        issues: reportData.issues,
        ongoingProjects: reportData.ongoingProjects,
        tomorrowPlan: reportData.tomorrowPlan,
        supervisorId: reportData.supervisorId,
        supervisor_id: reportData.supervisorId,
        status: reportData.status || 'submitted',
        maintenanceData: (reportData as any).maintenanceData,
        maintenance_data: (reportData as any).maintenanceData,
        constructionData: (reportData as any).constructionData,
        construction_data: (reportData as any).constructionData,
        salesData: (reportData as any).salesData,
        sales_data: (reportData as any).salesData,
      };

      let response = await fetch(`${API_BASE_URL}/work-reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        response = await fetch(`${API_BASE_URL}/daily-reports`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      if (response.ok) {
        await refetchReports();
      }
    } catch (err) {
      console.error('Failed to save report via API, keeping locally:', err);
    }
  }, [currentUser, usersList, refetchReports]);

  const handleUpdateReport = useCallback(async (id: string, reportData: Partial<DailyReport>) => {
    if (!currentUser) return;
    const oldReport = reports.find(r => r.id === id);
    const resolvedReportType = reportData.reportType || oldReport?.reportType || ((reportData as any).maintenanceData || (reportData as any).maintenance_data || oldReport?.maintenanceData ? 'maintenance_daily' : (reportData.weekStartDate || oldReport?.weekStartDate ? 'weekly' : 'daily'));

    // 作成者（author / author_id）の厳格な保護: 既存日報の作成者を最優先し、上長承認・回覧時に上長へすり替わらないよう防御
    const originalAuthorId = (oldReport?.author && oldReport.author.id) || oldReport?.authorId || (oldReport as any)?.author_id;
    const resolvedAuthorId = originalAuthorId || (reportData.author && reportData.author.id) || reportData.authorId || (reportData as any)?.author_id || currentUser.id;
    const resolvedAuthor = oldReport?.author || (originalAuthorId ? usersList.find(u => u.id === originalAuthorId) : undefined) || reportData.author || currentUser;

    setReports(prev => prev.map(r => r.id === id ? {
      ...r,
      ...reportData,
      author: resolvedAuthor,
      authorId: resolvedAuthorId,
      author_id: resolvedAuthorId,
      reportType: resolvedReportType
    } : r));

    // 多段階承認通知のトリガー
    try {
      const typeLabel = getReportTypeLabel(resolvedReportType);
      const authorId = resolvedAuthorId;
      const authorUser = usersList.find(u => u.id === authorId) || resolvedAuthor;
      const authorName = authorUser?.name || '担当者';
      const dateLabel = oldReport?.date || reportData.date || '';

      // 1. 差し戻し時 (status: submitted -> draft)
      if (oldReport && oldReport.status === 'submitted' && reportData.status === 'draft' && authorId && authorId !== currentUser.id) {
        triggerPushNotification({
          targetUserId: authorId,
          excludeUserId: currentUser.id,
          title: `↩️ ${typeLabel}差し戻し: ${currentUser.name}さん`,
          body: `${currentUser.name}さんより${dateLabel}の${typeLabel}が差し戻されました。修正の上、再提出してください。`,
          url: `/?tab=daily_report&reportId=${id}`,
          tag: `report-remand-${id}`
        });

        if (authorUser) {
          dispatchNotificationEmail([authorUser], {
            category: 'inspection',
            categoryLabel: '点検・報告書',
            title: `${typeLabel}差し戻し: ${currentUser.name}さん`,
            actorName: currentUser.name,
            details: [
              { label: '報告種別', value: typeLabel },
              { label: '対象日付', value: dateLabel },
              { label: '差し戻し者', value: currentUser.name },
              { label: 'コメント', value: reportData.feedbackComment || '差し戻し' },
            ],
            pathParams: `tab=daily_report&reportId=${id}`,
          }, currentUser);
        }
      }

      // 2. 次の上長への回覧時 (status: submitted かつ supervisorId が指定され、前と異なる場合)
      const nextSupervisorId = reportData.supervisorId;
      if (
        reportData.status === 'submitted' &&
        nextSupervisorId &&
        nextSupervisorId !== currentUser.id &&
        (!oldReport || oldReport.supervisorId !== nextSupervisorId)
      ) {
        const nextSupervisor = usersList.find(u => u.id === nextSupervisorId);
        triggerPushNotification({
          targetUserId: nextSupervisorId,
          excludeUserId: currentUser.id,
          title: `📄 ${typeLabel}確認依頼（回覧）: ${authorName}さん`,
          body: `${currentUser.name}さんより${authorName}さんの${dateLabel}の${typeLabel}が回覧されました。確認をお願いします。`,
          url: `/?tab=daily_report&reportId=${id}`,
          tag: `report-fwd-${id}`
        });

        if (nextSupervisor) {
          dispatchNotificationEmail([nextSupervisor], {
            category: 'inspection',
            categoryLabel: '点検・報告書',
            title: `${typeLabel}確認依頼（回覧）: ${authorName}さん`,
            actorName: currentUser.name,
            details: [
              { label: '報告種別', value: typeLabel },
              { label: '対象日付', value: dateLabel },
              { label: '作成者', value: authorName },
              { label: '前確認者', value: currentUser.name },
              { label: 'コメント', value: reportData.feedbackComment || '確認回覧' },
            ],
            pathParams: `tab=daily_report&reportId=${id}`,
          }, currentUser);
        }
      }

      // 3. 最終承認時 (status: reviewed)
      if (reportData.status === 'reviewed' && authorId && authorId !== currentUser.id) {
        triggerPushNotification({
          targetUserId: authorId,
          excludeUserId: currentUser.id,
          title: `🎉 ${typeLabel}最終承認完了: ${currentUser.name}さん`,
          body: `${currentUser.name}さんが${dateLabel}の${typeLabel}を最終承認（確認完了）しました。`,
          url: `/?tab=daily_report&reportId=${id}`,
          tag: `report-appr-${id}`
        });

        if (authorUser) {
          dispatchNotificationEmail([authorUser], {
            category: 'inspection',
            categoryLabel: '点検・報告書',
            title: `${typeLabel}最終承認完了: ${currentUser.name}さん`,
            actorName: currentUser.name,
            details: [
              { label: '報告種別', value: typeLabel },
              { label: '対象日付', value: dateLabel },
              { label: '承認者', value: currentUser.name },
              { label: 'フィードバック', value: reportData.feedbackComment || '最終承認完了' },
            ],
            pathParams: `tab=daily_report&reportId=${id}`,
          }, currentUser);
        }
      }
    } catch (notifErr) {
      console.warn('Failed to send multi-level approval notifications:', notifErr);
    }

    try {
      const payload = {
        ...reportData,
        id,
        reportType: resolvedReportType,
        report_type: resolvedReportType,
        author_id: resolvedAuthorId,
        authorId: resolvedAuthorId,
        author: resolvedAuthor,
        supervisor_id: reportData.supervisorId || (reportData.supervisor && reportData.supervisor.id),
        week_start_date: reportData.weekStartDate,
        week_label: reportData.weekLabel,
        achievements: reportData.results !== undefined ? reportData.results : (reportData as any).achievements,
        continued_items: reportData.ongoingProjects !== undefined ? reportData.ongoingProjects : (reportData as any).continued_items,
        next_week_plans: reportData.tomorrowPlan !== undefined ? reportData.tomorrowPlan : (reportData as any).next_week_plans,
        maintenance_data: (reportData as any).maintenanceData !== undefined ? (reportData as any).maintenanceData : (reportData as any).maintenance_data,
        maintenanceData: (reportData as any).maintenanceData !== undefined ? (reportData as any).maintenanceData : (reportData as any).maintenance_data,
        construction_data: (reportData as any).constructionData !== undefined ? (reportData as any).constructionData : (reportData as any).construction_data,
        constructionData: (reportData as any).constructionData !== undefined ? (reportData as any).constructionData : (reportData as any).construction_data,
        sales_data: (reportData as any).salesData !== undefined ? (reportData as any).salesData : (reportData as any).sales_data,
        salesData: (reportData as any).salesData !== undefined ? (reportData as any).salesData : (reportData as any).sales_data,
      };
      let response = await fetch(`${API_BASE_URL}/work-reports/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        response = await fetch(`${API_BASE_URL}/daily-reports/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      if (response.ok) {
        await refetchReports();
      }
    } catch (err) {
      console.error('Failed to update report via API:', err);
    }
  }, [currentUser, reports, usersList, refetchReports]);

  const handleReviewReport = useCallback(async (id: string, feedbackComment?: string) => {
    if (!currentUser) return;
    const targetReport = reports.find(r => r.id === id);
    setReports(prev => prev.map(r => r.id === id ? { ...r, status: 'reviewed', feedbackComment, reviewedAt: new Date().toISOString() } : r));

    // 作成者宛に確認・フィードバック完了のプッシュ通知を送信
    if (targetReport && targetReport.author && targetReport.author.id !== currentUser.id) {
      const typeLabel = targetReport.reportType === 'weekly' ? '週報' : '日報';
      const dateLabel = targetReport.reportType === 'weekly' ? (targetReport.weekLabel || `${targetReport.weekStartDate}週`) : targetReport.date;
      triggerPushNotification({
        targetUserId: targetReport.author.id,
        excludeUserId: currentUser.id,
        title: `✍️ ${typeLabel}確認完了: ${currentUser.name}さん`,
        body: `${currentUser.name}さんが${dateLabel}の${typeLabel}を確認しました。${feedbackComment ? `「${feedbackComment.slice(0, 40)}」` : ''}`,
        url: `/?tab=daily_report&reportId=${id}`,
        tag: `report-rev-${id}`
      });

      const authorUser = usersList.find(u => u.id === targetReport.author.id) || targetReport.author;
      dispatchNotificationEmail([authorUser], {
        category: 'inspection',
        categoryLabel: '点検・報告書',
        title: `${typeLabel}確認完了: ${currentUser.name}さん`,
        actorName: currentUser.name,
        details: [
          { label: '報告種別', value: typeLabel },
          { label: '対象日付', value: dateLabel },
          { label: '確認者', value: currentUser.name },
          { label: 'フィードバック', value: feedbackComment || '確認完了' },
        ],
        pathParams: `tab=daily_report&reportId=${id}`,
      }, currentUser);
    }

    try {
      let response = await fetch(`${API_BASE_URL}/work-reports/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedbackComment })
      });
      if (!response.ok) {
        response = await fetch(`${API_BASE_URL}/daily-reports/${id}/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feedbackComment })
        });
      }
      if (response.ok) {
        await refetchReports();
      }
    } catch (err) {
      console.error('Failed to review report via API:', err);
    }
  }, [currentUser, reports, usersList, refetchReports]);

  const handleDeleteReport = useCallback(async (id: string) => {
    setReports(prev => prev.filter(r => r.id !== id));
    try {
      const stored = localStorage.getItem('deleted_report_ids');
      const list = stored ? JSON.parse(stored) : [];
      if (!list.includes(id)) {
        list.push(id);
        localStorage.setItem('deleted_report_ids', JSON.stringify(list));
      }
    } catch (_) {}

    try {
      let response = await fetch(`${API_BASE_URL}/work-reports/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        response = await fetch(`${API_BASE_URL}/daily-reports/${id}`, {
          method: 'DELETE'
        });
      }
      if (!response.ok) {
        response = await fetch(`${API_BASE_URL}/reports/${id}`, {
          method: 'DELETE'
        });
      }
      if (response.ok) {
        await refetchReports();
      }
    } catch (err) {
      console.error('Failed to delete report via API:', err);
    }
  }, [refetchReports]);

  return {
    reports,
    setReports,
    refetchReports,
    handleAddReport,
    handleUpdateReport,
    handleReviewReport,
    handleDeleteReport,
  };
}
