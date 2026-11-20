import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Upload, Play, FolderLock, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import {
  hasAndroidStoragePermissionNative,
  injectFileToAndroidData,
  launchFreeFireApp,
  requestAndroidStoragePermissionNative,
  triggerAndroidCrosshairBridge,
  triggerAndroidFloatingMenuBridge,
  useVnPanel,
} from '../contexts/vnPanelState.ts';

function SmoothRoundToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border p-0.5 transition-colors duration-300 ease-out cursor-pointer focus:outline-none ${
        checked
          ? 'bg-white border-white shadow-[0_0_16px_rgba(255,255,255,0.45)]'
          : 'bg-white/15 border-white/25'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full shadow-md transform transition-transform duration-300 ease-out ${
          checked ? 'translate-x-5 bg-black' : 'translate-x-0 bg-white'
        }`}
      />
    </button>
  );
}

interface FlowStatus {
  phase: 'idle' | 'processing' | 'done' | 'warning';
  action: string;
  detail: string;
  targetPath?: string;
}

/**
 * Clean, transparent VN INJECTOR control core.
 * Native floating overlay is strictly handled by Android VNPanelService (never HTML fixed divs).
 */
function VnInjectorCore({
  compact = false,
  onNotice,
}: {
  compact?: boolean;
  onNotice?: (msg: string) => void;
}) {
  const { state, ownerConfig, patchState } = useVnPanel();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pickedFileRef = useRef<File | null>(null);
  const [selectedLocalFile, setSelectedLocalFile] = useState<{
    name: string;
    size: number;
    type: string;
  } | null>(() =>
    state.customFileName
      ? { name: state.customFileName, size: state.customFileSize, type: state.customFileType }
      : null
  );
  const [localToast, setLocalToast] = useState<string | null>(null);
  const [storageGranted, setStorageGranted] = useState<boolean | null>(() =>
    hasAndroidStoragePermissionNative()
  );
  const [flowStatus, setFlowStatus] = useState<FlowStatus>({
    phase: 'idle',
    action: 'Siap',
    detail: 'Aktifkan fitur, atur FILE COSTUM -> INJ, atau tekan MENU / PLAY FF / PLAY ML.',
  });

  useEffect(() => {
    if (state.customFileName) {
      setSelectedLocalFile({
        name: state.customFileName,
        size: state.customFileSize,
        type: state.customFileType,
      });
    }
  }, [state.customFileName, state.customFileSize, state.customFileType]);

  useEffect(() => {
    const syncStoragePerm = (ev?: Event) => {
      const detail = (ev as CustomEvent<{ granted?: boolean }>)?.detail;
      if (typeof detail?.granted === 'boolean') {
        setStorageGranted(detail.granted);
      } else {
        setStorageGranted(hasAndroidStoragePermissionNative());
      }
    };
    window.addEventListener('ze-native-storage-permission', syncStoragePerm);
    return () => {
      window.removeEventListener('ze-native-storage-permission', syncStoragePerm);
    };
  }, []);

  const emitNotice = (msg: string) => {
    if (onNotice) {
      onNotice(msg);
    } else {
      setLocalToast(msg);
      window.setTimeout(() => {
        setLocalToast((prev) => (prev === msg ? null : prev));
      }, 2600);
    }
  };

  const runRealAndroidDataInjection = async (opts: {
    label: string;
    fileName: string;
    file?: File | null;
    fileUrl?: string | null;
    targetSubdir?: string;
  }) => {
    const targetSubdir = opts.targetSubdir || 'com.dts.freefireth/files';
    setFlowStatus({
      phase: 'processing',
      action: `${opts.label} -> Android/data`,
      detail: `Memeriksa izin penyimpanan & menimpa ${opts.fileName}...`,
      targetPath: `/storage/emulated/0/Android/data/${targetSubdir}/${opts.fileName}`,
    });

    try {
      const result = await injectFileToAndroidData({
        fileName: opts.fileName,
        file: opts.file,
        fileUrl: opts.fileUrl,
        targetSubdir,
      });
      setStorageGranted(hasAndroidStoragePermissionNative());

      if (result.success) {
        setFlowStatus({
          phase: 'done',
          action: `${opts.label} Berhasil`,
          detail: result.message,
          targetPath: result.targetPath,
        });
        emitNotice(result.overwritten ? `${opts.label}: File ditimpa di Android/data` : `${opts.label}: Tersimpan di Android/data`);
      } else {
        setFlowStatus({
          phase: 'warning',
          action: result.needsPermission ? 'Izin Penyimpanan Diperlukan' : `${opts.label} Status`,
          detail: result.message,
          targetPath: result.targetPath,
        });
        emitNotice(result.needsPermission ? 'Berikan izin akses penyimpanan penuh Android/data' : result.message);
      }
    } catch (err: any) {
      setFlowStatus({
        phase: 'warning',
        action: `${opts.label} Gagal`,
        detail: err?.message || 'Gagal menulis ke Android/data',
        targetPath: `/storage/emulated/0/Android/data/${targetSubdir}/${opts.fileName}`,
      });
      emitNotice(err?.message || 'Gagal memproses file');
    }
  };

  const handleToggle90 = async () => {
    const next = !state.is90Enabled;
    patchState({ is90Enabled: next });
    emitNotice(next ? '90% ON' : '90% OFF');
    if (next) {
      if (ownerConfig.file90?.fileUrl && ownerConfig.file90?.fileName) {
        await runRealAndroidDataInjection({
          label: '90%',
          fileName: ownerConfig.file90.fileName,
          fileUrl: ownerConfig.file90.fileUrl,
        });
      } else {
        setFlowStatus({
          phase: 'done',
          action: '90% Aktif',
          detail: 'Mode 90% diaktifkan. Siap menimpa file owner saat tersedia.',
          targetPath: '/storage/emulated/0/Android/data/com.dts.freefireth/files',
        });
      }
    } else {
      setFlowStatus({
        phase: 'idle',
        action: '90% Nonaktif',
        detail: 'Switch 90% dimatikan.',
      });
    }
  };

  const handleToggleBypass = async () => {
    const next = !state.isBypassEnabled;
    patchState({ isBypassEnabled: next });
    emitNotice(next ? 'BYPASS ON' : 'BYPASS OFF');
    if (next) {
      if (ownerConfig.fileBypass?.fileUrl && ownerConfig.fileBypass?.fileName) {
        await runRealAndroidDataInjection({
          label: 'BYPASS',
          fileName: ownerConfig.fileBypass.fileName,
          fileUrl: ownerConfig.fileBypass.fileUrl,
        });
      } else {
        setFlowStatus({
          phase: 'done',
          action: 'BYPASS Aktif',
          detail: 'Mode BYPASS diaktifkan. Siap menimpa file bypass saat tersedia.',
          targetPath: '/storage/emulated/0/Android/data/com.dts.freefireth/files',
        });
      }
    } else {
      setFlowStatus({
        phase: 'idle',
        action: 'BYPASS Nonaktif',
        detail: 'Switch BYPASS dimatikan.',
      });
    }
  };

  const handleToggleCrosshair = () => {
    const next = !state.isCrosshairEnabled;
    patchState({ isCrosshairEnabled: next });
    triggerAndroidCrosshairBridge(next);
    emitNotice(next ? 'CROSSHAIR ON' : 'CROSSHAIR OFF');
    setFlowStatus({
      phase: next ? 'done' : 'idle',
      action: next ? 'CROSSHAIR Aktif' : 'CROSSHAIR Nonaktif',
      detail: next ? 'Reticle tengah layar ditampilkan.' : 'Reticle dimatikan.',
    });
  };

  const handlePickCustomFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    pickedFileRef.current = file;
    const info = {
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
    };
    setSelectedLocalFile(info);
    patchState({
      customFileName: info.name,
      customFileSize: info.size,
      customFileType: info.type,
      customFileInjected: false,
    });
    setFlowStatus({
      phase: 'idle',
      action: 'File Siap INJ',
      detail: `${info.name} (${info.size.toLocaleString('id-ID')} B) — tekan INJ untuk menulis ke Android/data.`,
      targetPath: `/storage/emulated/0/Android/data/com.dts.freefireth/files/${info.name}`,
    });
    emitNotice(`File dipilih: ${info.name}`);
  };

  const handleInjectCustomFile = async () => {
    const activeName = selectedLocalFile?.name || state.customFileName;
    if (!activeName) {
      emitNotice('Pilih file terlebih dahulu');
      setFlowStatus({
        phase: 'warning',
        action: 'Belum Ada File',
        detail: 'Tekan PILIH FILE terlebih dahulu sebelum menekan INJ.',
      });
      return;
    }

    patchState({
      customFileName: activeName,
      customFileSize: selectedLocalFile?.size || state.customFileSize,
      customFileType: selectedLocalFile?.type || state.customFileType,
      customFileInjected: true,
      customFileAppliedAt: Date.now(),
    });

    if (pickedFileRef.current) {
      await runRealAndroidDataInjection({
        label: 'FILE COSTUM (INJ)',
        fileName: activeName,
        file: pickedFileRef.current,
      });
    } else {
      const requestedPerm = requestAndroidStoragePermissionNative();
      setFlowStatus({
        phase: 'warning',
        action: 'Pilih Ulang File',
        detail: requestedPerm
          ? 'Pilih ulang file dari perangkat agar byte file dapat langsung ditulis & menimpa Android/data.'
          : 'Pilih ulang file lokal lalu tekan INJ untuk menimpa file bernama sama.',
        targetPath: `/storage/emulated/0/Android/data/com.dts.freefireth/files/${activeName}`,
      });
      emitNotice('Pilih ulang file untuk penulisan byte langsung');
    }
  };

  const handleToggleMenu = () => {
    const next = !state.isMenuEnabled;
    patchState({ isMenuEnabled: next });
    const { handledByNative } = triggerAndroidFloatingMenuBridge(next);
    if (next) {
      const msg = handledByNative
        ? 'AndroidInterface.startFloatingMenu() -> VNPanelService aktif'
        : 'Memanggil AndroidInterface.startFloatingMenu() (butuh APK Android untuk overlay WindowManager)';
      emitNotice(handledByNative ? 'Bubble MENU mengambang ON' : 'Menunggu Native AndroidInterface');
      setFlowStatus({
        phase: handledByNative ? 'done' : 'warning',
        action: 'MENU Mengambang',
        detail: msg,
      });
    } else {
      emitNotice('MENU mengambang OFF');
      setFlowStatus({
        phase: 'idle',
        action: 'MENU Dimatikan',
        detail: 'AndroidInterface.stopFloatingMenu() dipanggil.',
      });
    }
  };

  const handlePlayFreeFire = () => {
    setFlowStatus({
      phase: 'processing',
      action: 'PLAY FF -> AndroidInterface.openFreeFire()',
      detail: 'Mengecek paket com.dts.freefireth -> com.dts.freefiremax -> com.garena.game.ff...',
    });
    const res = launchFreeFireApp();
    if (res.mode === 'native') {
      const isDirectPkg = res.result.startsWith('com.');
      setFlowStatus({
        phase: isDirectPkg ? 'done' : 'warning',
        action: 'PLAY FF',
        detail: isDirectPkg
          ? `Membuka langsung ${res.result} (masuk lobby tanpa Play Store)`
          : 'Paket Free Fire tidak ditemukan di perangkat, membuka halaman instalasi.',
      });
      emitNotice(isDirectPkg ? `Membuka ${res.result}...` : 'Paket FF tidak terinstall');
    } else {
      setFlowStatus({
        phase: 'warning',
        action: 'PLAY FF (Web Preview)',
        detail: 'Menunggu AndroidInterface.openFreeFire() di APK Android (tanpa Play Store link di JS).',
      });
      emitNotice('PLAY FF memanggil AndroidInterface.openFreeFire()');
    }
  };

  const handleRequestStoragePerm = () => {
    const handled = requestAndroidStoragePermissionNative();
    if (handled) {
      emitNotice('Membuka izin penyimpanan penuh Android...');
    } else if (typeof (window as any).showDirectoryPicker === 'function') {
      (window as any)
        .showDirectoryPicker({ mode: 'readwrite' })
        .then(() => {
          setStorageGranted(true);
          emitNotice('Akses folder penyimpanan diberikan');
        })
        .catch(() => {});
    } else {
      emitNotice('Gunakan APK Android untuk izin MANAGE_EXTERNAL_STORAGE');
    }
  };

  const displayCustomName = selectedLocalFile?.name || state.customFileName;

  return (
    <div className="w-full flex flex-col">
      <input
        ref={fileInputRef}
        type="file"
        onChange={handlePickCustomFile}
        className="hidden"
      />

      {localToast && (
        <div className="mb-3 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/25 text-[11px] font-bold text-white text-center">
          {localToast}
        </div>
      )}

      {/* Title */}
      <div className={compact ? 'mb-3 text-center' : 'mb-5 text-center'}>
        <h2
          className={`${
            compact ? 'text-sm tracking-[0.22em]' : 'text-lg tracking-[0.26em]'
          } font-black text-white uppercase`}
        >
          VN INJECTOR
        </h2>
      </div>

      {/* Rows */}
      <div className={compact ? 'space-y-3' : 'space-y-4'}>
        {/* 90% */}
        <div className="flex items-center justify-between gap-3 py-1.5">
          <div className="min-w-0">
            <span className={`${compact ? 'text-xs' : 'text-sm'} font-extrabold tracking-wide text-white`}>
              90%
            </span>
          </div>
          <SmoothRoundToggle
            checked={state.is90Enabled}
            onChange={handleToggle90}
            label="Toggle 90%"
          />
        </div>

        {/* BYPASS */}
        <div className="flex items-center justify-between gap-3 py-1.5">
          <div className="min-w-0">
            <span className={`${compact ? 'text-xs' : 'text-sm'} font-extrabold tracking-wide text-white`}>
              BYPASS
            </span>
          </div>
          <SmoothRoundToggle
            checked={state.isBypassEnabled}
            onChange={handleToggleBypass}
            label="Toggle BYPASS"
          />
        </div>

        {/* CROSSHAIR */}
        <div className="flex items-center justify-between gap-3 py-1.5">
          <span className={`${compact ? 'text-xs' : 'text-sm'} font-extrabold tracking-wide text-white`}>
            CROSSHAIR
          </span>
          <SmoothRoundToggle
            checked={state.isCrosshairEnabled}
            onChange={handleToggleCrosshair}
            label="Toggle CROSSHAIR"
          />
        </div>

        {/* FILE COSTUM */}
        <div className="py-1.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <span className={`${compact ? 'text-xs' : 'text-sm'} font-extrabold tracking-wide text-white shrink-0`}>
                FILE COSTUM
              </span>
              {displayCustomName && (
                <p className="text-[10px] text-white/60 font-mono truncate max-w-[140px]">
                  {displayCustomName}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`${
                  compact ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1.5 text-[11px]'
                } rounded-lg bg-white/12 hover:bg-white/20 border border-white/25 text-white font-bold tracking-wider uppercase flex items-center gap-1 transition active:scale-95 cursor-pointer`}
              >
                <Upload size={compact ? 11 : 12} />
                <span>PILIH FILE</span>
              </button>
              <button
                type="button"
                onClick={handleInjectCustomFile}
                className={`${
                  compact ? 'px-2.5 py-1 text-[10px]' : 'px-3.5 py-1.5 text-[11px]'
                } rounded-lg font-black tracking-wider uppercase transition active:scale-95 cursor-pointer border ${
                  state.customFileInjected && displayCustomName
                    ? 'bg-white text-black border-white'
                    : 'bg-white/20 hover:bg-white/30 text-white border-white/35'
                }`}
              >
                INJ
              </button>
            </div>
          </div>
        </div>

        {/* MENU (Calls window.AndroidInterface.startFloatingMenu()) */}
        <div className="flex items-center justify-between gap-3 py-1.5">
          <span className={`${compact ? 'text-xs' : 'text-sm'} font-extrabold tracking-wide text-white`}>
            MENU
          </span>
          <SmoothRoundToggle
            checked={state.isMenuEnabled}
            onChange={handleToggleMenu}
            label="Toggle MENU"
          />
        </div>
      </div>

      {/* PLAY FF BUTTON */}
      <div className={compact ? 'mt-4' : 'mt-6'}>
        <button
          type="button"
          onClick={handlePlayFreeFire}
          className={`${
            compact ? 'py-2.5 text-[11px]' : 'py-3.5 text-xs'
          } w-full rounded-xl bg-white text-black font-black tracking-[0.16em] uppercase hover:bg-zinc-200 active:scale-[0.98] transition flex items-center justify-center gap-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.55)] cursor-pointer`}
        >
          <Play size={compact ? 12 : 14} fill="currentColor" />
          <span>PLAY FF</span>
        </button>
      </div>

      {/* Real Storage Permission + Flow Status Box */}
      <div className="mt-4 rounded-xl bg-black/40 border border-white/15 p-3 space-y-2 text-left">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-white min-w-0">
            {flowStatus.phase === 'processing' ? (
              <Loader2 size={13} className="animate-spin text-sky-400 shrink-0" />
            ) : flowStatus.phase === 'done' ? (
              <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle size={13} className="text-zinc-300 shrink-0" />
            )}
            <span className="truncate">{flowStatus.action}</span>
          </div>
          <button
            type="button"
            onClick={handleRequestStoragePerm}
            className={`px-2 py-1 rounded-lg text-[9px] font-extrabold uppercase tracking-wider border flex items-center gap-1 cursor-pointer shrink-0 transition ${
              storageGranted
                ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                : 'bg-white/10 hover:bg-white/20 border-white/25 text-white'
            }`}
          >
            <FolderLock size={10} />
            <span>{storageGranted ? 'Izin Storage ON' : 'Izin Storage'}</span>
          </button>
        </div>

        <p className="text-[10px] text-white/75 leading-relaxed">{flowStatus.detail}</p>
        {flowStatus.targetPath && (
          <p className="text-[9px] font-mono text-white/50 truncate">
            Target: {flowStatus.targetPath}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Full-page transparent VN PANEL over global background video.
 */
export function VnPanelPage({ onBack }: { onBack: () => void }) {
  const [notice, setNotice] = useState<string | null>(null);

  const showNotice = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => {
      setNotice((prev) => (prev === msg ? null : prev));
    }, 2400);
  };

  return (
    <div className="min-h-screen w-full bg-transparent flex flex-col text-white select-none relative pb-24">
      <header className="sticky top-0 z-30 px-4 py-3 flex items-center justify-between bg-transparent">
        <button
          type="button"
          onClick={onBack}
          aria-label="Kembali"
          className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-md border border-white/20 hover:bg-white/15 flex items-center justify-center text-white cursor-pointer active:scale-95 transition"
        >
          <ArrowLeft size={18} />
        </button>
        <span className="text-xs font-extrabold tracking-[0.24em] text-white/80 uppercase">
          VN PANEL
        </span>
        <div className="w-10" />
      </header>

      {notice && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/25 text-white text-[11px] font-bold shadow-xl whitespace-nowrap">
          {notice}
        </div>
      )}

      <main className="flex-1 flex items-center justify-center px-5 py-4">
        <div className="w-full max-w-sm rounded-2xl bg-black/25 backdrop-blur-md border border-white/15 px-6 py-7 shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
          <VnInjectorCore onNotice={showNotice} />
        </div>
      </main>
    </div>
  );
}

export function VnCrosshairOverlay() {
  const { state } = useVnPanel();
  if (!state.isCrosshairEnabled) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[99990] flex items-center justify-center"
    >
      <div className="relative w-8 h-8 flex items-center justify-center">
        <span className="absolute top-0 left-1/2 -translate-x-1/2 w-[2px] h-2.5 bg-white shadow-[0_0_4px_rgba(0,0,0,0.95)]" />
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[2px] h-2.5 bg-white shadow-[0_0_4px_rgba(0,0,0,0.95)]" />
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-[2px] w-2.5 bg-white shadow-[0_0_4px_rgba(0,0,0,0.95)]" />
        <span className="absolute right-0 top-1/2 -translate-y-1/2 h-[2px] w-2.5 bg-white shadow-[0_0_4px_rgba(0,0,0,0.95)]" />
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 ring-1 ring-white shadow-[0_0_6px_rgba(0,0,0,0.9)]" />
      </div>
    </div>
  );
}

/**
 * Floating menu overlay wajib dirender secara native oleh Android VNPanelService
 * (WindowManager TYPE_APPLICATION_OVERLAY), bukan HTML div/fixed di dalam WebView.
 */
export function VnFloatingMenuOverlay() {
  return null;
}

export default VnPanelPage;
