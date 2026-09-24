import React, { useState, useEffect } from 'react';
import { 
  InspectionReportRecord, 
  InspectionDoorReport, 
  JUDGEMENT_OPTIONS,
  InspectionJudgementCode,
  InspectionCheckCategoryDef,
  InspectionCheckItemDef
} from '../../types/inspectionReport';
import { 
  createDefaultDoorReport, 
  createDefaultCheckResults 
} from '../../utils/inspectionReportStorage';
import {
  getInspectionMasterCategories,
  getInspectionMasterItems,
  INSPECTION_MASTER_EVENT
} from '../../utils/inspectionMasterStorage';
import { SignaturePad } from './SignaturePad';
import { InspectionReportPrintView } from './InspectionReportPrintView';
import { 
  X, 
  Save, 
  CheckCircle2, 
  FileText, 
  Plus, 
  Trash2, 
  Sparkles, 
  PenTool, 
  Eye, 
  Clock, 
  Building2, 
  AlertCircle 
} from 'lucide-react';

interface InspectionReportEditorModalProps {
  initialReport: InspectionReportRecord;
  onSave: (report: InspectionReportRecord) => void;
  onClose: () => void;
}

export const InspectionReportEditorModal: React.FC<InspectionReportEditorModalProps> = ({
  initialReport,
  onSave,
  onClose,
}) => {
  const [report, setReport] = useState<InspectionReportRecord>(initialReport);
  const [selectedDoorIndex, setSelectedDoorIndex] = useState<number>(0);
  const [isSignatureOpen, setIsSignatureOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // 動的マスター（カテゴリと項目）
  const [masterCategories, setMasterCategories] = useState<InspectionCheckCategoryDef[]>(() => getInspectionMasterCategories());
  const [masterItems, setMasterItems] = useState<InspectionCheckItemDef[]>(() => getInspectionMasterItems(false));

  useEffect(() => {
    const handleMasterChange = () => {
      setMasterCategories(getInspectionMasterCategories());
      setMasterItems(getInspectionMasterItems(false));
    };
    window.addEventListener(INSPECTION_MASTER_EVENT, handleMasterChange);
    return () => window.removeEventListener(INSPECTION_MASTER_EVENT, handleMasterChange);
  }, []);

  const doors = report.doors || [];
  const currentDoor: InspectionDoorReport = doors[selectedDoorIndex] || doors[0] || createDefaultDoorReport(1);

  // 扉情報の更新
  const updateCurrentDoor = (fields: Partial<InspectionDoorReport>) => {
    const updatedDoors = [...doors];
    if (updatedDoors[selectedDoorIndex]) {
      updatedDoors[selectedDoorIndex] = {
        ...updatedDoors[selectedDoorIndex],
        ...fields,
      };
      setReport({ ...report, doors: updatedDoors });
    }
  };

  // 全項目を「良好(V)」にするワンタップ機能
  const handleSetAllToGood = () => {
    const newResults = createDefaultCheckResults();
    updateCurrentDoor({ checkResults: newResults });
    showToast('この扉の全項目を「良好 (V)」にリセットしました');
  };

  // 個別チェック項目の判定切り替え
  const handleSetJudgement = (itemKey: string, code: InspectionJudgementCode) => {
    const currentResults = { ...(currentDoor.checkResults || {}) };
    currentResults[itemKey] = code;
    updateCurrentDoor({ checkResults: currentResults });
  };

  // 扉を追加
  const handleAddDoor = () => {
    const nextIdx = doors.length + 1;
    const newDoor = createDefaultDoorReport(nextIdx, '', `扉 ${nextIdx}`, '');
    setReport({
      ...report,
      doors: [...doors, newDoor],
      totalDoorsCount: doors.length + 1,
    });
    setSelectedDoorIndex(doors.length);
  };

  // 扉を削除
  const handleDeleteDoor = (index: number) => {
    if (doors.length <= 1) {
      alert('最低1台の扉データが必要です。');
      return;
    }
    if (confirm(`扉 ${index + 1} を削除してもよろしいですか？`)) {
      const filtered = doors.filter((_, i) => i !== index).map((d, i) => ({ ...d, doorIndex: i + 1 }));
      setReport({
        ...report,
        doors: filtered,
        totalDoorsCount: filtered.length,
      });
      setSelectedDoorIndex(Math.max(0, index - 1));
    }
  };

  const showToast = (msg: string) => {
    setSaveToast(msg);
    setTimeout(() => setSaveToast(null), 3000);
  };

  // 下書き保存
  const handleSaveDraft = () => {
    const updated: InspectionReportRecord = {
      ...report,
      status: report.customerSignature ? 'signed' : 'draft',
      updatedAt: new Date().toISOString(),
    };
    onSave(updated);
    showToast('下書きを保存しました');
  };

  // お客様サインの確定
  const handleSignatureComplete = (signatureBase64: string) => {
    const updated: InspectionReportRecord = {
      ...report,
      customerSignature: signatureBase64,
      signedAt: new Date().toISOString(),
      status: 'signed',
      updatedAt: new Date().toISOString(),
    };
    setReport(updated);
    setIsSignatureOpen(false);
    onSave(updated);
    showToast('お客様サインを受領し、点検報告書を完了として保存しました！');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex justify-center p-2 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-slate-50 rounded-2xl shadow-2xl border border-slate-200 max-w-5xl w-full my-auto flex flex-col max-h-[94vh] overflow-hidden">
        {/* トップバー */}
        <div className="px-4 sm:px-6 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span className="p-1.5 rounded-lg bg-indigo-500/30 text-indigo-300 border border-indigo-400/30">
              <FileText className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold truncate">
                  {report.customerName || '新規点検報告書'}
                </h2>
                {report.status === 'signed' ? (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    サイン受領済
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/40 rounded-full">
                    下書き
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400 flex items-center gap-2 truncate">
                <span>作業No: {report.jobNo || '未割当'}</span>
                <span>•</span>
                <span>実施日: {report.inspectionDate}</span>
                <span>•</span>
                <span>担当: {report.inspectorName}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPreviewOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition-colors cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">帳票プレビュー</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* トーストメッセージ */}
        {saveToast && (
          <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-bold flex items-center justify-between shadow-xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>{saveToast}</span>
            </div>
          </div>
        )}

        {/* メインスクロールエリア */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* ① 基本情報ヘッダーカード */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-800">
                <Building2 className="w-4 h-4 text-indigo-600" />
                <span>現場・作業ヘッダー情報</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">区分:</span>
                <select
                  value={report.category}
                  onChange={(e) => setReport({ ...report, category: e.target.value as any })}
                  className="text-xs border border-slate-300 rounded px-2 py-1 bg-slate-50 font-bold text-slate-700"
                >
                  <option value="maintenance">保守点検 (ST)</option>
                  <option value="warranty">保証期間</option>
                  <option value="spot">スポット点検</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-slate-500 font-bold mb-1">お客様名</label>
                <input
                  type="text"
                  value={report.customerName}
                  onChange={(e) => setReport({ ...report, customerName: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-slate-800 font-bold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-slate-500 font-bold mb-1">作業No (受付番号)</label>
                <input
                  type="text"
                  value={report.jobNo}
                  onChange={(e) => setReport({ ...report, jobNo: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-slate-500 font-bold mb-1">点検時間 (開始 ～ 終了)</label>
                <div className="flex items-center gap-1">
                  <input
                    type="time"
                    value={report.startTime}
                    onChange={(e) => setReport({ ...report, startTime: e.target.value })}
                    className="w-full px-2 py-1 border border-slate-300 rounded-lg font-mono text-center text-slate-800"
                  />
                  <span className="text-slate-400">～</span>
                  <input
                    type="time"
                    value={report.endTime}
                    onChange={(e) => setReport({ ...report, endTime: e.target.value })}
                    className="w-full px-2 py-1 border border-slate-300 rounded-lg font-mono text-center text-slate-800"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-500 font-bold mb-1">主点検員 / 同行者</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={report.inspectorName}
                    onChange={(e) => setReport({ ...report, inspectorName: e.target.value })}
                    className="w-1/2 px-2 py-1.5 border border-slate-300 rounded-lg font-bold text-slate-800 bg-white"
                    placeholder="主担当"
                  />
                  <input
                    type="text"
                    value={report.subInspectorName || ''}
                    onChange={(e) => setReport({ ...report, subInspectorName: e.target.value })}
                    className="w-1/2 px-2 py-1.5 border border-slate-300 rounded-lg text-slate-800 bg-white"
                    placeholder="同行・補助"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-slate-500 font-bold mb-1 text-xs">ご住所</label>
              <input
                type="text"
                value={report.address}
                onChange={(e) => setReport({ ...report, address: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-800 bg-white"
                placeholder="現場住所を入力"
              />
            </div>
          </div>

          {/* ② 扉切り替えタブ & 台数管理 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
                {doors.map((door, idx) => (
                  <button
                    key={door.doorIndex}
                    type="button"
                    onClick={() => setSelectedDoorIndex(idx)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                      selectedDoorIndex === idx
                        ? 'bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-200'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>扉 {idx + 1}</span>
                    {door.location && (
                      <span className={`text-[10px] px-1.5 py-0.2 rounded font-normal ${
                        selectedDoorIndex === idx ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {door.location}
                      </span>
                    )}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={handleAddDoor}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
                  title="扉（台数）を追加"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>扉追加</span>
                </button>
              </div>

              {doors.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleDeleteDoor(selectedDoorIndex)}
                  className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2 py-1 rounded transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>この扉を削除</span>
                </button>
              )}
            </div>

            {/* 現在選択中の扉スペック入力 */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-slate-500 font-bold mb-1">扉No (建具番号)</label>
                  <input
                    type="text"
                    value={currentDoor.doorNumber}
                    onChange={(e) => updateCurrentDoor({ doorNumber: e.target.value })}
                    placeholder="例: 247653"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono font-bold text-slate-800 bg-slate-50/50"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1">設置場所</label>
                  <input
                    type="text"
                    value={currentDoor.location}
                    onChange={(e) => updateCurrentDoor({ location: e.target.value })}
                    placeholder="例: 正面玄関 / 風除室 外側"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-bold text-slate-800 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1">機種 (型式)</label>
                  <input
                    type="text"
                    value={currentDoor.model}
                    onChange={(e) => updateCurrentDoor({ model: e.target.value })}
                    placeholder="例: 100KLCM / TAS-EB-15T"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono font-bold text-indigo-700 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1">開閉回数</label>
                  <input
                    type="text"
                    value={currentDoor.openCount}
                    onChange={(e) => updateCurrentDoor({ openCount: e.target.value })}
                    placeholder="例: 42,639"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono font-bold text-slate-900 bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1 border-t border-slate-100">
                <div>
                  <label className="block text-slate-500 font-medium mb-1">開速度 (0-9)</label>
                  <input
                    type="text"
                    value={currentDoor.openSpeed}
                    onChange={(e) => updateCurrentDoor({ openSpeed: e.target.value })}
                    className="w-full px-2 py-1 border border-slate-300 rounded font-mono text-center font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-medium mb-1">閉速度 (0-9)</label>
                  <input
                    type="text"
                    value={currentDoor.closeSpeed}
                    onChange={(e) => updateCurrentDoor({ closeSpeed: e.target.value })}
                    className="w-full px-2 py-1 border border-slate-300 rounded font-mono text-center font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-medium mb-1">タイマー (秒)</label>
                  <input
                    type="text"
                    value={currentDoor.timerSeconds}
                    onChange={(e) => updateCurrentDoor({ timerSeconds: e.target.value })}
                    className="w-full px-2 py-1 border border-slate-300 rounded font-mono text-center font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-medium mb-1">有効開口幅 (mm)</label>
                  <input
                    type="text"
                    value={currentDoor.sensorWidth}
                    onChange={(e) => updateCurrentDoor({ sensorWidth: e.target.value })}
                    className="w-full px-2 py-1 border border-slate-300 rounded font-mono text-center font-bold"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ③ 点検チェックリスト（判定操作） */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            {/* チェックリスト上部アクションバー */}
            <div className="px-4 py-3 bg-slate-100/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  扉 {selectedDoorIndex + 1} の点検チェックリスト
                </span>
                <span className="text-[11px] text-slate-500">
                  （各ボタンをタップして判定を変更できます）
                </span>
              </div>

              {/* ワンタップ全良好ボタン */}
              <button
                type="button"
                onClick={handleSetAllToGood}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-2xs transition-all cursor-pointer"
                title="この扉のすべての項目を良好(V)に一括設定します"
              >
                <Sparkles className="w-3.5 h-3.5" />
                全項目を一括で「良好(V)」にする
              </button>
            </div>

            {/* カテゴリごとの項目リスト */}
            <div className="p-4 space-y-5">
              {masterCategories.map((category) => {
                const items = masterItems.filter((i) => i.category === category.id);
                if (items.length === 0) return null;
                return (
                  <div key={category.id} className="space-y-2">
                    <div className="text-xs font-bold text-indigo-900 border-l-4 border-indigo-600 pl-2 bg-indigo-50/50 py-1 rounded-r">
                      {category.name}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {items.map((item) => {
                        const currentVal = currentDoor.checkResults?.[item.key] || 'V';
                        return (
                          <div
                            key={item.key}
                            className="p-2 bg-slate-50 hover:bg-slate-100/80 rounded-lg border border-slate-200/80 flex items-center justify-between gap-2 text-xs"
                          >
                            <span className="text-slate-800 font-medium truncate">
                              {item.label}
                            </span>
                            {/* 判定ピルボタン群（横スクロール可能） */}
                            <div className="flex items-center gap-1 shrink-0 overflow-x-auto py-0.5">
                              {['V', 'A', 'T', 'C', '△', '×', '－'].map((code) => {
                                const isSelected = currentVal === code;
                                const opt = JUDGEMENT_OPTIONS.find((o) => o.code === code);
                                return (
                                  <button
                                    key={code}
                                    type="button"
                                    onClick={() => handleSetJudgement(item.key, code as InspectionJudgementCode)}
                                    className={`w-6 h-6 rounded text-[11px] font-black transition-all cursor-pointer flex items-center justify-center ${
                                      isSelected
                                        ? 'bg-slate-900 text-white shadow-xs scale-110 ring-2 ring-indigo-400'
                                        : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-200'
                                    }`}
                                    title={`${code}: ${opt?.label || ''}`}
                                  >
                                    {code}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ④ センサー検出範囲 & 所見 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* センサーチェック */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
              <div className="font-bold text-xs text-slate-800 border-b border-slate-100 pb-1.5 flex items-center justify-between">
                <span>センサー検出範囲チェック (扉 {selectedDoorIndex + 1})</span>
                <span className="text-[10px] text-slate-400">JADA自動ドア規格準拠</span>
              </div>
              <div className="space-y-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={currentDoor.outerSensorWidthOk}
                    onChange={(e) => updateCurrentDoor({ outerSensorWidthOk: e.target.checked })}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-slate-700">外部センサー: 幅・奥行・直近検出 正常 (○)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={currentDoor.innerSensorWidthOk}
                    onChange={(e) => updateCurrentDoor({ innerSensorWidthOk: e.target.checked })}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-slate-700">内部センサー: 幅・奥行・直近検出 正常 (○)</span>
                </label>
              </div>
            </div>

            {/* 所見・特記事項 */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
              <div className="font-bold text-xs text-slate-800 border-b border-slate-100 pb-1.5 flex items-center justify-between">
                <span>点検結果・所見・総合特記事項</span>
                <span className="text-[10px] text-slate-400">ワンタップで定型文を挿入</span>
              </div>
              
              {/* 定型文クイック挿入チップ */}
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {[
                  '定期点検完了：各部機構動作およびセンサー検出範囲ともに良好です。',
                  '開閉速度および開放タイマーを調整し、正常動作を確認いたしました。',
                  '異音を確認、各部清掃および給油注油を実施し、動作良好となりました。',
                  'ベルトに軽微な摩耗あり。次回点検時の消耗品交換を推奨いたします。',
                  '吊車の摩耗を確認。現状動作に支障ありませんが経過観察といたします。',
                  '補助光線センサーの受光レンズ部を清掃し、正常検出を確認いたしました。',
                ].map((preset, pIdx) => (
                  <button
                    key={pIdx}
                    type="button"
                    onClick={() => {
                      const current = (report.overallRemarks || '').trim();
                      if (!current) {
                        setReport({ ...report, overallRemarks: preset });
                      } else {
                        setReport({ ...report, overallRemarks: `${current}\n${preset}` });
                      }
                      showToast('所見定型文を反映しました');
                    }}
                    className="px-2 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 text-[10.5px] text-slate-700 rounded-md border border-slate-200 transition-colors cursor-pointer text-left truncate max-w-full"
                  >
                    + {preset.length > 25 ? `${preset.slice(0, 25)}...` : preset}
                  </button>
                ))}
              </div>

              <textarea
                value={report.overallRemarks || ''}
                onChange={(e) => setReport({ ...report, overallRemarks: e.target.value })}
                rows={3}
                placeholder="定期点検を実施いたしました。各部動作・センサー検出状態ともに良好です。"
                className="w-full p-2 border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
              />
            </div>
          </div>

          {/* ⑤ お客様サイン受領セクション */}
          <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-5 rounded-xl text-white shadow-md flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0 border border-white/20">
                <PenTool className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm sm:text-base">お客様ご確認・受領署名（サイン）</h3>
                  {report.customerSignature && (
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/30 text-emerald-300 rounded-full border border-emerald-400/40">
                      受領完了
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  点検完了後、お客様に画面上で直接手書きサインを記入していただきます。
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {report.customerSignature ? (
                <div className="flex items-center gap-2">
                  <div className="h-10 w-24 bg-white rounded border border-slate-300 p-0.5 flex items-center justify-center overflow-hidden">
                    <img src={report.customerSignature} alt="サイン" className="max-h-full max-w-full object-contain" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsSignatureOpen(true)}
                    className="px-3 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                  >
                    サイン変更
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsSignatureOpen(true)}
                  className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs sm:text-sm font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer animate-pulse"
                >
                  <PenTool className="w-4 h-4" />
                  サインをいただく
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ボトム固定アクションバー */}
        <div className="px-4 sm:px-6 py-3 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            閉じる
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveDraft}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs sm:text-sm font-bold transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4" />
              下書き保存
            </button>
            <button
              type="button"
              onClick={() => {
                handleSaveDraft();
                onClose();
              }}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              保存して完了
            </button>
          </div>
        </div>
      </div>

      {/* サイン用キャンバスモーダル */}
      {isSignatureOpen && (
        <SignaturePad
          initialSignature={report.customerSignature}
          onSave={handleSignatureComplete}
          onCancel={() => setIsSignatureOpen(false)}
        />
      )}

      {/* 帳票印刷プレビューモーダル */}
      {isPreviewOpen && (
        <InspectionReportPrintView
          report={report}
          onClose={() => setIsPreviewOpen(false)}
        />
      )}
    </div>
  );
};
