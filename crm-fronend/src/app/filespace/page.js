'use client';
/* eslint-disable @next/next/no-img-element -- preview uses short-lived signed S3 URLs */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Archive, Code2, Download, File, FileAudio, FileImage, FileSpreadsheet,
  FileText, FileVideo, Folder, FolderPlus, LoaderCircle, Presentation,
  Copy, ExternalLink, History, MessageCircle, Move, Pencil, RotateCcw, Search, ShieldAlert, ShieldCheck, Trash2, UploadCloud,
} from 'lucide-react';
import { toast } from 'react-toastify';

const apiUrl = (path) => `${process.env.NEXT_PUBLIC_API_URL}${path}`;
const authHeaders = (extra = {}) => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`,
  ...extra,
});

const request = async (path, options = {}) => {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: authHeaders(options.headers),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Ошибка ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
};

const formatSize = (value) => {
  const size = Number(value || 0);
  if (size < 1024) return `${size} Б`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} КБ`;
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} МБ`;
  return `${(size / 1024 ** 3).toFixed(1)} ГБ`;
};

const extensionOf = (name) => String(name || '').split('.').pop()?.toLowerCase() || '';
const isImage = (file) => String(file.contentType || '').startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(extensionOf(file.name));
const isPdf = (file) => String(file.contentType || '').toLowerCase() === 'application/pdf' || extensionOf(file.name) === 'pdf';
const isSpreadsheet = (file) => extensionOf(file.name) === 'xlsx';
const isPreviewable = (file) => isImage(file) || isPdf(file) || isSpreadsheet(file);
const isFileAvailable = (file) => ['clean', 'skipped'].includes(file.scanStatus);

const FileTypeIcon = ({ file }) => {
  const type = String(file.contentType || '').toLowerCase();
  const extension = extensionOf(file.name);
  const props = { size: 25, strokeWidth: 1.8 };
  if (isImage(file)) return <FileImage {...props} className="text-fuchsia-500" />;
  if (extension === 'pdf' || type === 'application/pdf') return <div className="flex h-7 w-6 items-center justify-center rounded-sm bg-red-600 text-[8px] font-extrabold tracking-tight text-white shadow-sm">PDF</div>;
  if (type.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(extension)) return <FileVideo {...props} className="text-violet-500" />;
  if (type.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(extension)) return <FileAudio {...props} className="text-pink-500" />;
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) return <Archive {...props} className="text-amber-600" />;
  if (['xls', 'xlsx', 'csv', 'ods'].includes(extension)) return <FileSpreadsheet {...props} className="text-emerald-600" />;
  if (['ppt', 'pptx', 'odp'].includes(extension)) return <Presentation {...props} className="text-orange-500" />;
  if (['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'xml', 'py', 'sql'].includes(extension)) return <Code2 {...props} className="text-cyan-600" />;
  if (type.startsWith('text/') || ['doc', 'docx', 'txt', 'rtf', 'odt'].includes(extension)) return <FileText {...props} className="text-blue-600" />;
  return <File {...props} className="text-slate-500" />;
};

export default function FileSpacePage() {
  const router = useRouter();
  const [current, setCurrent] = useState(null);
  const [items, setItems] = useState({ folders: [], files: [] });
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyLabel, setBusyLabel] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [previewUrls, setPreviewUrls] = useState({});
  const [previewLoading, setPreviewLoading] = useState('');
  const [previewErrors, setPreviewErrors] = useState(() => new Set());
  const [spreadsheetPreviews, setSpreadsheetPreviews] = useState({});
  const [previewFile, setPreviewFile] = useState(null);
  const [personalRoot, setPersonalRoot] = useState(null);
  const [personalFolders, setPersonalFolders] = useState([]);
  const [sharedFolders, setSharedFolders] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canWrite, setCanWrite] = useState(true);
  const [contextMenu, setContextMenu] = useState(null);
  const [accessEditor, setAccessEditor] = useState(null);
  const [view, setView] = useState('folder');
  const [query, setQuery] = useState('');
  const [trashItems, setTrashItems] = useState({ folders: [], files: [] });
  const [trashFileCount, setTrashFileCount] = useState(0);
  const [selectedTrashFiles, setSelectedTrashFiles] = useState(() => new Set());
  const [auditEntries, setAuditEntries] = useState([]);
  const [auditCount, setAuditCount] = useState(0);
  const [auditRetentionDays, setAuditRetentionDays] = useState(180);
  const [auditQuery, setAuditQuery] = useState('');
  const [auditCursor, setAuditCursor] = useState(null);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoadingMore, setAuditLoadingMore] = useState(false);
  const [moveEditor, setMoveEditor] = useState(null);
  const [versionEditor, setVersionEditor] = useState(null);
  const [searchOrigin, setSearchOrigin] = useState(null);
  const fileInput = useRef(null);
  const versionFileInput = useRef(null);
  const previewObjectUrls = useRef(new Set());
  const auditSentinel = useRef(null);

  const openFolder = useCallback(async (folder, addToHistory = true) => {
    setLoading(true);
    try {
      const data = await request(`/filespace/folders/${folder.id}`);
      if (addToHistory && current) setHistory((value) => [...value, current]);
      setCurrent(data.folder);
      setView('folder');
      setItems({ folders: data.folders, files: data.files });
      setCanWrite(Boolean(data.canWrite));
      setSelected(new Set());
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [current]);

  useEffect(() => {
    request('/filespace/root')
      .then((data) => {
        setPersonalRoot(data.personalRoot);
        setPersonalFolders(data.personalFolders || []);
        setSharedFolders(data.sharedFolders);
        setIsAdmin(Boolean(data.isAdmin));
        setTrashFileCount(Number(data.trashFileCount || 0));
        setAuditCount(Number(data.auditCount || 0));
        setAuditRetentionDays(Number(data.auditRetentionDays || 180));
        return openFolder(data.personalRoot, false);
      })
      .catch((error) => { toast.error(error.message); setLoading(false); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshNavigationCounts = async () => {
    const data = await request('/filespace/root');
    setPersonalRoot(data.personalRoot);
    setPersonalFolders(data.personalFolders || []);
    setSharedFolders(data.sharedFolders || []);
    setTrashFileCount(Number(data.trashFileCount || 0));
    setAuditCount(Number(data.auditCount || 0));
    setAuditRetentionDays(Number(data.auditRetentionDays || 180));
  };

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  useEffect(() => () => {
    previewObjectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    previewObjectUrls.current.clear();
  }, []);

  useEffect(() => {
    if (view !== 'folder' || !current?.id || !items.files.some((file) => ['pending', 'scanning'].includes(file.scanStatus))) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const data = await request(`/filespace/folders/${current.id}`);
        setItems({ folders: data.folders, files: data.files });
      } catch { /* следующая ручная загрузка покажет ошибку */ }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [view, current?.id, items.files]);

  const goBack = () => {
    const parent = history.at(-1);
    if (!parent) return;
    setHistory((value) => value.slice(0, -1));
    openFolder(parent, false);
  };

  const createFolder = async () => {
    const name = window.prompt('Название новой папки');
    if (!name?.trim()) return;
    setBusyLabel('Создаём папку…');
    try {
      await request('/filespace/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId: current.id, name }),
      });
      await openFolder(current, false);
    } catch (error) { toast.error(error.message); }
    finally { setBusyLabel(''); }
  };

  const createSharedFolder = async () => {
    const name = window.prompt('Название общей папки');
    if (!name?.trim()) return;
    setBusyLabel('Создаём общую папку…');
    try {
      const folder = await request('/filespace/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, kind: 'shared' }),
      });
      setSharedFolders((value) => [...value, { ...folder, canDelete: true }].sort((a, b) => a.name.localeCompare(b.name, 'ru')));
      setHistory([]);
      await openFolder(folder, false);
    } catch (error) { toast.error(error.message); }
    finally { setBusyLabel(''); }
  };

  const openAccessEditor = async (folder) => {
    setContextMenu(null);
    setBusyLabel('Загружаем права доступа…');
    try {
      const data = await request(`/filespace/folders/${folder.id}/access`);
      setAccessEditor(data);
    } catch (error) { toast.error(error.message); }
    finally { setBusyLabel(''); }
  };

  const toggleAccessRole = (roleId) => setAccessEditor((value) => ({
    ...value,
    roles: value.roles.map((role) => role.id === roleId ? { ...role, allowed: !role.allowed } : role),
  }));

  const saveAccess = async () => {
    setBusyLabel('Сохраняем права доступа…');
    try {
      await request(`/filespace/folders/${accessEditor.folder.id}/access`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleIds: accessEditor.roles.filter((role) => role.allowed).map((role) => role.id) }),
      });
      setAccessEditor(null);
      toast.success('Права общей папки сохранены');
    } catch (error) { toast.error(error.message); }
    finally { setBusyLabel(''); }
  };

  const openFromNavigation = (folder) => {
    setHistory([]);
    openFolder(folder, false);
  };

  const showContextMenu = (event, type, item, writable = canWrite) => {
    if (!writable && type !== 'file') return;
    event.preventDefault();
    event.stopPropagation();
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : event.clientX + 240;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : event.clientY + 320;
    setContextMenu({
      x: Math.max(8, Math.min(event.clientX, viewportWidth - 240)),
      y: Math.max(8, Math.min(event.clientY, viewportHeight - 320)),
      type,
      item,
      writable,
    });
  };

  const showSharedContextMenu = (event, folder) => {
    if (!isAdmin) return;
    event.preventDefault();
    event.stopPropagation();
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : event.clientX + 240;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : event.clientY + 260;
    setContextMenu({
      x: Math.max(8, Math.min(event.clientX, viewportWidth - 240)),
      y: Math.max(8, Math.min(event.clientY, viewportHeight - 260)),
      type: 'folder',
      item: folder,
      access: true,
      writable: Boolean(folder.canDelete),
    });
  };

  const uploadFiles = async (selected) => {
    if (!selected?.length || !current) return;
    setBusyLabel(selected.length > 1 ? `Загружаем файлы: 0 из ${selected.length}` : `Загружаем «${selected[0].name}»…`);
    try {
      for (const [index, selectedFile] of selected.entries()) {
        if (selected.length > 1) setBusyLabel(`Загружаем файлы: ${index + 1} из ${selected.length}`);
        const started = await request('/filespace/uploads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            folderId: current.id,
            name: selectedFile.name,
            size: selectedFile.size,
            contentType: selectedFile.type || 'application/octet-stream',
          }),
        });
        const uploaded = await fetch(started.uploadUrl, {
          method: started.method,
          headers: started.headers,
          body: selectedFile,
        });
        if (!uploaded.ok) throw new Error(`Не удалось загрузить «${selectedFile.name}»`);
        await request(`/filespace/uploads/${started.file.id}/complete`, { method: 'POST' });
      }
      toast.success('Файлы загружены и переданы на антивирусную проверку');
      await openFolder(current, false);
      await refreshNavigationCounts();
    } catch (error) { toast.error(error.message); }
    finally {
      setBusyLabel('');
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const downloadFile = async (file) => {
    setBusyLabel(`Подготавливаем «${file.name}»…`);
    try {
      const { url } = await request(`/filespace/files/${file.id}/download`);
      window.location.assign(url);
    } catch (error) { toast.error(error.message); }
    finally { setBusyLabel(''); }
  };

  const openFile = async (file) => {
    const popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    setBusyLabel(`Открываем «${file.name}»…`);
    try {
      const { url } = await request(`/filespace/files/${file.id}/open`);
      if (popup) popup.location.replace(url); else window.location.assign(url);
    } catch (error) {
      if (popup) popup.close();
      toast.error(error.message);
    } finally { setBusyLabel(''); }
  };

  const deleteFile = async (file) => {
    if (!window.confirm(`Переместить «${file.name}» в корзину?`)) return;
    setBusyLabel('Удаляем файл…');
    try {
      await request(`/filespace/files/${file.id}`, { method: 'DELETE' });
      setTrashFileCount((value) => value + 1);
      setItems((value) => ({ ...value, files: value.files.filter((item) => item.id !== file.id) }));
      setSelected((value) => { const next = new Set(value); next.delete(file.id); return next; });
      await refreshNavigationCounts();
    } catch (error) { toast.error(error.message); }
    finally { setBusyLabel(''); }
  };

  const toggleSelected = (fileId) => setSelected((value) => {
    const next = new Set(value);
    if (next.has(fileId)) next.delete(fileId); else next.add(fileId);
    return next;
  });

  const toggleAll = () => setSelected((value) => (
    value.size === items.files.length ? new Set() : new Set(items.files.map((file) => file.id))
  ));

  const deleteSelected = async () => {
    const ids = [...selected];
    if (!ids.length || !window.confirm(`Переместить выбранные файлы (${ids.length}) в корзину?`)) return;
    setBusyLabel(`Удаляем файлы: ${ids.length}…`);
    try {
      await request('/filespace/files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      setItems((value) => ({ ...value, files: value.files.filter((file) => !selected.has(file.id)) }));
      setTrashFileCount((value) => value + ids.length);
      setSelected(new Set());
      await refreshNavigationCounts();
      toast.success('Выбранные файлы перемещены в корзину');
    } catch (error) { toast.error(error.message); }
    finally { setBusyLabel(''); }
  };

  const loadPreview = async (file) => {
    if (!isPreviewable(file) || previewUrls[file.id] || spreadsheetPreviews[file.id] || previewErrors.has(file.id) || previewLoading === file.id) return;
    setPreviewLoading(file.id);
    try {
      const response = await fetch(apiUrl(`/filespace/files/${file.id}/preview`), { headers: authHeaders() });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Ошибка ${response.status}`);
      }
      if (isSpreadsheet(file)) {
        const data = await response.json();
        setSpreadsheetPreviews((value) => ({ ...value, [file.id]: data }));
      } else {
        const url = URL.createObjectURL(await response.blob());
        previewObjectUrls.current.add(url);
        setPreviewUrls((value) => ({ ...value, [file.id]: url }));
      }
    } catch (error) {
      console.warn('Не удалось загрузить превью:', error.message);
      setPreviewErrors((value) => new Set(value).add(file.id));
    } finally { setPreviewLoading(''); }
  };

  const markPreviewFailed = (fileId) => {
    setPreviewErrors((value) => new Set(value).add(fileId));
    setPreviewUrls((value) => { const next = { ...value }; delete next[fileId]; return next; });
  };

  const showPreview = (file) => {
    if (!isPreviewable(file)) return;
    setPreviewFile(file);
    loadPreview(file);
  };

  const handleFileClick = (file) => {
    if (!isFileAvailable(file)) {
      toast.info(file.scanStatus === 'infected' ? 'Файл заблокирован: обнаружена угроза' : file.scanStatus === 'failed' ? 'Антивирусная проверка не выполнена' : 'Файл ещё проверяется антивирусом');
      return;
    }
    if (isPreviewable(file)) showPreview(file);
    else openFile(file);
  };

  const rescanFile = async (file) => {
    setBusyLabel(`Повторно проверяем «${file.name}»…`);
    try {
      await request(`/filespace/files/${file.id}/rescan`, { method: 'POST' });
      if (view === 'folder' && current) await openFolder(current, false); else await runSearch();
      toast.success('Файл снова поставлен в очередь проверки');
    } catch (error) { toast.error(error.message); }
    finally { setBusyLabel(''); }
  };

  const runSearch = async (event) => {
    event?.preventDefault();
    if (query.trim().length < 2) return toast.info('Введите минимум 2 символа');
    setLoading(true);
    try {
      if (view === 'folder' && current) setSearchOrigin(current);
      const data = await request(`/filespace/search?q=${encodeURIComponent(query.trim())}`);
      setItems(data);
      setView('search');
      setCurrent(null);
      setHistory([]);
      setSelected(new Set());
    } catch (error) { toast.error(error.message); }
    finally { setLoading(false); }
  };

  const clearSearch = async () => {
    setQuery('');
    const destination = searchOrigin || personalRoot;
    if (destination) await openFolder(destination, false);
    setSearchOrigin(null);
  };

  const openTrash = async () => {
    setLoading(true);
    try {
      const data = await request('/filespace/trash');
      setTrashItems(data);
      setTrashFileCount(Number(data.fileCount ?? data.files.length));
      setSelectedTrashFiles(new Set());
      setView('trash'); setCurrent(null); setHistory([]);
    } catch (error) { toast.error(error.message); }
    finally { setLoading(false); }
  };

  const openAudit = async () => {
    setLoading(true);
    try {
      const data = await request('/filespace/audit?limit=50');
      setAuditEntries(data.entries);
      setAuditCursor(data.nextCursor);
      setAuditTotal(Number(data.total || 0));
      setAuditCount(Number(data.total || 0));
      setAuditRetentionDays(Number(data.retentionDays || 180));
      setAuditQuery('');
      setView('audit'); setCurrent(null); setHistory([]);
    } catch (error) { toast.error(error.message); }
    finally { setLoading(false); }
  };

  const searchAudit = async (event) => {
    event?.preventDefault();
    setLoading(true);
    try {
      const data = await request(`/filespace/audit?limit=50&q=${encodeURIComponent(auditQuery.trim())}`);
      setAuditEntries(data.entries);
      setAuditCursor(data.nextCursor);
      setAuditTotal(Number(data.total || 0));
      setAuditRetentionDays(Number(data.retentionDays || auditRetentionDays));
    } catch (error) { toast.error(error.message); }
    finally { setLoading(false); }
  };

  const clearAuditSearch = async () => {
    setAuditQuery('');
    setLoading(true);
    try {
      const data = await request('/filespace/audit?limit=50');
      setAuditEntries(data.entries); setAuditCursor(data.nextCursor); setAuditTotal(Number(data.total || 0)); setAuditCount(Number(data.total || 0)); setAuditRetentionDays(Number(data.retentionDays || 180));
    } catch (error) { toast.error(error.message); }
    finally { setLoading(false); }
  };

  const loadMoreAudit = useCallback(async () => {
    if (!auditCursor || auditLoadingMore) return;
    setAuditLoadingMore(true);
    try {
      const data = await request(`/filespace/audit?limit=50&cursor=${encodeURIComponent(auditCursor)}&q=${encodeURIComponent(auditQuery.trim())}`);
      setAuditEntries((value) => [...value, ...data.entries]);
      setAuditCursor(data.nextCursor);
    } catch (error) { toast.error(error.message); }
    finally { setAuditLoadingMore(false); }
  }, [auditCursor, auditLoadingMore, auditQuery]);

  useEffect(() => {
    if (view !== 'audit' || !auditCursor || !auditSentinel.current) return undefined;
    const observer = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting) loadMoreAudit(); }, { rootMargin: '240px' });
    observer.observe(auditSentinel.current);
    return () => observer.disconnect();
  }, [view, auditCursor, loadMoreAudit]);

  const renameItem = async (type, item) => {
    setContextMenu(null);
    const name = window.prompt('Новое название', item.name);
    if (!name?.trim() || name.trim() === item.name) return;
    setBusyLabel('Переименовываем…');
    try {
      await request(`/filespace/${type === 'folder' ? 'folders' : 'files'}/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      if (view === 'folder') await openFolder(current, false); else await runSearch();
      if (type === 'folder' && !item.parentId) await refreshNavigationCounts();
    } catch (error) { toast.error(error.message); }
    finally { setBusyLabel(''); }
  };

  const trashItem = async (type, item) => {
    setContextMenu(null);
    if (!window.confirm(`Переместить «${item.name}» в корзину?`)) return;
    setBusyLabel('Перемещаем в корзину…');
    try {
      await request(`/filespace/${type === 'folder' ? 'folders' : 'files'}/${item.id}`, { method: 'DELETE' });
      if (type === 'file') setTrashFileCount((value) => value + 1);
      if (type === 'folder' && !item.parentId) {
        await refreshNavigationCounts();
        setHistory([]);
        await openFolder(personalRoot, false);
      } else {
        if (view === 'folder') await openFolder(current, false); else await runSearch();
        if (type === 'file') await refreshNavigationCounts();
      }
    } catch (error) { toast.error(error.message); }
    finally { setBusyLabel(''); }
  };

  const beginMove = async (type, item) => {
    setContextMenu(null); setBusyLabel('Загружаем список папок…');
    try { setMoveEditor({ type, item, destinations: await request(`/filespace/destinations?sourceType=${type}&sourceId=${encodeURIComponent(item.id)}`), destinationFolderId: '' }); }
    catch (error) { toast.error(error.message); }
    finally { setBusyLabel(''); }
  };

  const sendFileToChat = (file) => {
    setContextMenu(null);
    try {
      sessionStorage.setItem('filespace:sendToChat', JSON.stringify({ fileId: file.id, name: file.name }));
      router.push('/webchats?filespaceSend=1');
    } catch (error) {
      toast.error(`Не удалось открыть выбор чата: ${error.message}`);
    }
  };

  const openVersionHistory = async (file) => {
    setContextMenu(null);
    setBusyLabel('Загружаем историю версий…');
    try {
      setVersionEditor(await request(`/filespace/files/${file.id}/versions`));
    } catch (error) { toast.error(error.message); }
    finally { setBusyLabel(''); }
  };

  const downloadFileVersion = async (version) => {
    setBusyLabel(`Подготавливаем версию ${version.versionNumber}…`);
    try {
      const { url } = await request(`/filespace/files/${versionEditor.file.id}/versions/${version.id}/download`);
      window.location.assign(url);
    } catch (error) { toast.error(error.message); }
    finally { setBusyLabel(''); }
  };

  const openFileVersion = async (version) => {
    const popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    try {
      const { url } = await request(`/filespace/files/${versionEditor.file.id}/versions/${version.id}/open`);
      if (popup) popup.location.replace(url); else window.location.assign(url);
    } catch (error) {
      popup?.close();
      toast.error(error.message);
    }
  };

  const restoreFileVersion = async (version) => {
    if (!window.confirm(`Восстановить версию ${version.versionNumber} файла «${versionEditor.file.name}»? Текущая версия сохранится в истории.`)) return;
    setBusyLabel('Восстанавливаем версию…');
    try {
      await request(`/filespace/files/${versionEditor.file.id}/versions/${version.id}/restore`, { method: 'POST' });
      const refreshed = await request(`/filespace/files/${versionEditor.file.id}/versions`);
      setVersionEditor(refreshed);
      if (view === 'folder' && current) await openFolder(current, false); else if (view === 'search') await runSearch();
      toast.success('Версия восстановлена');
    } catch (error) { toast.error(error.message); }
    finally { setBusyLabel(''); }
  };

  const uploadNewFileVersion = async (selectedFile) => {
    if (!selectedFile || !versionEditor) return;
    setBusyLabel(`Загружаем новую версию «${versionEditor.file.name}»…`);
    try {
      const started = await request(`/filespace/files/${versionEditor.file.id}/versions/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseVersionId: versionEditor.file.currentVersionId,
          sourceName: selectedFile.name,
          size: selectedFile.size,
          contentType: selectedFile.type || 'application/octet-stream',
        }),
      });
      const uploaded = await fetch(started.uploadUrl, {
        method: started.method,
        headers: started.headers,
        body: selectedFile,
      });
      if (!uploaded.ok) throw new Error('Не удалось передать новую версию в хранилище');
      const completion = await request(`/filespace/files/${versionEditor.file.id}/versions/${started.version.id}/complete`, { method: 'POST' });
      setVersionEditor(await request(`/filespace/files/${versionEditor.file.id}/versions`));
      if (view === 'folder' && current) await openFolder(current, false); else if (view === 'search') await runSearch();
      if (completion.conflict) {
        toast.warning(`Файл уже изменили. Ваша работа сохранена как «${completion.file.name}».`, { autoClose: 10000 });
      } else {
        toast.success('Новая версия загружена и передана на антивирусную проверку');
      }
    } catch (error) { toast.error(error.message); }
    finally {
      setBusyLabel('');
      if (versionFileInput.current) versionFileInput.current.value = '';
    }
  };

  const confirmMove = async () => {
    if (!moveEditor.destinationFolderId) return;
    setBusyLabel('Перемещаем…');
    try {
      await request('/filespace/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: moveEditor.type, ids: [moveEditor.item.id], destinationFolderId: moveEditor.destinationFolderId }) });
      setMoveEditor(null);
      if (view === 'folder') await openFolder(current, false); else await runSearch();
    } catch (error) { toast.error(error.message); }
    finally { setBusyLabel(''); }
  };

  const restoreItem = async (type, item) => {
    setBusyLabel('Восстанавливаем…');
    try { await request(`/filespace/trash/${type}/${item.id}/restore`, { method: 'POST' }); await openTrash(); await refreshNavigationCounts(); }
    catch (error) { toast.error(error.message); }
    finally { setBusyLabel(''); }
  };

  const purgeItem = async (type, item) => {
    if (!window.confirm(`Удалить «${item.name}» без возможности восстановления?`)) return;
    setBusyLabel('Удаляем окончательно…');
    try { await request(`/filespace/trash/${type}/${item.id}`, { method: 'DELETE' }); await openTrash(); }
    catch (error) { toast.error(error.message); }
    finally { setBusyLabel(''); }
  };

  const toggleTrashFile = (fileId) => setSelectedTrashFiles((value) => {
    const next = new Set(value);
    if (next.has(fileId)) next.delete(fileId); else next.add(fileId);
    return next;
  });

  const toggleAllTrashFiles = () => setSelectedTrashFiles((value) => (
    value.size === trashItems.files.length ? new Set() : new Set(trashItems.files.map((file) => file.id))
  ));

  const purgeTrashFiles = async (all = false) => {
    const ids = [...selectedTrashFiles];
    const count = all ? trashFileCount : ids.length;
    if (!count || !window.confirm(`Удалить без возможности восстановления ${all ? `все файлы (${count})` : `выбранные файлы (${count})`}?`)) return;
    setBusyLabel('Удаляем файлы окончательно…');
    try {
      await request('/filespace/trash/files', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(all ? { all: true } : { ids }) });
      await openTrash();
      toast.success('Файлы удалены окончательно');
    } catch (error) { toast.error(error.message); }
    finally { setBusyLabel(''); }
  };

  const actionNames = { create: 'создал(а)', upload: 'загрузил(а)', rename: 'переименовал(а)', move: 'переместил(а)', trash: 'переместил(а) в корзину', restore: 'восстановил(а)', purge: 'удалил(а) окончательно', permissions: 'изменил(а) права', send_to_chat: 'отправил(а) в чат', version_upload: 'обновил(а)', version_restore: 'восстановил(а)', conflict_copy: 'создал(а) конфликтный', virus_scan_clean: 'прошёл антивирусную проверку:', virus_detected: 'заблокировал заражённый файл', virus_scan_failed: 'не смог проверить файл', virus_rescan: 'повторно запустил(а) проверку файла' };

  return (
    <main className="filespace-page min-h-[calc(100vh-64px)] bg-slate-50 p-4 md:p-8">
      <section className="filespace-shell mx-auto max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="filespace-header flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
          <div className="filespace-heading mr-auto">
            <h1 className="text-xl font-semibold text-slate-900">Файловое пространство</h1>
            <p className="text-sm text-slate-500">{view === 'trash' ? 'Корзина' : view === 'audit' ? 'История действий' : view === 'search' ? `Результаты: ${query}` : current?.name || 'Загрузка…'}</p>
          </div>
          {view === 'folder' && <button disabled={!history.length} onClick={goBack} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">Назад</button>}
          {view === 'folder' && canWrite && <button onClick={createFolder} disabled={!current} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><FolderPlus size={17} />Папка</button>}
          {view === 'folder' && canWrite && selected.size > 0 && <button onClick={deleteSelected} disabled={!!busyLabel} className="inline-flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 hover:bg-red-100 disabled:opacity-50"><Trash2 size={17} />Удалить ({selected.size})</button>}
          {view === 'folder' && canWrite && <button onClick={() => fileInput.current?.click()} disabled={!!busyLabel || !current} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50"><UploadCloud size={17} />Загрузить</button>}
          <input ref={fileInput} type="file" multiple hidden onChange={(event) => uploadFiles(Array.from(event.target.files || []))} />
        </header>

        <div className="filespace-layout flex min-h-[560px]">
          <aside className="filespace-sidebar w-64 shrink-0 border-r border-slate-200 bg-slate-50/70 p-3">
            <button onClick={() => personalRoot && openFromNavigation(personalRoot)} className={`mb-4 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium !text-slate-800 hover:bg-white ${current?.id === personalRoot?.id ? '!bg-blue-100 !text-blue-950 ring-1 ring-blue-200' : ''}`}><Folder size={18} className="text-blue-500" /><span className="min-w-0 flex-1 truncate">Мои файлы</span><span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">{personalRoot?.fileCount || 0}</span></button>
            {isAdmin && <><div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Папки сотрудников</div><div className="mb-4 max-h-52 space-y-1 overflow-y-auto">{personalFolders.filter((folder) => folder.id !== personalRoot?.id).map((folder) => <button key={folder.id} onClick={() => openFromNavigation(folder)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm !text-slate-800 hover:bg-white ${current?.id === folder.id ? '!bg-blue-100 !text-blue-950 ring-1 ring-blue-200' : ''}`} title={folder.ownerName}><Folder size={17} className="shrink-0 text-sky-500" /><span className="min-w-0 flex-1 truncate">{folder.ownerName}</span><span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">{folder.fileCount || 0}</span></button>)}</div></>}
            <div className="mb-2 flex items-center justify-between px-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Общие папки</span>
              {isAdmin && <button onClick={createSharedFolder} title="Создать общую папку" className="rounded p-1 text-slate-500 hover:bg-white hover:text-blue-600"><FolderPlus size={17} /></button>}
            </div>
            <div className="space-y-1">
              {sharedFolders.map((folder) => <button key={folder.id} onClick={() => openFromNavigation(folder)} onContextMenu={(event) => showSharedContextMenu(event, folder)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm !text-slate-800 hover:bg-white ${current?.id === folder.id ? '!bg-blue-100 !text-blue-950 ring-1 ring-blue-200' : ''}`} title={isAdmin ? 'Правой кнопкой — меню папки' : folder.name}><Folder size={18} className="shrink-0 text-amber-500" fill="currentColor" /><span className="min-w-0 flex-1 truncate">{folder.name}</span><span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">{folder.fileCount || 0}</span></button>)}
              {!sharedFolders.length && <p className="px-3 py-3 text-xs text-slate-400">Нет доступных общих папок</p>}
            </div>
            <div className="mt-5 border-t border-slate-200 pt-3"><button onClick={openTrash} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-white ${view === 'trash' ? 'bg-blue-100 text-blue-950' : ''}`}><Trash2 size={17} /><span className="flex-1">Корзина</span>{trashFileCount > 0 && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">{trashFileCount}</span>}</button><button onClick={openAudit} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-white ${view === 'audit' ? 'bg-blue-100 text-blue-950' : ''}`}><History size={17} /><span className="flex-1">История действий</span>{auditCount > 0 && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">{auditCount}</span>}</button></div>
          </aside>

        <div className="filespace-content relative min-w-0 flex-1 p-4">
          {!!busyLabel && <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-white/80 backdrop-blur-[1px]"><LoaderCircle className="animate-spin text-blue-600" size={38} /><p className="max-w-md px-4 text-center font-medium text-slate-700">{busyLabel}</p></div>}
          {view !== 'trash' && view !== 'audit' && <form onSubmit={runSearch} className="filespace-search mb-4 flex items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-inner focus-within:border-blue-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100"><Search className="ml-4 shrink-0 text-slate-400" size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по файлам и папкам…" className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm text-slate-800 outline-none" />{query && <button type="button" onClick={() => view === 'search' ? clearSearch() : setQuery('')} title="Очистить поиск" aria-label="Очистить поиск" className="m-1.5 mr-0 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-300 bg-white text-xl font-semibold leading-none text-red-600 shadow-sm hover:border-red-400 hover:bg-red-50 hover:text-red-700"><span aria-hidden="true">×</span></button>}<button type="submit" className="m-1.5 flex h-9 items-center rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700">Найти</button></form>}
          {loading ? <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-500"><LoaderCircle className="animate-spin text-blue-600" size={32} /><span>Загружаем содержимое…</span></div> : view === 'trash' ? (
            <div className="divide-y divide-slate-100">{!trashItems.folders.length && !trashItems.files.length && <p className="py-20 text-center text-slate-400">Корзина пуста</p>}<div className="mb-3 flex items-center rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Элементы автоматически удаляются через 30 дней.</div>{trashItems.folders.map((folder) => <div key={folder.id} className="flex items-center gap-3 px-3 py-3"><Folder className="text-slate-400" size={24} /><span className="min-w-0 flex-1 truncate text-slate-700">{folder.name}</span><span className="hidden text-xs text-slate-400 sm:block">{new Date(folder.deletedAt).toLocaleString('ru-RU')}</span><button onClick={() => restoreItem('folder', folder)} title="Восстановить" className="rounded-lg p-2 text-blue-600 hover:bg-blue-50"><RotateCcw size={18} /></button><button onClick={() => purgeItem('folder', folder)} title="Удалить окончательно" className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 size={18} /></button></div>)}{trashItems.files.length > 0 && <div className="flex flex-wrap items-center gap-3 bg-slate-50 px-3 py-2 text-sm text-slate-600"><input type="checkbox" aria-label="Выбрать все файлы в корзине" checked={selectedTrashFiles.size === trashItems.files.length} onChange={toggleAllTrashFiles} className="h-4 w-4 rounded border-slate-300" /><span className="mr-auto">{selectedTrashFiles.size ? `Выбрано: ${selectedTrashFiles.size}` : `Файлов: ${trashFileCount}`}</span>{selectedTrashFiles.size > 0 && <button onClick={() => purgeTrashFiles(false)} className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100">Удалить выбранные</button>}<button onClick={() => purgeTrashFiles(true)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">Удалить все файлы</button></div>}{trashItems.files.map((file) => <div key={file.id} className={`flex items-center gap-3 px-3 py-3 ${selectedTrashFiles.has(file.id) ? 'bg-blue-50/70' : ''}`}><input type="checkbox" aria-label={`Выбрать ${file.name}`} checked={selectedTrashFiles.has(file.id)} onChange={() => toggleTrashFile(file.id)} className="h-4 w-4 rounded border-slate-300" /><FileTypeIcon file={file} /><span className="min-w-0 flex-1 truncate text-slate-700">{file.name}</span><span className="hidden text-xs text-slate-400 sm:block">{new Date(file.deletedAt).toLocaleString('ru-RU')}</span><button onClick={() => restoreItem('file', file)} title="Восстановить" className="rounded-lg p-2 text-blue-600 hover:bg-blue-50"><RotateCcw size={18} /></button><button onClick={() => purgeItem('file', file)} title="Удалить окончательно" className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 size={18} /></button></div>)}</div>
          ) : view === 'audit' ? (
            <div><form onSubmit={searchAudit} className="mb-3 flex items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 focus-within:border-blue-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100"><Search className="ml-4 shrink-0 text-slate-400" size={20} /><input value={auditQuery} onChange={(event) => setAuditQuery(event.target.value)} placeholder="Сотрудник, действие или название файла…" className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm outline-none" />{auditQuery && <button type="button" onClick={clearAuditSearch} aria-label="Очистить поиск по истории" className="m-1.5 mr-0 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-300 bg-white text-xl font-semibold leading-none text-red-600 shadow-sm hover:border-red-400 hover:bg-red-50 hover:text-red-700"><span aria-hidden="true">×</span></button>}<button type="submit" className="m-1.5 flex h-9 items-center rounded-lg bg-blue-600 px-5 text-sm font-medium text-white">Найти</button></form><div className="mb-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500"><span>Найдено действий: {auditTotal}</span><span>История хранится {auditRetentionDays} дней</span></div><div className="divide-y divide-slate-100">{!auditEntries.length && <p className="py-20 text-center text-slate-400">Ничего не найдено</p>}{auditEntries.map((entry) => <div key={entry.id} className="px-3 py-3"><p className="text-sm text-slate-800"><span className="font-medium">{entry.actorName}</span> {actionNames[entry.action] || entry.action} {entry.entityType === 'folder' ? 'папку' : 'файл'} <span className="font-medium">«{entry.entityName || 'без названия'}»</span></p><p className="mt-1 text-xs text-slate-400">{new Date(entry.createdAt).toLocaleString('ru-RU')}</p></div>)}{auditCursor && <div ref={auditSentinel} className="flex justify-center py-5 text-sm text-slate-400">{auditLoadingMore ? <><LoaderCircle className="mr-2 animate-spin" size={18} />Загружаем историю…</> : 'Прокрутите ниже для продолжения'}</div>}</div></div>
          ) : (
            <div className="divide-y divide-slate-100">
              {!items.folders.length && !items.files.length && <p className="py-20 text-center text-slate-400">В этой папке пока нет файлов</p>}
              {items.folders.map((folder) => (
                <div key={folder.id} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter') openFolder(folder); }} onClick={() => openFolder(folder)} onContextMenu={(event) => showContextMenu(event, 'folder', folder, view === 'search' ? folder.canWrite : canWrite)} className="filespace-item-row flex w-full cursor-pointer items-center gap-3 px-3 py-3 text-left hover:bg-slate-50">
                  <Folder className="text-amber-500" fill="currentColor" size={24} />
                  <span className="min-w-0 flex-1 font-medium text-slate-800">{folder.name}</span>{folder.path && <span className="hidden max-w-xs truncate text-xs text-slate-400 md:block">{folder.path}</span>}<span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{folder.fileCount || 0}</span>
                  {folder.canDelete && <button type="button" title="Удалить папку" onClick={(event) => { event.stopPropagation(); trashItem('folder', folder); }} className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 size={18} /></button>}
                </div>
              ))}
              {view === 'folder' && canWrite && items.files.length > 0 && <div className="flex items-center gap-3 bg-slate-50 px-3 py-2 text-sm text-slate-500"><input type="checkbox" aria-label="Выбрать все файлы" checked={selected.size === items.files.length} onChange={toggleAll} className="h-4 w-4 rounded border-slate-300" /><span>{selected.size ? `Выбрано: ${selected.size}` : 'Выбрать все файлы'}</span></div>}
              {items.files.map((file) => (
                <div key={file.id} onClick={() => handleFileClick(file)} onContextMenu={(event) => showContextMenu(event, 'file', file, view === 'search' ? file.canWrite : canWrite)} className={`filespace-item-row relative flex cursor-pointer items-center gap-3 px-3 py-3 hover:bg-slate-50 ${file.conflictOfFileId ? 'bg-orange-50/60' : ''} ${selected.has(file.id) ? 'bg-blue-50/70' : ''}`} title={file.conflictOfFileId ? 'Конфликтная копия: исходный файл был изменён другим пользователем' : isPreviewable(file) ? 'Открыть предпросмотр' : 'Открыть файл'}>
                  {view === 'folder' && canWrite && <input type="checkbox" aria-label={`Выбрать ${file.name}`} checked={selected.has(file.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggleSelected(file.id)} className="h-4 w-4 shrink-0 rounded border-slate-300" />}
                  <div className="relative shrink-0">
                    <FileTypeIcon file={file} />
                  </div>
                  <span className="min-w-0 flex-1 truncate text-slate-800">{file.name}</span>{file.path && <span className="hidden max-w-xs truncate text-xs text-slate-400 lg:block">{file.path}</span>}
                  {file.conflictOfFileId && <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-1 text-xs font-medium text-orange-800"><Copy size={13} />Конфликтная копия</span>}
                  {['pending', 'scanning'].includes(file.scanStatus) && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700"><LoaderCircle className="animate-spin" size={13} />Проверяется</span>}
                  {file.scanStatus === 'infected' && <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700"><ShieldAlert size={13} />Обнаружена угроза</span>}
                  {file.scanStatus === 'failed' && <button onClick={(event) => { event.stopPropagation(); rescanFile(file); }} title={file.scanResult || 'Повторить проверку'} className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-1 text-xs font-medium text-orange-700 hover:bg-orange-200"><RotateCcw size={13} />Повторить проверку</button>}
                  <span className="hidden text-sm text-slate-400 sm:block">{formatSize(file.size)}</span>
                  {isFileAvailable(file) && <button title="Скачать" onClick={(event) => { event.stopPropagation(); downloadFile(file); }} className="rounded-lg p-2 hover:bg-slate-200"><Download size={18} /></button>}
                  {(view === 'folder' ? canWrite : file.canWrite) && <button title="Удалить" onClick={(event) => { event.stopPropagation(); deleteFile(file); }} className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 size={18} /></button>}
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
      </section>

      {previewFile && isPreviewable(previewFile) && <div className="filespace-preview-modal fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4 md:p-8" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewFile(null); }} onContextMenu={(event) => { if (event.target === event.currentTarget) { event.preventDefault(); setPreviewFile(null); } }}><div className="filespace-preview-dialog flex h-[90vh] w-[min(1200px,94vw)] flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()} onContextMenu={(event) => event.stopPropagation()}><div className="filespace-preview-header flex shrink-0 items-center gap-3 border-b border-slate-200 px-4 py-3"><p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{previewFile.name}</p><button onClick={() => openFile(previewFile)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"><ExternalLink size={16} />Открыть отдельно</button><button onClick={() => setPreviewFile(null)} aria-label="Закрыть предпросмотр" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-xl leading-none text-slate-500 shadow-sm hover:bg-slate-100 hover:text-slate-900"><span aria-hidden="true">×</span></button></div><div className="filespace-preview-content min-h-0 flex-1 overflow-auto bg-slate-100 p-4">{previewErrors.has(previewFile.id) ? <div className="flex h-full items-center justify-center text-slate-500">Превью недоступно</div> : isSpreadsheet(previewFile) && spreadsheetPreviews[previewFile.id] ? <div className="min-w-max rounded-lg bg-white"><div className="sticky left-0 top-0 z-10 border-b bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">{spreadsheetPreviews[previewFile.id].sheetName}</div><table className="border-collapse text-xs text-slate-700"><tbody>{spreadsheetPreviews[previewFile.id].rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className="max-w-96 border border-slate-200 px-2 py-1.5 align-top whitespace-pre-wrap">{cell}</td>)}</tr>)}</tbody></table></div> : previewUrls[previewFile.id] ? isPdf(previewFile) ? <iframe src={`${previewUrls[previewFile.id]}#toolbar=1&navpanes=0&view=FitH`} title={`Предпросмотр ${previewFile.name}`} className="h-full min-h-[78vh] w-full rounded-lg border-0 bg-white" /> : <img src={previewUrls[previewFile.id]} alt={previewFile.name} onError={() => markPreviewFailed(previewFile.id)} className="mx-auto h-auto max-w-none rounded-lg" /> : <div className="flex h-full items-center justify-center gap-3 text-slate-500"><LoaderCircle className="animate-spin text-blue-600" size={28} />Загружаем превью…</div>}</div></div></div>}

      {contextMenu && (
        <div style={{ left: contextMenu.x, top: contextMenu.y }} className="fixed z-50 min-w-56 rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {contextMenu.access && <button onClick={() => openAccessEditor(contextMenu.item)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100"><ShieldCheck size={17} className="text-blue-600" />Настроить доступ ролей</button>}
          {contextMenu.type === 'file' && <button onClick={() => openVersionHistory(contextMenu.item)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100"><History size={17} className="text-violet-600" />История версий</button>}
          {contextMenu.type === 'file' && isFileAvailable(contextMenu.item) && <button onClick={() => sendFileToChat(contextMenu.item)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-blue-700 hover:bg-blue-50"><MessageCircle size={17} />Отправить в чат</button>}
          {contextMenu.writable && contextMenu.type === 'file' && contextMenu.item.scanStatus === 'failed' && <button onClick={() => { setContextMenu(null); rescanFile(contextMenu.item); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-orange-700 hover:bg-orange-50"><RotateCcw size={17} />Повторить проверку</button>}
          {contextMenu.writable && <button onClick={() => renameItem(contextMenu.type, contextMenu.item)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100"><Pencil size={17} />Переименовать</button>}
          {contextMenu.writable && !(contextMenu.type === 'folder' && !contextMenu.item.parentId) && <button onClick={() => beginMove(contextMenu.type, contextMenu.item)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100"><Move size={17} />Переместить</button>}
          {contextMenu.writable && (contextMenu.type === 'file' || contextMenu.item.canDelete) && <button onClick={() => trashItem(contextMenu.type, contextMenu.item)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"><Trash2 size={17} />В корзину</button>}
        </div>
      )}

      {versionEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onMouseDown={() => setVersionEditor(null)}>
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <History size={21} className="shrink-0 text-violet-600" />
                  <h2 className="truncate text-lg font-semibold text-slate-900">История версий</h2>
                </div>
                <p className="mt-1 truncate text-sm text-slate-500">{versionEditor.file.name}</p>
              </div>
              <div className="ml-3 flex shrink-0 items-center gap-2">
                {versionEditor.file.canWrite && <button onClick={() => versionFileInput.current?.click()} className="flex h-9 items-center gap-2 rounded-lg bg-violet-600 px-3 text-sm font-medium text-white hover:bg-violet-700"><UploadCloud size={17} />Новая версия</button>}
                <input ref={versionFileInput} type="file" hidden onChange={(event) => uploadNewFileVersion(event.target.files?.[0])} />
                <button onClick={() => setVersionEditor(null)} aria-label="Закрыть историю версий" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-xl leading-none text-slate-500 shadow-sm hover:border-slate-300 hover:bg-slate-100 hover:text-slate-800"><span aria-hidden="true">×</span></button>
              </div>
            </div>
            <div className="overflow-y-auto p-5">
              <div className="mb-4 rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-800">
                Восстановление не удаляет текущий файл: его состояние останется в истории как отдельная версия.
              </div>
              <div className="space-y-2">
                {!versionEditor.versions.length && <p className="py-12 text-center text-slate-400">Версий пока нет</p>}
                {versionEditor.versions.map((version) => {
                  const available = ['clean', 'skipped'].includes(version.scanStatus);
                  return (
                    <div key={version.id} className={`rounded-xl border p-4 ${version.isCurrent ? 'border-violet-300 bg-violet-50/60' : 'border-slate-200 bg-white'}`}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-900">Версия {version.versionNumber}</span>
                            {version.isCurrent && <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[11px] font-medium text-white">Текущая</span>}
                            {!available && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">Недоступна до проверки</span>}
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {new Date(version.createdAt).toLocaleString('ru-RU')} · {version.authorName || 'Система'} · {formatSize(version.size)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button onClick={() => openFileVersion(version)} disabled={!available} title="Открыть эту версию" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-35"><ExternalLink size={18} /></button>
                          <button onClick={() => downloadFileVersion(version)} disabled={!available} title="Скачать эту версию" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-35"><Download size={18} /></button>
                          {versionEditor.file.canWrite && !version.isCurrent && (
                            <button onClick={() => restoreFileVersion(version)} disabled={!available} className="ml-1 flex h-9 items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-35"><RotateCcw size={15} />Восстановить</button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {moveEditor && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={() => setMoveEditor(null)}><div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><h2 className="text-lg font-semibold text-slate-900">Переместить «{moveEditor.item.name}»</h2><p className="mt-1 text-sm text-slate-500">Выберите папку назначения в том же файловом пространстве.</p><select value={moveEditor.destinationFolderId} onChange={(event) => setMoveEditor((value) => ({ ...value, destinationFolderId: event.target.value }))} className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">Выберите папку</option>{moveEditor.destinations.filter((folder) => folder.id !== moveEditor.item.id).map((folder) => <option key={folder.id} value={folder.id}>{folder.path}</option>)}</select><div className="mt-5 flex justify-end gap-2"><button onClick={() => setMoveEditor(null)} className="rounded-lg border px-4 py-2 text-sm">Отмена</button><button onClick={confirmMove} disabled={!moveEditor.destinationFolderId} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-40">Переместить</button></div></div></div>}

      {accessEditor && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={() => setAccessEditor(null)}><div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><div className="mb-4"><h2 className="text-lg font-semibold text-slate-900">Доступ к папке</h2><p className="text-sm text-slate-500">{accessEditor.folder.name} · только чтение</p></div><div className="max-h-80 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">{accessEditor.roles.map((role) => <label key={role.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-50"><input type="checkbox" checked={role.allowed} onChange={() => toggleAccessRole(role.id)} className="h-4 w-4 rounded border-slate-300" /><span className="text-sm text-slate-800">{role.name}</span></label>)}</div><p className="mt-3 text-xs text-slate-400">Администраторы имеют доступ независимо от выбранных ролей.</p><div className="mt-5 flex justify-end gap-2"><button onClick={() => setAccessEditor(null)} className="rounded-lg border px-4 py-2 text-sm">Отмена</button><button onClick={saveAccess} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white">Сохранить</button></div></div></div>}
    </main>
  );
}
