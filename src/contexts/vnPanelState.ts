import { useCallback, useEffect, useState } from 'react';

export interface OwnerPanelFileInfo {
  slot: '90%' | 'bypass';
  fileName: string;
  fileSize: number;
  mimeType?: string;
  fileUrl: string;
  uploadedAt: number;
  uploadedBy?: string;
}

export interface OwnerVnPanelConfig {
  file90: OwnerPanelFileInfo | null;
  fileBypass: OwnerPanelFileInfo | null;
}

export interface VnPanelUserState {
  is90Enabled: boolean;
  isBypassEnabled: boolean;
  isCrosshairEnabled: boolean;
  isMenuEnabled: boolean;
  customFileName: string;
  customFileSize: number;
  customFileType: string;
  customFileInjected: boolean;
  customFileAppliedAt?: number;
}

export interface AndroidDataWriteResult {
  success: boolean;
  mode: 'native-android' | 'web-fs-api' | 'pending-permission';
  needsPermission?: boolean;
  overwritten?: boolean;
  targetPath: string;
  bytes: number;
  message: string;
}

const STORAGE_KEY_BASE = 'vn_panel_state';
const OWNER_FILES_CACHE_KEY = 'vn_panel_owner_files_cache_v1';
const LOCAL_UPDATE_EVENT = 'vn-panel-local-state-updated';
const OWNER_CONFIG_EVENT = 'vn-panel-owner-config-updated';

export const DEFAULT_VN_PANEL_USER_STATE: VnPanelUserState = {
  is90Enabled: false,
  isBypassEnabled: false,
  isCrosshairEnabled: false,
  isMenuEnabled: false,
  customFileName: '',
  customFileSize: 0,
  customFileType: '',
  customFileInjected: false,
};

function getActivePanelUid(): string {
  try {
    const raw =
      localStorage.getItem('zeio-user') ||
      localStorage.getItem('ze_user') ||
      localStorage.getItem('vn_currentUser');
    if (raw) {
      const parsed = JSON.parse(raw);
      const id = String(parsed?.id || '').trim().toUpperCase();
      if (id) return id;
    }
    const directId = String(localStorage.getItem('ze_id') || '').trim().toUpperCase();
    if (directId) return directId;
  } catch {}
  return 'GUEST';
}

function getScopedStorageKey(): string {
  return `${STORAGE_KEY_BASE}_${getActivePanelUid()}`;
}

export function loadVnPanelState(): VnPanelUserState {
  try {
    const raw = localStorage.getItem(getScopedStorageKey());
    if (!raw) return { ...DEFAULT_VN_PANEL_USER_STATE };
    const parsed = JSON.parse(raw);
    return {
      is90Enabled: Boolean(parsed?.is90Enabled),
      isBypassEnabled: Boolean(parsed?.isBypassEnabled),
      isCrosshairEnabled: Boolean(parsed?.isCrosshairEnabled),
      isMenuEnabled: Boolean(parsed?.isMenuEnabled),
      customFileName: typeof parsed?.customFileName === 'string' ? parsed.customFileName : '',
      customFileSize: Number(parsed?.customFileSize) || 0,
      customFileType: typeof parsed?.customFileType === 'string' ? parsed.customFileType : '',
      customFileInjected: Boolean(parsed?.customFileInjected),
      customFileAppliedAt:
        typeof parsed?.customFileAppliedAt === 'number' ? parsed.customFileAppliedAt : undefined,
    };
  } catch {
    return { ...DEFAULT_VN_PANEL_USER_STATE };
  }
}

export function loadCachedOwnerVnConfig(): OwnerVnPanelConfig {
  try {
    const raw = localStorage.getItem(OWNER_FILES_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        file90: parsed?.file90 || null,
        fileBypass: parsed?.fileBypass || null,
      };
    }
  } catch {}
  return { file90: null, fileBypass: null };
}

function syncNativeBridge(state: VnPanelUserState, ownerCfg: OwnerVnPanelConfig) {
  try {
    const bridge = window.ZeNative;
    if (!bridge) return;
    if (typeof bridge.syncVnPanelState === 'function') {
      bridge.syncVnPanelState(
        state.is90Enabled,
        state.isBypassEnabled,
        state.isCrosshairEnabled,
        state.isMenuEnabled,
        state.customFileName || '',
        ownerCfg.file90?.fileName || '',
        ownerCfg.fileBypass?.fileName || ''
      );
    }
  } catch {}
}

export function saveVnPanelState(
  next: VnPanelUserState,
  ownerCfg: OwnerVnPanelConfig = loadCachedOwnerVnConfig()
): VnPanelUserState {
  try {
    localStorage.setItem(getScopedStorageKey(), JSON.stringify(next));
  } catch {}
  syncNativeBridge(next, ownerCfg);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LOCAL_UPDATE_EVENT, { detail: next }));
  }
  return next;
}

