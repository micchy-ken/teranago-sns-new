import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Folder, 
  FolderPlus, 
  FileText, 
  Upload, 
  Download, 
  Archive, 
  History, 
  Users, 
  Shield, 
  Lock, 
  Globe, 
  Search, 
  ChevronRight, 
  Plus, 
  Trash2, 
  Edit3, 
  Eye, 
  AlertCircle, 
  CheckCircle2, 
  X, 
  File, 
  Image as ImageIcon, 
  Paperclip, 
  Clock, 
  FileArchive, 
  FolderArchive,
  User as UserIcon,
  RefreshCw,
  FolderOpen,
  ArrowLeft,
  Calendar,
  Layers,
  Sparkles
} from 'lucide-react';
import { API_BASE_URL } from '../config/api';
import { 
  User, 
  OfficeMaster, 
  DivisionMaster, 
  DocumentFolder, 
  DocumentItem, 
  DocumentVersion, 
  DocumentAttachedFile, 
  DocumentDownloadLog 
} from '../types';
import { MemberSelector } from './MemberSelector';
import { ConfirmModal, ConfirmModalState } from './ConfirmModal';

interface DocumentManagerProps {
  currentUser: User;
  allUsers: User[];
  offices?: OfficeMaster[];
  divisions?: DivisionMaster[];
}

// プレビューが可能な拡張子
const PREVIEW_IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'];
const PREVIEW_TEXT_EXTS = ['txt', 'csv', 'json', 'xml', 'log', 'ini', 'md'];

