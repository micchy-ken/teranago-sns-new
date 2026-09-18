import React from 'react';
import { 
  InspectionReportRecord, 
  STANDARD_CHECK_ITEMS, 
  STANDARD_CHECK_CATEGORIES,
  JUDGEMENT_OPTIONS 
} from '../../types/inspectionReport';
import { Printer, X, Download } from 'lucide-react';

interface InspectionReportPrintViewProps {
  report: InspectionReportRecord;
  onClose: () => void;
}

export const InspectionReportPrintView: React.FC<InspectionReportPrintViewProps> = ({
  report,
  onClose,
}) => {
  const handlePrint = () => {
    window.print();
  };

  const doors = report.doors || [];
  // 5台以下か、6台以上（15台モード）か
  const isCompactMode = doors.length > 5;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex justify-center p-2 sm:p-6 print:p-0 print:bg-white print:static">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full my-auto overflow-hidden flex flex-col print:shadow-none print:max-w-none print:w-full print:rounded-none">
        {/* 操作バー（印刷時は非表示） */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/40">
              点検報告書 帳票プレビュー
            </span>
            <h2 className="text-sm sm:text-base font-bold truncate">
              {report.customerName}（{report.jobNo || '作業No未定'}）
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold shadow-sm transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              印刷 / PDF保存
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 帳票実体エリア（A4サイズ用紙風レイアウト） */}
        <div className="p-6 sm:p-10 bg-white text-slate-900 text-xs select-text overflow-x-auto print:p-4">
          <div className="min-w-[760px] border border-slate-900 p-4 relative font-sans">
            {/* 上部タイトル＆ヘッダー */}
            <div className="text-center mb-3">
              <h1 className="text-xl sm:text-2xl font-black tracking-widest text-slate-900 border-b-2 border-slate-900 pb-1 inline-block px-8">
                点　検　報　告　書
              </h1>
            </div>

            {/* 顧客情報 & 作業情報ヘッダーグリッド */}
            <div className="grid grid-cols-12 border border-slate-900 mb-3 divide-x divide-slate-900 text-[11px]">
              {/* 左側：お客様情報 */}
              <div className="col-span-7 p-2 space-y-1.5">
                <div className="flex items-baseline">
                  <span className="w-16 font-bold text-slate-700 shrink-0">お客様名:</span>
                  <span className="text-sm font-bold text-slate-900 border-b border-dotted border-slate-400 flex-1 pb-0.5">
                    {report.customerName}
                  </span>
                </div>
                <div className="flex items-baseline">
                  <span className="w-16 font-bold text-slate-700 shrink-0">ご住所:</span>
                  <span className="text-slate-800 border-b border-dotted border-slate-400 flex-1 pb-0.5 truncate">
                    {report.address || '―'}
                  </span>
                </div>
                <div className="flex items-baseline gap-4">
                  <div className="flex items-center">
                    <span className="font-bold text-slate-700 mr-2">電話番号:</span>
                    <span className="text-slate-800">{report.phone || '―'}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="font-bold text-slate-700 mr-2">契約種別:</span>
                    <span className="font-bold text-slate-900 px-2 py-0.5 bg-slate-100 rounded border border-slate-300">
                      {report.contractType || 'ST'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 右側：作業情報 */}
              <div className="col-span-5 p-2 space-y-1.5 bg-slate-50/50">
                <div className="flex items-baseline justify-between">
                  <span className="font-bold text-slate-700">受付番号(作業No):</span>
                  <span className="font-mono font-bold text-sm text-slate-900 bg-white px-2 border border-slate-300 rounded">
                    {report.jobNo || '未登録'}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="font-bold text-slate-700">点検実施日:</span>
                  <span className="font-bold text-slate-900">
                    {report.inspectionDate}（{report.startTime} ～ {report.endTime}）
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="font-bold text-slate-700">点検員(担当):</span>
                  <span className="font-bold text-slate-900 border-b border-slate-400 px-3">
                    {report.inspectorName}
                  </span>
                </div>
              </div>
            </div>

            {/* 判定凡例バー */}
            <div className="border border-slate-400 bg-slate-100/80 px-2 py-1 mb-2 text-[10px] flex flex-wrap items-center justify-between gap-1">
              <span className="font-bold text-slate-700">【判定記号凡例】</span>
              {JUDGEMENT_OPTIONS.map((opt) => (
                <span key={opt.code} className="inline-flex items-center gap-0.5">
                  <span className="font-bold text-slate-900">{opt.code}</span>
                  <span className="text-slate-600">:{opt.label}</span>
                </span>
              ))}
            </div>

            {/* メイン点検テーブル */}
            <div className="border border-slate-900 overflow-x-auto mb-3">
              <table className="w-full text-center border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-200 border-b border-slate-900 font-bold">
                    <th className="border-r border-slate-900 p-1 w-24 text-left pl-2">区分</th>
                    <th className="border-r border-slate-900 p-1 w-44 text-left pl-2">点検項目</th>
                    {doors.map((door, idx) => (
                      <th key={door.doorIndex} className="border-r border-slate-900 p-1 min-w-[70px] bg-slate-100 last:border-r-0">
                        扉 {idx + 1}
                      </th>
                    ))}
                  </tr>
                  {/* 扉ヘッダー（建具・機種・開閉回数など） */}
                  <tr className="border-b border-slate-900 bg-slate-50 text-[10px]">
                    <td colSpan={2} className="border-r border-slate-900 p-1 font-bold text-right pr-2">
                      扉No / 設置場所 / 機種
                    </td>
                    {doors.map((door) => (
                      <td key={door.doorIndex} className="border-r border-slate-900 p-1 text-slate-800 last:border-r-0">
                        <div className="font-mono font-semibold">{door.doorNumber || '―'}</div>
                        <div className="text-[9px] text-slate-600 truncate">{door.location || '―'}</div>
                        <div className="text-[9px] font-bold text-indigo-700 truncate">{door.model || '―'}</div>
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-slate-900 bg-slate-50 text-[10px]">
                    <td colSpan={2} className="border-r border-slate-900 p-1 font-bold text-right pr-2">
                      開閉回数 / 開速度 / 閉速度 / タイマー
                    </td>
                    {doors.map((door) => (
                      <td key={door.doorIndex} className="border-r border-slate-900 p-1 text-slate-800 last:border-r-0">
                        <div className="font-mono text-slate-900">{door.openCount ? `${door.openCount}回` : '―'}</div>
                        <div className="text-[9px] text-slate-600">開:{door.openSpeed || '8'} / 閉:{door.closeSpeed || '3'} ({door.timerSeconds || '1'}秒)</div>
                      </td>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {STANDARD_CHECK_CATEGORIES.map((category) => {
                    const items = STANDARD_CHECK_ITEMS.filter(i => i.category === category.id);
                    return items.map((item, itemIdx) => (
                      <tr key={item.key} className="border-b border-slate-300 hover:bg-slate-50/50">
                        {itemIdx === 0 && (
                          <td 
                            rowSpan={items.length} 
                            className="border-r border-slate-900 p-1 font-bold text-slate-800 bg-slate-50 align-middle text-left pl-2 text-[10px]"
                          >
                            {category.name}
                          </td>
                        )}
                        <td className="border-r border-slate-900 p-1 text-left pl-2 text-slate-800 text-[10px]">
                          {item.label}
                        </td>
                        {doors.map((door) => {
                          const val = door.checkResults?.[item.key] || 'V';
                          const isAlert = val === '△' || val === '×' || val === 'M';
                          return (
                            <td 
                              key={door.doorIndex} 
                              className={`border-r border-slate-900 p-1 font-bold last:border-r-0 ${
                                isAlert ? 'bg-rose-50 text-rose-700 font-extrabold' : 'text-slate-800'
                              }`}
                            >
                              {val}
                            </td>
                          );
                        })}
                      </tr>
                    ));
                  })}

                  {/* センサー寸法チェック行 */}
                  <tr className="border-b border-slate-900 bg-slate-50 text-[10px]">
                    <td rowSpan={2} className="border-r border-slate-900 p-1 font-bold text-slate-800 text-left pl-2 align-middle">
                      センサー検出範囲
                    </td>
                    <td className="border-r border-slate-900 p-1 text-left pl-2 text-slate-800">
                      有効開口幅 / 外部センサー
                    </td>
                    {doors.map((door) => (
                      <td key={door.doorIndex} className="border-r border-slate-900 p-1 text-[10px] last:border-r-0">
                        <span className="font-mono">{door.sensorWidth || '1200'}mm</span> / {door.outerSensorWidthOk ? '○' : '―'}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-slate-900 bg-slate-50 text-[10px]">
                    <td className="border-r border-slate-900 p-1 text-left pl-2 text-slate-800">
                      内部センサー
                    </td>
                    {doors.map((door) => (
                      <td key={door.doorIndex} className="border-r border-slate-900 p-1 text-[10px] last:border-r-0">
                        {door.innerSensorWidthOk ? '○' : '―'}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 下部：報告事項所見 & お客様サイン枠 */}
            <div className="grid grid-cols-12 border border-slate-900 divide-x divide-slate-900 text-[11px]">
              {/* 所見・特記事項 */}
              <div className="col-span-8 p-2.5 flex flex-col justify-between min-h-[90px]">
                <div>
                  <div className="font-bold text-slate-800 mb-1">【点検結果・所見・特記事項】</div>
                  <div className="text-slate-700 whitespace-pre-wrap leading-relaxed text-[11px]">
                    {report.overallRemarks || '定期点検を実施いたしました。各部動作・センサー検出状態ともに良好です。'}
                  </div>
                </div>
                <div className="text-[9px] text-slate-400 mt-2">
                  ※上記点検結果に基づき、安全確保のため適正な維持管理をお願い申し上げます。
                </div>
              </div>

              {/* お客様受領サイン枠 */}
              <div className="col-span-4 p-2.5 flex flex-col justify-between bg-slate-50/50">
                <div className="font-bold text-slate-900 mb-1 text-center border-b border-slate-300 pb-1">
                  お客様ご確認（受領署名）
                </div>
                <div className="h-16 flex items-center justify-center border border-dashed border-slate-300 bg-white rounded my-1">
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
                <div className="flex items-center justify-between text-[9px] text-slate-600 pt-0.5">
                  <span>受領日: {report.signedAt ? report.signedAt.split('T')[0] : report.inspectionDate}</span>
                  <span className="font-semibold">{report.signedCustomerName || 'ご担当者様'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