export function triggerAndroidFloatingMenuBridge(enabled: boolean): { handledByNative: boolean } {
  try {
    const androidIfc = window.AndroidInterface;
    if (androidIfc) {
      if (enabled && typeof androidIfc.startFloatingMenu === 'function') {
        androidIfc.startFloatingMenu();
        return { handledByNative: true };
      }
      if (!enabled && typeof androidIfc.stopFloatingMenu === 'function') {
        androidIfc.stopFloatingMenu();
        return { handledByNative: true };
      }
    }
    const bridge = window.ZeNative;
    if (bridge && typeof bridge.setFloatingMenu === 'function') {
      bridge.setFloatingMenu(Boolean(enabled));
      return { handledByNative: true };
    }
  } catch {}
  return { handledByNative: false };
}

export function triggerAndroidCrosshairBridge(enabled: boolean): void {
  try {
    const bridge = window.ZeNative;
    if (bridge && typeof bridge.setCrosshair === 'function') {
      bridge.setCrosshair(Boolean(enabled));
    }
  } catch {}
}

/**
 * STRICT: Memanggil native AndroidInterface.openFreeFire() tanpa URL market:// atau window.open di JS.
 */
export function launchFreeFireApp(): {
  mode: 'native' | 'web-preview';
  result: string;
} {
  try {
    const androidIfc = window.AndroidInterface;
    if (androidIfc && typeof androidIfc.openFreeFire === 'function') {
      const res = String(androidIfc.openFreeFire() || 'com.dts.freefireth');
      return { mode: 'native', result: res };
    }
    const bridge = window.ZeNative;
    if (bridge && typeof bridge.playFreeFire === 'function') {
      const res = String(bridge.playFreeFire() || 'com.dts.freefireth');
      return { mode: 'native', result: res };
    }
  } catch {
    if (window.AndroidInterface || window.ZeNative) {
      return { mode: 'native', result: 'error' };
    }
  }

  return { mode: 'web-preview', result: 'android-bridge-required' };
}

/**
 * STRICT: Memanggil native AndroidInterface.openMobileLegends() tanpa URL market:// atau window.open di JS.
 */
export function launchMobileLegendsApp(): {
  mode: 'native' | 'web-preview';
  result: string;
} {
  try {
    const androidIfc = window.AndroidInterface;
    if (androidIfc && typeof androidIfc.openMobileLegends === 'function') {
      const res = String(androidIfc.openMobileLegends() || 'com.mobile.legends');
      return { mode: 'native', result: res };
    }
    const bridge = window.ZeNative;
    if (bridge && typeof bridge.openApp === 'function') {
      const ok = bridge.openApp('com.mobile.legends');
      return { mode: 'native', result: ok ? 'com.mobile.legends' : 'playstore' };
    }
  } catch {
    if (window.AndroidInterface || window.ZeNative) {
      return { mode: 'native', result: 'error' };
    }
  }

  return { mode: 'web-preview', result: 'android-bridge-required' };
}

export function hasAndroidStoragePermissionNative(): boolean | null {
  try {
    if (window.AndroidInterface && typeof window.AndroidInterface.hasStoragePermission === 'function') {
      return Boolean(window.AndroidInterface.hasStoragePermission());
    }
  } catch {}
  return null;
}

