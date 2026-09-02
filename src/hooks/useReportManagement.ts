import { useState, useCallback } from 'react';
import { API_BASE_URL } from '../config/api';
import { DailyReport, User } from '../types';
import { triggerPushNotification } from '../utils/pushNotifications';
import { dispatchNotificationEmail } from '../utils/emailNotificationDispatcher';

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
      let response = await fetch(`${API_BASE_URL}/work-reports`, {
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) {
        response = await fetch(`${API_BASE_URL}/daily-reports`, {
          headers: { 'Accept': 'application/json' }
        });
      }
      if (!response.ok) {
        response = await fetch(`${API_BASE_URL}/reports`, {
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
    const newReport: DailyReport = {
      id: tempId,
      author: currentUser,
      reportType: reportData.reportType || 'weekly',
      date: reportData.date || new Date().toISOString().split('T')[0],
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

    // 週報・日報提出時のプッシュ通知送信 (下書き以外)
    if (newReport.status === 'submitted') {
      const typeLabel = newReport.reportType === 'weekly' ? '週報' : '日報';
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
        reportType: reportData.reportType || 'weekly',
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
        status: reportData.status || 'submitted',
        maintenanceData: (reportData as any).maintenanceData,
        constructionData: (reportData as any).constructionData,
        salesData: (reportData as any).salesData,
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
    setReports(prev => prev.map(r => r.id === id ? { ...r, ...reportData } : r));
    try {
      const payload = {
        ...reportData,
        id,
        author_id: (reportData.author && reportData.author.id) || currentUser.id,
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
  }, [currentUser, refetchReports]);

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
