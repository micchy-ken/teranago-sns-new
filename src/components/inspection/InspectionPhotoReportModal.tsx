import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Camera,
  Upload,
  Printer,
  Save,
  Trash2,
  Copy,
  Plus,
  FileText,
  Check,
  AlertCircle,
  Eye,
  Edit3,
  Calendar,
  Building2,
  MapPin,
  Wrench,
  Loader2,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { InspectionPhotoReport, PhotoReportItem, PhotoReportLayoutType } from '../../types/photoReport';
import { InspectionReportRecord } from '../../types/inspectionReport';
import { User } from '../../types';
import { API_BASE_URL } from '../../config/api';
import { compressImageToDataUrl } from '../../utils/imageCompressor';

interface InspectionPhotoReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  initialInspectionReport?: InspectionReportRecord | null;
  existingPhotoReport?: InspectionPhotoReport | null;
  onSaved?: (savedReport: InspectionPhotoReport) => void;
}

// クイック選択用工程タグ
const STAGE_PRESETS = [
  '取替前',
  '取替中',
  '取替後',
  '点検前',
  '点検中',
  '点検後',
  '施工前',
  '施工中',
  '施工後',
  '不具合状況',
  '是正完了',
];

export const InspectionPhotoReportModal: React.FC<InspectionPhotoReportModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  initialInspectionReport,
  existingPhotoReport,
  onSaved,
}) => {
  // 基本情報ステート
  const [reportId, setReportId] = useState<string>('');
  const [inspectionReportId, setInspectionReportId] = useState<string | null>(null);
  const [jobNo, setJobNo] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [buildingName, setBuildingName] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [workSubject, setWorkSubject] = useState<string>('');
  const [workDate, setWorkDate] = useState<string>('');
  const [layoutType, setLayoutType] = useState<PhotoReportLayoutType>('3_items');
  const [photos, setPhotos] = useState<PhotoReportItem[]>([]);

  // UI・操作ステート
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isUploadingIdx, setIsUploadingIdx] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // ファイルアップロード用Ref
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // 初期値セットアップ
  useEffect(() => {
    if (!isOpen) return;

    if (existingPhotoReport) {
      // 既存の写真報告書を編集
      setReportId(existingPhotoReport.id);
      setInspectionReportId(existingPhotoReport.inspectionReportId || null);
      setJobNo(existingPhotoReport.jobNo || '');
      setTitle(existingPhotoReport.title || '');
      setCustomerName(existingPhotoReport.customerName || '');
      setBuildingName(existingPhotoReport.buildingName || '');
      setLocation(existingPhotoReport.location || '');
      setWorkSubject(existingPhotoReport.workSubject || '');
      setWorkDate(existingPhotoReport.workDate || '');
      setLayoutType(existingPhotoReport.layoutType || '3_items');
      setPhotos(existingPhotoReport.photos || []);
    } else if (initialInspectionReport) {
      // 点検報告書から新規作成
      const rep = initialInspectionReport;
      const bName = rep.customerName || rep.address || '現場名未設定';
      const loc = rep.doors?.[0]?.location || '1階 エントランス';
      const subj = rep.contractType ? `${rep.contractType} 定期点検修理` : '自動ドア点検修理';
      
      let formattedDate = rep.inspectionDate || '';
      if (rep.inspectionDate && rep.inspectionDate.includes('-')) {
        const [y, m, d] = rep.inspectionDate.split('-');
        formattedDate = `${y}年${Number(m)}月${Number(d)}日`;
      }

      setReportId('');
      setInspectionReportId(rep.id);
      setJobNo(rep.jobNo || '');
      setTitle(`${bName} 写真報告書`);
      setCustomerName(rep.customerName || '');
      setBuildingName(bName);
      setLocation(loc);
      setWorkSubject(subj);
      setWorkDate(formattedDate);
      setLayoutType('3_items');

      // デフォルト3枚の枠を用意
      setPhotos([
        {
          id: `p_${Date.now()}_1`,
          imageUrl: '',
          buildingName: bName,
          location: loc,
          workSubject: subj,
          workDate: formattedDate,
          stageTitle: '点検前',
          comment: '',
        },
        {
          id: `p_${Date.now()}_2`,
          imageUrl: '',
          buildingName: bName,
          location: loc,
          workSubject: subj,
          workDate: formattedDate,
          stageTitle: '取替中',
          comment: '',
        },
        {
          id: `p_${Date.now()}_3`,
          imageUrl: '',
          buildingName: bName,
          location: loc,
          workSubject: subj,
          workDate: formattedDate,
          stageTitle: '取替後',
          comment: '',
        },
      ]);
    } else {
      // まったくの新規作成
      const today = new Date();
      const formattedDate = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
      
      setReportId('');
      setInspectionReportId(null);
      setJobNo('');
      setTitle('写真報告書');
      setCustomerName('');
      setBuildingName('');
      setLocation('');
      setWorkSubject('');
      setWorkDate(formattedDate);
      setLayoutType('3_items');

      setPhotos([
        {
          id: `p_${Date.now()}_1`,
          imageUrl: '',
          buildingName: '',
          location: '',
          workSubject: '',
          workDate: formattedDate,
          stageTitle: '取替前',
          comment: '',
        },
        {
          id: `p_${Date.now()}_2`,
          imageUrl: '',
          buildingName: '',
          location: '',
          workSubject: '',
          workDate: formattedDate,
          stageTitle: '取替中',
          comment: '',
        },
        {
          id: `p_${Date.now()}_3`,
          imageUrl: '',
          buildingName: '',
          location: '',
          workSubject: '',
          workDate: formattedDate,
          stageTitle: '取替後',
          comment: '',
        },
      ]);
    }
  }, [isOpen, existingPhotoReport, initialInspectionReport]);

  if (!isOpen) return null;

  // 写真スロット数に合わせた写真リストの調整
  const targetCount = layoutType === '2_items' ? 2 : layoutType === '4_items' ? 4 : 3;

  // 写真枠の追加
  const handleAddPhotoSlot = () => {
    if (photos.length >= 6) return;
    setPhotos([
      ...photos,
      {
        id: `p_${Date.now()}_${photos.length + 1}`,
        imageUrl: '',
        buildingName: photos[0]?.buildingName || buildingName,
        location: photos[0]?.location || location,
        workSubject: photos[0]?.workSubject || workSubject,
        workDate: photos[0]?.workDate || workDate,
        stageTitle: '作業中',
        comment: '',
      },
    ]);
  };

  // 写真枠の削除
  const handleRemovePhotoSlot = (index: number) => {
    if (photos.length <= 1) return;
    setPhotos(photos.filter((_, idx) => idx !== index));
  };

  // 写真単体の更新
  const handleUpdatePhoto = (index: number, fields: Partial<PhotoReportItem>) => {
    setPhotos(prev => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], ...fields };
      }
      return next;
    });
  };

  // 1枚目の共通項目を全写真枠に一括反映
  const handleCopyFirstPhotoInfoToAll = () => {
    if (photos.length === 0) return;
    const first = photos[0];
    setPhotos(prev =>
      prev.map((p, idx) => {
        if (idx === 0) return p;
        return {
          ...p,
          buildingName: first.buildingName,
          location: first.location,
          workSubject: first.workSubject,
          workDate: first.workDate,
        };
      })
    );
    setSuccessToast('1枚目の基本情報（現場名・場所・件名・日付）を全写真にコピーしました');
    setTimeout(() => setSuccessToast(null), 3000);
  };

  // 画像アップロード処理（長辺1200pxクライアント圧縮後に送信）
  const handleFileChange = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingIdx(index);
      setErrorMessage(null);

      // 1. クライアント側で長辺1200pxに圧縮 (JPEG品質0.85)
      const compressedDataUrl = await compressImageToDataUrl(file, {
        maxDimension: 1200,
        quality: 0.85,
      });

      // 2. サーバーのアップロードAPIへ送信（DataURLをBlobに変換）
      const response = await fetch(compressedDataUrl);
      const blob = await response.blob();
      const formData = new FormData();
      formData.append('photo', blob, `photo_${Date.now()}.jpg`);

      const uploadRes = await fetch(`${API_BASE_URL}/photo-reports/upload`, {
        method: 'POST',
        body: formData,
      });

      if (uploadRes.ok) {
        const data = await uploadRes.json();
        // サーバーURLまたはBase64をセット
        const finalUrl = data.fileUrl ? `${API_BASE_URL.replace('/api', '')}${data.fileUrl}` : compressedDataUrl;
        handleUpdatePhoto(index, { imageUrl: finalUrl });
      } else {
        // APIアップロードがフォールバック等の場合はBase64を直接保持
        handleUpdatePhoto(index, { imageUrl: compressedDataUrl });
      }
    } catch (err: any) {
      console.error('画像アップロードエラー:', err);
      // エラー時もBase64で直接保持
      try {
        const fallbackDataUrl = await compressImageToDataUrl(file, { maxDimension: 1200, quality: 0.85 });
        handleUpdatePhoto(index, { imageUrl: fallbackDataUrl });
      } catch (_) {
        setErrorMessage('画像の読み込み・圧縮に失敗しました');
      }
    } finally {
      setIsUploadingIdx(null);
      if (e.target) e.target.value = '';
    }
  };

  // 保存処理
  const handleSave = async () => {
    if (!title.trim()) {
      setErrorMessage('報告書タイトルを入力してください');
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage(null);

      const payload = {
        inspectionReportId: inspectionReportId || null,
        jobNo: jobNo.trim(),
        title: title.trim(),
        customerName: customerName.trim(),
        buildingName: buildingName.trim(),
        location: location.trim(),
        workSubject: workSubject.trim(),
        workDate: workDate.trim(),
        layoutType,
        photos,
        createdById: currentUser.id,
        createdByName: currentUser.name,
      };

      let savedData: InspectionPhotoReport;
      if (reportId) {
        // 更新
        const res = await fetch(`${API_BASE_URL}/photo-reports/${reportId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('保存に失敗しました');
        savedData = {
          ...payload,
          id: reportId,
          createdAt: existingPhotoReport?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      } else {
        // 新規作成
        const res = await fetch(`${API_BASE_URL}/photo-reports`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('保存に失敗しました');
        savedData = await res.json();
        setReportId(savedData.id);
      }

      setSuccessToast('写真報告書を保存しました');
      setTimeout(() => setSuccessToast(null), 3000);

      if (onSaved) {
        onSaved(savedData);
      }
    } catch (err: any) {
      console.error('写真報告書保存エラー:', err);
      setErrorMessage('写真報告書の保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  // 印刷・PDF出力
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      {/* 印刷用スタイル定義 */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #photo-report-print-area, #photo-report-print-area * {
            visibility: visible;
          }
          #photo-report-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 0;
            background: white !important;
          }
          @page {
            size: A4 portrait;
            margin: 8mm 10mm;
          }
        }
      `}</style>

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        
        {/* ============================================================ */}
        {/* モーダルヘッダー */}
        {/* ============================================================ */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-indigo-600/80 rounded-xl text-white shadow-xs">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold truncate">
                  {reportId ? '点検・写真報告書の編集' : '点検・写真報告書の新規作成'}
                </h2>
                {jobNo && (
                  <span className="text-xs px-2 py-0.5 rounded bg-indigo-900/90 text-indigo-200 border border-indigo-700 font-mono">
                    No. {jobNo}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                A4縦レイアウト（2〜4枚構成）/ 長辺1200px自動圧縮 / PDF印刷対応
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* 編集 / プレビュー 切り替えタブ */}
            <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => setActiveTab('edit')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  activeTab === 'edit'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>編集入力</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  activeTab === 'preview'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>帳票プレビュー</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl border border-slate-700 transition-colors shadow-xs cursor-pointer"
              title="A4サイズで印刷またはPDF出力"
            >
              <Printer className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">印刷 / PDF出力</span>
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>保存</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer ml-1"
              title="閉じる"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* トースト・アラート */}
        {errorMessage && (
          <div className="px-5 py-2.5 bg-rose-50 border-b border-rose-200 text-rose-700 text-xs font-bold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-700">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {successToast && (
          <div className="px-5 py-2 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successToast}</span>
          </div>
        )}

        {/* ============================================================ */}
        {/* モーダル本体 */}
        {/* ============================================================ */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100/70">
          {activeTab === 'edit' ? (
            <div className="max-w-4xl mx-auto space-y-6">
              
              {/* 1. 報告書基本情報 */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    報告書の基本情報
                  </h3>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-bold text-slate-500">レイアウト構成:</span>
                    <select
                      value={layoutType}
                      onChange={e => setLayoutType(e.target.value as PhotoReportLayoutType)}
                      className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 font-bold outline-none focus:border-indigo-500"
                    >
                      <option value="3_items">3枚構成 (標準・見本準拠)</option>
                      <option value="2_items">2枚構成 (大きめ表示)</option>
                      <option value="4_items">4枚構成</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      報告書タイトル <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="例: 名古屋プライムセントラルタワー 写真報告書"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      管理番号 / 作業No.
                    </label>
                    <input
                      type="text"
                      value={jobNo}
                      onChange={e => setJobNo(e.target.value)}
                      placeholder="例: 202609-001"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      現場名 / 物件名
                    </label>
                    <input
                      type="text"
                      value={buildingName}
                      onChange={e => setBuildingName(e.target.value)}
                      placeholder="例: 名古屋プライムセントラルタワー"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      取付場所 / 箇所
                    </label>
                    <input
                      type="text"
                      value={location}
                      onChange={e => setLocation(e.target.value)}
                      placeholder="例: 1階HUG北側"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      件名 / 工事点検内容
                    </label>
                    <input
                      type="text"
                      value={workSubject}
                      onChange={e => setWorkSubject(e.target.value)}
                      placeholder="例: 自動ドア補助センサー修理"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-xs"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="text-[11px] text-slate-400">
                    ※ 1枚目の写真情報にも自動的に適用されます
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyFirstPhotoInfoToAll}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-2xs"
                  >
                    <Copy className="w-3.5 h-3.5 text-amber-600" />
                    <span>1枚目の情報を他の全写真にコピー</span>
                  </button>
                </div>
              </div>

              {/* 2. 写真明細リスト */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Camera className="w-4 h-4 text-indigo-600" />
                    写真明細登録 ({photos.length}枠)
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddPhotoSlot}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-indigo-600" />
                    <span>写真枠を追加</span>
                  </button>
                </div>

                {photos.map((photo, index) => (
                  <div
                    key={photo.id || index}
                    className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                          {index + 1}
                        </span>
                        <h4 className="font-bold text-slate-800 text-sm">
                          写真 {index + 1}
                        </h4>
                        {photo.stageTitle && (
                          <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold border border-slate-200">
                            {photo.stageTitle}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {photos.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemovePhotoSlot(index)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="この写真枠を削除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                      {/* 写真アップロード / プレビュー (md: 5列) */}
                      <div className="md:col-span-5 flex flex-col">
                        <div className="relative aspect-4/3 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 overflow-hidden flex flex-col items-center justify-center group">
                          {photo.imageUrl ? (
                            <>
                              <img
                                src={photo.imageUrl}
                                alt={`写真${index + 1}`}
                                className="w-full h-full object-contain bg-slate-900"
                              />
                              <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => fileInputRefs.current[index]?.click()}
                                  className="px-3 py-1.5 bg-white/90 hover:bg-white text-slate-800 rounded-lg text-xs font-bold shadow-md cursor-pointer flex items-center gap-1.5"
                                >
                                  <Camera className="w-3.5 h-3.5 text-indigo-600" />
                                  <span>写真を変更</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUpdatePhoto(index, { imageUrl: '' })}
                                  className="px-3 py-1.5 bg-rose-600/90 hover:bg-rose-600 text-white rounded-lg text-xs font-bold shadow-md cursor-pointer flex items-center gap-1.5"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>削除</span>
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className="p-4 text-center">
                              {isUploadingIdx === index ? (
                                <div className="flex flex-col items-center gap-2 text-indigo-600">
                                  <Loader2 className="w-8 h-8 animate-spin" />
                                  <span className="text-xs font-bold">圧縮・アップロード中...</span>
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  <div className="w-12 h-12 mx-auto rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                    <Camera className="w-6 h-6" />
                                  </div>
                                  <div>
                                    <p className="text-xs font-bold text-slate-700">写真を登録</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">
                                      長辺1200pxに自動圧縮されます
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => fileInputRefs.current[index]?.click()}
                                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
                                  >
                                    <Upload className="w-3.5 h-3.5" />
                                    <span>写真を選択 / 撮影</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          <input
                            ref={el => {
                              fileInputRefs.current[index] = el;
                            }}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={e => handleFileChange(index, e)}
                            className="hidden"
                          />
                        </div>
                      </div>

                      {/* 写真情報・工程・コメント入力 (md: 7列) */}
                      <div className="md:col-span-7 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">
                              ① 現場名 / 物件名
                            </label>
                            <input
                              type="text"
                              value={photo.buildingName}
                              onChange={e => handleUpdatePhoto(index, { buildingName: e.target.value })}
                              placeholder="例: 名古屋プライムセントラルタワー"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 focus:border-indigo-500 outline-none text-xs"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">
                              ② 取付場所 / 箇所
                            </label>
                            <input
                              type="text"
                              value={photo.location}
                              onChange={e => handleUpdatePhoto(index, { location: e.target.value })}
                              placeholder="例: 1階HUG北側"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 focus:border-indigo-500 outline-none text-xs"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">
                              ③ 件名 / 内容
                            </label>
                            <input
                              type="text"
                              value={photo.workSubject}
                              onChange={e => handleUpdatePhoto(index, { workSubject: e.target.value })}
                              placeholder="例: 自動ドア補助センサー修理"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 focus:border-indigo-500 outline-none text-xs"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">
                              ④ 実施日
                            </label>
                            <input
                              type="text"
                              value={photo.workDate}
                              onChange={e => handleUpdatePhoto(index, { workDate: e.target.value })}
                              placeholder="例: 2026年9月18日"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 focus:border-indigo-500 outline-none text-xs"
                            />
                          </div>
                        </div>

                        {/* 工程・区分 */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            ⑤ 工程・区分 (例: 補助光線センサー　取替前)
                          </label>
                          <input
                            type="text"
                            value={photo.stageTitle}
                            onChange={e => handleUpdatePhoto(index, { stageTitle: e.target.value })}
                            placeholder="例: 補助光線センサー 取替前"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 focus:border-indigo-500 outline-none text-xs font-bold text-indigo-900 bg-indigo-50/40 mb-1.5"
                          />
                          <div className="flex flex-wrap gap-1">
                            {STAGE_PRESETS.map(preset => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => {
                                  // 既存の名称を残しつつ末尾を置換またはセット
                                  const current = photo.stageTitle.trim();
                                  if (!current) {
                                    handleUpdatePhoto(index, { stageTitle: preset });
                                  } else {
                                    // 接頭辞があれば保持 (例: "補助光線センサー 取替前" -> "補助光線センサー " + preset)
                                    const parts = current.split(/\s+/);
                                    if (parts.length > 1) {
                                      parts[parts.length - 1] = preset;
                                      handleUpdatePhoto(index, { stageTitle: parts.join('　') });
                                    } else {
                                      handleUpdatePhoto(index, { stageTitle: preset });
                                    }
                                  }
                                }}
                                className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-800 border border-slate-200 transition-colors cursor-pointer"
                              >
                                {preset}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* 自由コメント・メモ */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            ⑥ 自由コメント・メモ欄 (帳票右下の横罫線エリアに出力)
                          </label>
                          <textarea
                            value={photo.comment}
                            onChange={e => handleUpdatePhoto(index, { comment: e.target.value })}
                            rows={3}
                            placeholder="所見、作業状況、交換理由などを記載してください..."
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 focus:border-indigo-500 outline-none text-xs resize-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* ============================================================ */
            /* 帳票プレビュー (添付PDF完全準拠 A4縦レイアウト) */
            /* ============================================================ */
            <div className="flex flex-col items-center">
              <div className="mb-4 flex items-center gap-3">
                <span className="text-xs font-bold text-slate-600">
                  A4縦 印刷プレビュー (実寸比率)
                </span>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>この内容で印刷 / PDF保存</span>
                </button>
              </div>

              {/* A4 帳票コンテナ */}
              <div
                id="photo-report-print-area"
                className="w-full max-w-[210mm] min-h-[297mm] bg-white p-6 sm:p-8 shadow-xl border border-slate-300 mx-auto text-slate-900 font-sans flex flex-col justify-between"
                style={{ minHeight: '297mm' }}
              >
                {/* 各写真ブロック (3枚構成が標準) */}
                <div className="flex-1 flex flex-col justify-around gap-4">
                  {Array.from({ length: targetCount }).map((_, index) => {
                    const photo = photos[index];
                    const hasPhoto = Boolean(photo && (photo.imageUrl || photo.buildingName || photo.stageTitle));

                    if (!hasPhoto) {
                      // 余白枠 (添付見本準拠)
                      return (
                        <div
                          key={`empty_${index}`}
                          className="flex-1 border border-slate-400 p-2 flex items-center justify-center min-h-[75mm] bg-slate-50/50"
                        >
                          <div className="text-center text-slate-400 font-bold tracking-[1.5em] text-sm">
                            余　　　　白
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={photo.id || index}
                        className="flex-1 border border-slate-400 p-2.5 flex flex-row gap-4 min-h-[75mm]"
                      >
                        {/* 左側: 現場写真 */}
                        <div className="w-[52%] border border-slate-300 bg-slate-100 flex items-center justify-center overflow-hidden relative">
                          {photo.imageUrl ? (
                            <img
                              src={photo.imageUrl}
                              alt={photo.stageTitle || `写真${index + 1}`}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <div className="text-center text-slate-400 text-xs font-bold p-4">
                              <Camera className="w-8 h-8 mx-auto mb-1 text-slate-300" />
                              <span>(写真未登録)</span>
                            </div>
                          )}
                        </div>

                        {/* 右側: 5行ヘッダー ＋ ノート風横罫線コメント欄 */}
                        <div className="w-[48%] flex flex-col justify-between">
                          {/* 5行ヘッダー (中央揃え・下線付き) */}
                          <div className="space-y-1.5 text-center text-xs">
                            {/* 1. 現場名 */}
                            <div className="border-b border-slate-800 pb-0.5 font-bold tracking-wider text-slate-900 min-h-[1.5em]">
                              {photo.buildingName || buildingName || '　'}
                            </div>

                            {/* 2. 取付場所 */}
                            <div className="border-b border-slate-800 pb-0.5 font-bold text-slate-800 min-h-[1.5em]">
                              {photo.location || location || '　'}
                            </div>

                            {/* 3. 件名 */}
                            <div className="border-b border-slate-800 pb-0.5 font-bold text-slate-800 min-h-[1.5em]">
                              {photo.workSubject || workSubject || '　'}
                            </div>

                            {/* 4. 実施日 */}
                            <div className="border-b border-slate-800 pb-0.5 text-slate-800 min-h-[1.5em]">
                              {photo.workDate || workDate || '　'}
                            </div>

                            {/* 5. 工程・区分 (強調下線) */}
                            <div className="border-b-2 border-slate-900 pb-1 font-extrabold text-sm text-slate-950 min-h-[1.6em] tracking-wide">
                              {photo.stageTitle || '　'}
                            </div>
                          </div>

                          {/* ノート風横罫線コメントエリア */}
                          <div className="mt-3 flex-1 flex flex-col justify-between min-h-[30mm] border-t border-slate-300 pt-1">
                            {photo.comment ? (
                              <div className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed px-1">
                                {photo.comment}
                              </div>
                            ) : (
                              // 空白時のノート罫線演出
                              <div className="w-full h-full flex flex-col justify-between py-1 opacity-40">
                                <div className="border-b border-slate-300 w-full h-4" />
                                <div className="border-b border-slate-300 w-full h-4" />
                                <div className="border-b border-slate-300 w-full h-4" />
                                <div className="border-b border-slate-300 w-full h-4" />
                                <div className="border-b border-slate-300 w-full h-4" />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* モーダルフッター */}
        {/* ============================================================ */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500">
            作成者: <span className="font-bold text-slate-700">{currentUser.name}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-300 transition-colors cursor-pointer"
            >
              閉じる
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>報告書を保存</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
