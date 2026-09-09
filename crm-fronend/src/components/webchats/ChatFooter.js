// components/ChatFooter.jsx
'use client';
import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  IoAttachOutline,
  IoMicOutline,
  IoSend,
  IoLockClosed,
  IoLockOpen,
  IoPause,
  IoTrashOutline, IoImageOutline, IoVideocamOutline, IoDocumentTextOutline
} from 'react-icons/io5';

const EMOJI_LIST = [
  '😀','😁','😂','🤣','😊','😍','😘','😎','🤔','😢',
  '😭','😡','👍','👎','👏','🙏','💪','🔥','🎉','❤️',
  '💔','✅','❌','⭐','🚀','📌','💬','👀','🤝','👌',
];

function Spinner({ size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="#D1D5DB" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="#374151" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}


/**
 * Props:
 *  - text
 *  - setText
 *  - sendMessage
 *  - onFile(file: File)
 *  - onSendVoice(blob: Blob)
 *  - isUploading
 *  - sending
 */
export default function ChatFooter({
  text,
  setText,
  sendMessage,
  onFile,
  onSendVoice,
  isUploading = false,
  sending = false,
  replyDraft, 
  onCancelReply,
  editingMessage,
  inputRef,
  cancelEdit, 
}) {
  const fileRef = useRef(null);
  const textareaRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const lastEmojiTouchAtRef = useRef(0);

  // media/recording refs
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recorderTimerRef = useRef(null);
  const recordingStartedAtRef = useRef(0);
  const lastRecordingDurationRef = useRef(0);

  // UI state
  const [isRecording, setIsRecording] = useState(false); // whether recording is active (holding or locked)
  const [recSec, setRecSec] = useState(0);
  const [locked, setLocked] = useState(false); // locked by dragging up
  const [previewBlob, setPreviewBlob] = useState(null); // blob after pausing/stopping (preview mode)
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  // const [dragStartY, setDragStartY] = useState(null);
  const dragStartYRef = useRef(null);
  const pointerActiveRef = useRef(false);
  const lockedRef = useRef(false);
  const longPressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);
  const recordingStartPendingRef = useRef(false);

  const onSendVoiceRef = useRef(onSendVoice);
  useEffect(() => {
    onSendVoiceRef.current = onSendVoice;
  }, [onSendVoice]);

  // рефы для функций-обработчиков
  const handleGlobalPointerMoveRef = useRef(null);
  const handleGlobalPointerUpRef = useRef(null);


  const LOCK_THRESHOLD = 80; // px to drag up to lock
  const LONG_PRESS_MS = 300;
  const MIN_RECORDING_MS = 250;






  // ---------- гарантируем стабильную stopRecordingAndGetBlob (пример) ----------
  const stopRecordingAndGetBlob = useCallback(() => {
    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current;
      const stream = streamRef.current;

      if (!mr) {
        if (recorderTimerRef.current) { clearInterval(recorderTimerRef.current); recorderTimerRef.current = null; }
        setIsRecording(false);
        setRecSec(0);
        resolve(null);
        return;
      }

      const onStop = () => {
        try {
          const recordedMimeType = mr.mimeType || recordedChunksRef.current[0]?.type || 'audio/webm';
          const blob = new Blob(recordedChunksRef.current, { type: recordedMimeType });
          const elapsedMs = recordingStartedAtRef.current
            ? Date.now() - recordingStartedAtRef.current
            : 0;
          lastRecordingDurationRef.current = Math.max(1, Math.round(elapsedMs / 1000));
          resolve(blob);
        } catch (e) {
          console.error(e);
          resolve(null);
        } finally {
          try {
            if (stream && typeof stream.getTracks === 'function') {
              const tracks = stream.getTracks();
              if (Array.isArray(tracks) && tracks.length) {
                tracks.forEach((t) => {
                  try { t.stop(); } catch (e) { console.warn('Error ', e); }
                });
              }
            }
          } catch (e) {
            // защитный catch на случай неожиданных ошибок
            console.warn('Error stopping tracks', e);
          }
          recordedChunksRef.current = [];
          mediaRecorderRef.current = null;
          streamRef.current = null;
          recordingStartedAtRef.current = 0;
          if (recorderTimerRef.current) { clearInterval(recorderTimerRef.current); recorderTimerRef.current = null; }
          setIsRecording(false);
          setRecSec(0);
        }
      };

      mr.addEventListener('stop', onStop, { once: true });
      try { mr.stop(); } catch (e) 
      
      { console.warn('Error ', e);
        onStop(); }
    });
  }, []);

  const stopRecordingAndGetBlobRef = useRef(stopRecordingAndGetBlob);
  useEffect(() => { stopRecordingAndGetBlobRef.current = stopRecordingAndGetBlob; }, [stopRecordingAndGetBlob]);

  // ---------- создаём обработчики и навешиваем их лишь после mount ----------
  useEffect(() => {
    // определяем функции здесь — они будут иметь доступ ко всем рефам выше
    handleGlobalPointerMoveRef.current = (e) => {
      if (!pointerActiveRef.current) return;
      if (lockedRef.current) return;
      if (!recordingStartedAtRef.current) return;

      const startY = dragStartYRef.current;
      if (startY == null) return;
      const dy = startY - e.clientY;
      if (dy >= LOCK_THRESHOLD) {
        setLocked(true);
        lockedRef.current = true;
        pointerActiveRef.current = false;
        dragStartYRef.current = null;
        // снимем слушатели — через текущие ref-ссылки
        try {
          window.removeEventListener('pointermove', handleGlobalPointerMoveRef.current);
          window.removeEventListener('pointerup', handleGlobalPointerUpRef.current);
          window.removeEventListener('pointercancel', handleGlobalPointerUpRef.current);
        } catch (err) { console.warn(err); }
      }
    };

    handleGlobalPointerUpRef.current = async () => {
      if (!pointerActiveRef.current) return;
      pointerActiveRef.current = false;
      dragStartYRef.current = null;
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      try {
        window.removeEventListener('pointermove', handleGlobalPointerMoveRef.current);
        window.removeEventListener('pointerup', handleGlobalPointerUpRef.current);
        window.removeEventListener('pointercancel', handleGlobalPointerUpRef.current);
      } catch (err) { console.warn(err); }

      if (lockedRef.current) return;
      if (!longPressTriggeredRef.current || !recordingStartedAtRef.current) return;

      const recordedMs = Date.now() - recordingStartedAtRef.current;
      longPressTriggeredRef.current = false;

      // авто-отправка через ref'ы (всегда актуальные)
      try {
        const blob = await stopRecordingAndGetBlobRef.current?.();
        if (blob && recordedMs >= MIN_RECORDING_MS && onSendVoiceRef.current) {
          onSendVoiceRef.current(blob, lastRecordingDurationRef.current);
        }
      } catch (err) {
        console.error('auto send failed', err);
      }
    };

    // cleanup если что-то было навешено ранее
    return () => {
      try {
        window.removeEventListener('pointermove', handleGlobalPointerMoveRef.current);
        window.removeEventListener('pointerup', handleGlobalPointerUpRef.current);
        window.removeEventListener('pointercancel', handleGlobalPointerUpRef.current);
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      } catch (e) {console.warn(e)}
    };
    // пустой массив — инициализируется только при mount, не создавая циклов/TDZ
  }, []);

  // ---------- pointer down: навешиваем текущие функции (они уже инициализированы выше в useEffect) ----------
  const onMicPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (pointerActiveRef.current || recordingStartPendingRef.current || mediaRecorderRef.current) return;
    e.preventDefault();

    pointerActiveRef.current = true;
    dragStartYRef.current = e.clientY;
    longPressTriggeredRef.current = false;
    setLocked(false);
    lockedRef.current = false;
    setPreviewBlob(null);

    // Подключаем отпускание сразу, до асинхронного запроса разрешения микрофона.
    window.addEventListener('pointermove', handleGlobalPointerMoveRef.current);
    window.addEventListener('pointerup', handleGlobalPointerUpRef.current);
    window.addEventListener('pointercancel', handleGlobalPointerUpRef.current);

    longPressTimerRef.current = setTimeout(async () => {
      longPressTimerRef.current = null;
      if (!pointerActiveRef.current) return;
      longPressTriggeredRef.current = true;
      recordingStartPendingRef.current = true;
      const started = await startRecordingInternal();
      recordingStartPendingRef.current = false;

      // Палец мог быть отпущен, пока браузер открывал/проверял микрофон.
      if (started && !pointerActiveRef.current && !lockedRef.current) {
        longPressTriggeredRef.current = false;
        await stopRecordingAndGetBlobRef.current?.();
      }
      if (!started) {
        pointerActiveRef.current = false;
        dragStartYRef.current = null;
        longPressTriggeredRef.current = false;
        window.removeEventListener('pointermove', handleGlobalPointerMoveRef.current);
        window.removeEventListener('pointerup', handleGlobalPointerUpRef.current);
        window.removeEventListener('pointercancel', handleGlobalPointerUpRef.current);
      }
    }, LONG_PRESS_MS);
  };


  const DEBUG = false;
  const log = (...a) => DEBUG && console.log('[ChatFooter]', ...a);
  log('DEBUG = ', DEBUG)

  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);



  const sendLockedRecording = async () => {
    pointerActiveRef.current = false;
    longPressTriggeredRef.current = false;
    dragStartYRef.current = null;
    try {
      // Останавливаем рекордер и получаем blob
      const blob = await stopRecordingAndGetBlobRef.current?.();
      if (blob && onSendVoiceRef.current) {
        // Вызов внешнего обработчика (родитель сделает upload/FormData)
        onSendVoiceRef.current(blob, lastRecordingDurationRef.current);
      }
    } catch (err) {
      console.error('sendLockedRecording error', err);
      // Можно показать UI-ошибку пользователю, если хотите
    } finally {
      // Сброс UI состояния записи
      setPreviewBlob(null);
      setLocked(false);
      lockedRef.current = false;
      // isRecording и recSec будут сброшены внутри stopRecordingAndGetBlob
    }
  };





  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = '0px';
    const scrollHeight = ta.scrollHeight;
    ta.style.height = Math.min(scrollHeight, 160) + 'px';
  }, [text]);

  useEffect(() => {
    if (!isEmojiOpen) return;
    const handleDocPointerDown = (e) => {
      const pickerEl = emojiPickerRef.current;
      if (!pickerEl) return;
      if (pickerEl.contains(e.target)) return;
      setIsEmojiOpen(false);
    };
    const handleEsc = (e) => {
      if (e.key === 'Escape') setIsEmojiOpen(false);
    };
    document.addEventListener('pointerdown', handleDocPointerDown);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('pointerdown', handleDocPointerDown);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isEmojiOpen]);

  const insertEmojiAtCursor = useCallback((emoji) => {
    const ta = textareaRef.current;
    const currentText = String(text ?? '');
    if (!ta) {
      setText(currentText + emoji);
      return;
    }

    const start = Number.isInteger(ta.selectionStart) ? ta.selectionStart : currentText.length;
    const end = Number.isInteger(ta.selectionEnd) ? ta.selectionEnd : currentText.length;
    const next = currentText.slice(0, start) + emoji + currentText.slice(end);
    setText(next);
    setIsEmojiOpen(false);

    requestAnimationFrame(() => {
      const input = textareaRef.current;
      if (!input) return;
      const nextPos = start + emoji.length;
      input.focus();
      input.setSelectionRange(nextPos, nextPos);
    });
  }, [setText, text]);

  const toggleEmojiPicker = useCallback(() => {
    setIsEmojiOpen((value) => !value);
  }, []);

  const onEmojiPointerUp = useCallback((event) => {
    if (event.pointerType === 'mouse') return;
    event.preventDefault();
    event.stopPropagation();
    lastEmojiTouchAtRef.current = Date.now();
    toggleEmojiPicker();
  }, [toggleEmojiPicker]);

  const onEmojiClick = useCallback((event) => {
    // Safari посылает synthetic click после touch/pointerup — не переключаем дважды.
    if (Date.now() - lastEmojiTouchAtRef.current < 600) return;
    event.stopPropagation();
    toggleEmojiPicker();
  }, [toggleEmojiPicker]);

  // Helpers: start media recorder
  const startRecordingInternal = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Запись голоса не поддерживается в этом браузере.');
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      recordedChunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) recordedChunksRef.current.push(ev.data);
      };

      // we'll not finalize here; finalization handled in stopRecordingAndGetBlob
      mr.start();
      recordingStartedAtRef.current = Date.now();
      setIsRecording(true);
      setRecSec(0);

      // timer
      recorderTimerRef.current = setInterval(() => setRecSec(s => s + 1), 1000);
      return true;
    } catch (err) {
      console.error('err getUserMedia', err);
      alert('Не удалось начать запись: ' + String(err));
      return false;
    }
  };

  const cancelLockedRecording = async () => {
    pointerActiveRef.current = false;
    longPressTriggeredRef.current = false;
    // Stop and discard
    await stopRecordingAndGetBlob();
    setPreviewBlob(null);
    setLocked(false);
    // do not send
  };

  const pauseLockedRecording = async () => {
    pointerActiveRef.current = false;
    longPressTriggeredRef.current = false;
    // Pause = stop & produce preview blob (user can send or delete)
    const blob = await stopRecordingAndGetBlob();
    setPreviewBlob(blob);
    setLocked(false);
  };

  const sendPreview = async () => {
    if (!previewBlob) return;
    if (onSendVoice) onSendVoice(previewBlob, lastRecordingDurationRef.current);
    setPreviewBlob(null);
  };

  const deletePreview = () => {
    setPreviewBlob(null);
  };

  // очистка при размонтировании компонента — важно!
  useEffect(() => {
    return () => {
      try {
        window.removeEventListener('pointermove', handleGlobalPointerMoveRef.current);
        window.removeEventListener('pointerup', handleGlobalPointerUpRef.current);
      } catch (e) { console.warn(e) }
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      if (recorderTimerRef.current) clearInterval(recorderTimerRef.current);
      try {
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== 'inactive') recorder.stop();
        streamRef.current?.getTracks?.().forEach((track) => track.stop());
      } catch (e) { console.warn(e); }
      pointerActiveRef.current = false;
      recordingStartPendingRef.current = false;
    };
  }, []); // пустой deps — cleanup один раз



  // file input
  const onAttachClick = () => {
    if (fileRef.current) fileRef.current.click();
  };

  const handleFileChange = (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) {
      if (onFile) onFile(f);
      e.target.value = '';
    }
  };

  // utility formatting sec to mm:ss
  const fmt = (s) => {
    const mm = Math.floor(s / 60).toString().padStart(2, '0');
    const ss = (s % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  };

  // UI: side controls when locked: left cancel, right pause
  // When previewBlob exists: left delete, right send (and show play icon/length)
  const showSend = (text || '').trim().length > 0;
  const isBusy = Boolean(sending || isUploading);


  // При ответе ставить курсор сразу в текстовое поле
  useEffect(() => {
    if (replyDraft && textareaRef.current) {
      // фокус через небольшой timeout, чтобы DOM успел обновиться
      setTimeout(() => {
        textareaRef.current.focus();
      }, 50);
    }
  }, [replyDraft]);



  const formatReplyPreview = (msg) => {
    if (!msg) return '«Сообщение недоступно»';

    const type = msg.previewType ?? msg.type ?? 'text';
    const text = msg.previewText ?? msg.content ?? msg.transcriptionText ?? msg.text ?? msg.body ?? '';

    switch (type) {
      case 'text': {
        const short = text.length > 120 ? text.slice(0, 120) + '…' : text;
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {/* если нужно опустить текст чуть ниже: */}
            <span style={{ display: 'inline-block', transform: 'translateY(1px)' }}>
              {short}
            </span>
          </span>
        );
      }
      case 'image':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', gap: 6 }}>
            <IoImageOutline size={14} color="#007AFF" style={{ display: 'block' }}/> 
            <span style={{ display: 'inline-block', verticalAlign: 'middle' }}>
            Фото
            </span>
          </span>
        );
      case 'video':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', gap: 6 }}>
            <IoVideocamOutline size={14} color="#007AFF" style={{ display: 'block' }}/> 
              <span style={{ display: 'inline-block', verticalAlign: 'middle' }}>
              Видео
              </span>
          </span>
        );
      case 'audio':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', gap: 6 }}>
            <IoMicOutline size={14} color="#007AFF" style={{ display: 'block' }}/> 
            <span style={{ display: 'inline-block', verticalAlign: 'middle' }}>Голосовое сообщение</span>
            
          </span>
        );
      case 'file':
      case 'document':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', gap: 6 }}>
            <IoDocumentTextOutline size={14} color="#007AFF" style={{ display: 'block' }}/> 
            <span style={{ display: 'inline-block', verticalAlign: 'middle' }}>Документ</span>
          </span>
        );
      default:
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', gap: 6 }}>
            <IoAttachOutline size={14} color="#007AFF" style={{ display: 'block' }}/> 
            <span style={{ display: 'inline-block', verticalAlign: 'middle' }}>Вложение</span>
          </span>
        );
    }
  };

  // console.log('ChatFooter replyDraft=', replyDraft);


  return (
    <div className={`webchat-footer ${showSend ? 'webchat-footer-has-text' : ''} w-full border-t border-gray-200 bg-white flex-shrink-0 p-3 relative`}>


      {/* ----------------- Banner редактирования (показываем только при editingMessage) ----------------- */}
      {editingMessage && (
        <div className="mb-2 p-2 bg-yellow-50 rounded flex items-center justify-between">
          <div style={{ fontSize: 13, color: '#333' }}>
            Редактирование сообщения: <p style={{fontWeight: 600}}>{editingMessage.content}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => {
                // быстрая отмена
                cancelEdit();
              }}
              className="px-2 py-1 text-sm"
            >
              Отменить
            </button>
          </div>
        </div>
      )}




      {replyDraft && (
        <div className="mb-2 p-2 bg-gray-50 rounded flex justify-between items-start">
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: '#666' }}>
              <span style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 6, fontWeight: 600 }}>
                  {replyDraft.authorName}:
                </span>
              {formatReplyPreview(replyDraft)}
              </div>
          </div>
          <button
            onClick={onCancelReply}
            aria-label="Отмена ответа"
            title="Отменить ответ"
            className="ml-2 p-1"
          >
            ✕
          </button>
        </div>
      )}


      <div className="webchat-footer-row flex items-end gap-3">
        {/* Attach */}
        {!locked && (
          <button
            type="button"
            onClick={onAttachClick}
            aria-label="Прикрепить файл"
            title="Прикрепить файл"
            disabled={isBusy}
            className="webchat-attach-button p-1 bg-transparent border-none hover:bg-gray-100 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <IoAttachOutline className="w-8 h-8 text-gray-800" />
          </button>
        )}

        <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} />

        {/* Input area */}
        <div className="webchat-input-box flex-1 flex items-center bg-gray-100 rounded-2xl px-3 py-0 min-h-[40px] max-h-[160px]">
          <textarea
            ref={(el) => {
              if (textareaRef) textareaRef.current = el;
              if (inputRef) inputRef.current = el;
            }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && editingMessage) { e.preventDefault(); cancelEdit(); }
              else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const t = (text||'').trim(); if (t) sendMessage(); }
            }}
            placeholder={editingMessage ? 'Измените сообщение и нажмите Применить (Enter)' : 'Введите сообщение...'}
            rows={1}
            className="resize-none w-full bg-transparent outline-none text-sm leading-5 scrollbar-hide"
          />
        </div>

        {/* Right controls: if previewBlob -> show delete + send; if locked -> cancel + pause; otherwise mic/send */}
        <div className="webchat-compose-actions flex items-center gap-2 relative">

          {!previewBlob && !locked && !isRecording && (
            <div className="webchat-emoji-control relative">
              <button
                type="button"
                onPointerUp={onEmojiPointerUp}
                onClick={onEmojiClick}
                aria-label="Открыть эмодзи"
                title="Эмодзи"
                className="webchat-emoji-button p-1 bg-transparent border-none hover:bg-gray-100 rounded-md transition"
              >
                <span className="text-2xl leading-none">😊</span>
              </button>

              {isEmojiOpen && (
                <div
                  ref={emojiPickerRef}
                  className="absolute right-0 bottom-12 z-50 w-72 bg-white border border-gray-200 rounded-xl shadow-lg p-2"
                >
                  <div className="grid grid-cols-10 gap-1 max-h-52 overflow-y-auto">
                    {EMOJI_LIST.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => insertEmojiAtCursor(emoji)}
                        className="h-8 w-8 rounded hover:bg-gray-100 flex items-center justify-center text-lg"
                        aria-label={`Эмодзи ${emoji}`}
                        title={emoji}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Compact lock + arrow badge (left-shifted, block background, bigger arrow) */}
          { (isRecording && !locked) && (
            <div className="webchat-recording-lock-hint absolute -top-14 right-10 z-50 pointer-events-none w-max flex flex-col items-center">
              {/* background block with small padding */}
              <div className="bg-white/95 backdrop-blur-sm rounded-md p-1.5 shadow-md flex flex-col items-center">
                {/* lock badge on top (small) */}
                <div className="mb-1 flex items-center justify-center">
                  <IoLockOpen className="w-4 h-4 text-gray-800" />
                </div>

                {fmt(recSec)}

                {/* bigger arrow pointing up (custom SVG, thicker stroke) */}
                <div className="flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-700" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                    <path d="M12 18V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M6 12L12 6L18 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
            </div>
          )}

          { locked && (
            <div className="webchat-recording-lock-hint absolute -top-14 right-10 z-50 pointer-events-none w-max flex flex-col items-center">
              <div className="bg-white/95 backdrop-blur-sm rounded-md p-1.5 shadow-md flex items-center justify-center">
                <IoLockClosed className="w-5 h-5 text-gray-800" />
              </div>
            </div>
          )}



          {previewBlob ? (
            // Preview: left delete, right send (and show small play)
            <>
              <button
                onClick={deletePreview}
                className="p-1 bg-transparent border-none hover:bg-gray-100 rounded-md transition"
                title="Удалить"
              >
                <IoTrashOutline className="w-6 h-6 text-gray-700" />
              </button>


              <button
                onClick={sendPreview}
                className="p-1 bg-transparent border-none hover:bg-gray-100 rounded-md transition"
                title="Отправить запись"
              >
                <IoSend className="w-6 h-6 text-blue-500" />
              </button>
            </>
          ) : locked ? (
            // Locked: left cancel, right pause
            <>
              <button
                onClick={cancelLockedRecording}
                className="p-1 bg-transparent border-none hover:bg-gray-100 rounded-md transition"
                title="Отменить запись"
              >
                <IoTrashOutline className="w-6 h-6 text-gray-700" />
              </button>

              <div className="px-2 text-sm text-gray-700">{fmt(recSec)}</div>

              <div className="flex items-center gap-2">
                <button
                  onClick={pauseLockedRecording}
                  className="p-1 bg-transparent border-none hover:bg-gray-100 rounded-md transition"
                  title="Пауза (завершить запись и посмотреть превью)"
                >
                  <IoPause className="w-6 h-6 text-gray-800" />
                </button>

                {/* Send immediately */}
                <button
                  onClick={sendLockedRecording}
                  className="p-1 bg-transparent border-none hover:bg-gray-100 rounded-md transition"
                  title="Отправить запись"
                  disabled={isUploading} // блокируем, если идёт загрузка
                >
                  <IoSend className={`w-6 h-6 ${isUploading ? 'text-gray-400' : 'text-blue-500'}`} />
                </button>
              </div>

            </>
          ) : showSend ? (
            // normal: text present -> send button
            <button
              onClick={sendMessage}
              disabled={sending}
              aria-label="Отправить"
              title="Отправить"
              className="webchat-send-button p-1 border-none transition"
            >
              {sending ? (
                <span className="inline-flex items-center justify-center w-8 h-8">
                  <Spinner size={20} />
                </span>
              ) : (
                <IoSend className="w-8 h-8 text-gray-800" />
              )}
            </button>
          ) : editingMessage ? (
            <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={sendMessage}
              disabled={sending}
              aria-label="Применить"
              title="Применить изменения"
              className="p-1 bg-transparent border-none hover:bg-gray-100 rounded-md transition"
            >
                {sending ? (
                  <span className="inline-flex items-center justify-center w-8 h-8">
                    <Spinner size={20} />
                  </span>
                ) : (
                  <IoSend className="w-8 h-8 text-gray-800" />
                )}
            </button>

              <button
                onClick={cancelEdit}
                className="p-1 bg-transparent border-none hover:bg-gray-100 rounded-md transition"
                title="Отменить изменения"
              >
                ✕
              </button>
            </div>

          ) : (
            // default: mic button with pointer events handling (press & hold)
            isBusy ? (
              <div
                aria-label="Идет отправка"
                title="Идет отправка"
                className="p-1 bg-transparent border-none rounded-md"
              >
                <span className="inline-flex items-center justify-center w-8 h-8">
                  <Spinner size={20} />
                </span>
              </div>
            ) : (
              <button
                onPointerDown={onMicPointerDown}
                onContextMenu={(event) => event.preventDefault()}
                aria-label={isRecording ? "Запись" : "Нажмите и держите для записи"}
                title="Нажмите и держите для записи"
                className="webchat-mic-button p-1 border-none transition"
                style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
              >
                <div className="relative flex items-center justify-center">
                  {/* Пульсирующий синий круг */}
                  {isRecording && (
                    <span className="absolute w-12 h-12 rounded-full bg-red-600/70 animate-ping" />
                  )}

                  {/* Статичный синий круг под иконкой, чтобы она не “висела” в воздухе */}
                  {isRecording && (
                    <span className="absolute w-10 h-10 rounded-full bg-red-600" />
                  )}

                  {/* Иконка микрофона поверх */}
                  <IoMicOutline
                    className={`w-8 h-8 relative z-10 transition-colors ${
                      isRecording ? 'text-white' : 'text-gray-600'
                    }`}
                  />
                </div>
              </button>
            )
          )}




        </div>
      </div>

    </div>
  );
}






















// // components/ChatFooter.jsx
// 'use client';
// import React, { useRef, useState, useEffect } from 'react';
// import { IoAttachOutline, IoMicOutline, IoSend, IoStopOutline } from 'react-icons/io5';

// /**
//  * Props:
//  *  - text: string
//  *  - setText: (s: string) => void
//  *  - sendMessage: () => Promise<void> | void
//  *  - onFile?: (file: File) => void
//  *  - onSendVoice?: (blob: Blob) => void
//  *  - isUploading?: boolean
//  *  - sending?: boolean
//  */
// export default function ChatFooter({
//   text,
//   setText,
//   sendMessage,
//   onFile,
//   onSendVoice,
//   isUploading = false,
//   sending = false,
// }) {
//   const fileRef = useRef(null);
//   const textareaRef = useRef(null);
//   const [isRecording, setIsRecording] = useState(false);
//   const [recSec, setRecSec] = useState(0);
//   const mediaRecorderRef = useRef(null);
//   const recordedChunksRef = useRef([]);

//   // Авто-рост textarea
//   useEffect(() => {
//     const ta = textareaRef.current;
//     if (!ta) return;
//     ta.style.height = '0px';
//     const scrollHeight = ta.scrollHeight;
//     ta.style.height = Math.min(scrollHeight, 160) + 'px';
//   }, [text]);

//   const onAttachClick = () => {
//     if (fileRef.current) fileRef.current.click();
//   };

//   const handleFileChange = (e) => {
//     const f = e.target.files && e.target.files[0];
//     if (f) {
//       if (onFile) onFile(f);
//       // очистка value, чтобы можно было загрузить тот же файл снова
//       e.target.value = '';
//     }
//   };

//   const onKeyDown = (e) => {
//     if (e.key === 'Enter' && !e.shiftKey) {
//       e.preventDefault();
//       const t = (text || '').trim();
//       if (t) sendMessage();
//     }
//   };

//   // MediaRecorder handlers
//   const startRecording = async () => {
//     if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
//       alert('Запись голоса не поддерживается в этом браузере.');
//       return;
//     }
//     try {
//       const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
//       recordedChunksRef.current = [];
//       const mr = new MediaRecorder(stream);
//       mediaRecorderRef.current = mr;

//       mr.ondataavailable = (ev) => {
//         if (ev.data && ev.data.size > 0) recordedChunksRef.current.push(ev.data);
//       };

//       mr.onstop = () => {
//         try {
//           const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
//           // Отправляем результат наружу
//           if (onSendVoice) onSendVoice(blob);
//         } catch (e) {
//           console.error('onstop error', e);
//         } finally {
//           // остановим все треки
//           stream.getTracks().forEach(t => t.stop());
//         }
//       };

//       mr.start();
//       setIsRecording(true);
//       setRecSec(0);

//       // простой таймер отображения длительности
//       const tId = setInterval(() => setRecSec(s => s + 1), 1000);
//       // сохраняем id в mr для очистки (необязательно)
//       mr._timerId = tId;
//     } catch (err) {
//       console.error('err getUserMedia', err);
//       alert('Не удалось начать запись: ' + String(err));
//     }
//   };

//   const stopRecording = () => {
//     const mr = mediaRecorderRef.current;
//     if (mr && mr.state !== 'inactive') {
//       clearInterval(mr._timerId);
//       mr.stop();
//     }
//     setIsRecording(false);
//     setRecSec(0);
//     mediaRecorderRef.current = null;
//   };

//   const onMicClick = () => {
//     if (isRecording) stopRecording();
//     else startRecording();
//   };

//   const showSend = (text || '').trim().length > 0;

//   return (
//     <div className="w-full border-t border-gray-200 bg-white flex-shrink-0 p-3">
//       <div className="flex items-end gap-3">
//         {/* Attach */}
//         <button
//           type="button"
//           onClick={onAttachClick}
//           aria-label="Прикрепить файл"
//           title="Прикрепить файл"
//           className="p-1 bg-transparent border-none hover:bg-gray-100 rounded-md transition"
//         >
//           <IoAttachOutline className="w-8 h-8 text-gray-800" />
//         </button>

//         <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} />

//         {/* Input area */}
//         <div className="flex-1 flex items-center bg-gray-100 rounded-2xl px-3 py-0 min-h-[40px] max-h-[160px]">
//           <textarea
//             ref={textareaRef}
//             value={text}
//             onChange={(e) => setText(e.target.value)}
//             onKeyDown={onKeyDown}
//             placeholder="Введите сообщение..."
//             rows={1}
//             className="resize-none w-full bg-transparent outline-none text-sm leading-5 scrollbar-hide"
//           />
//         </div>

//         {/* Right controls */}
//         <div className="flex items-center gap-2">
//           {showSend ? (
//             <button
//               onClick={sendMessage}
//               disabled={sending}
//               aria-label="Отправить"
//               title="Отправить"
//               className="p-1 bg-transparent border-none hover:bg-gray-100 rounded-md transition"
//             >
//               <IoSend className={`w-8 h-8 ${sending ? 'text-gray-800' : 'text-gray-800'}`} />
//             </button>
//           ) : (
//             <button
//               onClick={onMicClick}
//               aria-label={isRecording ? "Остановить запись" : "Записать голосовое"}
//               title={isRecording ? "Остановить запись" : "Записать голосовое"}
//               className="p-1 bg-transparent border-none hover:bg-gray-100 rounded-md transition"
//             >
//                 {isRecording ? (
//                     <IoStopOutline className="w-8 h-8 text-red-500" />
//                 ) : (
//                     <IoMicOutline className="w-8 h-8 text-gray-600" />
//                 )}
//             </button>
//           )}
//         </div>
//       </div>

//       {/* Status row */}
//       <div className="mt-2 text-xs text-gray-500">
//         {isUploading && <span>Загрузка файла…</span>}
//         {isRecording && <span>Запись: {Math.floor(recSec / 60).toString().padStart(2,'0')}:{(recSec % 60).toString().padStart(2,'0')}</span>}
//       </div>
//     </div>
//   );
// }
