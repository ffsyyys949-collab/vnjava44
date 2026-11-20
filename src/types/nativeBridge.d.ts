export interface ZeNativeBridgeInterface {
  requestNotificationPermission?: () => void;
  showMicDeniedDialog?: () => void;
  connectVpn?: (serverCode: string, serverIp: string, port: number, killSwitch: boolean) => void;
  disconnectVpn?: () => void;
  openApp?: (packageName: string) => boolean;
  setUserSession?: (userId: string, userName: string, serverOrigin: string) => void;
  showChatNotification?: (chatId: string, senderName: string, messageText: string, senderPhoto: string) => void;
  updateMusicNotification?: (
    title: string,
    artist: string,
    coverUrl: string,
    audioUrl: string,
    isPlaying: boolean
  ) => void;
  stopMusicNotification?: () => void;
  canDrawOverlays?: () => boolean;
  setFloatingMenu?: (enabled: boolean) => void;
  setCrosshair?: (enabled: boolean) => void;
  syncVnPanelState?: (
    p90: boolean,
    bypass: boolean,
    crosshair: boolean,
    menu: boolean,
    customFileName: string,
    owner90Name: string,
    ownerBypassName: string
  ) => void;
  playFreeFire?: () => string;
}

export interface AndroidInterfaceBridge {
  startFloatingMenu?: () => void;
  stopFloatingMenu?: () => void;
  openFreeFire?: () => string;
  openMobileLegends?: () => string;
  hasStoragePermission?: () => boolean;
  requestStoragePermission?: () => void;
  writeFileToAndroidData?: (targetSubdir: string, fileName: string, base64Content: string) => string;
  showMicDeniedDialog?: () => void;
}

declare global {
  interface Window {
    ZeNative?: ZeNativeBridgeInterface;
    AndroidInterface?: AndroidInterfaceBridge;
    __zeOpenChatById?: (chatId: string) => void;
    __zeMusicControl?: (action: 'play' | 'pause' | 'toggle' | 'next' | 'prev' | 'stop') => void;
  }
}
