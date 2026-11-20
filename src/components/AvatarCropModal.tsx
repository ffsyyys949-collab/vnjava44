import React, { useEffect, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw, Check } from 'lucide-react';

interface AvatarCropModalProps {
  imageSrc: string;
  onCancel: () => void;
  onConfirm: (croppedDataUrl: string) => void;
}

export function AvatarCropModal({ imageSrc, onCancel, onConfirm }: AvatarCropModalProps) {
  const [zoom, setZoom] = useState(1.2);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const draggingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement | null>(null);
  const viewportSize = 260;

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      setImgSize({ w: img.naturalWidth || 400, h: img.naturalHeight || 400 });
      setOffset({ x: 0, y: 0 });
      setZoom(1.1);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  const getBaseScale = () => {
    if (!imgSize) return 1;
    return Math.max(viewportSize / imgSize.w, viewportSize / imgSize.h);
  };

  const clampOffset = (nx: number, ny: number, z: number) => {
    if (!imgSize) return { x: 0, y: 0 };
    const scale = getBaseScale() * z;
    const drawW = imgSize.w * scale;
    const drawH = imgSize.h * scale;
    const maxX = Math.max(0, (drawW - viewportSize) / 2);
    const maxY = Math.max(0, (drawH - viewportSize) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, nx)),
      y: Math.max(-maxY, Math.min(maxY, ny)),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    lastPosRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - lastPosRef.current.x;
    const dy = e.clientY - lastPosRef.current.y;
    lastPosRef.current = { x: e.clientX, y: e.clientY };
    setOffset((prev) => clampOffset(prev.x + dx, prev.y + dy, zoom));
  };

  const handlePointerUp = () => {
    draggingRef.current = false;
  };

  const handleZoomChange = (nextZoom: number) => {
    const z = Math.max(1, Math.min(3, nextZoom));
    setZoom(z);
    setOffset((prev) => clampOffset(prev.x, prev.y, z));
  };

  const handleSaveCrop = () => {
    const img = imgRef.current;
    if (!img || !imgSize) {
      onConfirm(imageSrc);
      return;
    }

    const outSize = 480;
    const canvas = document.createElement('canvas');
    canvas.width = outSize;
    canvas.height = outSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      onConfirm(imageSrc);
      return;
    }

    const ratio = outSize / viewportSize;
    const scale = getBaseScale() * zoom * ratio;
    const drawW = imgSize.w * scale;
    const drawH = imgSize.h * scale;
    const dx = outSize / 2 + offset.x * ratio - drawW / 2;
    const dy = outSize / 2 + offset.y * ratio - drawH / 2;

    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, outSize, outSize);
    ctx.drawImage(img, dx, dy, drawW, drawH);

    onConfirm(canvas.toDataURL('image/jpeg', 0.92));
  };

  const baseScale = getBaseScale();
  const displayW = imgSize ? imgSize.w * baseScale * zoom : viewportSize;
  const displayH = imgSize ? imgSize.h * baseScale * zoom : viewportSize;

  return (
    <div className="fixed inset-0 z-[200] ze-solid-modal-backdrop flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#121318] border border-white/15 rounded-3xl p-5 shadow-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Atur Foto Profil</h3>
            <p className="text-[11px] text-zinc-400">Geser posisi & perbesar agar pas di bingkai</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-white/10 text-zinc-300 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-center py-2">
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ width: viewportSize, height: viewportSize, touchAction: 'none' }}
            className="relative rounded-full overflow-hidden border-2 border-white/40 bg-zinc-950 cursor-grab active:cursor-grabbing shadow-xl"
          >
            {imgSize && (
              <img
                src={imageSrc}
                alt="Crop preview"
                draggable={false}
                style={{
                  width: `${displayW}px`,
                  height: `${displayH}px`,
                  maxWidth: 'none',
                  left: '50%',
                  top: '50%',
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                }}
                className="absolute pointer-events-none select-none"
              />
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-300">
            <span className="flex items-center gap-1.5">
              <ZoomOut className="w-3.5 h-3.5 text-zinc-400" /> Zoom
            </span>
            <span className="font-mono text-white">{zoom.toFixed(1)}x</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
              className="w-full accent-sky-400 cursor-pointer"
            />
            <ZoomIn className="w-4 h-4 text-zinc-400 shrink-0" />
          </div>
        </div>

        <div className="flex items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => {
              setZoom(1.1);
              setOffset({ x: 0, y: 0 });
            }}
            className="px-3.5 min-h-[44px] rounded-xl bg-white/10 hover:bg-white/15 text-zinc-200 text-xs font-semibold flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
          <button
            type="button"
            onClick={handleSaveCrop}
            className="flex-1 min-h-[44px] rounded-xl bg-white text-black font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition"
          >
            <Check className="w-4 h-4" /> Gunakan Foto
          </button>
        </div>
      </div>
    </div>
  );
}
