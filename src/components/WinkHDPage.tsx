import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  Upload,
  Download,
  RotateCcw,
  Sliders,
  CheckCircle2,
  Zap,
  Image as ImageIcon,
  Eye,
  Layers,
} from 'lucide-react';

interface WinkHDPageProps {
  onBack: () => void;
}

type UpscaleMode = '2x' | '4x' | '4k';

interface ImageMetrics {
  width: number;
  height: number;
  bytes: number;
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '-';
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function applySharpenConvolution(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const out = new ImageData(width, height);
  const dst = out.data;

  // Kernel 3x3 SHARPEN: [0, -1, 0, -1, 5, -1, 0, -1, 0]
  for (let y = 0; y < height; y++) {
    const yUp = y > 0 ? y - 1 : 0;
    const yDown = y < height - 1 ? y + 1 : height - 1;
    const rowOff = y * width;
    const upOff = yUp * width;
    const downOff = yDown * width;

    for (let x = 0; x < width; x++) {
      const xLeft = x > 0 ? x - 1 : 0;
      const xRight = x < width - 1 ? x + 1 : width - 1;

      const idx = (rowOff + x) * 4;
      const idxUp = (upOff + x) * 4;
      const idxDown = (downOff + x) * 4;
      const idxLeft = (rowOff + xLeft) * 4;
      const idxRight = (rowOff + xRight) * 4;

      for (let c = 0; c < 3; c++) {
        const val =
          5 * data[idx + c] -
          data[idxUp + c] -
          data[idxDown + c] -
          data[idxLeft + c] -
          data[idxRight + c];
        dst[idx + c] = val < 0 ? 0 : val > 255 ? 255 : val;
      }
      dst[idx + 3] = data[idx + 3];
    }
  }

  return out;
}

export function WinkHDPage({ onBack }: WinkHDPageProps) {
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [enhancedUrl, setEnhancedUrl] = useState<string | null>(null);
  const [beforeMetrics, setBeforeMetrics] = useState<ImageMetrics | null>(null);
  const [afterMetrics, setAfterMetrics] = useState<ImageMetrics | null>(null);
  const [slider, setSlider] = useState<number>(50);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingStep, setProcessingStep] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [upscaleMode, setUpscaleMode] = useState<UpscaleMode>('2x');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const createdOriginalBlobRef = useRef<string | null>(null);
  const createdEnhancedBlobRef = useRef<string | null>(null);
  const activeRunIdRef = useRef<number>(0);

  // Local same-origin assets so Canvas getImageData is never CORS-tainted
  const samplePhotos = [
    {
      name: 'Potret Studio',
      thumb: '/assets/aistudio/IMG_b4c25b86-a1c4-4712-9ab2-40c765fd572f_6512b308.jpg',
    },
    {
      name: 'Game Scene',
      thumb: '/assets/aistudio/Screenshot_20261027-132820_c63c1926.jpg',
    },
    {
      name: 'Wallpaper HD',
      thumb: '/assets/aistudio/Screenshot_20261104_013044_4a6075cd.jpg',
    },
  ];

  useEffect(() => {
    return () => {
      if (createdOriginalBlobRef.current) {
        URL.revokeObjectURL(createdOriginalBlobRef.current);
      }
      if (createdEnhancedBlobRef.current) {
        URL.revokeObjectURL(createdEnhancedBlobRef.current);
      }
    };
  }, []);

  const runRealUpscale = async (sourceUrl: string, mode: UpscaleMode, knownBytes?: number) => {
    const runId = ++activeRunIdRef.current;
    setErrorMsg(null);
    setIsProcessing(true);
    setProcessingStep('Membaca dimensi asli & ukuran file...');

    try {
      let sourceBytes = knownBytes ?? 0;
      if (!sourceBytes) {
        const res = await fetch(sourceUrl);
        const rawBlob = await res.blob();
        sourceBytes = rawBlob.size;
      }

      if (activeRunIdRef.current !== runId) return;

      const img = new Image();
      img.src = sourceUrl;

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Gagal memuat gambar'));
      });

      if (activeRunIdRef.current !== runId) return;

      const lebarAsli = img.naturalWidth || img.width;
      const tinggiAsli = img.naturalHeight || img.height;

      if (!lebarAsli || !tinggiAsli) {
        throw new Error('Resolusi gambar tidak terbaca');
      }

      setBeforeMetrics({
        width: lebarAsli,
        height: tinggiAsli,
        bytes: sourceBytes,
      });

      let scale = 2;
      if (mode === '4x') {
        scale = 4;
      } else if (mode === '4k') {
        scale = 3840 / Math.max(lebarAsli, tinggiAsli);
        if (scale < 1) scale = 1;
      }

