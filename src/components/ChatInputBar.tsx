import React, { useEffect, useRef, useState } from 'react';
import { Camera, Layers, Mic, Paperclip, Send, Smile, Trash2 } from 'lucide-react';
import { formatVoiceDuration } from './VoiceNoteControls.tsx';

export interface ChatInputBarProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  placeholder?: string;
  disabled?: boolean;
  userId?: string;
  hasAttachment?: boolean;
  /* Optional left action buttons */
  showEmoji?: boolean;
  emojiActive?: boolean;
  onToggleEmoji?: () => void;
  showSticker?: boolean;
  stickerActive?: boolean;
  onToggleSticker?: () => void;
  showCamera?: boolean;
  onClickCamera?: () => void;
  cameraIcon?: 'camera' | 'paperclip';
  cameraTitle?: string;
  /* Optional voice note recorder callback (when omitted, shows Send button only) */
  onSendVoiceNote?: (audioUrl: string, durationSec: number) => Promise<void> | void;
  className?: string;
  inputClassName?: string;
}

export function ChatInputBar({
  value,
  onChange,
  onSubmit,
  placeholder = 'Ketik pesan...',
  disabled = false,
  userId,
  hasAttachment = false,
  showEmoji = false,
  emojiActive = false,
  onToggleEmoji,
  showSticker = false,
  stickerActive = false,
  onToggleSticker,
  showCamera = false,
  onClickCamera,
  cameraIcon = 'camera',
  cameraTitle = 'Kirim Foto',
  onSendVoiceNote,
  className = '',
  inputClassName = '',
}: ChatInputBarProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [vnError, setVnError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const startTimeRef = useRef(0);

  const cleanupStream = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
  };

  useEffect(() => {
    return () => cleanupStream();
  }, []);

  const startRecording = async () => {
    if (!onSendVoiceNote || disabled || isUploading || isRecording) return;
    setVnError(null);
    cancelledRef.current = false;
    chunksRef.current = [];

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setVnError('Mikrofon tidak didukung');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeOptions = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ];
      const chosenMime = mimeOptions.find(
        (m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)
      );

      const recorder = chosenMime
        ? new MediaRecorder(stream, { mimeType: chosenMime })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      startTimeRef.current = Date.now();
      setElapsedSec(0);
      setIsRecording(true);

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        const finalSec = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        cleanupStream();
        setIsRecording(false);

        if (cancelledRef.current || blob.size < 100) {
          return;
        }

        setIsUploading(true);
        try {
          const dataUrl: string = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          const res = await fetch('/api/voicenotes/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: userId || 'USER',
              audioData: dataUrl,
              duration: finalSec,
            }),
          });
          const json = await res.json().catch(() => null);
          const finalUrl = json?.success && json?.url ? json.url : dataUrl;
          await onSendVoiceNote(finalUrl, finalSec);
        } catch {
          setVnError('Gagal mengirim VN');
        } finally {
          setIsUploading(false);
        }
      };

      recorder.start(250);
      timerRef.current = window.setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 400);
    } catch {
      cleanupStream();
      setIsRecording(false);
      setVnError('Izin mikrofon ditolak, buka Pengaturan > Aplikasi > VNJAVA > Izin > Mikrofon > Izinkan');
      try {
        const androidBridge = (window as any)?.AndroidInterface || (window as any)?.ZeNative;
        androidBridge?.showMicDeniedDialog?.();
      } catch {}
    }
  };

  const cancelRecording = () => {
    cancelledRef.current = true;
    try {
      mediaRecorderRef.current?.stop();
    } catch {
      cleanupStream();
      setIsRecording(false);
    }
  };

  const finishAndSendRecording = () => {
    cancelledRef.current = false;
    try {
      mediaRecorderRef.current?.stop();
    } catch {
      cleanupStream();
      setIsRecording(false);
    }
  };

  const hasTextOrMedia = value.trim().length > 0 || hasAttachment;
  const showSendButton = hasTextOrMedia || !onSendVoiceNote;

  if (isRecording) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          padding: '8px',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
        className={className}
      >
        <button
          type="button"
          onClick={cancelRecording}
          style={{ flexShrink: 0, width: '36px', height: '36px' }}
          className="rounded-full bg-white/10 hover:bg-rose-500/25 text-rose-400 flex items-center justify-center cursor-pointer active:scale-95 transition"
          title="Batal Rekam"
        >
          <Trash2 size={16} />
        </button>

        <div
          style={{ flex: 1, minWidth: 0 }}
          className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/10 border border-rose-500/40"
        >
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
          <span className="text-xs font-mono font-bold text-white tabular-nums shrink-0">
            {formatVoiceDuration(elapsedSec)}
          </span>
          <span className="text-[11px] text-white/60 truncate">Merekam suara...</span>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 0,
            flexShrink: 0,
            width: '40px',
            height: '40px',
            position: 'relative',
            right: 0,
            margin: 0,
            padding: 0,
          }}
        >
          <button
            type="button"
            onClick={finishAndSendRecording}
            style={{ width: '40px', height: '40px' }}
            className="rounded-full bg-white text-black flex items-center justify-center active:scale-95 transition cursor-pointer shadow"
            title="Kirim Voice Note"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full relative">
      {vnError && (
        <div className="absolute -top-7 right-2 z-50 bg-rose-950 border border-rose-500/50 text-rose-200 text-[10px] px-2.5 py-0.5 rounded-full whitespace-nowrap shadow">
          {vnError}
        </div>
      )}
      <form
        onSubmit={onSubmit}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          padding: '8px',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
        className={className}
      >
        {showEmoji && (
          <button
            type="button"
            onClick={onToggleEmoji}
            style={{ flexShrink: 0 }}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition cursor-pointer ${
              emojiActive ? 'bg-white text-black' : 'bg-white/10 text-white/80 hover:text-white'
            }`}
            title="Emoji"
          >
            <Smile size={17} strokeWidth={1.5} />
          </button>
        )}

        {showSticker && (
          <button
            type="button"
            onClick={onToggleSticker}
            style={{ flexShrink: 0 }}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition cursor-pointer ${
              stickerActive ? 'bg-white text-black' : 'bg-white/10 text-white/80 hover:text-white'
            }`}
            title="Stiker"
          >
            <Layers size={17} strokeWidth={1.5} />
          </button>
        )}

        {showCamera && (
          <button
            type="button"
            onClick={onClickCamera}
            style={{ flexShrink: 0 }}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/80 hover:text-white cursor-pointer"
            title={cameraTitle}
          >
            {cameraIcon === 'paperclip' ? (
              <Paperclip size={17} strokeWidth={1.5} />
            ) : (
              <Camera size={17} strokeWidth={1.5} />
            )}
          </button>
        )}

        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ flex: 1, minWidth: 0 }}
          className={
            inputClassName ||
            'bg-white/10 border border-white/15 rounded-full px-3.5 py-2 text-xs sm:text-sm text-white placeholder-white/40 outline-none focus:border-white/40'
          }
        />

        <div
          style={{
            display: 'flex',
            gap: 0,
            flexShrink: 0,
            width: '40px',
            height: '40px',
            position: 'relative',
            right: 0,
            margin: 0,
            padding: 0,
          }}
        >
          {showSendButton ? (
            <button
              type="submit"
              disabled={!hasTextOrMedia || disabled}
              style={{ width: '40px', height: '40px' }}
              className="rounded-full bg-white text-black disabled:opacity-30 flex items-center justify-center active:scale-95 transition cursor-pointer shadow"
              title="Kirim Pesan"
            >
              <Send size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={startRecording}
              disabled={disabled || isUploading}
              style={{ width: '40px', height: '40px' }}
              className="rounded-full bg-white/12 hover:bg-white/20 disabled:opacity-40 text-white flex items-center justify-center active:scale-95 transition cursor-pointer"
              title={isUploading ? 'Mengunggah VN...' : 'Rekam Voice Note'}
            >
              {isUploading ? (
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <Mic size={17} />
              )}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