export function requestAndroidStoragePermissionNative(): boolean {
  try {
    if (window.AndroidInterface && typeof window.AndroidInterface.requestStoragePermission === 'function') {
      window.AndroidInterface.requestStoragePermission();
      return true;
    }
  } catch {}
  return false;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

let cachedWebDirHandle: any = null;

async function findExistingHandleInDir(dirHandle: any, fileName: string, depth = 3): Promise<any | null> {
  if (!dirHandle || depth < 0) return null;
  try {
    const direct = await dirHandle.getFileHandle(fileName, { create: false });
    if (direct) return direct;
  } catch {}

  try {
    for await (const [, entry] of dirHandle.entries()) {
      if (entry?.kind === 'directory') {
        const nested = await findExistingHandleInDir(entry, fileName, depth - 1);
        if (nested) return nested;
      }
    }
  } catch {}
  return null;
}

export async function injectFileToAndroidData(params: {
  fileName: string;
  file?: File | Blob | null;
  fileUrl?: string | null;
  targetSubdir?: string;
}): Promise<AndroidDataWriteResult> {
  const cleanName = params.fileName.trim().split(/[/\\]/).pop() || 'vn_injector_patch.dat';
  const targetSubdir = params.targetSubdir || 'com.dts.freefireth/files';
  const displayPath = `/storage/emulated/0/Android/data/${targetSubdir}/${cleanName}`;

  let bytesBuffer: ArrayBuffer;
  if (params.file) {
    bytesBuffer = await params.file.arrayBuffer();
  } else if (params.fileUrl) {
    const resp = await fetch(params.fileUrl);
    if (!resp.ok) {
      throw new Error(`Gagal mengunduh file sumber (${resp.status})`);
    }
    bytesBuffer = await resp.arrayBuffer();
  } else {
    throw new Error('Tidak ada data file untuk diproses ke Android/data');
  }

  // 1. Native Android APK Path (WRITE langsung ke /storage/emulated/0/Android/data + timpa file bernama sama)
  const androidIfc = window.AndroidInterface;
  if (androidIfc && typeof androidIfc.writeFileToAndroidData === 'function') {
    const base64 = arrayBufferToBase64(bytesBuffer);
    const rawJson = androidIfc.writeFileToAndroidData(targetSubdir, cleanName, base64);
    const parsed = JSON.parse(rawJson || '{}');
    if (parsed?.needsPermission) {
      return {
        success: false,
        mode: 'pending-permission',
        needsPermission: true,
        targetPath: displayPath,
        bytes: bytesBuffer.byteLength,
        message: parsed.message || 'Izin penyimpanan penuh Android/data diperlukan',
      };
    }
    if (!parsed?.success) {
      return {
        success: false,
        mode: 'native-android',
        targetPath: displayPath,
        bytes: bytesBuffer.byteLength,
        message: parsed?.message || 'Gagal menulis file ke Android/data',
      };
    }
    return {
      success: true,
      mode: 'native-android',
      overwritten: Boolean(parsed.overwritten),
      targetPath: parsed.path || displayPath,
      bytes: Number(parsed.bytes) || bytesBuffer.byteLength,
      message: parsed.overwritten
        ? `File "${cleanName}" ditimpa langsung di ${parsed.path || displayPath}`
        : `File "${cleanName}" disimpan ke ${parsed.path || displayPath}`,
    };
  }

  // 2. Browser / Desktop Web File System Access API fallback (real permission + real file overwrite)
  const picker = (window as any).showDirectoryPicker;
  if (typeof picker === 'function') {
    try {
      if (!cachedWebDirHandle) {
        cachedWebDirHandle = await picker({ mode: 'readwrite' });
      }
      if (cachedWebDirHandle?.requestPermission) {
        const perm = await cachedWebDirHandle.requestPermission({ mode: 'readwrite' });
        if (perm !== 'granted') {
          return {
            success: false,
            mode: 'pending-permission',
            needsPermission: true,
            targetPath: displayPath,
            bytes: bytesBuffer.byteLength,
            message: 'Izin folder penyimpanan ditolak browser',
          };
        }
      }
      const existingHandle = await findExistingHandleInDir(cachedWebDirHandle, cleanName);
      const targetHandle =
        existingHandle || (await cachedWebDirHandle.getFileHandle(cleanName, { create: true }));
      const writable = await targetHandle.createWritable();
      await writable.write(bytesBuffer);
      await writable.close();

      return {
        success: true,
        mode: 'web-fs-api',
        overwritten: Boolean(existingHandle),
        targetPath: `${cachedWebDirHandle.name}/${cleanName}`,
        bytes: bytesBuffer.byteLength,
        message: existingHandle
          ? `File "${cleanName}" ditimpa langsung (${bytesBuffer.byteLength.toLocaleString('id-ID')} B)`
          : `File "${cleanName}" ditulis ke folder terpilih (${bytesBuffer.byteLength.toLocaleString('id-ID')} B)`,
      };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return {
          success: false,
          mode: 'pending-permission',
          needsPermission: true,
          targetPath: displayPath,
          bytes: bytesBuffer.byteLength,
          message: 'Pemilihan folder penyimpanan dibatalkan',
        };
      }
    }
  }

  return {
    success: false,
    mode: 'pending-permission',
    needsPermission: true,
    targetPath: displayPath,
    bytes: bytesBuffer.byteLength,
    message: `Siap ditulis ke ${displayPath} (${bytesBuffer.byteLength.toLocaleString('id-ID')} B) — buka melalui APK VNJAVA untuk akses langsung /storage/emulated/0/Android/data`,
  };
}