export default function DocumentManager({
  currentUser,
  allUsers = [],
  offices = [],
  divisions = []
}: DocumentManagerProps) {
  // 状態管理
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [items, setItems] = useState<DocumentItem[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // モーダル管理
  const [showFolderModal, setShowFolderModal] = useState<boolean>(false);
  const [editingFolder, setEditingFolder] = useState<DocumentFolder | null>(null);

  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [showVersionModal, setShowVersionModal] = useState<boolean>(false);
  const [selectedItemForVersion, setSelectedItemForVersion] = useState<DocumentItem | null>(null);

  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [selectedItemForHistory, setSelectedItemForHistory] = useState<DocumentItem | null>(null);

  const [showDownloadsModal, setShowDownloadsModal] = useState<boolean>(false);
  const [selectedItemForDownloads, setSelectedItemForDownloads] = useState<DocumentItem | null>(null);
  const [downloadLogs, setDownloadLogs] = useState<DocumentDownloadLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);

  // プレビューモーダル
  const [previewFile, setPreviewFile] = useState<{ name: string; url: string; ext: string } | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);

  // 確認モーダル
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({ isOpen: false, title: '', message: '' });

  // フォーム用State: フォルダ作成/編集
  const [folderName, setFolderName] = useState('');
  const [folderDesc, setFolderDesc] = useState('');
  const [viewerType, setViewerType] = useState<'all' | 'custom'>('all');
  const [editorType, setEditorType] = useState<'all' | 'custom'>('all');
  const [selectedViewerIds, setSelectedViewerIds] = useState<string[]>([]);
  const [selectedEditorIds, setSelectedEditorIds] = useState<string[]>([]);

  // フォーム用State: ドキュメント新規作成
  const [docTitle, setDocTitle] = useState('');
  const [docDesc, setDocDesc] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isSubmittingDoc, setIsSubmittingDoc] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);

  // フォーム用State: 新バージョン登録
  const [verChangeNote, setVerChangeNote] = useState('');
  const [verFiles, setVerFiles] = useState<File[]>([]);
  const [isSubmittingVer, setIsSubmittingVer] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const verFileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = currentUser?.isAdmin === true || currentUser?.role === 'admin' || (currentUser as any)?.id === 'u1';

  // 1. 初回データロード
  useEffect(() => {
    fetchFoldersAndItems();
  }, [currentUser]);

  const fetchFoldersAndItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        userId: currentUser?.id || '',
        isAdmin: isAdmin ? 'true' : 'false'
      });
      const [foldersRes, itemsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/documents/folders?${q.toString()}`),
        fetch(`${API_BASE_URL}/documents/items`)
      ]);

      if (foldersRes.ok) {
        const foldersData = await foldersRes.json();
        setFolders(Array.isArray(foldersData) ? foldersData : []);
      }
      if (itemsRes.ok) {
        const itemsData = await itemsRes.json();
        setItems(Array.isArray(itemsData) ? itemsData : []);
      }
    } catch (err: any) {
      console.error('文書管理データの取得に失敗しました:', err);
      setError('文書管理サーバーへの接続に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  // 現在のフォルダ情報
  const currentFolder = useMemo(() => {
    if (!selectedFolderId) return null;
    return folders.find(f => f.id === selectedFolderId) || null;
  }, [folders, selectedFolderId]);

  // パンくずリスト構築
  const breadcrumbs = useMemo(() => {
    const list: DocumentFolder[] = [];
    let curr = currentFolder;
    while (curr) {
      list.unshift(curr);
      if (!curr.parentId) break;
      curr = folders.find(f => f.id === curr?.parentId) || null;
    }
    return list;
  }, [currentFolder, folders]);

  // 現在の階層で表示すべきサブフォルダ
  const visibleSubfolders = useMemo(() => {
    return folders.filter(f => f.parentId === selectedFolderId);
  }, [folders, selectedFolderId]);

  // 現在の階層で表示すべきドキュメント
  const visibleItems = useMemo(() => {
    let list = items;
    if (selectedFolderId) {
      list = list.filter(it => it.folderId === selectedFolderId);
    } else {
      // ルート階層では、ルートに直接紐づくアイテム または 全体検索時
      list = list.filter(it => !it.folderId || it.folderId === 'root');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = items.filter(it => {
        const matchTitle = it.title?.toLowerCase().includes(q);
        const matchDesc = it.description?.toLowerCase().includes(q);
        const matchFiles = it.latestFiles?.some(f => f.fileName.toLowerCase().includes(q));
        const matchAuthor = it.createdByName?.toLowerCase().includes(q) || it.updatedByName?.toLowerCase().includes(q);
        return matchTitle || matchDesc || matchFiles || matchAuthor;
      });
    }

    return list;
  }, [items, selectedFolderId, searchQuery]);

  // 現在のフォルダに対する権限チェック
  const canUploadToCurrentFolder = useMemo(() => {
    if (!selectedFolderId) return isAdmin; // ルート直下は管理者のみ
    if (!currentFolder) return false;
    if (isAdmin) return true;
    if (currentFolder.createdById === currentUser?.id) return true;
    if (!currentFolder.permission || currentFolder.permission.editors === 'all') return true;
    if (Array.isArray(currentFolder.permission.editors)) {
      return currentFolder.permission.editors.includes(currentUser?.id || '');
    }
    return false;
  }, [currentFolder, currentUser, isAdmin, selectedFolderId]);

  // ファイルサイズ変換
  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // ファイル種別アイコン
  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (PREVIEW_IMAGE_EXTS.includes(ext)) {
      return <ImageIcon className="w-4 h-4 text-emerald-500 shrink-0" />;
    }
    if (['pdf'].includes(ext)) {
      return <FileText className="w-4 h-4 text-rose-500 shrink-0" />;
    }
    if (['xlsx', 'xls', 'csv'].includes(ext)) {
      return <FileText className="w-4 h-4 text-teal-600 shrink-0" />;
    }
    if (['docx', 'doc'].includes(ext)) {
      return <FileText className="w-4 h-4 text-blue-600 shrink-0" />;
    }
    if (['zip', 'rar', '7z'].includes(ext)) {
      return <FileArchive className="w-4 h-4 text-amber-500 shrink-0" />;
    }
    return <File className="w-4 h-4 text-slate-400 shrink-0" />;
  };

  // ------------------------------------------
  // フォルダ操作 (作成・編集・削除)
  // ------------------------------------------
  const handleOpenCreateFolderModal = () => {
    setEditingFolder(null);
    setFolderName('');
    setFolderDesc('');
    setViewerType('all');
    setEditorType('all');
    setSelectedViewerIds([]);
    setSelectedEditorIds([]);
    setShowFolderModal(true);
  };

  const handleOpenEditFolderModal = (folder: DocumentFolder, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingFolder(folder);
    setFolderName(folder.name);
    setFolderDesc(folder.description || '');
    
    if (folder.permission?.viewers === 'all') {
      setViewerType('all');
      setSelectedViewerIds([]);
    } else {
      setViewerType('custom');
      setSelectedViewerIds(Array.isArray(folder.permission?.viewers) ? folder.permission.viewers : []);
    }

    if (folder.permission?.editors === 'all') {
      setEditorType('all');
      setSelectedEditorIds([]);
    } else {
      setEditorType('custom');
      setSelectedEditorIds(Array.isArray(folder.permission?.editors) ? folder.permission.editors : []);
    }

    setShowFolderModal(true);
  };

  const handleSaveFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) return;

    const payload = {
      name: folderName.trim(),
      description: folderDesc.trim(),
      parentId: editingFolder ? editingFolder.parentId : selectedFolderId,
      createdById: currentUser?.id,
      createdByName: currentUser?.name,
      permission: {
        viewers: viewerType === 'all' ? 'all' : selectedViewerIds,
        editors: editorType === 'all' ? 'all' : selectedEditorIds
      }
    };

    try {
      if (editingFolder) {
        const res = await fetch(`${API_BASE_URL}/documents/folders/${editingFolder.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('フォルダの更新に失敗しました');
      } else {
        const res = await fetch(`${API_BASE_URL}/documents/folders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('フォルダの作成に失敗しました');
      }
      setShowFolderModal(false);
      fetchFoldersAndItems();
    } catch (err: any) {
      alert(err.message || 'フォルダの保存に失敗しました');
    }
  };

  const handleDeleteFolder = (folder: DocumentFolder, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setConfirmModal({
      isOpen: true,
      title: 'フォルダの削除',
      message: `フォルダ「${folder.name}」を削除しますか？\n※フォルダ内にファイルやサブフォルダがある場合は削除できません。`,
      confirmText: '削除する',
      cancelText: 'キャンセル',
      type: 'danger',
      onConfirm: async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/documents/folders/${folder.id}`, {
            method: 'DELETE'
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || 'フォルダの削除に失敗しました');
          }
          if (selectedFolderId === folder.id) {
            setSelectedFolderId(folder.parentId || null);
          }
          fetchFoldersAndItems();
        } catch (err: any) {
          alert(err.message || '削除できませんでした');
        }
      }
    });
  };

  // ------------------------------------------
  // ドキュメント新規作成
  // ------------------------------------------
  const handleOpenUploadModal = () => {
    setDocTitle('');
    setDocDesc('');
    setAttachedFiles([]);
    setShowUploadModal(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setAttachedFiles(prev => [...prev, ...newFiles]);
      if (!docTitle && newFiles[0]) {
        // タイトルが未入力なら1つ目のファイル名から拡張子を除いたものを自動セット
        const baseName = newFiles[0].name.replace(/\.[^/.]+$/, '');
        setDocTitle(baseName);
      }
    }
  };

  const handleDropFiles = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files);
      setAttachedFiles(prev => [...prev, ...newFiles]);
      if (!docTitle && newFiles[0]) {
        const baseName = newFiles[0].name.replace(/\.[^/.]+$/, '');
        setDocTitle(baseName);
      }
    }
  };

  const handleRemoveAttachedFile = (idx: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmitNewDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docTitle.trim()) {
      alert('タイトルを入力してください。');
      return;
    }
    if (attachedFiles.length === 0) {
      alert('添付ファイルを最低1点選択してください。');
      return;
    }

    setIsSubmittingDoc(true);
    try {
      const formData = new FormData();
      formData.append('folderId', selectedFolderId || 'root');
      formData.append('title', docTitle.trim());
      formData.append('description', docDesc.trim());
      formData.append('createdById', currentUser?.id || 'unknown');
      formData.append('createdByName', currentUser?.name || 'ユーザー');

      attachedFiles.forEach(file => {
        formData.append('files', file);
      });

      const res = await fetch(`${API_BASE_URL}/documents/items`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'ドキュメントの登録に失敗しました');
      }

      setShowUploadModal(false);
      fetchFoldersAndItems();
    } catch (err: any) {
      alert(err.message || 'アップロードに失敗しました');
    } finally {
      setIsSubmittingDoc(false);
    }
  };

  // ------------------------------------------
  // 新バージョン登録 (版上げ)
  // ------------------------------------------
  const handleOpenVersionModal = (item: DocumentItem) => {
    setSelectedItemForVersion(item);
    setVerChangeNote('');
    setVerFiles([]);
    setShowVersionModal(true);
  };

  const handleVerFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setVerFiles(Array.from(e.target.files));
    }
  };

  const handleSubmitNewVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemForVersion) return;
    if (verFiles.length === 0) {
      alert('新バージョン用の添付ファイルを1点以上選択してください。');
      return;
    }

    setIsSubmittingVer(true);
    try {
      const formData = new FormData();
      formData.append('uploadedById', currentUser?.id || 'unknown');
      formData.append('uploadedByName', currentUser?.name || 'ユーザー');
      formData.append('changeNote', verChangeNote.trim());

      verFiles.forEach(f => {
        formData.append('files', f);
      });

      const res = await fetch(`${API_BASE_URL}/documents/items/${selectedItemForVersion.id}/versions`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '新バージョンの登録に失敗しました');
      }

      setShowVersionModal(false);
      fetchFoldersAndItems();
    } catch (err: any) {
      alert(err.message || '登録に失敗しました');
    } finally {
      setIsSubmittingVer(false);
    }
  };

  // ------------------------------------------
  // ドキュメント削除
  // ------------------------------------------
  const handleDeleteDocument = (item: DocumentItem) => {
    setConfirmModal({
      isOpen: true,
      title: '文書の削除',
      message: `文書「${item.title}」およびその全バージョン履歴を削除しますか？`,
      confirmText: '削除する',
      cancelText: 'キャンセル',
      type: 'danger',
      onConfirm: async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/documents/items/${item.id}`, {
            method: 'DELETE'
          });
          if (!res.ok) throw new Error('削除に失敗しました');
          fetchFoldersAndItems();
        } catch (err: any) {
          alert(err.message || '削除に失敗しました');
        }
      }
    });
  };

  // ------------------------------------------
  // ダウンロード操作 (単品 & ZIP一括 & DLログ自動記録)
  // ------------------------------------------
  const handleDownloadSingleFile = (file: DocumentAttachedFile) => {
    const q = new URLSearchParams({
      userId: currentUser?.id || 'unknown',
      userName: currentUser?.name || '匿名',
      userDepartment: currentUser?.department || ''
    });
    const downloadUrl = `${API_BASE_URL}/documents/download/${file.fileId}?${q.toString()}`;
    window.location.href = downloadUrl;

    // UI上のカウントを即時+1反映
    setTimeout(() => {
      fetchFoldersAndItems();
    }, 1200);
  };

  const handleDownloadZip = (item: DocumentItem, versionNumber?: number) => {
    const q = new URLSearchParams({
      userId: currentUser?.id || 'unknown',
      userName: currentUser?.name || '匿名',
      userDepartment: currentUser?.department || ''
    });
    if (versionNumber) {
      q.append('version', String(versionNumber));
    }
    const zipUrl = `${API_BASE_URL}/documents/items/${item.id}/download-zip?${q.toString()}`;
    window.location.href = zipUrl;

    setTimeout(() => {
      fetchFoldersAndItems();
    }, 1200);
  };

  // ------------------------------------------
  // 履歴・DL者リストモーダル表示
  // ------------------------------------------
  const handleOpenHistoryModal = (item: DocumentItem) => {
    setSelectedItemForHistory(item);
    setShowHistoryModal(true);
  };

  const handleOpenDownloadsModal = async (item: DocumentItem) => {
    setSelectedItemForDownloads(item);
    setShowDownloadsModal(true);
    setLoadingLogs(true);
    try {
      const res = await fetch(`${API_BASE_URL}/documents/items/${item.id}/downloads`);
      if (res.ok) {
        const logs = await res.json();
        setDownloadLogs(Array.isArray(logs) ? logs : []);
      }
    } catch (err) {
      console.error('DLログの取得に失敗:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  // ------------------------------------------
  // プレビュー表示
  // ------------------------------------------
  const handlePreviewFile = async (file: DocumentAttachedFile) => {
    const ext = file.fileName.split('.').pop()?.toLowerCase() || '';
    const fileUrl = `${API_BASE_URL}${file.fileUrl.startsWith('/') ? '' : '/'}${file.fileUrl}`;
    
    setPreviewFile({ name: file.fileName, url: fileUrl, ext });
    setPreviewContent(null);

    if (PREVIEW_TEXT_EXTS.includes(ext)) {
      setPreviewLoading(true);
      try {
        const res = await fetch(fileUrl);
        if (res.ok) {
          const text = await res.text();
          setPreviewContent(text);
        }
      } catch (e) {
        console.error('プレビューのロードに失敗:', e);
      } finally {
        setPreviewLoading(false);
      }
    }
  };

  return (
    <div className="bg-slate-50 min-h-screen p-4 sm:p-6 lg:p-8">
      {/* 画面ヘッダー */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-2xl shadow-xs border border-slate-200">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-xs">
                <FolderArchive className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">文書管理キャビネット</h1>
                <p className="text-xs sm:text-sm text-slate-500 font-medium">
                  社内規定・各種マニュアル・申請書式の階層フォルダ共有とバージョン履歴管理
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <button
              onClick={fetchFoldersAndItems}
              disabled={loading}
              className="px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>更新</span>
            </button>

            {/* フォルダ作成ボタン */}
            <button
              onClick={handleOpenCreateFolderModal}
              className="px-4 py-2 text-xs sm:text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >
              <FolderPlus className="w-4 h-4 text-amber-600" />
              <span>フォルダ作成</span>
            </button>

            {/* 新規文書アップロードボタン */}
            <button
              onClick={handleOpenUploadModal}
              disabled={!canUploadToCurrentFolder && !!selectedFolderId}
              className={`px-4 py-2 text-xs sm:text-sm font-bold text-white rounded-xl shadow-xs transition-all flex items-center gap-1.5 ${
                !canUploadToCurrentFolder && !!selectedFolderId
                  ? 'bg-slate-300 cursor-not-allowed text-slate-500'
                  : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95 shadow-indigo-200'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>文書を登録</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* 左カラム: フォルダツリー・階層ナビ */}
        <div className="lg:col-span-1 flex flex-col gap-4">
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Folder className="w-4 h-4 text-indigo-500" />
                <span>フォルダ階層</span>
              </h2>
              <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                {folders.length}件
              </span>
            </div>

            {/* ルート（全階層トップ） */}
            <button
              onClick={() => setSelectedFolderId(null)}
              className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left text-xs font-bold transition-all mb-1 ${
                selectedFolderId === null
                  ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <Globe className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="truncate">すべての共有キャビネット</span>
              </div>
              <span className="text-[10px] text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-100">
                {items.length}
              </span>
            </button>

            {/* フォルダツリーリスト */}
            <div className="space-y-1 mt-2 max-h-[500px] overflow-y-auto pr-1">
              {folders.filter(f => !f.parentId).map(rootFolder => (
                <FolderTreeItem
                  key={rootFolder.id}
                  folder={rootFolder}
                  allFolders={folders}
                  selectedId={selectedFolderId}
                  onSelect={(id) => setSelectedFolderId(id)}
                  onEdit={handleOpenEditFolderModal}
                  onDelete={handleDeleteFolder}
                  currentUser={currentUser}
                  isAdmin={isAdmin}
                />
              ))}
            </div>
          </div>

          {/* 権限ガイド情報 */}
          <div className="bg-indigo-50/60 rounded-2xl p-4 border border-indigo-100/80 text-xs text-indigo-900 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 font-bold text-indigo-800">
              <Shield className="w-4 h-4 text-indigo-600" />
              <span>アクセス権限について</span>
            </div>
            <p className="text-[11px] leading-relaxed text-indigo-700/90">
              各フォルダごとに「閲覧権限」および「アップロード・編集権限」が拠点・部署単位で柔軟に設定されています。
            </p>
          </div>
        </div>

        {/* 右カラム: パンくずリスト・検索・文書一覧 */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          {/* パンくずリスト & 検索バー */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* パンくず */}
            <div className="flex items-center gap-1.5 text-xs font-semibold overflow-x-auto pb-1 sm:pb-0">
              <button
                onClick={() => setSelectedFolderId(null)}
                className={`hover:text-indigo-600 transition-colors whitespace-nowrap ${
                  selectedFolderId === null ? 'text-indigo-600 font-bold' : 'text-slate-500'
                }`}
              >
                ルート
              </button>
              {breadcrumbs.map((bc, idx) => (
                <React.Fragment key={bc.id}>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                  <button
                    onClick={() => setSelectedFolderId(bc.id)}
                    className={`hover:text-indigo-600 transition-colors whitespace-nowrap truncate max-w-[140px] sm:max-w-[200px] ${
                      idx === breadcrumbs.length - 1 ? 'text-indigo-600 font-bold' : 'text-slate-500'
                    }`}
                  >
                    {bc.name}
                  </button>
                </React.Fragment>
              ))}
            </div>

            {/* 検索入力 */}
            <div className="relative w-full sm:w-64 shrink-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="文書名・添付ファイル名で検索..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-xl outline-none transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* サブフォルダのグリッド一覧（階層を潜るナビゲーション） */}
          {visibleSubfolders.length > 0 && !searchQuery && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {visibleSubfolders.map(sub => (
                <div
                  key={sub.id}
                  onClick={() => setSelectedFolderId(sub.id)}
                  className="group bg-white hover:bg-indigo-50/40 p-3.5 rounded-2xl border border-slate-200 hover:border-indigo-200 shadow-xs transition-all cursor-pointer flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-amber-50 group-hover:bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0 transition-colors">
                      <Folder className="w-5 h-5 fill-amber-200" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xs font-bold text-slate-800 group-hover:text-indigo-700 truncate">
                        {sub.name}
                      </h3>
                      <p className="text-[10px] text-slate-400 truncate">
                        {sub.documentCount || 0}件の文書
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {(isAdmin || sub.createdById === currentUser?.id) && (
                      <button
                        onClick={(e) => handleOpenEditFolderModal(sub, e)}
                        className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-colors"
                        title="フォルダ設定"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 現在のフォルダのメタ情報ヘッダー（フォルダ選択時） */}
          {currentFolder && (
            <div className="bg-gradient-to-r from-white to-slate-50 p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-amber-500" />
                  <h2 className="text-sm font-black text-slate-800">{currentFolder.name}</h2>
                  {currentFolder.permission?.viewers === 'all' ? (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                      <Globe className="w-3 h-3" />
                      全員閲覧可
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      限定公開 ({Array.isArray(currentFolder.permission?.viewers) ? currentFolder.permission.viewers.length : 0}名)
                    </span>
                  )}
                </div>
                {currentFolder.description && (
                  <p className="text-xs text-slate-500 mt-1">{currentFolder.description}</p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {(isAdmin || currentFolder.createdById === currentUser?.id) && (
                  <>
                    <button
                      onClick={() => handleOpenEditFolderModal(currentFolder)}
                      className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                      <span>設定・権限</span>
                    </button>
                    <button
                      onClick={() => handleDeleteFolder(currentFolder)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-lg transition-colors"
                      title="フォルダ削除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ドキュメント一覧テーブル */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {visibleItems.length === 0 ? (
              <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                <FileText className="w-10 h-10 text-slate-200" />
                <p className="text-sm font-bold text-slate-600">登録された文書はありません</p>
                <p className="text-xs text-slate-400">
                  {searchQuery ? '検索条件に一致する文書が見つかりませんでした。' : '上部の「文書を登録」からファイルを添付してください。'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold">
                      <th className="py-3 px-4 min-w-[200px]">文書タイトル / 概要</th>
                      <th className="py-3 px-4 min-w-[180px]">添付ファイル (最新版)</th>
                      <th className="py-3 px-3 min-w-[100px]">作成者</th>
                      <th className="py-3 px-3 min-w-[130px]">最終更新者 (添付日)</th>
                      <th className="py-3 px-3 text-center min-w-[90px]">DL数</th>
                      <th className="py-3 px-4 text-right min-w-[170px]">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleItems.map(item => {
                      const latestVersion = item.versions?.[item.versions.length - 1];
                      const files = latestVersion?.files || item.latestFiles || [];
                      const isMulti = files.length > 1;

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors group">
                          {/* タイトル & 概要 */}
                          <td className="py-3.5 px-4 align-top">
                            <div className="flex items-start gap-2">
                              <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 mt-0.5">
                                <FileText className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                                    {item.title}
                                  </span>
                                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                                    v{latestVersion?.versionNumber || 1}
                                  </span>
                                </div>
                                {item.description && (
                                  <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                                    {item.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* 添付ファイル群 */}
                          <td className="py-3.5 px-4 align-top">
                            <div className="flex flex-col gap-1">
                              {files.slice(0, 2).map(f => (
                                <div key={f.fileId} className="flex items-center gap-1.5 text-[11px] text-slate-700 min-w-0">
                                  {getFileIcon(f.fileName)}
                                  <span className="truncate max-w-[140px] font-medium" title={f.fileName}>
                                    {f.fileName}
                                  </span>
                                  <span className="text-[10px] text-slate-400 shrink-0">
                                    ({formatBytes(f.fileSize)})
                                  </span>
                                  <button
                                    onClick={() => handlePreviewFile(f)}
                                    className="p-0.5 text-slate-400 hover:text-indigo-600 transition-colors shrink-0"
                                    title="プレビュー"
                                  >
                                    <Eye className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                              {files.length > 2 && (
                                <span className="text-[10px] font-semibold text-slate-400">
                                  他 {files.length - 2} 件のファイル同梱
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 作成者 */}
                          <td className="py-3.5 px-3 align-top whitespace-nowrap">
                            <span className="font-medium text-slate-700">{item.createdByName}</span>
                          </td>

                          {/* 最終更新者 (添付日) */}
                          <td className="py-3.5 px-3 align-top whitespace-nowrap">
                            <div className="font-semibold text-slate-800">{item.updatedByName}</div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                              <Calendar className="w-3 h-3" />
                              <span>{item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('ja-JP') : '-'}</span>
                            </div>
                          </td>

                          {/* DL数 & 履歴ポップアップトリガー */}
                          <td className="py-3.5 px-3 align-top text-center whitespace-nowrap">
                            <button
                              onClick={() => handleOpenDownloadsModal(item)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-all hover:scale-105"
                              title="ダウンロード履歴を確認"
                            >
                              <Download className="w-3 h-3" />
                              <span>{item.downloadCount || 0}回</span>
                            </button>
                          </td>

                          {/* 操作ボタングループ */}
                          <td className="py-3.5 px-4 align-top text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* ダウンロード */}
                              {isMulti ? (
                                <button
                                  onClick={() => handleDownloadZip(item)}
                                  className="px-2.5 py-1 text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-2xs transition-colors flex items-center gap-1"
                                  title="同梱ファイルをZIPで一括ダウンロード"
                                >
                                  <Archive className="w-3 h-3" />
                                  <span>一括DL</span>
                                </button>
                              ) : (
                                files[0] && (
                                  <button
                                    onClick={() => handleDownloadSingleFile(files[0])}
                                    className="px-2.5 py-1 text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-2xs transition-colors flex items-center gap-1"
                                    title="ファイルをダウンロード"
                                  >
                                    <Download className="w-3 h-3" />
                                    <span>DL</span>
                                  </button>
                                )
                              )}

                              {/* 履歴モーダル */}
                              <button
                                onClick={() => handleOpenHistoryModal(item)}
                                className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                                title="改定履歴・過去バージョン"
                              >
                                <History className="w-3.5 h-3.5" />
                              </button>

                              {/* 新バージョン登録 */}
                              <button
                                onClick={() => handleOpenVersionModal(item)}
                                className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                                title="新バージョン登録 (ファイル差し替え)"
                              >
                                <Upload className="w-3.5 h-3.5" />
                              </button>

                              {/* 削除 */}
                              {(isAdmin || item.createdById === currentUser?.id) && (
                                <button
                                  onClick={() => handleDeleteDocument(item)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-lg transition-colors"
                                  title="文書を削除"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 1. フォルダ作成・編集モーダル (権限設定 & MemberSelector) */}
      {/* ========================================================= */}
      {showFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-8">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-800 text-base">
                  {editingFolder ? 'フォルダ設定・権限変更' : '新規フォルダ作成'}
                </h3>
              </div>
              <button
                onClick={() => setShowFolderModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFolder} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  フォルダ名 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  placeholder="例: 社内規定マニュアル、営業部申請書など"
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  説明・用途 (任意)
                </label>
                <textarea
                  rows={2}
                  value={folderDesc}
                  onChange={(e) => setFolderDesc(e.target.value)}
                  placeholder="フォルダの概要や対象とする文書について記載してください"
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 outline-none transition-all"
                />
              </div>

              {/* 閲覧権限設定 */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-indigo-500" />
                  <span>閲覧権限</span>
                </label>
                <div className="flex gap-4 mb-2 text-xs">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="viewerType"
                      checked={viewerType === 'all'}
                      onChange={() => setViewerType('all')}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="font-semibold text-slate-700">社内全員に公開</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="viewerType"
                      checked={viewerType === 'custom'}
                      onChange={() => setViewerType('custom')}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="font-semibold text-slate-700">指定メンバーのみ</span>
                  </label>
                </div>

                {viewerType === 'custom' && (
                  <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <MemberSelector
                      allUsers={allUsers}
                      selectedUserIds={selectedViewerIds}
                      onChangeSelectedUserIds={setSelectedViewerIds}
                      offices={offices}
                      divisions={divisions}
                      label="閲覧を許可するメンバーを選択"
                    />
                  </div>
                )}
              </div>

              {/* アップロード・編集権限設定 */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5 text-indigo-500" />
                  <span>アップロード・編集権限 (文書の登録・版更新・削除)</span>
                </label>
                <div className="flex gap-4 mb-2 text-xs">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="editorType"
                      checked={editorType === 'all'}
                      onChange={() => setEditorType('all')}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="font-semibold text-slate-700">社内全員</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="editorType"
                      checked={editorType === 'custom'}
                      onChange={() => setEditorType('custom')}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="font-semibold text-slate-700">指定メンバーのみ</span>
                  </label>
                </div>

                {editorType === 'custom' && (
                  <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <MemberSelector
                      allUsers={allUsers}
                      selectedUserIds={selectedEditorIds}
                      onChangeSelectedUserIds={setSelectedEditorIds}
                      offices={offices}
                      divisions={divisions}
                      label="編集を許可するメンバーを選択"
                    />
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowFolderModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors"
                >
                  {editingFolder ? '変更を保存' : 'フォルダを作成'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. 新規文書登録モーダル (複数ファイル同時添付) */}
      {/* ========================================================= */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-8">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-800 text-base">新規文書の登録</h3>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitNewDocument} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  登録先フォルダ
                </label>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-2">
                  <Folder className="w-4 h-4 text-amber-500" />
                  <span>{currentFolder ? currentFolder.name : 'ルートキャビネット'}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  文書タイトル <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="例: 2026年度 経費精算書一式、営業マニュアルなど"
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  概要・説明 (任意)
                </label>
                <textarea
                  rows={2}
                  value={docDesc}
                  onChange={(e) => setDocDesc(e.target.value)}
                  placeholder="文書の用途や関連する補足事項を記載してください"
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 outline-none transition-all"
                />
              </div>

              {/* ドラッグ＆ドロップ添付エリア */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  添付ファイル (複数選択・ドラッグ対応) <span className="text-rose-500">*</span>
                </label>

                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragActive(true); }}
                  onDragLeave={() => setIsDragActive(false)}
                  onDrop={handleDropFiles}
                  onClick={() => fileInputRef.current?.click()}
                  className={`p-6 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all ${
                    isDragActive
                      ? 'border-indigo-500 bg-indigo-50/60 scale-[0.99]'
                      : 'border-slate-200 hover:border-indigo-400 bg-slate-50/60'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="flex flex-col items-center justify-center gap-1.5">
                    <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 mb-1">
                      <Paperclip className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-bold text-slate-700">
                      クリックしてファイルを選択、またはここにドラッグ＆ドロップ
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Excel, Word, PDF, CAD, ZIP, 画像など複数ファイルを1件の文書として登録可能
                    </p>
                  </div>
                </div>

                {/* 選択されたファイル一覧 */}
                {attachedFiles.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <p className="text-xs font-bold text-slate-600">添付予定ファイル ({attachedFiles.length}件):</p>
                    <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                      {attachedFiles.map((f, i) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-white border border-slate-200 rounded-xl text-xs">
                          <div className="flex items-center gap-2 truncate min-w-0">
                            {getFileIcon(f.name)}
                            <span className="truncate font-medium text-slate-700">{f.name}</span>
                            <span className="text-[10px] text-slate-400">({formatBytes(f.size)})</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveAttachedFile(i)}
                            className="p-1 text-slate-400 hover:text-rose-500 rounded-md"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  disabled={isSubmittingDoc}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingDoc || attachedFiles.length === 0}
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 disabled:bg-slate-300"
                >
                  {isSubmittingDoc ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>アップロード中...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      <span>登録する</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. 新バージョン登録モーダル (版上げ・差し替え) */}
      {/* ========================================================= */}
      {showVersionModal && selectedItemForVersion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-8">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="font-bold text-slate-800 text-base">新バージョンの登録</h3>
                  <p className="text-[11px] text-slate-400 truncate max-w-xs">{selectedItemForVersion.title}</p>
                </div>
              </div>
              <button
                onClick={() => setShowVersionModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitNewVersion} className="p-6 space-y-4">
              <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-900">
                <div className="font-bold mb-0.5">次期バージョン: 第 {(selectedItemForVersion.latestVersionNumber || 1) + 1} 版</div>
                <p className="text-[11px] text-amber-800/90 leading-relaxed">
                  新しいファイルをアップロードすると自動的にバージョン番号がインクリメントされ、過去の版も履歴からいつでも参照・ダウンロード可能です。
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  改定メモ・更新理由 (任意)
                </label>
                <input
                  type="text"
                  value={verChangeNote}
                  onChange={(e) => setVerChangeNote(e.target.value)}
                  placeholder="例: 第3条の規程改定に伴う差し替え、最新版図面の追加など"
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  差し替え・追加ファイル <span className="text-rose-500">*</span>
                </label>
                <div
                  onClick={() => verFileInputRef.current?.click()}
                  className="p-6 border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-2xl text-center cursor-pointer bg-slate-50/60"
                >
                  <input
                    ref={verFileInputRef}
                    type="file"
                    multiple
                    onChange={handleVerFileChange}
                    className="hidden"
                  />
                  <div className="flex flex-col items-center justify-center gap-1">
                    <Upload className="w-5 h-5 text-indigo-500 mb-1" />
                    <span className="text-xs font-bold text-slate-700">ファイルを選択 (複数選択可)</span>
                  </div>
                </div>

                {verFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {verFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-white border border-slate-200 rounded-lg text-xs">
                        <span className="truncate">{f.name}</span>
                        <span className="text-slate-400">({formatBytes(f.size)})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowVersionModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingVer || verFiles.length === 0}
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs disabled:bg-slate-300"
                >
                  {isSubmittingVer ? 'アップロード中...' : '新版として更新'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. 改定履歴・バージョン一覧モーダル */}
      {/* ========================================================= */}
      {showHistoryModal && selectedItemForHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-8">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="font-bold text-slate-800 text-base">バージョン改定履歴</h3>
                  <p className="text-[11px] text-slate-400">{selectedItemForHistory.title}</p>
                </div>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="space-y-4">
                {(selectedItemForHistory.versions || []).slice().reverse().map((ver, idx) => {
                  const isLatest = idx === 0;
                  return (
                    <div
                      key={ver.versionNumber}
                      className={`p-4 rounded-2xl border transition-all ${
                        isLatest
                          ? 'bg-indigo-50/30 border-indigo-200 ring-1 ring-indigo-100'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-black px-2.5 py-0.5 rounded-full ${
                            isLatest ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'
                          }`}>
                            第 {ver.versionNumber} 版 {isLatest && '(最新)'}
                          </span>
                          <span className="text-xs font-bold text-slate-700">{ver.uploadedByName}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{ver.uploadedAt ? new Date(ver.uploadedAt).toLocaleString('ja-JP') : '-'}</span>
                        </div>
                      </div>

                      {ver.changeNote && (
                        <p className="text-xs text-slate-600 mb-3 bg-slate-50/80 p-2 rounded-lg border border-slate-100">
                          {ver.changeNote}
                        </p>
                      )}

                      {/* この版の添付ファイル群 */}
                      <div className="space-y-1.5 pt-2 border-t border-slate-100">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 mb-1">
                          <span>添付ファイル ({ver.files?.length || 0}件)</span>
                          {ver.files && ver.files.length > 1 && (
                            <button
                              onClick={() => handleDownloadZip(selectedItemForHistory, ver.versionNumber)}
                              className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-semibold"
                            >
                              <Archive className="w-3 h-3" />
                              <span>この版を一括ZIPダウンロード</span>
                            </button>
                          )}
                        </div>

                        {ver.files?.map(f => (
                          <div key={f.fileId} className="flex items-center justify-between p-2 bg-white border border-slate-100 rounded-xl text-xs hover:border-slate-300 transition-colors">
                            <div className="flex items-center gap-2 min-w-0">
                              {getFileIcon(f.fileName)}
                              <span className="truncate font-medium text-slate-800">{f.fileName}</span>
                              <span className="text-[10px] text-slate-400">({formatBytes(f.fileSize)})</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => handlePreviewFile(f)}
                                className="p-1 text-slate-400 hover:text-indigo-600 rounded"
                                title="プレビュー"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDownloadSingleFile(f)}
                                className="p-1 text-slate-600 hover:text-indigo-600 rounded"
                                title="ダウンロード"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 text-right">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 5. ダウンロード履歴 (誰がいつDLしたか) モーダル */}
      {/* ========================================================= */}
      {showDownloadsModal && selectedItemForDownloads && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-8">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="font-bold text-slate-800 text-base">ダウンロード閲覧・受領ログ</h3>
                  <p className="text-[11px] text-slate-400">{selectedItemForDownloads.title}</p>
                </div>
              </div>
              <button
                onClick={() => setShowDownloadsModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 max-h-[60vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-3 text-xs">
                <span className="font-bold text-slate-700">累計ダウンロード数</span>
                <span className="font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                  {selectedItemForDownloads.downloadCount || downloadLogs.length} 回
                </span>
              </div>

              {loadingLogs ? (
                <div className="py-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>ログを取得中...</span>
                </div>
              ) : downloadLogs.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  まだダウンロード履歴はありません。
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                        <th className="py-2 px-3">氏名 / 部署</th>
                        <th className="py-2 px-3">対象</th>
                        <th className="py-2 px-3 text-right">日時</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {downloadLogs.map(log => (
                        <tr key={log.id} className="hover:bg-slate-50/60">
                          <td className="py-2 px-3">
                            <div className="font-bold text-slate-800">{log.userName}</div>
                            {log.userDepartment && (
                              <div className="text-[10px] text-slate-400">{log.userDepartment}</div>
                            )}
                          </td>
                          <td className="py-2 px-3 text-[11px] text-slate-600">
                            <span className="font-semibold">v{log.versionNumber}</span>
                            <span className="text-[10px] text-slate-400 ml-1 truncate max-w-[120px] inline-block align-bottom" title={log.fileName}>
                              ({log.fileName || '一括ZIP'})
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right text-[10px] text-slate-400 whitespace-nowrap">
                            {log.downloadedAt ? new Date(log.downloadedAt).toLocaleString('ja-JP') : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 text-right">
              <button
                onClick={() => setShowDownloadsModal(false)}
                className="px-4 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 6. ファイルプレビューモーダル */}
      {/* ========================================================= */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
          <div className="bg-white w-full max-w-4xl max-h-[88vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2 truncate">
                {getFileIcon(previewFile.name)}
                <span className="font-bold text-slate-800 text-sm truncate">{previewFile.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewFile.url}
                  download={previewFile.name}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg flex items-center gap-1 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>ダウンロード</span>
                </a>
                <button
                  onClick={() => setPreviewFile(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 p-4 overflow-auto flex items-center justify-center bg-slate-100/60 min-h-[300px]">
              {PREVIEW_IMAGE_EXTS.includes(previewFile.ext) ? (
                <img
                  src={previewFile.url}
                  alt={previewFile.name}
                  className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-xs"
                />
              ) : previewFile.ext === 'pdf' ? (
                <iframe
                  src={previewFile.url}
                  title={previewFile.name}
                  className="w-full h-[70vh] rounded-lg border border-slate-200 bg-white"
                />
              ) : PREVIEW_TEXT_EXTS.includes(previewFile.ext) ? (
                previewLoading ? (
                  <div className="text-slate-400 text-xs flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>読み込み中...</span>
                  </div>
                ) : (
                  <pre className="w-full h-[70vh] p-4 bg-white rounded-lg border border-slate-200 text-xs text-slate-700 font-mono overflow-auto whitespace-pre-wrap leading-relaxed">
                    {previewContent}
                  </pre>
                )
              ) : (
                <div className="text-center p-8 text-slate-400 flex flex-col items-center gap-2">
                  <FileText className="w-12 h-12 text-slate-300" />
                  <p className="text-sm font-bold text-slate-600">このファイル形式はプレビューに対応していません</p>
                  <p className="text-xs text-slate-400">右上のダウンロードボタンから保存してご確認ください。</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 汎用確認モーダル */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        type={confirmModal.type}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={() => {
          confirmModal.onConfirm?.();
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

// ------------------------------------------
// フォルダツリー項目コンポーネント (再帰表示対応)
// ------------------------------------------
interface FolderTreeItemProps {
  folder: DocumentFolder;
  allFolders: DocumentFolder[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEdit: (folder: DocumentFolder, e?: React.MouseEvent) => void;
  onDelete: (folder: DocumentFolder, e?: React.MouseEvent) => void;
  currentUser: User;
  isAdmin: boolean;
  level?: number;
}

function FolderTreeItem({
  folder,
  allFolders,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
  currentUser,
  isAdmin,
  level = 0
}: FolderTreeItemProps) {
  const [isOpen, setIsOpen] = useState(true);
  const children = useMemo(() => allFolders.filter(f => f.parentId === folder.id), [allFolders, folder.id]);
  const isSelected = selectedId === folder.id;
  const isCustomViewer = folder.permission && folder.permission.viewers !== 'all';

  return (
    <div className="flex flex-col">
      <div
        onClick={() => onSelect(folder.id)}
        style={{ paddingLeft: `${level * 14 + 10}px` }}
        className={`group flex items-center justify-between py-2 pr-2 rounded-xl cursor-pointer text-xs transition-all ${
          isSelected
            ? 'bg-indigo-50 text-indigo-700 font-bold ring-1 ring-indigo-200'
            : 'text-slate-700 hover:bg-slate-50 font-medium'
        }`}
      >
        <div className="flex items-center gap-2 truncate min-w-0">
          {children.length > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
              className="text-slate-400 hover:text-slate-600 p-0.5"
            >
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
            </button>
          )}
          <Folder className={`w-4 h-4 shrink-0 ${isSelected ? 'text-indigo-600 fill-indigo-100' : 'text-amber-500 fill-amber-100'}`} />
          <span className="truncate">{folder.name}</span>
          {isCustomViewer && (
            <span title="限定公開" className="shrink-0 flex items-center">
              <Lock className="w-3 h-3 text-slate-400" />
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {(isAdmin || folder.createdById === currentUser?.id) && (
            <button
              type="button"
              onClick={(e) => onEdit(folder, e)}
              className="p-1 text-slate-400 hover:text-indigo-600 rounded"
              title="編集"
            >
              <Edit3 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {isOpen && children.length > 0 && (
        <div className="space-y-0.5 mt-0.5">
          {children.map(child => (
            <FolderTreeItem
              key={child.id}
              folder={child}
              allFolders={allFolders}
              selectedId={selectedId}
              onSelect={onSelect}
              onEdit={onEdit}
              onDelete={onDelete}
              currentUser={currentUser}
              isAdmin={isAdmin}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
