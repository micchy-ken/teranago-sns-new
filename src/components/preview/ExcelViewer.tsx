import React, { useEffect, useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  FileSpreadsheet, 
  Search, 
  Download, 
  AlertCircle, 
  Loader2, 
  Layers,
  ChevronDown
} from 'lucide-react';

interface ExcelViewerProps {
  url: string;
  fileName: string;
  onDownload?: () => void;
}

interface SheetData {
  name: string;
  rows: any[][];
}

export function ExcelViewer({ url, fileName, onDownload }: ExcelViewerProps) {
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [activeSheetIndex, setActiveSheetIndex] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);
    setSheets([]);
    setActiveSheetIndex(0);

    const loadExcel = async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        const buffer = await response.arrayBuffer();

        const uint8Array = new Uint8Array(buffer);
        const workbook = XLSX.read(uint8Array, { type: 'array', cellDates: true });
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          throw new Error('スプレッドシート内に有効なシートが見つかりませんでした');
        }

        const parsedSheets: SheetData[] = workbook.SheetNames.map(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          // 2次元配列として取得
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
            header: 1, 
            defval: '',
            blankrows: false 
          }) as (string | number | boolean | null)[][];

          return {
            name: sheetName,
            rows: jsonData || [],
          };
        });

        if (!isMounted) return;
        setSheets(parsedSheets);
        setActiveSheetIndex(0);
        setLoading(false);
      } catch (err: any) {
        if (!isMounted) return;
        console.error('[ExcelViewer] Load error:', err);
        setError(err?.message || 'Excelファイルの解析に失敗しました');
        setLoading(false);
      }
    };

    loadExcel();

    return () => {
      isMounted = false;
    };
  }, [url]);

  const currentSheet = sheets[activeSheetIndex];

  // 検索フィルタリング
  const filteredRows = useMemo(() => {
    if (!currentSheet || !currentSheet.rows) return [];
    if (!searchTerm.trim()) return currentSheet.rows;

    const term = searchTerm.toLowerCase();
    return currentSheet.rows.filter(row => 
      row.some(cell => String(cell || '').toLowerCase().includes(term))
    );
  }, [currentSheet, searchTerm]);

  // 列数（最大カラム数）の算出
  const maxCols = useMemo(() => {
    if (!currentSheet || !currentSheet.rows.length) return 0;
    return Math.max(...currentSheet.rows.map(r => r.length), 0);
  }, [currentSheet]);

  // 列ヘッダーラベル (A, B, C... Z, AA, AB...)
  const getColLabel = (index: number) => {
    let label = '';
    let num = index;
    while (num >= 0) {
      label = String.fromCharCode((num % 26) + 65) + label;
      num = Math.floor(num / 26) - 1;
    }
    return label;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500 min-h-[350px]">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mb-3" />
        <p className="text-xs font-bold text-slate-700">スプレッドシートを読み込み中...</p>
        <p className="text-[11px] text-slate-400 mt-1">セルデータを解析しています</p>
      </div>
    );
  }

  if (error || sheets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center min-h-[350px] max-w-md mx-auto">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3">
          <AlertCircle className="w-6 h-6" />
        </div>
        <p className="text-sm font-bold text-slate-800 mb-1">スプレッドシートの表示に失敗しました</p>
        <p className="text-xs text-slate-500 mb-4">{error || 'データが空です'}</p>
        <div className="flex items-center gap-2 flex-wrap justify-center">
          {onDownload && (
            <button
              onClick={onDownload}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>ダウンロードして確認</span>
            </button>
          )}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>ブラウザ別タブで開く</span>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-slate-50">
      {/* ツールバー: シートタブ & 検索バー */}
      <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap shrink-0">
        {/* シート切り替えタブ */}
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 sm:pb-0 scrollbar-thin">
          <div className="flex items-center gap-1 text-slate-400 text-xs font-bold mr-1 shrink-0">
            <Layers className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline">シート:</span>
          </div>
          {sheets.map((sheet, idx) => (
            <button
              key={idx}
              onClick={() => {
                setActiveSheetIndex(idx);
                setSearchTerm('');
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 shrink-0 ${
                activeSheetIndex === idx
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-2xs font-extrabold'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 border border-transparent'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>{sheet.name}</span>
              <span className="text-[10px] opacity-70">({sheet.rows.length}行)</span>
            </button>
          ))}
        </div>

        {/* 検索入力 */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="シート内を検索..."
            className="w-full pl-8 pr-3 py-1 text-xs bg-slate-100 hover:bg-white focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder:text-slate-400"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 hover:text-slate-600"
            >
              クリア
            </button>
          )}
        </div>
      </div>

      {/* スプレッドシートテーブル表示 */}
      <div className="flex-1 overflow-auto bg-slate-100 p-2 sm:p-4 max-h-[72vh]">
        {filteredRows.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-200 text-slate-400 text-xs font-bold">
            該当するセルデータが見つかりませんでした
          </div>
        ) : (
          <div className="inline-block min-w-full align-middle bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto max-w-full">
              <table className="min-w-full border-collapse text-left text-xs text-slate-700 font-sans">
                {/* カラムヘッダー (A, B, C...) */}
                <thead className="bg-slate-100/90 sticky top-0 z-10 border-b border-slate-200 backdrop-blur-2xs">
                  <tr>
                    <th className="px-2.5 py-1.5 text-[10px] font-mono font-bold text-slate-400 text-center w-12 border-r border-slate-200 bg-slate-100 select-none">
                      #
                    </th>
                    {Array.from({ length: maxCols }).map((_, cIdx) => (
                      <th
                        key={cIdx}
                        className="px-3 py-1.5 text-[11px] font-mono font-bold text-slate-600 border-r border-slate-200 last:border-r-0 select-none bg-slate-100 min-w-[80px]"
                      >
                        {getColLabel(cIdx)}
                      </th>
                    ))}
                  </tr>
                </thead>

                {/* 行データ */}
                <tbody className="divide-y divide-slate-100 font-normal">
                  {filteredRows.slice(0, 500).map((row, rIdx) => {
                    const isHeaderRow = rIdx === 0 && !searchTerm;
                    return (
                      <tr 
                        key={rIdx} 
                        className={`hover:bg-indigo-50/40 transition-colors ${
                          isHeaderRow ? 'bg-slate-50/80 font-bold text-slate-900 border-b-2 border-slate-200' : ''
                        }`}
                      >
                        {/* 行番号 */}
                        <td className="px-2.5 py-1.5 text-[10px] font-mono text-slate-400 text-center border-r border-slate-200 bg-slate-50/50 select-none">
                          {rIdx + 1}
                        </td>
                        {/* 各セル */}
                        {Array.from({ length: maxCols }).map((_, cIdx) => {
                          const cellVal = row[cIdx];
                          const strVal = cellVal !== undefined && cellVal !== null 
                            ? (cellVal instanceof Date 
                                ? cellVal.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }) 
                                : String(cellVal)) 
                            : '';
                          const isHighlighted = searchTerm && strVal.toLowerCase().includes(searchTerm.toLowerCase());

                          return (
                            <td
                              key={cIdx}
                              className={`px-3 py-1.5 text-xs border-r border-slate-100 last:border-r-0 whitespace-nowrap overflow-hidden text-ellipsis max-w-xs ${
                                isHighlighted ? 'bg-amber-100 text-amber-900 font-bold' : ''
                              }`}
                              title={strVal}
                            >
                              {strVal}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredRows.length > 500 && (
              <div className="p-2.5 bg-slate-50 border-t border-slate-200 text-center text-[11px] text-slate-500 font-medium">
                先頭500行を表示しています（全 {filteredRows.length} 行）。すべてのデータを確認するにはファイルをダウンロードしてください。
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