export async function fetchOwnerVnPanelConfig(): Promise<OwnerVnPanelConfig> {
  try {
    const res = await fetch('/api/vn-panel/config');
    const data = await res.json();
    if (data?.success && data.config) {
      const cfg: OwnerVnPanelConfig = {
        file90: data.config.file90 || null,
        fileBypass: data.config.fileBypass || null,
      };
      try {
        localStorage.setItem(OWNER_FILES_CACHE_KEY, JSON.stringify(cfg));
      } catch {}
      window.dispatchEvent(new CustomEvent(OWNER_CONFIG_EVENT, { detail: cfg }));
      return cfg;
    }
  } catch {}
  return loadCachedOwnerVnConfig();
}

export function useVnPanel() {
  const [state, setState] = useState<VnPanelUserState>(() => loadVnPanelState());
  const [ownerConfig, setOwnerConfig] = useState<OwnerVnPanelConfig>(() =>
    loadCachedOwnerVnConfig()
  );

  useEffect(() => {
    let mounted = true;
    fetchOwnerVnPanelConfig().then((cfg) => {
      if (mounted) {
        setOwnerConfig(cfg);
        syncNativeBridge(loadVnPanelState(), cfg);
      }
    });

    const handleLocalUpdate = (ev: Event) => {
      const detail = (ev as CustomEvent<VnPanelUserState>)?.detail;
      setState(detail || loadVnPanelState());
    };

    const handleOwnerConfigUpdate = (ev: Event) => {
      const detail = (ev as CustomEvent<OwnerVnPanelConfig>)?.detail;
      if (detail) {
        setOwnerConfig(detail);
        try {
          localStorage.setItem(OWNER_FILES_CACHE_KEY, JSON.stringify(detail));
        } catch {}
      }
    };

    const handleAccountSwitch = () => {
      const latest = loadVnPanelState();
      setState(latest);
      syncNativeBridge(latest, loadCachedOwnerVnConfig());
    };

    // Sync updates coming back from Android Native Foreground Overlay Service
    const handleNativeSync = (ev: Event) => {
      const d = (ev as CustomEvent<Partial<VnPanelUserState>>)?.detail;
      if (!d) return;
      const current = loadVnPanelState();
      const merged: VnPanelUserState = {
        ...current,
        ...(typeof d.is90Enabled === 'boolean' ? { is90Enabled: d.is90Enabled } : {}),
        ...(typeof d.isBypassEnabled === 'boolean' ? { isBypassEnabled: d.isBypassEnabled } : {}),
        ...(typeof d.isCrosshairEnabled === 'boolean'
          ? { isCrosshairEnabled: d.isCrosshairEnabled }
          : {}),
        ...(typeof d.isMenuEnabled === 'boolean' ? { isMenuEnabled: d.isMenuEnabled } : {}),
      };
      try {
        localStorage.setItem(getScopedStorageKey(), JSON.stringify(merged));
      } catch {}
      setState(merged);
    };

    let evtSource: EventSource | null = null;
    try {
      evtSource = new EventSource('/api/events');
      evtSource.addEventListener('vn-panel-updated', (e: MessageEvent) => {
        try {
          const parsed = JSON.parse(e.data);
          if (parsed?.config) {
            const nextCfg: OwnerVnPanelConfig = {
              file90: parsed.config.file90 || null,
              fileBypass: parsed.config.fileBypass || null,
            };
            try {
              localStorage.setItem(OWNER_FILES_CACHE_KEY, JSON.stringify(nextCfg));
            } catch {}
            setOwnerConfig(nextCfg);
            syncNativeBridge(loadVnPanelState(), nextCfg);
          }
        } catch {}
      });
    } catch {}

    window.addEventListener(LOCAL_UPDATE_EVENT, handleLocalUpdate);
    window.addEventListener(OWNER_CONFIG_EVENT, handleOwnerConfigUpdate);
    window.addEventListener('ze-user-store-updated', handleAccountSwitch);
    window.addEventListener('zeio-user-updated', handleAccountSwitch);
    window.addEventListener('ze-native-vn-panel-sync', handleNativeSync);

    return () => {
      mounted = false;
      evtSource?.close();
      window.removeEventListener(LOCAL_UPDATE_EVENT, handleLocalUpdate);
      window.removeEventListener(OWNER_CONFIG_EVENT, handleOwnerConfigUpdate);
      window.removeEventListener('ze-user-store-updated', handleAccountSwitch);
      window.removeEventListener('zeio-user-updated', handleAccountSwitch);
      window.removeEventListener('ze-native-vn-panel-sync', handleNativeSync);
    };
  }, []);

  const patchState = useCallback(
    (patch: Partial<VnPanelUserState>) => {
      const current = loadVnPanelState();
      const next = saveVnPanelState({ ...current, ...patch }, ownerConfig);
      setState(next);
      return next;
    },
    [ownerConfig]
  );

  return {
    state,
    ownerConfig,
    patchState,
  };
}
