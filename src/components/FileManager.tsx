import React, { useState, useEffect, useRef } from 'react';
import { 
  Folder, 
  File, 
  Search, 
  Download, 
  Upload, 
  Trash2, 
  Eye, 
  FileText, 
  Image as ImageIcon, 
  ChevronRight, 
  HardDrive, 
  RefreshCw, 
  FolderPlus, 
  ArrowLeft, 
  X, 
  ExternalLink,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { API_BASE_URL } from '../config/api';
import { User } from '../types';
import { ConfirmModal, ConfirmModalState } from './ConfirmModal';

interface ExternalFile {
  name: string;
  path: string;
  url?: string;
  size: number;
  mtime: string;
  isDirectory: boolean;
  extension: string;
  fileObject?: File;
  blobUrl?: string;
}

interface FileManagerProps {
  currentUser?: User;
}

// プレビューが有効な拡張子
const PREVIEW_IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'];
const PREVIEW_TEXT_EXTS = ['txt', 'csv', 'json', 'xml', 'log', 'ini', 'md'];

export default function FileManager({ currentUser }: FileManagerProps) {
  const [files, setFiles] = useState<ExternalFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPath, setCurrentPath] = useState<string>(''); // 空文字はルート
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({ isOpen: false, title: '', message: '' });
  
  // プレビュー関連
  const [previewFile, setPreviewFile] = useState<ExternalFile | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 初回ロード（旧バージョンのlocalStorageキャッシュをクリアして必ずAPIと同期）
  useEffect(() => {
    try {
      localStorage.removeItem('teranago_external_files_deleted');
      localStorage.removeItem('teranago_external_files_uploads_meta');
    } catch (e) {
      // ignore
    }
    fetchFileList();
  }, []);

  // ファイル一覧取得 (フォールバック処理を排除し、完全なAPI通信で一覧を取得)
  const fetchFileList = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/external-files/list`);
      if (response.ok) {
        const data: ExternalFile[] = await response.json();
        setFiles(data);
      } else {
        const errText = await response.text().catch(() => '');
        setError(`サーバーからファイル一覧を取得できませんでした (ステータス: ${response.status})。APIサーバー(${API_BASE_URL})への接続を確認してください。`);
        setFiles([]);
      }
    } catch (err: any) {
      console.error('APIから外部ファイル一覧の取得に失敗しました:', err);
      setError(`接続エラー: ${err.message || 'APIサーバーにアクセスできません。ネットワーク環境やCORS設定をご確認ください。'}`);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  // 共通のファイルアクセスURL構築ヘルパー
  const getFileUrl = (file: ExternalFile | null, isDownload = false) => {
    if (!file) return '';

    if (file.url && file.url.startsWith('http') && !file.url.includes('/api/external-files/')) {
      return file.url;
    }
    
    const relPath = file.path || '';
    const rawUrl = file.url || `/api/external-files/serve?path=${encodeURIComponent(relPath)}`;

    if (rawUrl.startsWith('http')) return rawUrl;

    const baseUrl = (API_BASE_URL || '').replace(/\/+$/, '');

    let fullUrl = '';
    if (rawUrl.startsWith('/api/')) {
      if (baseUrl.endsWith('/api')) {
        fullUrl = `${baseUrl}${rawUrl.substring(4)}`;
      } else {
        fullUrl = `${baseUrl}${rawUrl}`;
      }
    } else if (rawUrl.startsWith('/')) {
      fullUrl = `${baseUrl}${rawUrl}`;
    } else {
      fullUrl = `${baseUrl}/${rawUrl}`;
    }

    if (isDownload && !fullUrl.includes('download=1')) {
      fullUrl += `${fullUrl.includes('?') ? '&' : '?'}download=1`;
    }

    return fullUrl;
  };

  // テキストファイルのコンテンツ読み込み (プレビュー用)
  const fetchTextContent = async (file: ExternalFile) => {
    setPreviewLoading(true);
    setPreviewContent(null);
    try {
      const url = getFileUrl(file);
      const res = await fetch(url);
      if (res.ok) {
        const text = await res.text();
        if (text.includes('<!DOCTYPE html>') || text.startsWith('Cannot GET')) {
          throw new Error('APIからHTMLエラーページが返されました');
        }
        setPreviewContent(text);
      } else {
        throw new Error(`ステータスコード: ${res.status}`);
      }
    } catch (err: any) {
      setPreviewContent(`プレビューの読み込みに失敗しました (${err.message || '接続エラー'})。`);
    } finally {
      setPreviewLoading(false);
    }
  };

  // ファイルサイズ変換
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '---';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // 拡張子アイコンの決定
  const getFileIcon = (file: ExternalFile) => {
    if (file.isDirectory) return <Folder className="w-5 h-5 text-amber-500 fill-amber-100" />;
    const ext = file.extension;
    if (PREVIEW_IMAGE_EXTS.includes(ext)) {
      return <ImageIcon className="w-5 h-5 text-emerald-500" />;
    }
    if (['pdf', 'docx', 'doc', 'txt', 'xlsx', 'xls', 'pptx', 'ppt', 'csv'].includes(ext)) {
      return <FileText className="w-5 h-5 text-indigo-500" />;
    }
    return <File className="w-5 h-5 text-slate-400" />;
  };

  // パンくずリスト用の階層配列
  const getBreadcrumbs = () => {
    if (!currentPath) return [];
    return currentPath.split('/');
  };

  // 特定の階層へ移動する
  const navigateToBreadcrumb = (index: number) => {
    const parts = currentPath.split('/');
    const newPath = parts.slice(0, index + 1).join('/');
    setCurrentPath(newPath);
  };

  // 現在の階層に存在するファイル・フォルダをフィルタ
  const getVisibleFiles = () => {
    // 検索モード
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      return files.filter(f => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q));
    }

    // 階層ナビゲーションモード
    return files.filter(f => {
      if (!currentPath) {
        // ルート直下
        return !f.path.includes('/');
      } else {
        // 現在のフォルダ内
        const lastSlashIndex = f.path.lastIndexOf('/');
        const fileParent = lastSlashIndex !== -1 ? f.path.substring(0, lastSlashIndex) : '';
        return fileParent === currentPath && f.path !== currentPath;
      }
    });
  };

  // フォルダ作成
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const folderPath = currentPath ? `${currentPath}/${newFolderName.trim()}` : newFolderName.trim();
    
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/external-files/folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: folderPath })
      });
      if (response.ok) {
        setNewFolderName('');
        setShowNewFolderModal(false);
        await fetchFileList();
      } else {
        const errData = await response.json().catch(() => ({}));
        setConfirmModal({
          isOpen: true,
          title: 'フォルダ作成失敗',
          message: errData.error || 'フォルダ作成処理でエラーが発生しました。',
          type: 'warning',
          confirmText: '確認'
        });
      }
    } catch (e: any) {
      setConfirmModal({
        isOpen: true,
        title: '通信エラー',
        message: `APIサーバーに接続できませんでした: ${e.message}`,
        type: 'warning',
        confirmText: '確認'
      });
    } finally {
      setLoading(false);
    }
  };

  // ファイル削除
  const handleDeleteFile = (file: ExternalFile) => {
    setConfirmModal({
      isOpen: true,
      title: 'ファイルの削除確認',
      message: `「${file.name}」を本当に削除しますか？\nこの操作は実フォルダからファイルを削除します。`,
      type: 'danger',
      confirmText: '削除する',
      cancelText: 'キャンセル',
      onConfirm: async () => {
        try {
          const deleteUrl = `${API_BASE_URL}/external-files?path=${encodeURIComponent(file.path)}`;
          const response = await fetch(deleteUrl, {
            method: 'DELETE'
          });

          if (response.ok) {
            await fetchFileList();
          } else {
            const errData = await response.json().catch(() => ({}));
            setConfirmModal({
              isOpen: true,
              title: '削除できませんでした',
              message: errData.error || '削除処理でエラーが発生しました。',
              type: 'warning',
              confirmText: '確認'
            });
          }
        } catch (err: any) {
          setConfirmModal({
            isOpen: true,
            title: '通信エラー',
            message: `削除リクエストの通信エラーが発生しました: ${err.message}`,
            type: 'warning',
            confirmText: '確認'
          });
        }
      }
    });
  };

  // ファイルアップロードの処理
  const handleUploadFile = async (selectedFile: File) => {
    setIsUploading(true);
    setUploadProgress('アップロード中...');

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('folder', currentPath);

    try {
      const response = await fetch(`${API_BASE_URL}/external-files/upload`, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        setUploadProgress('アップロード完了！一覧を更新中...');
        await fetchFileList();
      } else {
        const errData = await response.json().catch(() => ({}));
        setConfirmModal({
          isOpen: true,
          title: 'アップロード失敗',
          message: errData.error || 'サーバーへのアップロードに失敗しました。',
          type: 'warning',
          confirmText: '確認'
        });
      }
    } catch (err: any) {
      setConfirmModal({
        isOpen: true,
        title: '通信エラー',
        message: `アップロードの通信エラーが発生しました: ${err.message}`,
        type: 'warning',
        confirmText: '確認'
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  // ドラッグ＆ドロップ
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUploadFile(e.dataTransfer.files[0]);
    }
  };

  // ファイルプレビューオープン
  const handleOpenPreview = (file: ExternalFile) => {
    setPreviewFile(file);
    if (PREVIEW_TEXT_EXTS.includes(file.extension)) {
      fetchTextContent(file);
    }
  };

  // 直接ダウンロード
  const handleDownload = async (file: ExternalFile) => {
    // 外部直リンク（unsplashなど）の場合
    if (file.url && file.url.startsWith('http') && !file.url.includes('/api/external-files/')) {
      const link = document.createElement('a');
      link.href = file.url;
      link.setAttribute('download', file.name);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    const downloadUrl = getFileUrl(file, true);
    if (!downloadUrl) return;

    try {
      const response = await fetch(downloadUrl);
      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          const text = await response.text();
          setConfirmModal({
            isOpen: true,
            title: 'ダウンロードエラー (Cannot GET)',
            message: `APIからファイルではなくHTMLレスポンス(Cannot GET /api/external-files/serve)が返されました。\nAPIサーバーのエンドポイント定義やURLルーティングをご確認ください。\n\nリクエストURL: ${downloadUrl}\n内容: ${text.slice(0, 100)}`,
            type: 'warning',
            confirmText: '確認'
          });
          return;
        }

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.setAttribute('download', file.name);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      } else {
        const errText = await response.text().catch(() => '');
        setConfirmModal({
          isOpen: true,
          title: 'ダウンロード失敗',
          message: `サーバーエラー (ステータスコード: ${response.status})\n${errText}`,
          type: 'warning',
          confirmText: '確認'
        });
      }
    } catch (err: any) {
      setConfirmModal({
        isOpen: true,
        title: '通信エラー',
        message: `ダウンロード中にエラーが発生しました: ${err.message}`,
        type: 'warning',
        confirmText: '確認'
      });
    }
  };

  const visibleFiles = getVisibleFiles();

  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[600px] animate-fade-in" id="file-manager-root">
      
      {/* ヘッダーエリア */}
      <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-800">NAS 共有ファイル・フォルダ</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            WEBアプリ外（自社NAS内の同期フォルダ等）から直接追加したファイルも自動反映され、瞬時に検索・閲覧・ダウンロード可能です。
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* 同期・再読み込み */}
          <button
            type="button"
            onClick={fetchFileList}
            disabled={loading}
            className="p-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 shadow-xs transition-colors flex items-center justify-center gap-1.5 text-xs font-medium cursor-pointer"
            title="NAS同期を更新"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            再同期
          </button>

          {/* 新規フォルダ */}
          <button
            type="button"
            onClick={() => setShowNewFolderModal(true)}
            className="p-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 shadow-xs transition-colors flex items-center justify-center gap-1.5 text-xs font-medium cursor-pointer"
          >
            <FolderPlus className="w-3.5 h-3.5 text-amber-500" />
            新規フォルダ
          </button>

          {/* アップロードボタン */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            アップロード
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={(e) => e.target.files?.[0] && handleUploadFile(e.target.files[0])} 
            className="hidden" 
          />
        </div>
      </div>

      {/* 検索・ナビゲーション */}
      <div className="p-4 border-b border-slate-100 bg-white flex flex-col sm:flex-row items-center gap-4">
        {/* パンくずリスト、または検索時の状態 */}
        <div className="flex-1 flex items-center gap-1 overflow-x-auto w-full py-1">
          <button
            onClick={() => { setCurrentPath(''); setSearchQuery(''); }}
            className="text-xs font-bold text-slate-600 hover:text-indigo-600 flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-lg shrink-0"
          >
            <HardDrive className="w-3 h-3 text-slate-500" />
            ROOT
          </button>

          {getBreadcrumbs().map((part, index) => (
            <React.Fragment key={index}>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <button
                onClick={() => { navigateToBreadcrumb(index); setSearchQuery(''); }}
                className="text-xs font-semibold text-slate-600 hover:text-indigo-600 max-w-[120px] truncate bg-slate-50 px-2 py-1 rounded-lg shrink-0"
              >
                {part}
              </button>
            </React.Fragment>
          ))}

          {searchQuery && (
            <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg font-bold">
              検索中: "{searchQuery}"
            </span>
          )}
        </div>

        {/* 検索バー */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="全階層からファイルをインクリメンタル検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-4 py-2 w-full text-xs bg-slate-100 border-none focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-xl placeholder-slate-400 transition-all duration-200"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ドラッグ＆ドロップドロップエリア */}
      <div 
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`flex-1 p-6 flex flex-col relative ${isDragActive ? 'bg-indigo-50/50 ring-2 ring-indigo-500 ring-dashed' : ''}`}
      >
        {/* ドラッグオーバーオーバーレイ */}
        {isDragActive && (
          <div className="absolute inset-0 bg-indigo-50/70 z-10 flex flex-col items-center justify-center pointer-events-none">
            <Upload className="w-12 h-12 text-indigo-600 animate-bounce mb-2" />
            <p className="text-sm font-bold text-indigo-700">ここにファイルをドロップしてアップロード</p>
            <p className="text-xs text-indigo-500 mt-1">現在のフォルダ: {currentPath || 'ROOT'}</p>
          </div>
        )}

        {/* アップロードプログレス */}
        {isUploading && (
          <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-xl mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-indigo-600 animate-spin" />
              <span className="text-xs font-medium text-indigo-700">{uploadProgress}</span>
            </div>
          </div>
        )}

        {/* エラーメッセージ表示 */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl mb-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-xs font-bold text-rose-800">同期エラー</h4>
              <p className="text-xs text-rose-700 mt-0.5 leading-relaxed">{error}</p>
            </div>
            <button 
              onClick={fetchFileList}
              className="text-xs font-bold bg-white text-rose-700 hover:bg-rose-100 border border-rose-200 px-2.5 py-1 rounded-lg transition-colors shrink-0 cursor-pointer"
            >
              再試行
            </button>
          </div>
        )}

        {/* ロード中 */}
        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center py-20">
            <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
            <p className="text-xs text-slate-500">NAS フォルダ同期中...</p>
          </div>
        )}

        {/* ファイルリストテーブル */}
        {!loading && (
          <div className="flex-1 overflow-x-auto">
            {visibleFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <Folder className="w-12 h-12 text-slate-300 mb-2" />
                <p className="text-sm font-semibold text-slate-500">このフォルダにはファイルがありません</p>
                <p className="text-xs text-slate-400 mt-1">
                  NASの該当フォルダにファイルを追加するか、上の「アップロード」ボタンからファイルを追加してください。
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 text-xs font-semibold">
                    <th className="pb-3 pt-1 pl-2">名前</th>
                    <th className="pb-3 pt-1">更新日時</th>
                    <th className="pb-3 pt-1 text-right">サイズ</th>
                    <th className="pb-3 pt-1 text-right pr-2">アクション</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* 一つ上のフォルダに戻るボタン (階層モードかつルート以外の場合) */}
                  {!searchQuery && currentPath && (
                    <tr 
                      onClick={() => {
                        const idx = currentPath.lastIndexOf('/');
                        setCurrentPath(idx !== -1 ? currentPath.substring(0, idx) : '');
                      }}
                      className="group hover:bg-slate-50/50 cursor-pointer transition-colors"
                    >
                      <td className="py-3 pl-2 flex items-center gap-3">
                        <div className="p-1 bg-slate-100 rounded-lg group-hover:bg-slate-200 transition-colors">
                          <ArrowLeft className="w-4 h-4 text-slate-600" />
                        </div>
                        <span className="text-xs font-bold text-slate-500">... (親フォルダへ)</span>
                      </td>
                      <td className="py-3 text-xs text-slate-400">---</td>
                      <td className="py-3 text-xs text-slate-400 text-right">---</td>
                      <td className="py-3 text-right pr-2"></td>
                    </tr>
                  )}

                  {/* 各ファイル・フォルダの描画 */}
                  {visibleFiles.map((file, i) => (
                    <tr 
                      key={i}
                      className="group hover:bg-slate-50/40 transition-colors"
                    >
                      <td className="py-3.5 pl-2">
                        {file.isDirectory ? (
                          // フォルダクリックで中へ
                          <button
                            type="button"
                            onClick={() => setCurrentPath(file.path)}
                            className="flex items-center gap-3 font-semibold text-xs text-slate-700 hover:text-indigo-600 text-left cursor-pointer focus:outline-none"
                          >
                            <div className="p-1.5 bg-amber-50 rounded-xl group-hover:bg-amber-100 transition-colors">
                              {getFileIcon(file)}
                            </div>
                            <span className="truncate max-w-[300px] sm:max-w-[400px]">
                              {file.name}
                            </span>
                          </button>
                        ) : (
                          // ファイル表示
                          <div className="flex items-center gap-3 text-xs text-slate-600">
                            <div className="p-1.5 bg-slate-50 rounded-xl group-hover:bg-slate-100 transition-colors">
                              {getFileIcon(file)}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-medium truncate max-w-[240px] sm:max-w-[380px] text-slate-700">
                                {file.name}
                              </span>
                              {searchQuery && (
                                <span className="text-[10px] text-slate-400 truncate max-w-[240px]">
                                  パス: {file.path}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 text-xs text-slate-500">
                        {new Date(file.mtime).toLocaleString('ja-JP', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="py-3.5 text-xs font-mono text-slate-500 text-right">
                        {formatBytes(file.size)}
                      </td>
                      <td className="py-3.5 text-right pr-2">
                        <div className="flex items-center justify-end gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                          
                          {/* プレビューボタン */}
                          {!file.isDirectory && (PREVIEW_IMAGE_EXTS.includes(file.extension) || PREVIEW_TEXT_EXTS.includes(file.extension) || file.extension === 'pdf') && (
                            <button
                              onClick={() => handleOpenPreview(file)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                              title="ブラウザでプレビュー"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}

                          {/* ダウンロード */}
                          {!file.isDirectory && (
                            <button
                              onClick={() => handleDownload(file)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                              title="ダウンロード"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          )}

                          {/* 削除 (管理者 or 権限、ここでは自由削除可としておく) */}
                          <button
                            onClick={() => handleDeleteFile(file)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="削除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* プレビューモーダル */}
      {previewFile && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden">
            
            {/* モーダルヘッダー */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                {getFileIcon(previewFile)}
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-800 truncate max-w-[300px] sm:max-w-md">
                    {previewFile.name}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    サイズ: {formatBytes(previewFile.size)} | 更新: {new Date(previewFile.mtime).toLocaleString('ja-JP')}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownload(previewFile)}
                  className="p-2 hover:bg-indigo-50 text-indigo-600 hover:text-indigo-700 rounded-xl transition-colors text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  ダウンロード
                </button>
                <button
                  onClick={() => {
                    const fullUrl = getFileUrl(previewFile);
                    if (fullUrl) {
                      window.open(fullUrl, '_blank');
                    }
                  }}
                  className="p-2 hover:bg-slate-100 text-slate-600 rounded-xl transition-colors text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  title="新しいタブで開く"
                >
                  <ExternalLink className="w-4 h-4" />
                  新規タブ
                </button>
                <button
                  onClick={() => { setPreviewFile(null); setPreviewContent(null); }}
                  className="p-2 hover:bg-slate-200 text-slate-500 rounded-xl transition-colors cursor-pointer"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>

            {/* モーダルコンテンツ */}
            <div className="flex-1 bg-slate-100 p-6 overflow-auto flex items-center justify-center">
              {previewLoading ? (
                <div className="flex flex-col items-center">
                  <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mb-2" />
                  <span className="text-xs text-slate-500">読み込み中...</span>
                </div>
              ) : PREVIEW_IMAGE_EXTS.includes(previewFile.extension) ? (
                // 画像プレビュー
                <img 
                  src={getFileUrl(previewFile)}
                  alt={previewFile.name}
                  referrerPolicy="no-referrer"
                  className="max-w-full max-h-full object-contain rounded-lg shadow-sm"
                />
              ) : previewFile.extension === 'pdf' ? (
                // PDFプレビュー (iframe)
                <iframe
                  src={getFileUrl(previewFile)}
                  className="w-full h-full border-none rounded-lg bg-white shadow-sm"
                  title="PDFプレビュー"
                />
              ) : PREVIEW_TEXT_EXTS.includes(previewFile.extension) && previewContent ? (
                // テキストプレビュー
                <pre className="w-full h-full bg-slate-900 text-slate-100 p-4 rounded-lg font-mono text-xs overflow-auto text-left leading-relaxed">
                  {previewContent}
                </pre>
              ) : (
                <div className="text-center">
                  <File className="w-16 h-16 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-600">このファイル形式はプレビュー非対応です</p>
                  <p className="text-xs text-slate-500 mt-1">上のダウンロードボタンからダウンロードしてご確認ください。</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 新規フォルダモーダル */}
      {showNewFolderModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-6">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-4">
              <FolderPlus className="w-4 h-4 text-amber-500" />
              新規フォルダ作成
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">フォルダ名</label>
                <input
                  type="text"
                  placeholder="フォルダ名を入力..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewFolderModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleCreateFolder}
                  disabled={!newFolderName.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  作成
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        {...confirmModal}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
