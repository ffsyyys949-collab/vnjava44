import React, { useState } from 'react';
import {
  Settings,
  ShoppingCart,
  Users,
  Grid2x2,
  Sliders,
  Info,
  X,
  ChevronRight,
  Clock,
  LogOut,
  ArrowLeftRight,
  UserPlus,
  Check,
} from 'lucide-react';
import { UserRoleBadge, isUserOwner } from './UserRoleBadge.tsx';
import DiamondPlusIcon from './DiamondPlusIcon.tsx';

export interface SavedAccountEntry {
  id: string;
  name: string;
  username: string;
  photo?: string;
  avatar?: string;
  role?: string;
  isOwner?: boolean;
  isVerified?: boolean;
  bio?: string;
}

interface AppSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
  savedAccounts?: SavedAccountEntry[];
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onOpenKeranjang: () => void;
  onOpenTeman: () => void;
  onOpenHistory?: () => void;
  onOpenChess?: () => void;
  onOpenVnPanel: () => void;
  onSwitchAccount: (account: SavedAccountEntry) => void;
  onAddAccount: () => void;
  onLogout: () => void;
  onComingSoon: (featureName: string) => void;
}

export function AppSidebar({
  isOpen,
  onClose,
  currentUser,
  savedAccounts = [],
  onOpenProfile,
  onOpenSettings,
  onOpenKeranjang,
  onOpenTeman,
  onOpenHistory,
  onOpenChess,
  onOpenVnPanel,
  onSwitchAccount,
  onAddAccount,
  onLogout,
  onComingSoon,
}: AppSidebarProps) {
  const [showSwitchAccounts, setShowSwitchAccounts] = useState(false);

  if (!isOpen) return null;

  const isOwner = isUserOwner(currentUser);
  const currentUid = String(currentUser?.id || '').trim().toUpperCase();

  return (
    <div className="fixed inset-0 z-[10020] flex select-none ze-transparent-page bg-transparent">
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/45 backdrop-blur-[1.5px] transition-opacity"
        aria-label="Tutup Menu"
      />

      <aside
        className="relative z-10 my-2.5 ml-2.5 w-[66vw] max-w-[244px] min-w-[206px] h-[calc(100dvh-20px)] flex flex-col justify-between overflow-y-auto overflow-x-hidden rounded-[26px] border border-white/25 ring-1 ring-black/80 bg-[#0b0d13]/72 shadow-[22px_0_56px_rgba(0,0,0,0.96),0_12px_40px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.22)] animate-in slide-in-from-left duration-250 ease-out no-scrollbar"
        style={{
          backdropFilter: 'blur(20px) saturate(175%)',
          WebkitBackdropFilter: 'blur(20px) saturate(175%)',
        }}
      >
        <div className="absolute top-0 left-4 right-4 h-[1px] bg-gradient-to-r from-transparent via-white/35 to-transparent pointer-events-none" />

        {/* TOP SECTION */}
        <div className="flex flex-col">
          {/* Header (No brand logo image) */}
          <div className="px-3.5 py-3 flex items-center justify-between gap-2 border-b border-white/14">
            <div className="min-w-0">
              <h2 className="text-xs font-black tracking-wider text-white uppercase leading-tight truncate">
                VNJAVA MENU
              </h2>
              <p className="text-[9px] text-zinc-300 leading-tight truncate">Navigasi Utama</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-white/90 hover:text-white cursor-pointer active:scale-90 transition shrink-0 shadow-md"
              title="Tutup Menu"
            >
              <X size={14} />
            </button>
          </div>

          {/* 1. PROFIL AKUN */}
          <div className="p-2.5 border-b border-white/14">
            <div
              onClick={() => {
                onClose();
                onOpenProfile();
              }}
              className="p-2.5 rounded-2xl bg-black/45 border border-white/18 hover:border-white/35 shadow-[0_8px_22px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.14)] transition cursor-pointer flex flex-col gap-2 group active:scale-[0.98] overflow-hidden"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-900 border border-white/30 shrink-0 shadow-md">
                  <img
                    src={
                      currentUser?.avatar ||
                      currentUser?.photo ||
                      `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(currentUser?.name || 'User')}`
                    }
                    alt={currentUser?.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <ChevronRight size={14} className="text-zinc-300 group-hover:text-white shrink-0" />
              </div>

              <div className="min-w-0 space-y-1">
                <div className="text-[12px] font-extrabold text-white truncate leading-tight">
                  {currentUser?.name || 'Pengguna VNJAVA'}
                </div>
                <UserRoleBadge user={currentUser} size="xs" className="max-w-full" />
                <p className="text-[10px] text-zinc-300 truncate font-mono leading-tight">
                  @{currentUser?.username || currentUser?.id || 'ze.user'}
                </p>
                {isOwner && (
                  <div className="pt-0.5 flex items-center gap-1 text-[9px] font-black text-amber-300 tracking-wider uppercase">
                    <DiamondPlusIcon size={11} />
                    <span className="truncate">UNLIMITED DIAMOND+</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* NAVIGATION LIST */}
          <nav className="p-2.5 flex flex-col gap-1.5">
            {/* SETTING */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenSettings();
              }}
              className="w-full p-2.5 rounded-2xl bg-black/26 border border-white/14 hover:border-white/30 shadow-[0_6px_18px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.1)] transition cursor-pointer flex items-center justify-between gap-2 text-left active:scale-[0.98] group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-white shrink-0 shadow-sm">
                  <Settings size={15} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-white leading-tight truncate">Setting</p>
                  <p className="text-[9px] text-zinc-300 leading-tight truncate mt-0.5">Akun &amp; privasi</p>
                </div>
              </div>
              <ChevronRight size={13} className="text-zinc-300 group-hover:text-white shrink-0" />
            </button>

            {/* KERANJANG */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenKeranjang();
              }}
              className="w-full p-2.5 rounded-2xl bg-black/26 border border-white/14 hover:border-white/30 shadow-[0_6px_18px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.1)] transition cursor-pointer flex items-center justify-between gap-2 text-left active:scale-[0.98] group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-white shrink-0 shadow-sm">
                  <ShoppingCart size={15} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-white leading-tight truncate">Keranjang</p>
                  <p className="text-[9px] text-zinc-300 leading-tight truncate mt-0.5">Beli KEY &amp; VIP Pass</p>
                </div>
              </div>
              <ChevronRight size={13} className="text-zinc-300 group-hover:text-white shrink-0" />
            </button>

            {/* TEMAN */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenTeman();
              }}
              className="w-full p-2.5 rounded-2xl bg-black/26 border border-white/14 hover:border-white/30 shadow-[0_6px_18px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.1)] transition cursor-pointer flex items-center justify-between gap-2 text-left active:scale-[0.98] group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-white shrink-0 shadow-sm">
                  <Users size={15} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-white leading-tight truncate">Teman</p>
                  <p className="text-[9px] text-zinc-300 leading-tight truncate mt-0.5">Kontak &amp; cari akun</p>
                </div>
              </div>
              <ChevronRight size={13} className="text-zinc-300 group-hover:text-white shrink-0" />
            </button>

            {/* HISTORY / RIWAYAT */}
            {onOpenHistory && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenHistory();
                }}
                className="w-full p-2.5 rounded-2xl bg-black/26 border border-white/14 hover:border-white/30 shadow-[0_6px_18px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.1)] transition cursor-pointer flex items-center justify-between gap-2 text-left active:scale-[0.98] group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-white shrink-0 shadow-sm">
                    <Clock size={15} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-white leading-tight truncate">History / Riwayat</p>
                    <p className="text-[9px] text-zinc-300 leading-tight truncate mt-0.5">Video, chat, download &amp; topup</p>
                  </div>
                </div>
                <ChevronRight size={13} className="text-zinc-300 group-hover:text-white shrink-0" />
              </button>
            )}

            {/* CATUR */}
            <button
              type="button"
              onClick={() => {
                onClose();
                if (onOpenChess) {
                  onOpenChess();
                } else {
                  onComingSoon('Catur');
                }
              }}
              className="w-full p-2.5 rounded-2xl bg-black/26 border border-white/14 hover:border-white/30 shadow-[0_6px_18px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.1)] transition cursor-pointer flex items-center justify-between gap-2 text-left active:scale-[0.98] group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-white shrink-0 shadow-sm">
                  <Grid2x2 size={15} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-white leading-tight truncate">Catur</p>
                  <p className="text-[9px] text-zinc-300 leading-tight truncate mt-0.5">2 Player 1 HP</p>
                </div>
              </div>
              <ChevronRight size={13} className="text-zinc-300 group-hover:text-white shrink-0" />
            </button>

            {/* VN PANEL — sama persis dengan Beranda */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenVnPanel();
              }}
              className="w-full p-2.5 rounded-2xl bg-black/26 border border-white/14 hover:border-white/30 shadow-[0_6px_18px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.1)] transition cursor-pointer flex items-center justify-between gap-2 text-left active:scale-[0.98] group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-white shrink-0 shadow-sm">
                  <Sliders size={15} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-white leading-tight truncate">VN PANEL</p>
                  <p className="text-[9px] text-zinc-300 leading-tight truncate mt-0.5">VN Injector</p>
                </div>
              </div>
              <ChevronRight size={13} className="text-zinc-300 group-hover:text-white shrink-0" />
            </button>
          </nav>
        </div>

        {/* BOTTOM SECTION: TENTANG APLIKASI + BERALIH AKUN & LOG OUT */}
        <div className="p-2.5 border-t border-white/12 mt-auto bg-black/30 space-y-2">
          <div className="flex items-start gap-2 min-w-0 px-1">
            <div className="w-6 h-6 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center text-white shrink-0 mt-0.5">
              <Info size={12} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-white leading-tight truncate">VNJAVA v3.0.0</p>
              <p className="text-[8px] text-zinc-400 leading-tight mt-0.5 truncate">© 2026 VNJAVA</p>
            </div>
          </div>

          {showSwitchAccounts && (
            <div className="rounded-2xl bg-black/60 border border-white/15 p-2 space-y-1.5">
              <p className="text-[9px] font-bold text-white/60 uppercase px-1">Pilih Akun Tersimpan</p>
              <div className="max-h-32 overflow-y-auto space-y-1 no-scrollbar">
                {savedAccounts.map((acc) => {
                  const isCurrent = String(acc.id || '').trim().toUpperCase() === currentUid;
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => {
                        setShowSwitchAccounts(false);
                        onClose();
                        if (!isCurrent) onSwitchAccount(acc);
                      }}
                      className={`w-full px-2 py-1.5 rounded-xl flex items-center justify-between gap-2 text-left transition cursor-pointer ${
                        isCurrent
                          ? 'bg-white/15 border border-white/25'
                          : 'bg-white/5 hover:bg-white/10 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <img
                          src={
                            acc.photo ||
                            acc.avatar ||
                            `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(acc.name || acc.username || 'U')}`
                          }
                          alt={acc.name}
                          className="w-6 h-6 rounded-full object-cover shrink-0 border border-white/20"
                        />
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold text-white truncate">{acc.name || acc.username}</p>
                          <p className="text-[8px] text-white/50 font-mono truncate">@{acc.username || acc.id}</p>
                        </div>
                      </div>
                      {isCurrent && <Check size={12} className="text-emerald-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowSwitchAccounts(false);
                  onClose();
                  onAddAccount();
                }}
                className="w-full py-1.5 px-2 rounded-xl bg-white/10 hover:bg-white/15 text-[10px] font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer transition"
              >
                <UserPlus size={12} />
                <span>Masuk Akun Lain</span>
              </button>
            </div>
          )}

          {/* Bottom Action Row: Beralih Akun & Log Out */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setShowSwitchAccounts((prev) => !prev)}
              className="py-2 px-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer active:scale-95 transition"
            >
              <ArrowLeftRight size={12} />
              <span className="truncate">Beralih Akun</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onLogout();
              }}
              className="py-2 px-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/35 text-rose-200 text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer active:scale-95 transition"
            >
              <LogOut size={12} />
              <span className="truncate">Log Out</span>
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

export default AppSidebar;
