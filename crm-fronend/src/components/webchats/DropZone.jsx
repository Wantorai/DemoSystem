// DropZone.jsx
import React, { useRef, useState, useCallback, useEffect } from 'react';

const IMAGE_EXTS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'heic', 'heif', 'svg', 'tif', 'tiff',
]);
const AUDIO_EXTS = new Set([
  'mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus', 'oga',
]);
const VIDEO_EXTS = new Set([
  'mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', '3gp', 'mpeg', 'mpg',
]);

function getFileExt(fileName) {
  const name = String(fileName || '').toLowerCase();
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1);
}

function isAllowedByAccept(file, acceptList) {
  const mime = String(file?.type || '').toLowerCase();
  const ext = getFileExt(file?.name);

  for (const ruleRaw of acceptList) {
    const rule = String(ruleRaw || '').trim().toLowerCase();
    if (!rule) continue;

    // Расширение: ".pdf", ".docx"
    if (rule.startsWith('.')) {
      if (ext && rule.slice(1) === ext) return true;
      continue;
    }

    // Wildcard MIME: "image/*", "audio/*", "video/*"
    if (rule.endsWith('/*')) {
      const prefix = rule.slice(0, -1); // "image/", "audio/", ...
      if (mime.startsWith(prefix)) return true;

      // fallback по расширению, если mime пустой/неинформативный
      if (prefix === 'image/' && IMAGE_EXTS.has(ext)) return true;
      if (prefix === 'audio/' && AUDIO_EXTS.has(ext)) return true;
      if (prefix === 'video/' && VIDEO_EXTS.has(ext)) return true;
      continue;
    }

    // Точный MIME: "application/pdf"
    if (mime && rule === mime) return true;
  }

  return false;
}

export default function DropZone({
  children,
  onFiles,           // async (File[]) => void  - вызывается при дропе
  accept = null,     // optional, like "image/*,audio/*,application/pdf"
  multiple = true,
  className = '',
  disabled = false,
}) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const zoneRef = useRef(null);

  const handleDragEnter = useCallback((e) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer?.types && e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragOver = useCallback((e) => {
    if (disabled) return;
    e.preventDefault(); // необходимо, чтобы браузер позволил drop
    e.dataTransfer.dropEffect = 'copy';
  }, [disabled]);

  const handleDragLeave = useCallback((e) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  }, [disabled]);

  const handleDrop = useCallback(async (e) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);

    const dt = e.dataTransfer;
    if (!dt) return;

    // Получаем файлы — пробрасываем FileList -> Array
    let files = Array.from(dt.files || []);

    // Фильтрация по accept (если задан)
    if (accept && files.length) {
      const allowed = accept
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      files = files.filter((file) => isAllowedByAccept(file, allowed));
    }

    if (!multiple && files.length > 1) files = [files[0]];

    if (files.length === 0) return;

    try {
      await onFiles(files);
    } catch (err) {
      console.error('DropZone onFiles error', err);
    }
  }, [accept, disabled, multiple, onFiles]);

  // Optional: клавиатурный фокус чтобы пользователи могли вставлять файлы через paste
  useEffect(() => {
    const el = zoneRef.current;
    if (!el) return;
    el.addEventListener('dragenter', handleDragEnter);
    el.addEventListener('dragover', handleDragOver);
    el.addEventListener('dragleave', handleDragLeave);
    el.addEventListener('drop', handleDrop);
    return () => {
      el.removeEventListener('dragenter', handleDragEnter);
      el.removeEventListener('dragover', handleDragOver);
      el.removeEventListener('dragleave', handleDragLeave);
      el.removeEventListener('drop', handleDrop);
    };
  }, [handleDragEnter, handleDragOver, handleDragLeave, handleDrop]);

  return (
    <div ref={zoneRef} className={className} style={{ position: 'relative' }}>
      {children}
      {isDragging && !disabled && (
        <div
          aria-hidden="true"
          style={{
            pointerEvents: 'none',
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.35)',
            color: 'white',
            fontSize: 18,
            zIndex: 9999,
            transition: 'opacity .15s',
          }}
        >
          <div style={{ pointerEvents: 'auto' }}>
            Перетащите файлы сюда, чтобы отправить
          </div>
        </div>
      )}
    </div>
  );
}