      // Guard canvas max dimension so browser/Android WebView stays within hardware texture limits
      const maxCanvasEdge = 4096;
      const rawNewW = Math.round(lebarAsli * scale);
      const rawNewH = Math.round(tinggiAsli * scale);
      let lebarBaru = rawNewW;
      let tinggiBaru = rawNewH;
      if (lebarBaru > maxCanvasEdge || tinggiBaru > maxCanvasEdge) {
        const clampRatio = maxCanvasEdge / Math.max(lebarBaru, tinggiBaru);
        lebarBaru = Math.round(lebarBaru * clampRatio);
        tinggiBaru = Math.round(tinggiBaru * clampRatio);
      }

      setProcessingStep(`Resampling piksel ke ${lebarBaru} × ${tinggiBaru}...`);
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      if (activeRunIdRef.current !== runId) return;

      const canvas = document.createElement('canvas');
      canvas.width = lebarBaru;
      canvas.height = tinggiBaru;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        throw new Error('Context canvas 2D tidak tersedia');
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, lebarBaru, tinggiBaru);

      setProcessingStep('Menjalankan konvolusi sharpen 3×3 pada setiap piksel...');
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      if (activeRunIdRef.current !== runId) return;

      const pixels = ctx.getImageData(0, 0, lebarBaru, tinggiBaru);
      const sharpened = applySharpenConvolution(pixels);
      ctx.putImageData(sharpened, 0, 0);

      setProcessingStep('Mengemas hasil JPEG 95% (canvas.toBlob)...');
      const outputBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error('Gagal menghasilkan file JPEG dari canvas'));
          },
          'image/jpeg',
          0.95
        );
      });

      if (activeRunIdRef.current !== runId) return;

      if (createdEnhancedBlobRef.current) {
        URL.revokeObjectURL(createdEnhancedBlobRef.current);
      }
      const nextEnhancedUrl = URL.createObjectURL(outputBlob);
      createdEnhancedBlobRef.current = nextEnhancedUrl;

      setEnhancedUrl(nextEnhancedUrl);
      setAfterMetrics({
        width: lebarBaru,
        height: tinggiBaru,
        bytes: outputBlob.size,
      });
    } catch (err: any) {
      if (activeRunIdRef.current === runId) {
        setErrorMsg(err?.message || 'Gagal memproses gambar');
      }
    } finally {
      if (activeRunIdRef.current === runId) {
        setIsProcessing(false);
        setProcessingStep('');
      }
    }
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Pilih file foto (JPG, PNG, WEBP).');
      return;
    }

    if (createdOriginalBlobRef.current) {
      URL.revokeObjectURL(createdOriginalBlobRef.current);
    }
    const objUrl = URL.createObjectURL(file);
    createdOriginalBlobRef.current = objUrl;

    setOriginalUrl(objUrl);
    setEnhancedUrl(null);
    setAfterMetrics(null);
    runRealUpscale(objUrl, upscaleMode, file.size);
  };

  const handleSelectSample = (thumbUrl: string) => {
    if (createdOriginalBlobRef.current) {
      URL.revokeObjectURL(createdOriginalBlobRef.current);
      createdOriginalBlobRef.current = null;
    }
    setOriginalUrl(thumbUrl);
    setEnhancedUrl(null);
    setAfterMetrics(null);
    runRealUpscale(thumbUrl, upscaleMode);
  };

  const handleSwitchMode = (nextMode: UpscaleMode) => {
    setUpscaleMode(nextMode);
    if (originalUrl && !isProcessing) {
      runRealUpscale(originalUrl, nextMode, beforeMetrics?.bytes);
    }
  };

  const handleDownload = () => {
    if (!enhancedUrl) return;
    const link = document.createElement('a');
    link.href = enhancedUrl;
    link.download = 'VHD_HD.jpg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleReset = () => {
    activeRunIdRef.current++;
    if (createdOriginalBlobRef.current) {
      URL.revokeObjectURL(createdOriginalBlobRef.current);
      createdOriginalBlobRef.current = null;
    }
    if (createdEnhancedBlobRef.current) {
      URL.revokeObjectURL(createdEnhancedBlobRef.current);
      createdEnhancedBlobRef.current = null;
    }
    setOriginalUrl(null);
    setEnhancedUrl(null);
    setBeforeMetrics(null);
    setAfterMetrics(null);
    setSlider(50);
    setIsProcessing(false);
    setProcessingStep('');
    setErrorMsg(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const modeButtons: Array<{ id: UpscaleMode; label: string }> = [
    { id: '2x', label: '2X' },
    { id: '4x', label: '4X' },
    { id: '4k', label: '4K' },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-white flex flex-col relative z-50 select-none">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleUpload}
        className="hidden"
      />

      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-black/75 backdrop-blur-xl border-b border-white/[0.08] px-4 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            type="button"
            onClick={onBack}
            className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 flex items-center justify-center text-white/80 hover:text-white transition cursor-pointer shrink-0"
            title="Kembali"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-2 truncate">
                <ImageIcon size={17} className="text-violet-400 shrink-0" />
                <span className="truncate">VHD AI</span>
              </h1>
              <span className="bg-white/10 border border-white/20 text-white text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full shrink-0">
                REAL CANVAS
              </span>
            </div>
            <p className="text-[11px] text-white/50 truncate">
              {beforeMetrics
                ? `Asli: ${beforeMetrics.width}×${beforeMetrics.height}`
                : 'Real Upscaler 2X • 4X • 4K + Sharpen 3×3'}
            </p>
          </div>
        </div>

        {/* Upscale Mode Toggle */}
        <div className="flex items-center bg-white/[0.06] p-1 rounded-xl border border-white/10 text-xs font-semibold shrink-0">
          {modeButtons.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={isProcessing}
              onClick={() => handleSwitchMode(m.id)}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer disabled:opacity-50 ${
                upscaleMode === m.id
                  ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 max-w-xl w-full mx-auto p-4 flex flex-col gap-4 pb-28">
        {errorMsg && (
          <div className="rounded-2xl bg-rose-500/15 border border-rose-500/35 px-4 py-3 text-xs text-rose-200 flex items-center justify-between gap-2">
            <span>{errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="text-[11px] font-bold underline cursor-pointer"
            >
              Tutup
            </button>
          </div>
        )}

        {/* EMPTY / UPLOAD STATE */}
        {!originalUrl && !isProcessing && (
          <div className="space-y-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="group relative border-2 border-dashed border-violet-500/30 hover:border-violet-400 bg-gradient-to-b from-violet-950/20 via-[#141419] to-[#0E0E12] rounded-[32px] p-8 flex flex-col items-center text-center cursor-pointer transition-all duration-300"
            >
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-violet-600/30 to-indigo-600/30 border border-violet-400/30 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                <Layers size={36} className="text-violet-400" />
              </div>
              <h2 className="text-lg font-bold text-white mb-1.5">Upload Foto ke VHD AI</h2>
              <p className="text-xs text-white/60 max-w-xs mb-5">
                Upscale piksel asli ({upscaleMode.toUpperCase()}) + filter konvolusi sharpen 3×3 nyata langsung di perangkat.
              </p>

              <button
                type="button"
                className="bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 text-white px-7 py-3 rounded-full text-xs font-bold flex items-center gap-2 shadow-xl shadow-violet-600/30 hover:brightness-110 active:scale-95 transition cursor-pointer"
              >
                <Upload size={16} />
                Pilih Foto dari Galeri
              </button>
              <span className="text-[10px] text-white/35 mt-3 font-medium">
                Output JPEG 95% (VHD_HD.jpg) sesuai rasio foto asli
              </span>
            </div>

            {/* Same-Origin Local Samples */}
            <div className="bg-[#121217] border border-white/[0.08] rounded-3xl p-4">
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-xs font-bold text-white/80 flex items-center gap-1.5">
                  <Sliders size={13} className="text-violet-400" />
                  Uji Sampel Lokal (Non-Gimmick)
                </span>
                <span className="text-[10px] text-white/40">Canvas Pixel Test</span>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {samplePhotos.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectSample(item.thumb)}
                    className="group relative rounded-2xl overflow-hidden aspect-[4/5] border border-white/10 hover:border-violet-500 transition cursor-pointer"
                  >
                    <img
                      src={item.thumb}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent flex flex-col justify-end p-2 text-left">
                      <span className="text-[10px] font-bold text-white leading-tight">{item.name}</span>
                      <span className="text-[8px] text-violet-300 font-semibold mt-0.5">Proses VHD →</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Technical Breakdown */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-[#131318] border border-white/[0.06] rounded-2xl p-3.5 flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                  <Zap size={16} className="text-violet-400" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white">Rasio Proporsional</h3>
                  <p className="text-[10px] text-white/50 mt-0.5 leading-relaxed">
                    Menghitung lebar &amp; tinggi baru tanpa memaksa distorsi 16:9.
                  </p>
                </div>
              </div>

              <div className="bg-[#131318] border border-white/[0.06] rounded-2xl p-3.5 flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                  <Layers size={16} className="text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white">Kernel Sharpen 3×3</h3>
                  <p className="text-[10px] text-white/50 mt-0.5 leading-relaxed">
                    Menajamkan kontur nyata piksel per piksel sebelum ekspor blob JPEG.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* REAL PROCESSING STATE */}
        {isProcessing && (
          <div className="bg-[#131318] border border-white/10 rounded-[32px] p-8 flex flex-col items-center text-center my-auto min-h-[320px] justify-center">
            <div className="w-16 h-16 rounded-full border-4 border-violet-500/25 border-t-violet-500 animate-spin mb-5" />
            <h3 className="text-base font-bold text-white mb-1.5">Memproses Piksel Nyata ({upscaleMode.toUpperCase()})</h3>
            <p className="text-xs text-violet-300 font-medium">{processingStep || 'Menjalankan canvas...'}</p>
          </div>
        )}

        {/* REAL BEFORE / AFTER COMPARISON (ZERO CSS FILTERS) */}
        {originalUrl && !isProcessing && (
          <div className="space-y-4">
            {/* Real Pixel & Size Proof Banner */}
            {beforeMetrics && afterMetrics && (
              <div className="rounded-2xl bg-[#121217] border border-emerald-500/30 p-3.5 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-white/60">Asli: {beforeMetrics.width}×{beforeMetrics.height}</span>
                  <span className="text-emerald-400">VHD Output ({upscaleMode.toUpperCase()})</span>
                </div>
                <p className="text-xs font-mono font-bold text-white leading-relaxed break-words">
                  SEBELUM: {beforeMetrics.width}×{beforeMetrics.height} ({formatFileSize(beforeMetrics.bytes)}) → SESUDAH:{' '}
                  <span className="text-emerald-400">
                    {afterMetrics.width}×{afterMetrics.height} ({formatFileSize(afterMetrics.bytes)})
                  </span>
                </p>
              </div>
            )}

            {/* Split Slider Comparison — Pure Images Only */}
            <div className="relative rounded-[28px] overflow-hidden border border-white/20 bg-black aspect-[3/4] sm:aspect-[4/5] shadow-2xl select-none touch-none">
              <div className="absolute inset-0 w-full h-full">
                <img
                  src={enhancedUrl || originalUrl}
                  alt="VHD AI Result"
                  className="w-full h-full object-contain bg-black"
                />
              </div>

              <div
                className="absolute inset-0 w-full h-full overflow-hidden"
                style={{
                  clipPath: `polygon(0% 0%, ${slider}% 0%, ${slider}% 100%, 0% 100%)`,
                }}
              >
                <img
                  src={originalUrl}
                  alt="Original"
                  className="w-full h-full object-contain bg-black"
                />
              </div>

              <div
                className="absolute top-0 bottom-0 w-[2px] bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)] pointer-events-none"
                style={{ left: `${slider}%` }}
              >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/80 backdrop-blur-md border-2 border-white flex items-center justify-center shadow-lg text-[10px] font-bold text-white">
                  ↔
                </div>
              </div>

              <div className="absolute top-3.5 left-3.5 z-20">
                <span className="bg-black/70 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1 rounded-full border border-white/20">
                  Before ({beforeMetrics ? `${beforeMetrics.width}×${beforeMetrics.height}` : 'Asli'})
                </span>
              </div>
              <div className="absolute top-3.5 right-3.5 z-20">
                <span className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1">
                  <CheckCircle2 size={11} />
                  VHD AI ({afterMetrics ? `${afterMetrics.width}×${afterMetrics.height}` : upscaleMode.toUpperCase()})
                </span>
              </div>

              <input
                type="range"
                min="0"
                max="100"
                value={slider}
                onChange={(e) => setSlider(Number(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-30"
                aria-label="Before After comparison slider"
              />
            </div>

            {/* Slider Control Row */}
            <div className="bg-[#141419] border border-white/10 rounded-2xl p-3 flex items-center gap-3">
              <Eye size={15} className="text-white/40 shrink-0" />
              <input
                type="range"
                min="0"
                max="100"
                value={slider}
                onChange={(e) => setSlider(Number(e.target.value))}
                className="flex-1 accent-violet-500 cursor-pointer h-1.5 bg-white/10 rounded-lg"
              />
              <span className="text-[11px] font-mono font-bold text-violet-400 min-w-[36px] text-right">
                {slider}%
              </span>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={handleReset}
                className="w-full bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 text-white/80 hover:text-white py-3.5 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 border border-white/10 transition cursor-pointer"
              >
                <RotateCcw size={15} />
                Upload Lain
              </button>

              <button
                type="button"
                disabled={!enhancedUrl}
                onClick={handleDownload}
                className="w-full bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:brightness-110 active:scale-95 disabled:opacity-40 text-white py-3.5 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 shadow-xl shadow-violet-600/30 transition cursor-pointer"
              >
                <Download size={15} />
                Simpan VHD_HD.jpg
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default WinkHDPage;
