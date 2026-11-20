import React, { useState, useRef, useEffect } from 'react';
import { Camera, Image as ImageIcon, Palette, Send, Sliders, Type, Video, X } from 'lucide-react';
import { StoryItem } from './StoryViewer.tsx';

const TEXT_STORY_BACKGROUNDS = [
  'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
  'linear-gradient(135deg, #1d4ed8 0%, #1e1b4b 100%)',
  'linear-gradient(135deg, #7e22ce 0%, #3b0764 100%)',
  'linear-gradient(135deg, #be123c 0%, #4c0519 100%)',
  'linear-gradient(135deg, #0f766e 0%, #042f2e 100%)',
  'linear-gradient(135deg, #c2410c 0%, #431407 100%)',
  'linear-gradient(135deg, #0284c7 0%, #172554 100%)',
  '#111111',
];

export function AddStoryModal({
  currentUser,
  onClose,
  onStoryAdded,
}: {
  currentUser: { id: string; name: string; photo?: string };
  onClose: () => void;
  onStoryAdded: (newStory: any) => void;
}) {
  const [mode, setMode] = useState<'media' | 'text'>('media');
  const [preview, setPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [quality, setQuality] = useState<'360p' | '720p' | '1080p'>('720p');
  const [caption, setCaption] = useState('');
  const [textContent, setTextContent] = useState('');
  const [bgIndex, setBgIndex] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.querySelector('.bottom-nav')?.classList.add('hidden');
    return () => {
      document.querySelector('.bottom-nav')?.classList.remove('hidden');
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, forcedKind?: 'image' | 'video') => {
    setErrorMsg(null);
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      setErrorMsg('Ukuran file maksimal 25MB');
      return;
    }

    const isVid = forcedKind === 'video' || file.type.startsWith('video');
    setMediaType(isVid ? 'video' : 'image');

    const reader = new FileReader();
    reader.onload = (ev) => {
      if (typeof ev.target?.result === 'string') {
        setPreview(ev.target.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (isUploading) return;
    if (mode === 'media' && !preview) {
      setErrorMsg('Pilih foto atau video terlebih dahulu.');
      return;
    }
    if (mode === 'text' && !textContent.trim()) {
      setErrorMsg('Tulis teks story Anda terlebih dahulu.');
      return;
    }

    setIsUploading(true);
    setErrorMsg(null);

    const storyItemId = 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const newItem: StoryItem =
      mode === 'text'
        ? {
            id: storyItemId,
            type: 'text',
            url: '',
            caption: textContent.trim(),
            bgStyle: TEXT_STORY_BACKGROUNDS[bgIndex],
            textColor: '#ffffff',
            timestamp: Date.now(),
            viewers: [],
            likes: [],
            likesCount: 0,
          }
        : {
            id: storyItemId,
            type: mediaType,
            url: preview!,
            quality: mediaType === 'video' ? quality : undefined,
            caption: caption.trim() || undefined,
            timestamp: Date.now(),
            viewers: [],
            likes: [],
            likesCount: 0,
          };

    const payload = {
      id: 'story_' + currentUser.id,
      userId: currentUser.id,
      userName: currentUser.name,
      userPhoto: currentUser.photo,
      mediaUrl: mode === 'text' ? '' : preview,
      mediaType: mode === 'text' ? 'text' : mediaType,
      quality: mode === 'media' && mediaType === 'video' ? quality : undefined,
      caption: mode === 'text' ? textContent.trim() : caption.trim() || undefined,
      bgStyle: mode === 'text' ? TEXT_STORY_BACKGROUNDS[bgIndex] : undefined,
      textColor: mode === 'text' ? '#ffffff' : undefined,
      items: [newItem],
      createdAt: Date.now(),
    };

    try {
      const res = await fetch('/api/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        onStoryAdded(data.story || payload);
      } else {
        onStoryAdded(payload);
      }
    } catch {
      onStoryAdded(payload);
    }

    setIsUploading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[10010] ze-opaque-viewer bg-black flex flex-col justify-between select-none text-white">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => handleFileChange(e, 'image')}
        className="hidden"
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        onChange={(e) => handleFileChange(e, 'video')}
        className="hidden"
      />

      <div className="w-full max-w-md mx-auto px-4 pt-3 pb-2.5 flex items-center justify-between border-b border-white/10 bg-black z-20">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer"
          >
            <X size={20} />
          </button>
          <div>
            <h2 className="text-base font-bold text-white leading-tight">Buat Story</h2>
            <p className="text-[11px] text-white/55">Tersimpan permanen di akun Anda</p>
          </div>
        </div>

        <div className="flex bg-zinc-900 p-1 rounded-full border border-white/10">
          <button
            type="button"
            onClick={() => setMode('media')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              mode === 'media' ? 'bg-white text-black' : 'text-white/65'
            }`}
          >
            <Camera size={13} />
            <span>Media</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('text')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              mode === 'text' ? 'bg-white text-black' : 'text-white/65'
            }`}
          >
            <Type size={13} />
            <span>Teks</span>
          </button>
        </div>
      </div>

      <div className="flex-1 w-full max-w-md mx-auto flex flex-col justify-center p-4 overflow-hidden">
        {mode === 'media' ? (
          <div className="flex-1 flex flex-col justify-center gap-3 min-h-0">
            <div className="flex-1 min-h-[260px] rounded-3xl bg-zinc-950 border border-white/15 overflow-hidden flex items-center justify-center relative">
              {preview ? (
                <>
                  {mediaType === 'video' ? (
                    <video
                      src={preview}
                      autoPlay
                      muted
                      loop
                      playsInline
                      className="w-full h-full object-contain bg-black"
                    />
                  ) : (
                    <img
                      src={preview}
                      alt="Story Preview"
                      className="w-full h-full object-contain bg-black"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setPreview(null)}
                    className="absolute top-3 right-3 px-3 py-1.5 rounded-full bg-black/80 border border-white/20 text-xs font-semibold text-white cursor-pointer"
                  >
                    Ganti Media
                  </button>
                </>
              ) : (
                <div className="text-center p-6 space-y-5 w-full">
                  <div className="w-16 h-16 rounded-full bg-white/10 mx-auto flex items-center justify-center">
                    <Camera size={28} className="text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">Pilih Foto atau Video untuk Story</p>
                    <p className="text-xs text-white/50 mt-1">
                      Tetap aman &amp; permanen walaupun foto di galeri HP dihapus
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="py-3 px-4 rounded-2xl bg-white text-black font-bold text-xs flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition"
                    >
                      <ImageIcon size={16} />
                      <span>Pilih Foto</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => videoInputRef.current?.click()}
                      className="py-3 px-4 rounded-2xl bg-zinc-800 border border-white/15 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition"
                    >
                      <Video size={16} />
                      <span>Pilih Video</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {mediaType === 'video' && preview && (
              <div className="flex items-center justify-between gap-2 bg-zinc-900/80 border border-white/10 rounded-2xl px-3 py-2">
                <span className="text-xs text-white/65 flex items-center gap-1.5">
                  <Sliders size={13} />
                  Kualitas:
                </span>
                <div className="flex gap-1.5">
                  {(['360p', '720p', '1080p'] as const).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setQuality(q)}
                      className={`px-3 py-1 rounded-full text-[11px] font-bold cursor-pointer ${
                        quality === q ? 'bg-white text-black' : 'bg-white/10 text-white/75'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            className="flex-1 min-h-[280px] rounded-3xl border border-white/15 p-6 flex flex-col justify-between relative overflow-hidden"
            style={{ background: TEXT_STORY_BACKGROUNDS[bgIndex] }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-white/75 bg-black/30 px-3 py-1 rounded-full">
                Story Teks
              </span>
              <button
                type="button"
                onClick={() => setBgIndex((i) => (i + 1) % TEXT_STORY_BACKGROUNDS.length)}
                className="w-9 h-9 rounded-full bg-black/35 hover:bg-black/55 border border-white/20 flex items-center justify-center text-white cursor-pointer"
                title="Ganti Warna Latar"
              >
                <Palette size={16} />
              </button>
            </div>

            <textarea
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="Ketik status atau cerita Anda di sini..."
              rows={5}
              maxLength={300}
              className="w-full bg-transparent text-white placeholder-white/55 text-center text-xl sm:text-2xl font-bold outline-none resize-none leading-relaxed my-auto"
              autoFocus
            />

            <div className="flex items-center justify-center gap-2">
              {TEXT_STORY_BACKGROUNDS.map((bg, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setBgIndex(idx)}
                  style={{ background: bg }}
                  className={`w-6 h-6 rounded-full border-2 cursor-pointer transition ${
                    bgIndex === idx ? 'border-white scale-110' : 'border-white/30'
                  }`}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="w-full max-w-md mx-auto px-4 pb-5 pt-2 space-y-2 bg-black border-t border-white/10">
        {errorMsg && <p className="text-xs text-red-400 text-center">{errorMsg}</p>}

        <div className="flex items-center gap-2">
          {mode === 'media' && (
            <input
              type="text"
              placeholder="Tambah keterangan (opsional)..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="flex-1 bg-zinc-900 border border-white/15 rounded-full px-4 py-3 text-xs text-white placeholder-white/40 outline-none focus:border-white/35"
            />
          )}
          <button
            type="button"
            onClick={handleUpload}
            disabled={isUploading || (mode === 'media' ? !preview : !textContent.trim())}
            className={`${
              mode === 'text' ? 'w-full' : 'px-5 shrink-0'
            } py-3 rounded-full bg-white text-black text-xs font-extrabold hover:bg-white/90 active:scale-95 transition disabled:opacity-40 cursor-pointer shadow-lg flex items-center justify-center gap-2`}
          >
            <Send size={14} />
            <span>{isUploading ? 'Mengunggah...' : 'Bagikan Story'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
