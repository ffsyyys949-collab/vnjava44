import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import {
  getCustomThemesMeta,
  saveCustomThemesMeta,
  saveVideoBlob,
  getVideoBlob,
  deleteVideoBlob,
  CustomThemeMeta
} from './themeStorage';

export interface GlobalTheme {
  id: string;
  name: string;
  subtitle: string;
  video: string | null;
  bg?: string;
  previewThumb?: string;
  isCustom?: boolean;
}

export const EXTERNAL_BG_MAIN_VIDEO = '/assets/aistudio/ssstik.io_1792870405896_cd0f92f4.mp4';
export const EXTERNAL_BG_LIQUID_VIDEO = '/assets/aistudio/ssstik.io_1793231239969_f00ac994.mp4';

export function resolveExternalBgVideoUrl(url?: string | null): string | null {
  if (!url) return null;
  if (
    url === '/assets/aistudio/VID-20261028-WA0024_84426855.mp4' ||
    url === 'https://pomf2.lain.la/f/0c4r19dc.mp4'
  ) {
    return EXTERNAL_BG_MAIN_VIDEO;
  }
  if (
    url === '/assets/bw_water_liquid.mp4' ||
    url === 'https://pomf2.lain.la/f/kv285epn.mp4'
  ) {
    return EXTERNAL_BG_LIQUID_VIDEO;
  }
  return url;
}

export const GLOBAL_THEMES: GlobalTheme[] = [
  {
    id: 'bw-liquid-water',
    name: 'Black & White Liquid Glass',
    subtitle: 'Air hitam putih bergelombang & efek kaca monokrom mewah',
    video: EXTERNAL_BG_MAIN_VIDEO,
    bg: '#000000',
    previewThumb: '/assets/bw_water_still.jpg',
  },
];

interface ThemeContextType {
  theme: GlobalTheme;
  setTheme: (theme: GlobalTheme) => void;
  selectThemeById: (id: string) => void;
  allThemes: GlobalTheme[];
  addCustomTheme: (data: { name: string; subtitle?: string; blob?: Blob; videoUrl?: string; bg?: string }) => Promise<GlobalTheme>;
  deleteCustomTheme: (id: string) => Promise<void>;
}

function getActiveThemeUid(): string {
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

function readThemeIdForCurrentUser(): string {
  const uid = getActiveThemeUid();
  try {
    const scopedSimple = localStorage.getItem(`zeio-theme_${uid}`);
    if (scopedSimple) return scopedSimple;
    const scopedGlobal = localStorage.getItem(`zeio-global-theme_${uid}`);
    if (scopedGlobal) {
      try {
        const parsed = JSON.parse(scopedGlobal);
        if (parsed?.id) return parsed.id;
      } catch {
        return scopedGlobal;
      }
    }
    if (uid === 'GUEST') {
      const savedSimple = localStorage.getItem('zeio-theme');
      if (savedSimple) return savedSimple;
    }
  } catch {}
  return 'bw-liquid-water';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [customThemes, setCustomThemes] = useState<GlobalTheme[]>([]);
  const objectUrlsRef = useRef<Map<string, string>>(new Map());

  // Load custom themes from storage on initial mount
  useEffect(() => {
    let isMounted = true;
    const loadCustom = async () => {
      try {
        const metas = getCustomThemesMeta();
        const loaded: GlobalTheme[] = [];
        for (const meta of metas) {
          let videoUrl = resolveExternalBgVideoUrl(meta.videoUrl || null);
          if (meta.hasBlob) {
            const blob = await getVideoBlob(meta.id);
            if (blob) {
              const url = URL.createObjectURL(blob);
              objectUrlsRef.current.set(meta.id, url);
              videoUrl = url;
            }
          }
          loaded.push({
            id: meta.id,
            name: meta.name,
            subtitle: meta.subtitle || 'Tema video kustom pengguna',
            video: videoUrl,
            bg: meta.bg || '#000000',
            isCustom: true
          });
        }
        if (isMounted) {
          setCustomThemes(loaded);
        }
      } catch (err) {
        console.warn('Error loading custom themes:', err);
      }
    };

    loadCustom();

    return () => {
      isMounted = false;
      // Revoke any created object URLs on unmount
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const [themeId, setThemeId] = useState<string>(() => readThemeIdForCurrentUser());

  const allThemes = [...GLOBAL_THEMES, ...customThemes];

  // Resolve current active theme
  const theme = allThemes.find((t) => t.id === themeId) || GLOBAL_THEMES[0];

  useEffect(() => {
    const uid = getActiveThemeUid();
    try {
      localStorage.setItem(`zeio-theme_${uid}`, theme.id);
      localStorage.setItem(`zeio-global-theme_${uid}`, JSON.stringify({
        id: theme.id,
        name: theme.name,
        subtitle: theme.subtitle,
        video: theme.video,
        bg: theme.bg,
        isCustom: theme.isCustom
      }));
    } catch {}
  }, [theme]);

  useEffect(() => {
    const handleAccountSwitch = () => {
      setThemeId(readThemeIdForCurrentUser());
    };
    window.addEventListener('ze-user-store-updated', handleAccountSwitch);
    window.addEventListener('zeio-user-updated', handleAccountSwitch);
    return () => {
      window.removeEventListener('ze-user-store-updated', handleAccountSwitch);
      window.removeEventListener('zeio-user-updated', handleAccountSwitch);
    };
  }, []);

  const setTheme = (newTheme: GlobalTheme) => {
    setThemeId(newTheme.id);
  };

  const selectThemeById = (id: string) => {
    const found = allThemes.find((t) => t.id === id);
    if (found) {
      setThemeId(found.id);
    }
  };

  const addCustomTheme = async (data: {
    name: string;
    subtitle?: string;
    blob?: Blob;
    videoUrl?: string;
    bg?: string;
  }): Promise<GlobalTheme> => {
    const id = 'custom-theme-' + Date.now();
    let videoUrl = data.videoUrl || null;
    let hasBlob = false;

    if (data.blob) {
      await saveVideoBlob(id, data.blob);
      hasBlob = true;
      videoUrl = URL.createObjectURL(data.blob);
      objectUrlsRef.current.set(id, videoUrl);
    }

    const meta: CustomThemeMeta = {
      id,
      name: data.name.trim() || 'Custom Video',
      subtitle: data.subtitle?.trim() || 'Tema video kustom sendiri',
      bg: data.bg || '#000000',
      hasBlob,
      videoUrl: !hasBlob ? videoUrl || undefined : undefined,
      createdAt: Date.now()
    };

    const existingMetas = getCustomThemesMeta();
    saveCustomThemesMeta([...existingMetas, meta]);

    const newTheme: GlobalTheme = {
      id,
      name: meta.name,
      subtitle: meta.subtitle,
      video: videoUrl,
      bg: meta.bg,
      isCustom: true
    };

    setCustomThemes((prev) => [...prev, newTheme]);
    setThemeId(id);
    return newTheme;
  };

  const deleteCustomTheme = async (id: string) => {
    try {
      await deleteVideoBlob(id);
    } catch {}

    const oldUrl = objectUrlsRef.current.get(id);
    if (oldUrl) {
      URL.revokeObjectURL(oldUrl);
      objectUrlsRef.current.delete(id);
    }

    const existingMetas = getCustomThemesMeta();
    saveCustomThemesMeta(existingMetas.filter((m) => m.id !== id));
    setCustomThemes((prev) => prev.filter((t) => t.id !== id));

    if (themeId === id) {
      setThemeId('bw-liquid-water');
    }
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        selectThemeById,
        allThemes,
        addCustomTheme,
        deleteCustomTheme
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
