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
  Sparkles,
  RotateCw,
  RotateCcw,
  Clipboard,
  Images,
  Layers
} from 'lucide-react';
import { InspectionPhotoReport, PhotoReportItem, PhotoReportLayoutType } from '../../types/photoReport';
import { InspectionReportRecord } from '../../types/inspectionReport';
import { User } from '../../types';
import { API_BASE_URL } from '../../config/api';
import { compressImageToDataUrl, rotateImage } from '../../utils/imageCompressor';

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
  const [isLoadingExisting, setIsLoadingExisting] = useState<boolean>(false);
  const [historyReports, setHistoryReports] = useState<InspectionPhotoReport[]>([]);
  const [isUploadingIdx, setIsUploadingIdx] = useState<number | null>(null);
  const [isRotatingIdx, setIsRotatingIdx] = useState<number | null>(null);
  const [isBulkUploading, setIsBulkUploading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // ファイルアップロード用Ref
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const bulkFileInputRef = useRef<HTMLInputElement | null>(null);

  // 報告書データをフォームステートに適用する関数
  const applyReportToState = (rep: InspectionPhotoReport) => {
    setReportId(rep.id);
    setInspectionReportId(rep.inspectionReportId || null);
    setJobNo(rep.jobNo || '');
    setTitle(rep.title || '');
    setCustomerName(rep.customerName || '');
    setBuildingName(rep.buildingName || '');
    setLocation(rep.location || '');
    setWorkSubject(rep.workSubject || '');
    setWorkDate(rep.workDate || '');
    setLayoutType(rep.layoutType || '3_items');
    setPhotos(Array.isArray(rep.photos) ? rep.photos : []);
  };

  // 初期値セットアップ ＆ APIからの自動復元
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    const loadData = async () => {
      if (existingPhotoReport) {
        // 1. propsで直接写真報告書が渡された場合
        applyReportToState(existingPhotoReport);
        setHistoryReports([existingPhotoReport]);
      } else if (initialInspectionReport) {
        // 2. 点検報告書から開かれた場合 -> まずサーバーから作成済み写真報告書を検索
        const rep = initialInspectionReport;
        setIsLoadingExisting(true);

        try {
          // inspectionReportId で検索
          let queryUrl = `${API_BASE_URL}/photo-reports?inspectionReportId=${encodeURIComponent(rep.id)}`;
          let res = await fetch(queryUrl);
          let matchedList: InspectionPhotoReport[] = res.ok ? await res.json() : [];

          // 見つからず jobNo がある場合は jobNo でも検索
          if (matchedList.length === 0 && rep.jobNo) {
            queryUrl = `${API_BASE_URL}/photo-reports?jobNo=${encodeURIComponent(rep.jobNo)}`;
            res = await fetch(queryUrl);
            if (res.ok) {
              matchedList = await res.json();
            }
          }

          if (!isMounted) return;

          if (matchedList && matchedList.length > 0) {
            // 作成済みの写真報告書が存在する場合 -> 最新のものを自動復元！
            setHistoryReports(matchedList);
            applyReportToState(matchedList[0]);
          } else {
            // まだ作成されていない場合 -> 点検報告書から新規初期値を生成
            setHistoryReports([]);
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
          }
        } catch (err) {
          console.error('既存写真報告書取得エラー:', err);
        } finally {
          if (isMounted) setIsLoadingExisting(false);
        }
      } else {
        // 3. まったくの新規作成
        setHistoryReports([]);
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
    };

    loadData();

    return () => {
      isMounted = false;
    };
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

  // 写真の回転処理 (90度 / -90度)
  const handleRotatePhoto = async (index: number, degrees: number) => {
    const photo = photos[index];
    if (!photo || !photo.imageUrl) return;

    try {
      setIsRotatingIdx(index);
      setErrorMessage(null);

      // Canvas で回転させた Base64 DataURL を取得
      const rotatedDataUrl = await rotateImage(photo.imageUrl, degrees, 0.85);

      // サーバーへ回転後画像をアップロードしてURL更新を試みる
      try {
        const response = await fetch(rotatedDataUrl);
        const blob = await response.blob();
        const formData = new FormData();
        formData.append('photo', blob, `rotated_${Date.now()}.jpg`);

        const uploadRes = await fetch(`${API_BASE_URL}/photo-reports/upload`, {
          method: 'POST',
          body: formData,
        });

        if (uploadRes.ok) {
          const data = await uploadRes.json();
          const finalUrl = data.fileUrl ? `${API_BASE_URL.replace('/api', '')}${data.fileUrl}` : rotatedDataUrl;
          handleUpdatePhoto(index, { imageUrl: finalUrl });
        } else {
          handleUpdatePhoto(index, { imageUrl: rotatedDataUrl });
        }
      } catch (_) {
        handleUpdatePhoto(index, { imageUrl: rotatedDataUrl });
      }

      setSuccessToast(`写真${index + 1}を${degrees > 0 ? '右' : '左'}に90°回転しました`);
      setTimeout(() => setSuccessToast(null), 2500);
    } catch (err: any) {
      console.error('写真回転エラー:', err);
      setErrorMessage('写真の回転に失敗しました');
    } finally {
      setIsRotatingIdx(null);
    }
  };

  // 複数写真の一括アップロード・流し込み処理
  const handleBulkUploadFiles = async (fileList: FileList | File[]) => {
    const rawFiles = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    if (rawFiles.length === 0) {
      setErrorMessage('選択されたファイルに画像が含まれていません');
      return;
    }

    try {
      setIsBulkUploading(true);
      setErrorMessage(null);

      // 現在の写真リストをコピー
      let updatedPhotos = [...photos];
      let currentEmptyIdx = 0;

      for (let i = 0; i < rawFiles.length; i++) {
        const file = rawFiles[i];
        
        // 1. 長辺1200pxに圧縮
        const compressedDataUrl = await compressImageToDataUrl(file, {
          maxDimension: 1200,
          quality: 0.85,
        });

        // 2. サーバーへアップロード
        let finalUrl = compressedDataUrl;
        try {
          const res = await fetch(compressedDataUrl);
          const blob = await res.blob();
          const formData = new FormData();
          formData.append('photo', blob, `bulk_photo_${Date.now()}_${i}.jpg`);

          const uploadRes = await fetch(`${API_BASE_URL}/photo-reports/upload`, {
            method: 'POST',
            body: formData,
          });

          if (uploadRes.ok) {
            const data = await uploadRes.json();
            if (data.fileUrl) {
              finalUrl = `${API_BASE_URL.replace('/api', '')}${data.fileUrl}`;
            }
          }
        } catch (_) {
          finalUrl = compressedDataUrl;
        }

        // 3. 空いているスロット（imageUrlが未設定の枠）を探す
        while (currentEmptyIdx < updatedPhotos.length && updatedPhotos[currentEmptyIdx].imageUrl) {
          currentEmptyIdx++;
        }

        if (currentEmptyIdx < updatedPhotos.length) {
          // 既存の空枠にセット
          updatedPhotos[currentEmptyIdx] = {
            ...updatedPhotos[currentEmptyIdx],
            imageUrl: finalUrl,
          };
          currentEmptyIdx++;
        } else if (updatedPhotos.length < 6) {
          // スロットが足りない場合は新規枠を追加（最大6枠）
          const first = updatedPhotos[0];
          const newSlot: PhotoReportItem = {
            id: `p_${Date.now()}_${updatedPhotos.length + 1}`,
            imageUrl: finalUrl,
            buildingName: first?.buildingName || buildingName,
            location: first?.location || location,
            workSubject: first?.workSubject || workSubject,
            workDate: first?.workDate || workDate,
            stageTitle: STAGE_PRESETS[updatedPhotos.length] || '作業中',
            comment: '',
          };
          updatedPhotos.push(newSlot);
          currentEmptyIdx = updatedPhotos.length;
        } else {
          // 枠上限到達
          break;
        }
      }

      setPhotos(updatedPhotos);
      setSuccessToast(`${rawFiles.length}枚の写真を一括貼付け・登録しました`);
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err: any) {
      console.error('一括アップロードエラー:', err);
      setErrorMessage('写真の一括登録に失敗しました');
    } finally {
      setIsBulkUploading(false);
      if (bulkFileInputRef.current) bulkFileInputRef.current.value = '';
    }
  };

  // クリップボードからの画像貼り付けボタンハンドラー
  const handlePasteFromClipboard = async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) {
        setErrorMessage('お使いのブラウザはクリップボード読取に対応していません。Ctrl+V / Cmd+Vキーをお試しください');
        return;
      }
      const clipboardItems = await navigator.clipboard.read();
      const imageFiles: File[] = [];

      for (const item of clipboardItems) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const file = new File([blob], `pasted_${Date.now()}.png`, { type: imageType });
          imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        await handleBulkUploadFiles(imageFiles);
      } else {
        setErrorMessage('クリップボードに画像が見つかりませんでした。画像をコピーした状態でお試しください');
      }
    } catch (err: any) {
      console.warn('クリップボード読取失敗:', err);
      setErrorMessage('クリップボードの読み取り許可がないか、画像がありません。Ctrl+V / Cmd+V での直接貼付けもお試しください');
    }
  };

  // グローバルペーストイベント（Ctrl+V / Cmd+V）のハンドリング
  useEffect(() => {
    if (!isOpen || activeTab !== 'edit') return;

    const onGlobalPaste = (e: ClipboardEvent) => {
      // テキストエリアや入力欄にフォーカスがある通常のテキスト入力時は妨害しない
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        // もし画像が含まれていれば画像貼り付けを優先
        if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
          const files = Array.from(e.clipboardData.files).filter(f => f.type.startsWith('image/'));
          if (files.length > 0) {
            e.preventDefault();
            handleBulkUploadFiles(files);
            return;
          }
        }
        return;
      }

      if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
        const files = Array.from(e.clipboardData.files).filter(f => f.type.startsWith('image/'));
        if (files.length > 0) {
          e.preventDefault();
          handleBulkUploadFiles(files);
        }
      }
    };

    window.addEventListener('paste', onGlobalPaste);
    return () => {
      window.removeEventListener('paste', onGlobalPaste);
    };
  }, [isOpen, activeTab, photos, buildingName, location, workSubject, workDate]);

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

      setHistoryReports(prev => {
        const existingIdx = prev.findIndex(r => r.id === savedData.id);
        if (existingIdx >= 0) {
          const next = [...prev];
          next[existingIdx] = savedData;
          return next;
        }
        return [savedData, ...prev];
      });

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
          {isLoadingExisting ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-indigo-600">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="text-xs font-bold">作成済みの写真報告書を確認中...</span>
            </div>
          ) : activeTab === 'edit' ? (
            <div className="max-w-4xl mx-auto space-y-6">

              {/* 既存の写真報告書が複数ある場合、または作成済みの切り替えバー */}
              {historyReports.length > 0 && (
                <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span className="text-xs font-bold text-indigo-950">
                      作成済みの写真報告書 ({historyReports.length}件):
                    </span>
                    <select
                      value={reportId}
                      onChange={e => {
                        const target = historyReports.find(r => r.id === e.target.value);
                        if (target) applyReportToState(target);
                      }}
                      className="px-2.5 py-1 rounded-lg border border-indigo-300 bg-white text-xs font-bold text-indigo-900 outline-none focus:ring-2 focus:ring-indigo-500 max-w-[260px] truncate"
                    >
                      {historyReports.map(hr => (
                        <option key={hr.id} value={hr.id}>
                          {hr.title} ({new Date(hr.updatedAt || hr.createdAt).toLocaleDateString('ja-JP')})
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      // 新規別枠で作成
                      if (initialInspectionReport) {
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
                      }
                    }}
                    className="px-3 py-1 bg-white hover:bg-indigo-100 text-indigo-700 border border-indigo-300 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 inline-flex items-center gap-1 shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>新しく別の写真報告書を作成</span>
                  </button>
                </div>
              )}
              
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <Camera className="w-4 h-4 text-indigo-600 shrink-0" />
                    <h3 className="text-sm font-bold text-slate-800">
                      写真明細登録 ({photos.length}枠)
                    </h3>
                    <span className="text-[11px] text-slate-400 hidden md:inline">
                      (ドラッグ＆ドロップまたは Ctrl+V で直接貼付け可能)
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* 複数写真の一括選択 */}
                    <button
                      type="button"
                      onClick={() => bulkFileInputRef.current?.click()}
                      disabled={isBulkUploading}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-2xs"
                      title="複数の写真をまとめて選択して順番に自動配置します"
                    >
                      {isBulkUploading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                      ) : (
                        <Images className="w-3.5 h-3.5 text-indigo-600" />
                      )}
                      <span>{isBulkUploading ? '一括処理中...' : '複数写真を一括選択'}</span>
                    </button>

                    {/* クリップボード貼付け */}
                    <button
                      type="button"
                      onClick={handlePasteFromClipboard}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-2xs"
                      title="コピーした画像をクリップボードから貼り付けます (Ctrl+Vも対応)"
                    >
                      <Clipboard className="w-3.5 h-3.5 text-slate-600" />
                      <span>クリップボード貼付け</span>
                    </button>

                    {/* 写真枠を追加 */}
                    <button
                      type="button"
                      onClick={handleAddPhotoSlot}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>写真枠を追加</span>
                    </button>

                    {/* 隠し一括ファイル選択input */}
                    <input
                      ref={bulkFileInputRef}
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={e => {
                        if (e.target.files && e.target.files.length > 0) {
                          handleBulkUploadFiles(e.target.files);
                        }
                      }}
                      className="hidden"
                    />
                  </div>
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
                      <div className="md:col-span-5 flex flex-col space-y-2">
                        <div
                          onDragOver={e => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onDrop={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                              const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
                              if (files.length === 1) {
                                handleFileChange(index, { target: { files: [files[0]] } } as any);
                              } else if (files.length > 1) {
                                handleBulkUploadFiles(files);
                              }
                            }
                          }}
                          className="relative aspect-4/3 rounded-xl border-2 border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50 overflow-hidden flex flex-col items-center justify-center transition-colors"
                        >
                          {photo.imageUrl ? (
                            <>
                              <img
                                src={photo.imageUrl}
                                alt={`写真${index + 1}`}
                                className="w-full h-full object-contain bg-slate-900"
                              />

                              {/* 回転中・アップロード中インジケーター */}
                              {(isRotatingIdx === index || isUploadingIdx === index) && (
                                <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-xs flex flex-col items-center justify-center gap-2 text-white">
                                  <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
                                  <span className="text-xs font-bold">
                                    {isRotatingIdx === index ? '画像を回転中...' : '画像を処理中...'}
                                  </span>
                                </div>
                              )}
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
                                  <div className="w-12 h-12 mx-auto rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-2xs">
                                    <Camera className="w-6 h-6" />
                                  </div>
                                  <div>
                                    <p className="text-xs font-bold text-slate-700">写真を登録</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">
                                      ドラッグ＆ドロップ または 選択
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

                        {/* 写真登録済みの時の操作ツールバー（回転・変更・削除） */}
                        {photo.imageUrl && (
                          <div className="flex items-center justify-between gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleRotatePhoto(index, -90)}
                                disabled={isRotatingIdx === index}
                                className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold border border-slate-300 shadow-2xs transition-colors cursor-pointer"
                                title="左に90度回転"
                              >
                                <RotateCcw className="w-3.5 h-3.5 text-indigo-600" />
                                <span className="hidden sm:inline">左90°</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRotatePhoto(index, 90)}
                                disabled={isRotatingIdx === index}
                                className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold border border-slate-300 shadow-2xs transition-colors cursor-pointer"
                                title="右に90度回転"
                              >
                                <RotateCw className="w-3.5 h-3.5 text-indigo-600" />
                                <span className="hidden sm:inline">右90°</span>
                              </button>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => fileInputRefs.current[index]?.click()}
                                className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold border border-slate-300 shadow-2xs transition-colors cursor-pointer"
                                title="写真を撮り直す・別の写真に変更"
                              >
                                <Camera className="w-3.5 h-3.5 text-slate-600" />
                                <span>変更</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdatePhoto(index, { imageUrl: '' })}
                                className="flex items-center gap-1 p-1 bg-white hover:bg-rose-50 text-rose-600 rounded-lg text-xs font-bold border border-slate-300 shadow-2xs transition-colors cursor-pointer"
                                title="この写真を削除"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
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
