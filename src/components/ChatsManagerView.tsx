import React, { useState, useEffect, useMemo, useRef } from 'react';
import { UserRoleBadge } from './UserRoleBadge.tsx';
import {
  MessageCircle,
  Users,
  Search,
  UserPlus,
  Globe,
  Bell,
  ChevronRight,
  ChevronDown,
  Pin,
  Archive,
  MoreVertical,
} from 'lucide-react';
import { renderMessageContent } from './EmojiStickerPicker.tsx';
import { ChatActionMenuModal } from './ChatActionMenuModal.tsx';

interface ChatPrefs {
  pinnedIds: string[];
  archivedIds: string[];
  deletedIds: string[];
  deletedContactIds: string[];
}

const EMPTY_PREFS: ChatPrefs = {
  pinnedIds: [],
  archivedIds: [],
  deletedIds: [],
  deletedContactIds: [],
};

const isTestUser = (u: any) => {
  if (!u) return false;
  const id = String(u.id || '').trim().toUpperCase();
  const name = String(u.name || '').trim().toUpperCase();
  const username = String(u.username || '').trim().replace(/^@/, '').toUpperCase();
  return id === 'TEST' || id === 'ZE-TEST' || name === 'TEST' || username === 'TEST';
};

export function ChatsManagerView({
  currentUser,
  friends,
  chats,
  allUsers,
  notesMap,
  friendRequestsCount,
  onOpenPrivateChat,
  onOpenGlobalChat,
  onOpenAddFriendById,
  onNavigateRequests,
  onCreateNote,
  onViewNote,
  onViewProfile,
}: {
  currentUser: any;
  friends: any[];
  chats: any[];
  allUsers: any[];
  notesMap: Record<string, any>;
  friendRequestsCount: number;
  onOpenPrivateChat: (partner: any) => void;
  onOpenGlobalChat: () => void;
  onOpenAddFriendById: () => void;
  onNavigateRequests: () => void;
  onCreateNote: () => void;
  onViewNote: (note: any) => void;
  onViewProfile: (user: any) => void;
  renderGlobalChat?: (onBack?: () => void) => React.ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<'chats' | 'directory'>('chats');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlineSearchResults, setOnlineSearchResults] = useState<any[]>([]);
  const [onlineUsersList, setOnlineUsersList] = useState<string[]>([]);
  const [showArchivedSection, setShowArchivedSection] = useState(false);

  const cleanUid = String(currentUser?.id || '').trim().toUpperCase();
  const prefsStorageKey = cleanUid ? `ze_chat_prefs_${cleanUid}` : 'ze_chat_prefs';

  const [prefs, setPrefs] = useState<ChatPrefs>(() => {
    try {
      const saved = localStorage.getItem(prefsStorageKey);
      if (saved) return { ...EMPTY_PREFS, ...JSON.parse(saved) };
    } catch {}
    return EMPTY_PREFS;
  });

  const [actionTarget, setActionTarget] = useState<{
    chatId: string;
    partnerId: string;
    partnerName: string;
    isFriend: boolean;
  } | null>(null);

  const longPressTimerRef = useRef<number | null>(null);
  const longPressedRef = useRef(false);

  // Reload per-account chat preferences when user switches
  useEffect(() => {
    if (!cleanUid) {
      setPrefs(EMPTY_PREFS);
      return;
    }
    try {
      const local = localStorage.getItem(`ze_chat_prefs_${cleanUid}`);
      setPrefs(local ? { ...EMPTY_PREFS, ...JSON.parse(local) } : EMPTY_PREFS);
    } catch {
      setPrefs(EMPTY_PREFS);
    }

    fetch(`/api/chats/preferences?userId=${encodeURIComponent(cleanUid)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.preferences) {
          const merged = { ...EMPTY_PREFS, ...data.preferences };
          setPrefs(merged);
          localStorage.setItem(`ze_chat_prefs_${cleanUid}`, JSON.stringify(merged));
        }
      })
      .catch(() => {});
  }, [cleanUid]);

  const applyChatPrefAction = async (
    action: 'pin' | 'unpin' | 'archive' | 'unarchive' | 'delete_chat' | 'delete_contact',
    chatId: string,
    targetId: string
  ) => {
    setActionTarget(null);
    if (!cleanUid) return;

    // Optimistic update
    setPrefs((prev) => {
      const next: ChatPrefs = {
        pinnedIds: [...prev.pinnedIds],
        archivedIds: [...prev.archivedIds],
        deletedIds: [...prev.deletedIds],
        deletedContactIds: [...prev.deletedContactIds],
      };
      if (action === 'pin' && !next.pinnedIds.includes(chatId)) next.pinnedIds.unshift(chatId);
      if (action === 'unpin') next.pinnedIds = next.pinnedIds.filter((id) => id !== chatId);
      if (action === 'archive' && !next.archivedIds.includes(chatId)) {
        next.archivedIds.push(chatId);
        next.pinnedIds = next.pinnedIds.filter((id) => id !== chatId);
      }
      if (action === 'unarchive') next.archivedIds = next.archivedIds.filter((id) => id !== chatId);
      if (action === 'delete_chat' && !next.deletedIds.includes(chatId)) {
        next.deletedIds.push(chatId);
        next.pinnedIds = next.pinnedIds.filter((id) => id !== chatId);
        next.archivedIds = next.archivedIds.filter((id) => id !== chatId);
      }
      if (action === 'delete_contact' && targetId && !next.deletedContactIds.includes(targetId)) {
        next.deletedContactIds.push(targetId);
        if (chatId && !next.deletedIds.includes(chatId)) next.deletedIds.push(chatId);
      }
      localStorage.setItem(`ze_chat_prefs_${cleanUid}`, JSON.stringify(next));
      return next;
    });

    try {
      const res = await fetch('/api/chats/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: cleanUid, action, chatId, targetId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.preferences) {
          const next = { ...EMPTY_PREFS, ...data.preferences };
          setPrefs(next);
          localStorage.setItem(`ze_chat_prefs_${cleanUid}`, JSON.stringify(next));
        }
      }
    } catch {}
  };

  useEffect(() => {
    let isMounted = true;
    const fetchOnline = async () => {
      try {
        const res = await fetch('/api/presence/online');
        if (res.ok) {
          const data = await res.json();
          if (isMounted && Array.isArray(data.onlineUsers)) {
            setOnlineUsersList(data.onlineUsers.map((u: string) => String(u).toUpperCase()));
          }
        }
      } catch {}
    };

    fetchOnline();
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchOnline();
    }, 12000);

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, []);

  const isUserOnline = (user: any) => {
    if (!user) return false;
    const uId = String(user.id || '').toUpperCase();
    const uName = String(user.username || '').toUpperCase().replace(/^@/, '');
    return onlineUsersList.includes(uId) || onlineUsersList.includes(uName);
  };

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setOnlineSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.users)) {
            const cleanMatches = data.users.filter(
              (u: any) =>
                String(u.id).toUpperCase() !== cleanUid &&
                !isTestUser(u) &&
                !prefs.deletedContactIds.includes(String(u.id))
            );
            setOnlineSearchResults(cleanMatches);
          }
        }
      } catch {}
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery, cleanUid, prefs.deletedContactIds]);

  const myNote = notesMap[currentUser?.id];

  const cleanFriends = useMemo(() => {
    return friends.filter(
      (f) => !isTestUser(f) && !prefs.deletedContactIds.includes(String(f.id))
    );
  }, [friends, prefs.deletedContactIds]);

  // Map conversations with Pin, Archive, Delete filters
  const { activeConversations, archivedConversations } = useMemo(() => {
    const active: Array<{
      chatId: string;
      chat: any;
      partner: any;
      lastMsg: string;
      lastTime: number;
      isUnread: boolean;
      isOnline: boolean;
      isPinned: boolean;
    }> = [];
    const archived: typeof active = [];

    const processedChatIds = new Set<string>();

    for (const c of chats) {
      const cId = c.id || c.chatId;
      if (!cId || processedChatIds.has(cId)) continue;
      if (prefs.deletedIds.includes(cId)) continue;
      processedChatIds.add(cId);

      const parts: string[] =
        Array.isArray(c.participants) && c.participants.length > 0
          ? c.participants
          : cId.includes('_')
          ? cId.split('_')
          : [];

      const partnerId = parts.find((p) => String(p).toUpperCase() !== cleanUid);
      if (!partnerId) continue;

      const partnerClean = String(partnerId).toUpperCase();
      if (partnerClean === 'TEST' || partnerClean === 'ZE-TEST') continue;
      if (prefs.deletedContactIds.some((id) => String(id).toUpperCase() === partnerClean)) continue;

      const partner = allUsers.find(
        (u) =>
          String(u.id).toUpperCase() === partnerClean ||
          String(u.phone || '').toUpperCase() === partnerClean ||
          String(u.username || '').toUpperCase().replace(/^@/, '') === partnerClean.replace(/^@/, '')
      ) || {
        id: partnerId,
        name: partnerId.startsWith('ZE-') ? `User ${partnerId}` : partnerId,
        username: partnerId.toLowerCase().replace(/[^a-z0-9_]/g, ''),
        photo: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(partnerId)}`,
      };

      if (isTestUser(partner)) continue;

      const isUnread = Boolean(
        c.lastSenderId && String(c.lastSenderId).toUpperCase() !== cleanUid
      );
      const isPinned = prefs.pinnedIds.includes(cId);
      const isArchived = prefs.archivedIds.includes(cId);

      const item = {
        chatId: cId,
        chat: c,
        partner,
        lastMsg: c.lastMessage || 'Mulai percakapan',
        lastTime: c.lastTime || c.updatedAt || Date.now(),
        isUnread,
        isOnline: isUserOnline(partner),
        isPinned,
      };

      if (isArchived) archived.push(item);
      else active.push(item);
    }

    active.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return b.lastTime - a.lastTime;
    });
    archived.sort((a, b) => b.lastTime - a.lastTime);

    return { activeConversations: active, archivedConversations: archived };
  }, [chats, allUsers, cleanUid, onlineUsersList, prefs]);

  const filteredFriends = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return cleanFriends.filter((f) => {
      if (!q) return true;
      return (
        f.name?.toLowerCase().includes(q) ||
        f.username?.toLowerCase().includes(q) ||
        f.id?.toLowerCase().includes(q)
      );
    });
  }, [cleanFriends, searchQuery]);

  const registeredUsersDirectory = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return allUsers
      .filter(
        (u) =>
          String(u.id).toUpperCase() !== cleanUid &&
          !isTestUser(u) &&
          !prefs.deletedContactIds.includes(String(u.id))
      )
      .filter((u) => {
        if (!q) return true;
        return (
          u.name?.toLowerCase().includes(q) ||
          u.username?.toLowerCase().includes(q) ||
          u.id?.toLowerCase().includes(q)
        );
      });
  }, [allUsers, cleanUid, searchQuery, prefs.deletedContactIds]);

  const nonFriendOnlineUsers = useMemo(() => {
    return onlineSearchResults.filter(
      (u) => !cleanFriends.some((f) => String(f.id).toUpperCase() === String(u.id).toUpperCase())
    );
  }, [onlineSearchResults, cleanFriends]);

  const formatChatTime = (timestamp: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const openChatActionMenu = (partner: any, chatId?: string) => {
    const resolvedChatId = chatId || [cleanUid, String(partner.id).toUpperCase()].sort().join('_');
    const isFriend = cleanFriends.some(
      (f) => String(f.id).toUpperCase() === String(partner.id).toUpperCase()
    );
    setActionTarget({
      chatId: resolvedChatId,
      partnerId: partner.id,
      partnerName: partner.name || partner.id,
      isFriend,
    });
  };

  const startLongPress = (partner: any, chatId?: string) => {
    longPressedRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = window.setTimeout(() => {
      longPressedRef.current = true;
      openChatActionMenu(partner, chatId);
    }, 450);
  };

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const renderChatRow = (item: (typeof activeConversations)[number]) => {
    const { chatId, partner, lastMsg, lastTime, isUnread, isOnline, isPinned } = item;
    return (
      <div
        key={chatId}
        onPointerDown={() => startLongPress(partner, chatId)}
        onPointerUp={clearLongPress}
        onPointerCancel={clearLongPress}
        onPointerLeave={clearLongPress}
        onContextMenu={(e) => {
          e.preventDefault();
          openChatActionMenu(partner, chatId);
        }}
        onClick={() => {
          if (longPressedRef.current) {
            longPressedRef.current = false;
            return;
          }
          onOpenPrivateChat(partner);
        }}
        className={`px-4 py-3 flex items-center gap-3.5 hover:bg-white/[0.05] transition active:bg-white/[0.08] cursor-pointer ${
          isUnread ? 'bg-white/[0.04]' : ''
        }`}
      >
        <div
          className="relative flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onViewProfile(partner);
          }}
        >
          <div className="w-12 h-12 rounded-full overflow-hidden bg-white/10 border border-white/15 flex items-center justify-center">
            {partner.photo || partner.avatar ? (
              <img src={partner.photo || partner.avatar} alt={partner.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-white font-bold text-base">{(partner.name || 'U').charAt(0)}</span>
            )}
          </div>
          {isOnline ? (
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-sky-400 rounded-full border-2 border-black" />
          ) : (
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-white/30 rounded-full border border-black" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5 gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {isPinned && <Pin size={12} className="text-sky-400 shrink-0" />}
              <p className={`text-sm truncate ${isUnread ? 'text-white font-bold' : 'text-white font-semibold'}`}>
                {partner.name}
              </p>
              <UserRoleBadge user={partner} size="sm" />
            </div>
            <span className="text-[10px] text-white/40 shrink-0 font-mono">
              {formatChatTime(lastTime)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 mt-0.5">
            <p className={`text-xs truncate ${isUnread ? 'text-white font-medium' : 'text-white/50'}`}>
              {renderMessageContent(lastMsg)}
            </p>
            <div className="flex items-center gap-1.5 shrink-0">
              {isUnread && <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openChatActionMenu(partner, chatId);
                }}
                className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/45 hover:text-white cursor-pointer"
                title="Kelola Chat"
              >
                <MoreVertical size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-transparent pb-[130px] select-none">
      {/* Top Header */}
      <div className="sticky top-0 z-40 bg-white/[0.06] backdrop-blur-[36px] backdrop-saturate-[180%] border-b border-white/[0.12] px-4 pt-3 pb-2.5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <h2 className="text-base sm:text-lg font-bold text-white tracking-wide whitespace-nowrap overflow-hidden text-ellipsis">
              Chats
            </h2>
            <span className="text-[10px] font-mono bg-white/10 px-2 py-0.5 rounded-full text-white/80 font-bold border border-white/10 shrink-0 whitespace-nowrap">
              {currentUser?.id}
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={onNavigateRequests}
              className="relative p-2 rounded-full bg-white/10 hover:bg-white/15 text-white/80 hover:text-white transition cursor-pointer shrink-0"
              title="Permintaan Pertemanan"
            >
              <Bell size={17} strokeWidth={1.5} />
              {friendRequestsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center">
                  {friendRequestsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={onOpenAddFriendById}
              className="bg-white text-black px-3 py-1.5 rounded-full text-xs font-bold hover:bg-white/90 active:scale-95 transition flex items-center gap-1.5 cursor-pointer shadow shrink-0 whitespace-nowrap"
            >
              <UserPlus size={14} className="shrink-0" />
              <span>+ Tambah Teman</span>
            </button>
          </div>
        </div>

        <div className="bg-white/[0.06] backdrop-blur-2xl p-1 rounded-full flex gap-1 border border-white/[0.12]">
          <button
            type="button"
            onClick={() => setActiveTab('chats')}
            className={`flex-1 py-1.5 rounded-full text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
              activeTab === 'chats' ? 'bg-white text-black shadow' : 'text-white/60 hover:text-white'
            }`}
          >
            <MessageCircle size={13} strokeWidth={1.8} />
            <span>Chat</span>
            {activeConversations.length > 0 && (
              <span className={`text-[10px] px-1.5 rounded-full font-mono ${activeTab === 'chats' ? 'bg-black/10 text-black' : 'bg-white/10 text-white/70'}`}>
                {activeConversations.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('directory')}
            className={`flex-1 py-1.5 rounded-full text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
              activeTab === 'directory' ? 'bg-white text-black shadow' : 'text-white/60 hover:text-white'
            }`}
          >
            <Users size={13} strokeWidth={1.8} />
            <span>Pengguna</span>
            <span className={`text-[10px] px-1.5 rounded-full font-mono ${activeTab === 'directory' ? 'bg-black/10 text-black' : 'bg-white/10 text-white/70'}`}>
              {registeredUsersDirectory.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onOpenGlobalChat()}
            className="flex-1 py-1.5 rounded-full text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer text-white/60 hover:text-white active:scale-95"
          >
            <Globe size={13} strokeWidth={1.8} />
            <span>Global</span>
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
          </button>
        </div>
      </div>

      <div>
        {friendRequestsCount > 0 && (
          <div
            onClick={onNavigateRequests}
            className="mx-4 mt-3 p-3 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-between cursor-pointer hover:bg-white/15 transition"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center">
                <UserPlus size={14} />
              </div>
              <div>
                <p className="text-xs font-bold text-white">
                  {friendRequestsCount} Permintaan Pertemanan Baru
                </p>
                <p className="text-[10px] text-white/50">Klik untuk melihat dan menerima</p>
              </div>
            </div>
            <ChevronRight size={16} className="text-white/50" />
          </div>
        )}

        <div className="px-4 mt-3 mb-2">
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-2.5 text-white/40" />
            <input
              type="text"
              placeholder={
                activeTab === 'directory'
                  ? 'Cari di direktori pengguna VNJAVA...'
                  : 'Cari pesan, teman, atau ketik ID...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#181818] border border-white/[0.08] rounded-full pl-9 pr-4 py-2 text-xs text-white placeholder-white/30 outline-none focus:border-white/20 transition-all"
            />
          </div>
        </div>

        {activeTab === 'chats' && (
          <div>
            {/* Notes Row */}
            <div className="px-4 py-2 border-b border-white/[0.05]">
              <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
                <div className="flex flex-col items-center flex-shrink-0 cursor-pointer relative">
                  <div onClick={myNote ? () => onViewNote(myNote) : onCreateNote} className="relative">
                    <div className="w-12 h-12 rounded-full overflow-hidden border border-white/20 bg-white/10 flex items-center justify-center">
                      {currentUser?.photo ? (
                        <img src={currentUser.photo} alt={currentUser.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-white font-bold text-sm">{(currentUser?.name || 'V').charAt(0)}</span>
                      )}
                    </div>
                    {myNote ? (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white text-black rounded-full px-2 py-0.5 text-[9px] font-bold shadow-md truncate max-w-[80px]">
                        {myNote.text}
                      </div>
                    ) : (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          onCreateNote();
                        }}
                        className="absolute bottom-0 right-0 w-4 h-4 bg-white text-black rounded-full flex items-center justify-center font-bold text-[10px] shadow"
                      >
                        +
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-white/60 mt-1">Catatan Anda</span>
                </div>

                {cleanFriends.map((f) => {
                  const fNote = notesMap[f.id];
                  const online = isUserOnline(f);
                  return (
                    <div
                      key={f.id}
                      className="flex flex-col items-center flex-shrink-0 cursor-pointer relative"
                      onClick={fNote ? () => onViewNote(fNote) : () => onOpenPrivateChat(f)}
                    >
                      <div className="relative">
                        <div className={`w-12 h-12 rounded-full p-[2px] ${fNote ? 'border border-sky-400' : 'border border-white/20'}`}>
                          <div className="w-full h-full rounded-full overflow-hidden bg-white/10 flex items-center justify-center">
                            {f.photo ? (
                              <img src={f.photo} alt={f.name} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-white font-bold text-sm">{(f.name || 'U').charAt(0)}</span>
                            )}
                          </div>
                        </div>
                        {fNote && (
                          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white text-black rounded-full px-2 py-0.5 text-[9px] font-bold shadow-md truncate max-w-[80px]">
                            {fNote.text}
                          </div>
                        )}
                        {online && (
                          <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-sky-400 rounded-full border border-black" />
                        )}
                      </div>
                      <span className="text-[10px] text-white/70 mt-1 max-w-[55px] truncate text-center">
                        {f.name.split(' ')[0]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Active Conversations */}
            <div className="divide-y divide-white/[0.04]">
              {activeConversations.length > 0 && !searchQuery.trim() && (
                <div>
                  <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-white/40 font-bold bg-white/[0.02] flex items-center justify-between">
                    <span>Percakapan ({activeConversations.length})</span>
                    <span className="text-white/45 text-[9px]">Tahan chat untuk Pin / Arsip / Hapus</span>
                  </div>
                  {activeConversations.map(renderChatRow)}
                </div>
              )}

              {/* Archived Chats Collapsible Drawer */}
              {archivedConversations.length > 0 && !searchQuery.trim() && (
                <div className="border-t border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => setShowArchivedSection((prev) => !prev)}
                    className="w-full px-4 py-3 flex items-center justify-between text-xs font-bold text-white/80 hover:bg-white/[0.04] cursor-pointer transition"
                  >
                    <div className="flex items-center gap-2.5">
                      <Archive size={15} className="text-sky-400" />
                      <span>Chat Diarsipkan</span>
                      <span className="text-[10px] font-mono bg-white/10 px-2 py-0.5 rounded-full text-white/75">
                        {archivedConversations.length}
                      </span>
                    </div>
                    {showArchivedSection ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </button>
                  {showArchivedSection && (
                    <div className="bg-white/[0.02] divide-y divide-white/[0.04]">
                      {archivedConversations.map(renderChatRow)}
                    </div>
                  )}
                </div>
              )}

              {/* Friends List */}
              {filteredFriends.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-white/40 font-bold bg-white/[0.02] flex items-center justify-between">
                    <span>Teman Terhubung ({filteredFriends.length})</span>
                  </div>

                  {filteredFriends.map((friend) => {
                    const online = isUserOnline(friend);
                    return (
                      <div
                        key={friend.id}
                        onPointerDown={() => startLongPress(friend)}
                        onPointerUp={clearLongPress}
                        onPointerCancel={clearLongPress}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          openChatActionMenu(friend);
                        }}
                        className="px-4 py-3 flex items-center gap-3.5 hover:bg-white/[0.04] transition active:bg-white/[0.08] cursor-pointer"
                        onClick={() => {
                          if (longPressedRef.current) {
                            longPressedRef.current = false;
                            return;
                          }
                          onOpenPrivateChat(friend);
                        }}
                      >
                        <div
                          className="relative flex-shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewProfile(friend);
                          }}
                        >
                          <div className="w-12 h-12 rounded-full overflow-hidden bg-white/10 border border-white/15 flex items-center justify-center">
                            {friend.photo ? (
                              <img src={friend.photo} alt={friend.name} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-white font-bold text-base">{friend.name.charAt(0)}</span>
                            )}
                          </div>
                          {online && (
                            <div className="absolute bottom-0 right-0 w-3 h-3 bg-sky-400 rounded-full border-2 border-black" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <p className="text-white font-semibold text-sm truncate">{friend.name}</p>
                              <UserRoleBadge user={friend} size="sm" />
                            </div>
                            <span className={`text-[10px] font-mono ${online ? 'text-sky-400' : 'text-white/40'}`}>
                              {online ? 'Online' : 'Aktif'}
                            </span>
                          </div>
                          <p className="text-white/50 text-xs truncate leading-relaxed font-mono">
                            @{friend.username} • {friend.id}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {activeConversations.length === 0 &&
                archivedConversations.length === 0 &&
                cleanFriends.length === 0 &&
                !searchQuery.trim() && (
                  <div className="p-8 text-center my-8 flex flex-col items-center max-w-sm mx-auto">
                    <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 mb-4 shadow-xl">
                      <MessageCircle size={36} strokeWidth={1.5} />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-1">Mulai Chat di VNJAVA</h3>
                    <p className="text-xs text-white/50 max-w-xs mb-6 leading-relaxed">
                      Kirim pesan langsung ke pengguna lain atau buka direktori pengguna untuk mulai mengobrol.
                    </p>
                    <div className="flex flex-col gap-2.5 w-full">
                      <button
                        type="button"
                        onClick={() => setActiveTab('directory')}
                        className="w-full py-3 rounded-full bg-white text-black font-bold text-xs hover:bg-white/90 active:scale-95 transition shadow-xl flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Users size={16} />
                        <span>Buka Direktori Pengguna ({registeredUsersDirectory.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={onOpenAddFriendById}
                        className="w-full py-2.5 rounded-full bg-white/10 text-white font-semibold text-xs hover:bg-white/15 active:scale-95 transition border border-white/15 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <UserPlus size={15} />
                        <span>+ Tambah Teman Pakai ID</span>
                      </button>
                    </div>
                  </div>
                )}

              {searchQuery.trim() && nonFriendOnlineUsers.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-sky-400 font-bold bg-sky-500/5 border-t border-b border-white/[0.04] flex items-center justify-between">
                    <span>Ditemukan ({nonFriendOnlineUsers.length})</span>
                  </div>
                  {nonFriendOnlineUsers.map((targetUser) => (
                    <div
                      key={targetUser.id}
                      className="px-4 py-3 flex items-center gap-3.5 hover:bg-white/[0.05] transition bg-white/[0.01]"
                    >
                      <div
                        className="relative flex-shrink-0 cursor-pointer"
                        onClick={() => onViewProfile(targetUser)}
                      >
                        <div className="w-12 h-12 rounded-full overflow-hidden bg-white/10 border border-white/20 flex items-center justify-center">
                          {targetUser.photo || targetUser.avatar ? (
                            <img
                              src={targetUser.photo || targetUser.avatar}
                              alt={targetUser.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-white font-bold text-base">
                              {(targetUser.name || targetUser.username || 'V').charAt(0)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-white font-bold text-sm truncate">{targetUser.name}</p>
                          <UserRoleBadge user={targetUser} size="sm" />
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-white/50 truncate font-mono">
                            @{targetUser.username || targetUser.id}
                          </span>
                          <span className="text-[10px] text-white/70 font-mono bg-white/10 px-1.5 rounded border border-white/10">
                            {targetUser.id}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onOpenPrivateChat(targetUser)}
                        className="px-3.5 py-1.5 rounded-full bg-white text-black font-bold text-xs hover:bg-white/90 active:scale-95 transition cursor-pointer flex items-center gap-1.5 shrink-0 shadow-md"
                      >
                        <MessageCircle size={13} />
                        <span>Chat</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'directory' && (
          <div className="divide-y divide-white/[0.04]">
            <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-white/40 font-bold bg-white/[0.02] flex items-center justify-between">
              <span>Direktori Pengguna VNJAVA ({registeredUsersDirectory.length})</span>
              <span className="text-white/40 text-[9px] font-mono">Ketuk untuk mulai chat</span>
            </div>

            {registeredUsersDirectory.length === 0 ? (
              <div className="p-8 text-center text-white/40 text-xs">
                {searchQuery ? 'Tidak ada pengguna yang cocok dengan pencarian.' : 'Belum ada pengguna lain yang terdaftar.'}
              </div>
            ) : (
              registeredUsersDirectory.map((user) => {
                const online = isUserOnline(user);
                return (
                  <div
                    key={user.id}
                    className="px-4 py-3 flex items-center gap-3.5 hover:bg-white/[0.04] transition active:bg-white/[0.07] cursor-pointer"
                    onClick={() => onOpenPrivateChat(user)}
                  >
                    <div
                      className="relative flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewProfile(user);
                      }}
                    >
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-white/10 border border-white/15 flex items-center justify-center">
                        {user.photo || user.avatar ? (
                          <img src={user.photo || user.avatar} alt={user.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-white font-bold text-base">{(user.name || 'U').charAt(0)}</span>
                        )}
                      </div>
                      {online && (
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-sky-400 rounded-full border-2 border-black" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-white font-bold text-sm truncate">{user.name}</p>
                        <UserRoleBadge user={user} size="sm" />
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-white/50 truncate font-mono">
                          @{user.username || user.id}
                        </span>
                        <span className="text-[10px] text-white/60 font-mono bg-white/5 px-1.5 rounded border border-white/10">
                          {user.id}
                        </span>
                      </div>
                      {user.bio && (
                        <p className="text-[11px] text-white/40 truncate mt-0.5">{user.bio}</p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenPrivateChat(user);
                      }}
                      className="px-3.5 py-1.5 rounded-full bg-white text-black font-bold text-xs hover:bg-white/90 active:scale-95 transition cursor-pointer flex items-center gap-1.5 shrink-0 shadow"
                    >
                      <MessageCircle size={13} />
                      <span>Chat</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {actionTarget && (
        <ChatActionMenuModal
          chatTitle={actionTarget.partnerName}
          isPinned={prefs.pinnedIds.includes(actionTarget.chatId)}
          isArchived={prefs.archivedIds.includes(actionTarget.chatId)}
          hasContact={actionTarget.isFriend}
          onClose={() => setActionTarget(null)}
          onPinToggle={() =>
            applyChatPrefAction(
              prefs.pinnedIds.includes(actionTarget.chatId) ? 'unpin' : 'pin',
              actionTarget.chatId,
              actionTarget.partnerId
            )
          }
          onArchiveToggle={() =>
            applyChatPrefAction(
              prefs.archivedIds.includes(actionTarget.chatId) ? 'unarchive' : 'archive',
              actionTarget.chatId,
              actionTarget.partnerId
            )
          }
          onDeleteChat={() =>
            applyChatPrefAction('delete_chat', actionTarget.chatId, actionTarget.partnerId)
          }
          onDeleteContact={() =>
            applyChatPrefAction('delete_contact', actionTarget.chatId, actionTarget.partnerId)
          }
        />
      )}
    </div>
  );
}

export default ChatsManagerView;
