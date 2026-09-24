import React, { useState, useMemo } from 'react';
import { 
  InspectionReportRecord, 
  InspectionDoorReport,
  JUDGEMENT_OPTIONS 
} from '../../types/inspectionReport';
import {
  getInspectionMasterCategories,
  getInspectionMasterItems
} from '../../utils/inspectionMasterStorage';
import { 
  Printer, 
  X, 
  Layers, 
  LayoutGrid, 
  CheckCircle2, 
  Info,
  Maximize2
} from 'lucide-react';

interface InspectionReportPrintViewProps {
  report: InspectionReportRecord;
  onClose: () => void;
}

export type PrintLayoutMode = 'standard5' | 'wide15' | 'auto';

export const InspectionReportPrintView: React.FC<InspectionReportPrintViewProps> = ({
  report,
  onClose,
}) => {
  const doors = report.doors || [];
  
  // 動的マスター（非表示設定の項目は印刷対象外）
  const masterCategories = useMemo(() => getInspectionMasterCategories(), []);
  const masterItems = useMemo(() => getInspectionMasterItems(false), []);

  // デフォルトモードの判定: 6台以上の場合は15列一括または5列改ページを選択可能
  const [layoutMode, setLayoutMode] = useState<PrintLayoutMode>(
    doors.length > 5 ? 'standard5' : 'standard5'
  );
  const [showPrintGuide, setShowPrintGuide] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  // 5列標準モード用：扉データを5台ごとのページに分割
  const get5ColumnPages = () => {
    const pages: Array<Array<{ door?: InspectionDoorReport; doorNum: number; isPlaceholder: boolean }>> = [];
    const totalDoors = Math.max(doors.length, 5);
    const pageCount = Math.ceil(totalDoors / 5);

    for (let p = 0; p < pageCount; p++) {
      const pageDoors: Array<{ door?: InspectionDoorReport; doorNum: number; isPlaceholder: boolean }> = [];
      for (let i = 0; i < 5; i++) {
        const globalIdx = p * 5 + i;
        if (globalIdx < doors.length) {
          pageDoors.push({
            door: doors[globalIdx],
            doorNum: globalIdx + 1,
            isPlaceholder: false
          });
        } else {
          // 5枠を維持するためのプレースホルダー枠
          pageDoors.push({
            door: undefined,
            doorNum: globalIdx + 1,
            isPlaceholder: true
          });
        }
      }
      pages.push(pageDoors);
    }
    return pages;
  };

  // 15列ワイドモード用：最大15台分の列を生成（最低10〜15枠）
  const get15ColumnDoors = () => {
    const maxColumns = Math.max(Math.min(Math.max(doors.length, 10), 15), 15);
    const cols: Array<{ door?: InspectionDoorReport; doorNum: number; isPlaceholder: boolean }> = [];
    for (let i = 0; i < maxColumns; i++) {
      if (i < doors.length) {
        cols.push({
          door: doors[i],
          doorNum: i + 1,
          isPlaceholder: false
        });
      } else {
        cols.push({
          door: undefined,
          doorNum: i + 1,
          isPlaceholder: true
        });
      }
    }
    return cols;
  };

  // 事務確認検印スタンプのレンダリング
  const renderOfficeStamp = () => {
    if (report.officeConfirmed) {
      const dateStr = report.officeConfirmedAt 
        ? report.officeConfirmedAt.split('T')[0].replace(/-/g, '.')
        : (report.inspectionDate ? report.inspectionDate.replace(/-/g, '.') : '');
      const name = (report.officeConfirmedByName || '事務確認').slice(0, 4);

      return (
        <div className="flex flex-col items-center justify-center p-1">
          <div className="w-14 h-14 rounded-full border-2 border-rose-600 flex flex-col items-center justify-between py-1 text-rose-600 font-sans shadow-2xs select-none">
            <span className="text-[8px] font-black tracking-wider leading-none border-b border-rose-300 w-full text-center pb-0.5">
              寺岡オート
            </span>
            <div className="flex flex-col items-center leading-none my-auto">
              <span className="text-[7px] font-bold tracking-tight text-rose-700">{dateStr}</span>
              <span className="text-[9px] font-black tracking-widest text-rose-600 mt-0.5">{name}</span>
            </div>
            <span className="text-[8px] font-black tracking-widest leading-none border-t border-rose-300 w-full text-center pt-0.5">
              確　認
            </span>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center p-1">
        <div className="w-14 h-14 rounded-lg border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 select-none bg-slate-50/50">
          <span className="text-[8px] font-bold">事務検印</span>
          <span className="text-[7px] mt-0.5">（未確認）</span>
        </div>
      </div>
    );
  };

  const fiveColPages = get5ColumnPages();
  const wideCols = get15ColumnDoors();

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex justify-center p-2 sm:p-6 print:p-0 print:bg-white print:static">
      {/* 印刷専用CSSスタイル注入 */}
      <style>{`
        @media print {
          @page {
            size: ${layoutMode === 'wide15' ? 'A4 landscape' : 'A4 portrait'};
            margin: 8mm 6mm 8mm 6mm;
          }
          body {
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-break-page {
            page-break-after: always;
            break-after: page;
          }
          .print-avoid-break {
            page-break-inside: avoid;
            break-inside: avoid;
          }
        }
      `}</style>

      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full my-auto overflow-hidden flex flex-col print:shadow-none print:max-w-none print:w-full print:rounded-none">
        
        {/* 操作バー（画面上部・印刷時は非表示） */}
        <div className="px-4 sm:px-6 py-3 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 print:hidden shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/40">
              点検報告書 印刷プレビュー
            </span>
            <h2 className="text-sm sm:text-base font-bold truncate max-w-xs sm:max-w-md">
              {report.customerName}（{report.jobNo || '作業No未登録'}）
            </h2>
            <span className="text-xs text-slate-300 font-mono bg-slate-800 px-2 py-0.5 rounded">
              総台数: {doors.length}台
            </span>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {/* 帳票様式切り替えボタングループ */}
            <div className="flex items-center bg-slate-800 p-1 rounded-lg border border-slate-700 text-xs">
              <button
                type="button"
                onClick={() => setLayoutMode('standard5')}
                className={`px-2.5 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  layoutMode === 'standard5'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
                title="1〜5台はA4縦1枚、6台以上は5台区切りで自動改ページ印刷"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>5列様式 (A4縦/改ページ)</span>
              </button>

              <button
                type="button"
                onClick={() => setLayoutMode('wide15')}
                className={`px-2.5 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  layoutMode === 'wide15'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
                title="最大15台の点検結果を横長（A4横）1枚に一括レイアウト"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>15列様式 (A4横)</span>
              </button>

              <button
                type="button"
                onClick={() => setLayoutMode('auto')}
                className={`px-2.5 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  layoutMode === 'auto'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
                title="登録された扉の台数のみ幅いっぱいに自動フィット"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>実台数フィット</span>
              </button>
            </div>

            {/* 印刷ガイドトグルボタン */}
            <button
              type="button"
              onClick={() => setShowPrintGuide(!showPrintGuide)}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="印刷設定のコツ・用紙サイズ"
            >
              <Info className="w-4 h-4" />
            </button>

            {/* 印刷実行ボタン */}
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>印刷 / PDF出力</span>
            </button>

            {/* 閉じるボタン */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 印刷ガイドアコーディオン（画面表示時のみ） */}
        {showPrintGuide && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 text-xs text-amber-900 flex items-start gap-2 print:hidden">
            <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold">【きれいに印刷・PDF保存するための推奨設定】</span>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-800">
                <li>
                  <span className="font-semibold">用紙の向き:</span> {layoutMode === 'wide15' ? '「横 (Landscape)」' : '「縦 (Portrait)」'} を選択してください。
                </li>
                <li>
                  <span className="font-semibold">背景のグラフィック:</span> 印刷ダイアログの「詳細設定」から <span className="font-bold underline">「背景のグラフィック」にチェックを入れてください</span>（枠線の背景色やスタンプがきれいに印字されます）。
                </li>
                <li>
                  <span className="font-semibold">ヘッダーとフッター:</span> オフにすると、ブラウザのURLや日付の余分な印字を消すことができます。
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* 帳票実体エリア */}
        {/* ==================================================================== */}
        <div className="p-4 sm:p-8 bg-slate-100 print:bg-white text-slate-900 select-text overflow-x-auto print:p-0 print:overflow-visible">
          
          {/* ------------------------------------------------------------------ */}
          {/* ① 5列標準様式 (A4縦 / 5台毎ページ分割) */}
          {/* ------------------------------------------------------------------ */}
          {layoutMode === 'standard5' && (
            <div className="space-y-8 print:space-y-0">
              {fiveColPages.map((pageDoors, pageIdx) => {
                const isLastPage = pageIdx === fiveColPages.length - 1;

                return (
                  <div 
                    key={pageIdx}
                    className={`bg-white border border-slate-900 p-4 font-sans text-xs min-w-[760px] mx-auto shadow-md print:shadow-none print:border-slate-900 print:p-3 relative ${
                      !isLastPage ? 'print-break-page' : ''
                    }`}
                  >
                    {/* 上部タイトル＆検印欄 */}
                    <div className="flex items-start justify-between border-b-2 border-slate-900 pb-2 mb-2">
                      <div className="w-20" /> {/* 余白バランス用 */}
                      
                      <div className="text-center">
                        <h1 className="text-xl sm:text-2xl font-black tracking-widest text-slate-900 px-4">
                          自 動 ド ア 保 守 点 検 報 告 書
                        </h1>
                        <div className="text-[10px] text-slate-600 tracking-wider mt-0.5">
                          TERAOKA AUTO DOOR MAINTENANCE REPORT
                        </div>
                      </div>

                      {/* 右上：事務検印＆ページ表記 */}
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <div className="text-[9px] font-bold text-slate-500">
                            Page {pageIdx + 1} / {fiveColPages.length}
                          </div>
                        </div>
                        {renderOfficeStamp()}
                      </div>
                    </div>

                    {/* お客様情報 & 作業情報ヘッダーグリッド */}
                    <div className="grid grid-cols-12 border border-slate-900 mb-2 divide-x divide-slate-900 text-[11px]">
                      {/* 左側：お客様情報 */}
                      <div className="col-span-7 p-2 space-y-1">
                        <div className="flex items-baseline">
                          <span className="w-20 font-bold text-slate-700 shrink-0">お客様名:</span>
                          <span className="text-sm font-bold text-slate-900 border-b border-dotted border-slate-400 flex-1 pb-0.5 truncate">
                            {report.customerName}
                          </span>
                        </div>
                        <div className="flex items-baseline">
                          <span className="w-20 font-bold text-slate-700 shrink-0">ご住所:</span>
                          <span className="text-slate-800 border-b border-dotted border-slate-400 flex-1 pb-0.5 truncate">
                            {report.address || '―'}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-4 pt-0.5">
                          <div className="flex items-center">
                            <span className="font-bold text-slate-700 mr-2">電話番号:</span>
                            <span className="text-slate-800">{report.phone || '―'}</span>
                          </div>
                          <div className="flex items-center">
                            <span className="font-bold text-slate-700 mr-2">契約種別:</span>
                            <span className="font-bold text-slate-900 px-2 py-0.2 bg-slate-100 rounded border border-slate-300">
                              {report.contractType || 'ST'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* 右側：作業情報 */}
                      <div className="col-span-5 p-2 space-y-1 bg-slate-50/60">
                        <div className="flex items-baseline justify-between">
                          <span className="font-bold text-slate-700">受付番号(作業No):</span>
                          <span className="font-mono font-bold text-xs text-slate-900 bg-white px-2 border border-slate-300 rounded">
                            {report.jobNo || '未登録'}
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between">
                          <span className="font-bold text-slate-700">点検実施日:</span>
                          <span className="font-bold text-slate-900">
                            {report.inspectionDate}（{report.startTime || '―'} ～ {report.endTime || '―'}）
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between">
                          <span className="font-bold text-slate-700">点検員(担当):</span>
                          <span className="font-bold text-slate-900 border-b border-slate-400 px-2">
                            {report.inspectorName || '―'} {report.subInspectorName ? ` / ${report.subInspectorName}` : ''}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 判定記号凡例バー */}
                    <div className="border border-slate-400 bg-slate-100 px-2 py-0.5 mb-1.5 text-[9.5px] flex flex-wrap items-center justify-between gap-1">
                      <span className="font-bold text-slate-700">【判定凡例】</span>
                      {JUDGEMENT_OPTIONS.map((opt) => (
                        <span key={opt.code} className="inline-flex items-center gap-0.5">
                          <span className="font-bold text-slate-900">{opt.code}</span>
                          <span className="text-slate-600">:{opt.label}</span>
                        </span>
                      ))}
                    </div>

                    {/* 5列点検テーブル */}
                    <div className="border border-slate-900 mb-2">
                      <table className="w-full text-center border-collapse text-[10.5px]">
                        <thead>
                          <tr className="bg-slate-200 border-b border-slate-900 font-bold">
                            <th className="border-r border-slate-900 p-1 w-24 text-left pl-2">区分</th>
                            <th className="border-r border-slate-900 p-1 w-44 text-left pl-2">点検項目</th>
                            {pageDoors.map((col, cIdx) => (
                              <th 
                                key={cIdx} 
                                className="border-r border-slate-900 p-1 w-[88px] bg-slate-100 last:border-r-0 font-bold"
                              >
                                扉 {col.doorNum}
                              </th>
                            ))}
                          </tr>

                          {/* 扉ヘッダー（建具・機種・開閉回数など） */}
                          <tr className="border-b border-slate-900 bg-slate-50 text-[9.5px]">
                            <td colSpan={2} className="border-r border-slate-900 p-1 font-bold text-right pr-2">
                              扉No / 設置場所 / 機種
                            </td>
                            {pageDoors.map((col, cIdx) => (
                              <td key={cIdx} className="border-r border-slate-900 p-1 text-slate-800 last:border-r-0">
                                {col.door ? (
                                  <>
                                    <div className="font-mono font-bold text-slate-900 truncate">{col.door.doorNumber || '―'}</div>
                                    <div className="text-[9px] text-slate-600 truncate">{col.door.location || '―'}</div>
                                    <div className="text-[9px] font-bold text-indigo-700 truncate">{col.door.model || '―'}</div>
                                  </>
                                ) : (
                                  <div className="text-slate-300 py-1 font-mono">―</div>
                                )}
                              </td>
                            ))}
                          </tr>
                          <tr className="border-b border-slate-900 bg-slate-50 text-[9.5px]">
                            <td colSpan={2} className="border-r border-slate-900 p-1 font-bold text-right pr-2">
                              開閉回数 / 開・閉速度 / タイマー
                            </td>
                            {pageDoors.map((col, cIdx) => (
                              <td key={cIdx} className="border-r border-slate-900 p-1 text-slate-800 last:border-r-0">
                                {col.door ? (
                                  <>
                                    <div className="font-mono font-semibold text-slate-900">{col.door.openCount ? `${col.door.openCount}回` : '―'}</div>
                                    <div className="text-[8.5px] text-slate-600">
                                      開:{col.door.openSpeed || '8'} / 閉:{col.door.closeSpeed || '3'} ({col.door.timerSeconds || '1'}s)
                                    </div>
                                  </>
                                ) : (
                                  <div className="text-slate-300 py-1 font-mono">―</div>
                                )}
                              </td>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {masterCategories.map((category) => {
                            const items = masterItems.filter(i => i.category === category.id);
                            if (items.length === 0) return null;
                            return items.map((item, itemIdx) => (
                              <tr key={item.key} className="border-b border-slate-300 hover:bg-slate-50/50 leading-tight">
                                {itemIdx === 0 && (
                                  <td 
                                    rowSpan={items.length} 
                                    className="border-r border-slate-900 p-1 font-bold text-slate-800 bg-slate-50 align-middle text-left pl-2 text-[9.5px]"
                                  >
                                    {category.name}
                                  </td>
                                )}
                                <td className="border-r border-slate-900 p-1 text-left pl-2 text-slate-800 text-[9.5px]">
                                  {item.label}
                                </td>
                                {pageDoors.map((col, cIdx) => {
                                  if (!col.door) {
                                    return (
                                      <td key={cIdx} className="border-r border-slate-900 p-0.5 text-slate-300 font-mono text-[9px] last:border-r-0">
                                        ―
                                      </td>
                                    );
                                  }
                                  const val = col.door.checkResults?.[item.key] || 'V';
                                  const isAlert = val === '△' || val === '×' || val === 'M';
                                  return (
                                    <td 
                                      key={cIdx} 
                                      className={`border-r border-slate-900 p-0.5 font-bold last:border-r-0 ${
                                        isAlert ? 'bg-rose-50 text-rose-700 font-black' : 'text-slate-800'
                                      }`}
                                    >
                                      {val}
                                    </td>
                                  );
                                })}
                              </tr>
                            ));
                          })}

                          {/* センサー検出範囲 */}
                          <tr className="border-b border-slate-900 bg-slate-50 text-[9.5px]">
                            <td rowSpan={2} className="border-r border-slate-900 p-1 font-bold text-slate-800 text-left pl-2 align-middle">
                              センサー検出範囲
                            </td>
                            <td className="border-r border-slate-900 p-1 text-left pl-2 text-slate-800">
                              有効開口幅 / 外部センサー
                            </td>
                            {pageDoors.map((col, cIdx) => (
                              <td key={cIdx} className="border-r border-slate-900 p-1 text-[9.5px] last:border-r-0">
                                {col.door ? (
                                  <>
                                    <span className="font-mono">{col.door.sensorWidth || '1200'}mm</span> / {col.door.outerSensorWidthOk ? '○' : '―'}
                                  </>
                                ) : (
                                  <span className="text-slate-300">―</span>
                                )}
                              </td>
                            ))}
                          </tr>
                          <tr className="border-b border-slate-900 bg-slate-50 text-[9.5px]">
                            <td className="border-r border-slate-900 p-1 text-left pl-2 text-slate-800">
                              内部センサー
                            </td>
                            {pageDoors.map((col, cIdx) => (
                              <td key={cIdx} className="border-r border-slate-900 p-1 text-[9.5px] last:border-r-0">
                                {col.door ? (
                                  <span>{col.door.innerSensorWidthOk ? '○' : '―'}</span>
                                ) : (
                                  <span className="text-slate-300">―</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* 下部：所見 & サイン枠（最終ページまたは全ページに共通枠を配置） */}
                    <div className="grid grid-cols-12 border border-slate-900 divide-x divide-slate-900 text-[11px] print-avoid-break">
                      {/* 所見・特記事項 */}
                      <div className="col-span-8 p-2 flex flex-col justify-between min-h-[85px]">
                        <div>
                          <div className="font-bold text-slate-900 mb-0.5 text-[10.5px]">
                            【点検結果・所見・総合特記事項】
                          </div>
                          <div className="text-slate-800 whitespace-pre-wrap leading-relaxed text-[10.5px]">
                            {report.overallRemarks || '定期保守点検を実施いたしました。各部機構動作およびセンサー検出動作ともに良好です。'}
                          </div>
                        </div>
                        <div className="text-[8.5px] text-slate-500 mt-1">
                          ※安全基準(JADA規格等)に基づき適正な維持管理をお願い申し上げます。
                        </div>
                      </div>

                      {/* お客様受領サイン枠 */}
                      <div className="col-span-4 p-2 flex flex-col justify-between bg-slate-50/50">
                        <div className="font-bold text-slate-900 text-center border-b border-slate-300 pb-0.5 text-[10.5px]">
                          お客様ご確認（受領署名）
                        </div>
                        <div className="h-16 flex items-center justify-center border border-dashed border-slate-300 bg-white rounded my-1 p-0.5">
                          {report.customerSignature ? (
                            <img 
                              src={report.customerSignature} 
                              alt="お客様サイン" 
                              className="max-h-full max-w-full object-contain"
                            />
                          ) : (
                            <span className="text-slate-400 text-[10px] italic">未受領</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-[8.5px] text-slate-600 pt-0.5">
                          <span>受領日: {report.signedAt ? report.signedAt.split('T')[0] : (report.inspectionDate || '―')}</span>
                          <span className="font-bold text-slate-800">{report.signedCustomerName || 'ご担当者様'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ------------------------------------------------------------------ */}
          {/* ② 15列ワイド様式 (A4横 Landscape / 最大15台一括) */}
          {/* ------------------------------------------------------------------ */}
          {layoutMode === 'wide15' && (
            <div className="bg-white border border-slate-900 p-3 font-sans text-xs min-w-[1050px] mx-auto shadow-md print:shadow-none print:border-slate-900 print:p-2 relative">
              {/* 上部タイトル＆検印欄 */}
              <div className="flex items-center justify-between border-b-2 border-slate-900 pb-1.5 mb-2">
                <div className="flex items-center gap-3">
                  <h1 className="text-lg sm:text-xl font-black tracking-widest text-slate-900">
                    自 動 ド ア 保 守 点 検 報 告 書（15列ワイド帳票）
                  </h1>
                  <span className="text-[10px] text-indigo-700 font-bold bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                    A4横向き印刷推奨
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right text-[10px] text-slate-600">
                    受付番号: <span className="font-mono font-bold text-slate-900">{report.jobNo || '未登録'}</span>
                  </div>
                  {renderOfficeStamp()}
                </div>
              </div>

              {/* ヘッダー情報バー */}
              <div className="grid grid-cols-12 border border-slate-900 mb-2 divide-x divide-slate-900 text-[10px] bg-slate-50/70">
                <div className="col-span-5 p-1.5 flex items-baseline gap-2">
                  <span className="font-bold text-slate-700 shrink-0">お客様名:</span>
                  <span className="font-bold text-slate-900 truncate">{report.customerName}</span>
                </div>
                <div className="col-span-3 p-1.5 flex items-baseline gap-2">
                  <span className="font-bold text-slate-700 shrink-0">点検日:</span>
                  <span className="font-bold text-slate-900">{report.inspectionDate}</span>
                </div>
                <div className="col-span-4 p-1.5 flex items-baseline gap-2">
                  <span className="font-bold text-slate-700 shrink-0">点検員:</span>
                  <span className="font-bold text-slate-900">{report.inspectorName}</span>
                </div>
              </div>

              {/* 15列テーブル */}
              <div className="border border-slate-900 overflow-x-auto mb-2">
                <table className="w-full text-center border-collapse text-[9.5px]">
                  <thead>
                    <tr className="bg-slate-200 border-b border-slate-900 font-bold">
                      <th className="border-r border-slate-900 p-0.5 w-20 text-left pl-1">区分</th>
                      <th className="border-r border-slate-900 p-0.5 w-36 text-left pl-1">点検項目</th>
                      {wideCols.map((col, cIdx) => (
                        <th 
                          key={cIdx} 
                          className="border-r border-slate-900 p-0.5 min-w-[42px] bg-slate-100 last:border-r-0 font-bold text-[9px]"
                        >
                          扉{col.doorNum}
                        </th>
                      ))}
                    </tr>
                    {/* 扉ヘッダー（建具・機種など） */}
                    <tr className="border-b border-slate-900 bg-slate-50 text-[8.5px]">
                      <td colSpan={2} className="border-r border-slate-900 p-0.5 font-bold text-right pr-1">
                        扉No / 機種
                      </td>
                      {wideCols.map((col, cIdx) => (
                        <td key={cIdx} className="border-r border-slate-900 p-0.5 text-slate-800 last:border-r-0">
                          {col.door ? (
                            <>
                              <div className="font-mono font-bold truncate">{col.door.doorNumber || '―'}</div>
                              <div className="text-[7.5px] text-indigo-700 truncate">{col.door.model || '―'}</div>
                            </>
                          ) : (
                            <span className="text-slate-300">―</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {masterCategories.map((category) => {
                      const items = masterItems.filter(i => i.category === category.id);
                      if (items.length === 0) return null;
                      return items.map((item, itemIdx) => (
                        <tr key={item.key} className="border-b border-slate-300 hover:bg-slate-50/50 leading-none">
                          {itemIdx === 0 && (
                            <td 
                              rowSpan={items.length} 
                              className="border-r border-slate-900 p-0.5 font-bold text-slate-800 bg-slate-50 align-middle text-left pl-1 text-[8.5px]"
                            >
                              {category.name}
                            </td>
                          )}
                          <td className="border-r border-slate-900 p-0.5 text-left pl-1 text-slate-800 text-[8.5px] truncate max-w-[140px]">
                            {item.label}
                          </td>
                          {wideCols.map((col, cIdx) => {
                            if (!col.door) {
                              return (
                                <td key={cIdx} className="border-r border-slate-900 p-0 text-slate-300 font-mono text-[8px] last:border-r-0">
                                  ―
                                </td>
                              );
                            }
                            const val = col.door.checkResults?.[item.key] || 'V';
                            const isAlert = val === '△' || val === '×' || val === 'M';
                            return (
                              <td 
                                key={cIdx} 
                                className={`border-r border-slate-900 p-0 font-bold text-[9px] last:border-r-0 ${
                                  isAlert ? 'bg-rose-50 text-rose-700 font-black' : 'text-slate-800'
                                }`}
                              >
                                {val}
                              </td>
                            );
                          })}
                        </tr>
                      ));
                    })}
                  </tbody>
                </table>
              </div>

              {/* 下部所見 & サイン */}
              <div className="grid grid-cols-12 border border-slate-900 divide-x divide-slate-900 text-[10px]">
                <div className="col-span-8 p-1.5">
                  <div className="font-bold text-slate-900 mb-0.5">【点検所見・特記事項】</div>
                  <div className="text-slate-800 text-[10px] leading-tight">
                    {report.overallRemarks || '定期点検を実施いたしました。全15系統動作・センサー検出良好です。'}
                  </div>
                </div>
                <div className="col-span-4 p-1.5 flex items-center justify-between gap-2 bg-slate-50/50">
                  <div className="flex-1">
                    <div className="font-bold text-slate-900 text-[9px]">お客様受領署名</div>
                    <div className="text-[8px] text-slate-600">受領日: {report.signedAt ? report.signedAt.split('T')[0] : (report.inspectionDate || '―')}</div>
                  </div>
                  <div className="h-10 w-24 border border-dashed border-slate-300 bg-white rounded flex items-center justify-center p-0.5">
                    {report.customerSignature ? (
                      <img src={report.customerSignature} alt="サイン" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="text-slate-400 text-[8px] italic">未受領</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------------ */}
          {/* ③ 実台数フィット様式 (Auto Fit) */}
          {/* ------------------------------------------------------------------ */}
          {layoutMode === 'auto' && (
            <div className="bg-white border border-slate-900 p-4 font-sans text-xs min-w-[760px] mx-auto shadow-md print:shadow-none print:border-slate-900 print:p-3 relative">
              <div className="flex items-start justify-between border-b-2 border-slate-900 pb-2 mb-2">
                <div className="w-16" />
                <div className="text-center">
                  <h1 className="text-xl sm:text-2xl font-black tracking-widest text-slate-900 px-4">
                    自 動 ド ア 保 守 点 検 報 告 書
                  </h1>
                  <div className="text-[10px] text-slate-600 tracking-wider mt-0.5">
                    TERAOKA AUTO DOOR MAINTENANCE REPORT (FIT MODE)
                  </div>
                </div>
                {renderOfficeStamp()}
              </div>

              {/* 顧客情報 & 作業情報 */}
              <div className="grid grid-cols-12 border border-slate-900 mb-2 divide-x divide-slate-900 text-[11px]">
                <div className="col-span-7 p-2 space-y-1">
                  <div className="flex items-baseline">
                    <span className="w-20 font-bold text-slate-700 shrink-0">お客様名:</span>
                    <span className="text-sm font-bold text-slate-900 border-b border-dotted border-slate-400 flex-1 pb-0.5 truncate">
                      {report.customerName}
                    </span>
                  </div>
                  <div className="flex items-baseline">
                    <span className="w-20 font-bold text-slate-700 shrink-0">ご住所:</span>
                    <span className="text-slate-800 border-b border-dotted border-slate-400 flex-1 pb-0.5 truncate">
                      {report.address || '―'}
                    </span>
                  </div>
                </div>
                <div className="col-span-5 p-2 space-y-1 bg-slate-50/60">
                  <div className="flex items-baseline justify-between">
                    <span className="font-bold text-slate-700">受付番号:</span>
                    <span className="font-mono font-bold text-xs text-slate-900 bg-white px-2 border border-slate-300 rounded">
                      {report.jobNo || '未登録'}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="font-bold text-slate-700">点検実施日:</span>
                    <span className="font-bold text-slate-900">{report.inspectionDate}</span>
                  </div>
                </div>
              </div>

              {/* 点検テーブル */}
              <div className="border border-slate-900 mb-2 overflow-x-auto">
                <table className="w-full text-center border-collapse text-[10.5px]">
                  <thead>
                    <tr className="bg-slate-200 border-b border-slate-900 font-bold">
                      <th className="border-r border-slate-900 p-1 w-24 text-left pl-2">区分</th>
                      <th className="border-r border-slate-900 p-1 w-44 text-left pl-2">点検項目</th>
                      {doors.map((door, idx) => (
                        <th key={door.doorIndex || idx} className="border-r border-slate-900 p-1 bg-slate-100 last:border-r-0 font-bold">
                          扉 {idx + 1}
                        </th>
                      ))}
                    </tr>
                    <tr className="border-b border-slate-900 bg-slate-50 text-[9.5px]">
                      <td colSpan={2} className="border-r border-slate-900 p-1 font-bold text-right pr-2">
                        扉No / 設置場所 / 機種
                      </td>
                      {doors.map((door, idx) => (
                        <td key={door.doorIndex || idx} className="border-r border-slate-900 p-1 text-slate-800 last:border-r-0">
                          <div className="font-mono font-bold text-slate-900">{door.doorNumber || '―'}</div>
                          <div className="text-[9px] text-slate-600 truncate">{door.location || '―'}</div>
                          <div className="text-[9px] font-bold text-indigo-700 truncate">{door.model || '―'}</div>
                        </td>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {masterCategories.map((category) => {
                      const items = masterItems.filter(i => i.category === category.id);
                      if (items.length === 0) return null;
                      return items.map((item, itemIdx) => (
                        <tr key={item.key} className="border-b border-slate-300 hover:bg-slate-50/50">
                          {itemIdx === 0 && (
                            <td 
                              rowSpan={items.length} 
                              className="border-r border-slate-900 p-1 font-bold text-slate-800 bg-slate-50 align-middle text-left pl-2 text-[9.5px]"
                            >
                              {category.name}
                            </td>
                          )}
                          <td className="border-r border-slate-900 p-1 text-left pl-2 text-slate-800 text-[9.5px]">
                            {item.label}
                          </td>
                          {doors.map((door, idx) => {
                            const val = door.checkResults?.[item.key] || 'V';
                            const isAlert = val === '△' || val === '×' || val === 'M';
                            return (
                              <td 
                                key={door.doorIndex || idx} 
                                className={`border-r border-slate-900 p-0.5 font-bold last:border-r-0 ${
                                  isAlert ? 'bg-rose-50 text-rose-700 font-black' : 'text-slate-800'
                                }`}
                              >
                                {val}
                              </td>
                            );
                          })}
                        </tr>
                      ));
                    })}
                  </tbody>
                </table>
              </div>

              {/* 所見 & サイン */}
              <div className="grid grid-cols-12 border border-slate-900 divide-x divide-slate-900 text-[11px]">
                <div className="col-span-8 p-2">
                  <div className="font-bold text-slate-900 mb-0.5 text-[10.5px]">【点検所見・特記事項】</div>
                  <div className="text-slate-800 whitespace-pre-wrap leading-relaxed text-[10.5px]">
                    {report.overallRemarks || '定期保守点検を実施いたしました。各部動作良好です。'}
                  </div>
                </div>
                <div className="col-span-4 p-2 bg-slate-50/50 flex flex-col justify-between">
                  <div className="font-bold text-slate-900 text-center border-b border-slate-300 pb-0.5 text-[10.5px]">
                    お客様受領署名
                  </div>
                  <div className="h-16 flex items-center justify-center border border-dashed border-slate-300 bg-white rounded my-1">
                    {report.customerSignature ? (
                      <img src={report.customerSignature} alt="お客様サイン" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="text-slate-400 text-[10px] italic">未受領</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[8.5px] text-slate-600">
                    <span>受領日: {report.signedAt ? report.signedAt.split('T')[0] : (report.inspectionDate || '―')}</span>
                    <span className="font-bold">{report.signedCustomerName || 'ご担当者様'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

