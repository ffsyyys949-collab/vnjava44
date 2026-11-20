import React, { useEffect, useRef, useState } from 'react';
import { Mic, Play, Pause, Send, Trash2 } from 'lucide-react';

export function parseVoiceNoteText(text?: string, audioUrl?: string, duration?: number) {
  if (audioUrl) {
    return { url: audioUrl, duration: Number(duration) || 0 };
  }
  const raw = String(text || '').trim();
  const match = raw.match(/^\[VN:(\d+)\](.+)$/i);
  if (match) {
    return { url: match[2].trim(), duration: Number(match[1]) || 0 };
  }
  const pipeMatch = raw.match(/^\[VN\]:([^|]+)\|?(\d*)$/i);
  if (pipeMatch) {
    return { url: pipeMatch[1].trim(), duration: Number(pipeMatch[2]) || 0 };
  }
  return null;
}

export function formatVoiceDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface VoiceNoteRecorderProps {
  userId?: string;
  onSendVoiceNote: (audioUrl: string, durationSec: number) => Promise<void> | void;
  disabled?: boolean;
}

export function VoiceNoteRecorder({ userId, onSendVoiceNote, disabled }: VoiceNoteRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
        try { t.stop(); } catch {}
      });
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
  };

  useEffect(() => {
    return () => cleanupStream();
  }, []);

  const startRecording = async () => {
    if (disabled || isUploading || isRecording) return;
    setErrorMsg(null);
    cancelledRef.current = false;
    chunksRef.current = [];

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setErrorMsg('Mikrofon tidak didukung di browser ini.');
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
      const chosenMime = mimeOptions.find((m) =>
        typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)
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
            body: JSON.stringify({ userId: userId || 'USER', audioData: dataUrl, duration: finalSec }),
          });
          const json = await res.json().catch(() => null);
          const finalUrl = json?.success && json?.url ? json.url : dataUrl;
          await onSendVoiceNote(finalUrl, finalSec);
        } catch {
          setErrorMsg('Gagal mengirim voice note');
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
      setErrorMsg('Izin mikrofon ditolak, buka Pengaturan > Aplikasi > VNJAVA > Izin > Mikrofon > Izinkan');
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

  const finishAndSend = () => {
    cancelledRef.current = false;
    try {
      mediaRecorderRef.current?.stop();
    } catch {
      cleanupStream();
      setIsRecording(false);
    }
  };

  if (isRecording) {
    return (
      <div className="flex items-center gap-2 bg-zinc-900 border border-rose-500/40 rounded-full px-3 py-1.5 shrink-0">
        <button
          type="button"
          onClick={cancelRecording}
          className="w-8 h-8 rounded-full bg-white/10 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center"
          title="Batal Rekam"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-1.5 px-1">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          <span className="text-xs font-mono font-bold text-white tabular-nums">
            {formatVoiceDuration(elapsedSec)}
          </span>
        </div>
        <button
          type="button"
          onClick={finishAndSend}
          className="w-8 h-8 rounded-full bg-sky-500 hover:bg-sky-400 text-white flex items-center justify-center"
          title="Kirim Voice Note"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={startRecording}
        disabled={disabled || isUploading}
        className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white flex items-center justify-center active:scale-95 transition"
        title={isUploading ? 'Mengunggah VN...' : 'Rekam Voice Note'}
      >
        {isUploading ? (
          <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        ) : (
          <Mic className="w-4 h-4" />
        )}
      </button>
      {errorMsg && (
        <span className="absolute bottom-full mb-1 right-0 bg-rose-950 border border-rose-500/50 text-rose-200 text-[10px] px-2 py-0.5 rounded whitespace-nowrap">
          {errorMsg}
        </span>
      )}
    </div>
  );
}

interface VoiceNoteBubbleProps {
  url: string;
  duration?: number;
  isOwn?: boolean;
}

export function VoiceNoteBubble({ url, duration = 0, isOwn = false }: VoiceNoteBubbleProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [totalDur, setTotalDur] = useState(duration);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = new Audio(url);
    audioRef.current = audio;

    const onLoaded = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setTotalDur(Math.round(audio.duration));
      }
    };
    const onTime = () => {
      setCurrentTime(audio.currentTime);
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnded);
    };
  }, [url]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      if (window.mainAudio && !window.mainAudio.paused) {
        window.mainAudio.pause();
      }
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  const bars = [35, 65, 90, 50, 80, 45, 70, 95, 60, 40, 85, 55, 75, 50, 90, 45, 65, 40];

  return (
    <div className="flex items-center gap-2.5 min-w-[200px] max-w-[260px] py-0.5">
      <button
        type="button"
        onClick={togglePlay}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition active:scale-95 ${
          isOwn ? 'bg-black text-white' : 'bg-white text-black'
        }`}
      >
        {playing ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
      </button>

      <div className="flex-1 flex flex-col gap-1">
        <div
          className="flex items-center gap-[2px] h-5 cursor-pointer"
          onClick={(e) => {
            const audio = audioRef.current;
            if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            audio.currentTime = ratio * audio.duration;
            setProgress(ratio * 100);
          }}
        >
          {bars.map((h, i) => {
            const pct = ((i + 1) / bars.length) * 100;
            const filled = pct <= progress;
            return (
              <span
                key={i}
                style={{ height: `${Math.max(25, h)}%` }}
                className={`flex-1 rounded-full transition-colors ${
                  filled
                    ? isOwn
                      ? 'bg-zinc-900'
                      : 'bg-sky-400'
                    : isOwn
                    ? 'bg-zinc-600/50'
                    : 'bg-white/30'
                }`}
              />
            );
          })}
        </div>
        <div className="flex items-center justify-between text-[10px] font-mono tabular-nums opacity-75">
          <span>{playing ? formatVoiceDuration(currentTime) : formatVoiceDuration(totalDur)}</span>
          <span>VN</span>
        </div>
      </div>
    </div>
  );
}
