import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Trash2, X, Eye, Heart, ChevronLeft, ChevronRight } from 'lucide-react';

export interface StoryViewerEntry {
  viewerId: string;
  viewerName: string;
  viewerPhoto?: string;
  viewedAt: number;
}

export interface StoryItem {
  id: string;
  type: 'image' | 'video' | 'text';
  url: string;
  quality?: string;
  caption?: string;
  bgStyle?: string;
  textColor?: string;
  timestamp: number;
  viewers?: StoryViewerEntry[];
  likes?: string[];
  likesCount?: number;
}

export interface GroupedUserStory {
  id: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  createdAt: number;
  items: StoryItem[];
}

export function StoryViewerModal({
  story,
  currentUser,
  onClose,
  onDeleteItem,
  onNextStory,
  onPrevStory,
  onStoryUpdated,
}: {
  story: GroupedUserStory;
  currentUser?: { id: string; name: string; photo?: string } | null;
  onClose: () => void;
  onDeleteItem: (userId: string, itemId: string) => Promise<void> | void;
  onNextStory?: () => void;
  onPrevStory?: () => void;
  onStoryUpdated?: (updatedStory: GroupedUserStory) => void;
}) {
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [itemProgress, setItemProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showViewersSheet, setShowViewersSheet] = useState(false);

  // Local item state mirrored so likes/views update immediately without closing viewer
  const [localItems, setLocalItems] = useState<StoryItem[]>(() => story.items || []);
  const pressStartRef = useRef<number>(0);
  const holdTimerRef = useRef<number | null>(null);
  const recordedViewsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setLocalItems(story.items || []);
    setActiveItemIndex(0);
    setItemProgress(0);
    setIsPaused(false);
    setShowViewersSheet(false);
  }, [story.id, story.userId]);

  const items = localItems;
  const currentItem = items[activeItemIndex] || items[0];
  const isMyStory = Boolean(
    currentUser && String(story.userId).toUpperCase() === String(currentUser.id).toUpperCase()
  );

  // Record story view on server when viewing another user's story item
  useEffect(() => {
    if (!currentItem || !currentUser?.id || isMyStory) return;
    const viewKey = `${story.userId}_${currentItem.id}_${currentUser.id}`;
    if (recordedViewsRef.current.has(viewKey)) return;
    recordedViewsRef.current.add(viewKey);

    fetch('/api/stories/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storyId: story.id,
        storyOwnerId: story.userId,
        itemId: currentItem.id,
        viewerId: currentUser.id,
        viewerName: currentUser.name,
        viewerPhoto: currentUser.photo,
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.story?.items) {
          setLocalItems(data.story.items);
          onStoryUpdated?.(data.story);
        }
      })
      .catch(() => {});
  }, [currentItem?.id, story.id, story.userId, currentUser?.id, isMyStory]);

  const handleNextItem = () => {
    if (activeItemIndex < items.length - 1) {
      setActiveItemIndex((prev) => prev + 1);
      setItemProgress(0);
      setIsPaused(false);
    } else if (onNextStory) {
      onNextStory();
    } else {
      onClose();
    }
  };

  const handlePrevItem = () => {
    if (activeItemIndex > 0) {
      setActiveItemIndex((prev) => prev - 1);
      setItemProgress(0);
      setIsPaused(false);
    } else if (onPrevStory) {
      onPrevStory();
    }
  };

  // Smooth auto-progress
  useEffect(() => {
    if (isPaused || showDeleteConfirm || showViewersSheet || !currentItem) return;

    const duration = currentItem.type === 'video' ? 12000 : 5000;
    const startOffset = (itemProgress / 100) * duration;
    const startTime = performance.now() - startOffset;
    let rafId = 0;

    const tick = (now: DOMHighResTimeStamp) => {
      const pct = Math.min(100, ((now - startTime) / duration) * 100);
      setItemProgress(pct);
      if (pct >= 100) {
        handleNextItem();
        return;
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [activeItemIndex, isPaused, showDeleteConfirm, showViewersSheet, currentItem?.id]);

  const handleToggleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentItem || !currentUser?.id) return;

    // Optimistic update
    const myIdUpper = String(currentUser.id).toUpperCase();
    setLocalItems((prev) =>
      prev.map((it) => {
        if (it.id !== currentItem.id) return it;
        const existing = Array.isArray(it.likes) ? it.likes : [];
        const hasLiked = existing.some((id) => String(id).toUpperCase() === myIdUpper);
        const nextLikes = hasLiked
          ? existing.filter((id) => String(id).toUpperCase() !== myIdUpper)
          : [...existing, currentUser.id];
        return {
          ...it,
          likes: nextLikes,
          likesCount: nextLikes.length,
        };
      })
    );

    try {
      const res = await fetch('/api/stories/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId: story.id,
          storyOwnerId: story.userId,
          itemId: currentItem.id,
          userId: currentUser.id,
          userName: currentUser.name,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.story?.items) {
          setLocalItems(data.story.items);
          onStoryUpdated?.(data.story);
        }
      }
    } catch {}
  };

  const confirmDelete = async () => {
    if (!currentItem) return;
    await onDeleteItem(story.userId, currentItem.id);
    setShowDeleteConfirm(false);
    if (items.length <= 1) {
      onClose();
    } else {
      const next = items.filter((it) => it.id !== currentItem.id);
      setLocalItems(next);
      if (activeItemIndex >= next.length) {
        setActiveItemIndex(Math.max(0, next.length - 1));
      }
      setItemProgress(0);
      setIsPaused(false);
    }
  };

  useEffect(() => {
    document.querySelector('.bottom-nav')?.classList.add('hidden');
    return () => {
      document.querySelector('.bottom-nav')?.classList.remove('hidden');
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, []);

  if (!currentItem) return null;

  const myIdUpper = String(currentUser?.id || '').toUpperCase();
  const likesArr = Array.isArray(currentItem.likes) ? currentItem.likes : [];
  const isLiked = myIdUpper ? likesArr.some((id) => String(id).toUpperCase() === myIdUpper) : false;
  const likesCount = typeof currentItem.likesCount === 'number' ? currentItem.likesCount : likesArr.length;
  const viewersList = Array.isArray(currentItem.viewers) ? currentItem.viewers : [];

  const handlePointerDown = () => {
    pressStartRef.current = Date.now();
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = window.setTimeout(() => {
      setIsPaused(true);
    }, 220);
  };

  const handlePointerUpZone = (zone: 'prev' | 'next') => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    const duration = Date.now() - pressStartRef.current;
    if (duration < 220) {
      // Single quick tap skips cleanly
      if (zone === 'prev') handlePrevItem();
      else handleNextItem();
    } else {
      // Release after hold resumes playback
      setIsPaused(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10005] ze-opaque-viewer bg-black flex flex-col justify-between items-center select-none overflow-hidden">
      {/* Top Controls & Segmented Progress Bar */}
      <div className="w-full max-w-md pt-3 px-4 z-20 bg-black/80 pb-2">
        <div className="flex gap-1.5 w-full mb-3">
          {items.map((it, idx) => {
            let widthPercent = 0;
            if (idx < activeItemIndex) widthPercent = 100;
            else if (idx === activeItemIndex) widthPercent = itemProgress;
            return (
              <div key={it.id || idx} className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white transition-all duration-75 ease-linear rounded-full"
                  style={{ width: `${widthPercent}%` }}
                />
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full overflow-hidden border border-white/25 bg-zinc-900 flex items-center justify-center shrink-0">
              {story.userPhoto ? (
                <img src={story.userPhoto} alt={story.userName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-white font-bold text-sm">{story.userName.charAt(0)}</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-white leading-none truncate">
                  {story.userName} {isMyStory ? '(Anda)' : ''}
                </p>
                {currentItem.quality && (
                  <span className="bg-white/20 text-white font-mono text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0">
                    {currentItem.quality}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-white/60 mt-1 font-mono">
                {activeItemIndex + 1} / {items.length}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsPaused((p) => !p)}
              className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition active:scale-95 cursor-pointer"
              title={isPaused ? 'Lanjutkan' : 'Jeda'}
            >
              {isPaused ? <Play size={14} className="ml-0.5" /> : <Pause size={14} />}
            </button>

            {isMyStory && (
              <button
                type="button"
                onClick={() => {
                  setIsPaused(true);
                  setShowDeleteConfirm(true);
                }}
                className="w-9 h-9 rounded-full bg-red-500/25 hover:bg-red-500/40 text-red-300 border border-red-500/35 flex items-center justify-center transition active:scale-95 cursor-pointer"
                title="Hapus story ini"
              >
                <Trash2 size={14} />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition active:scale-95 cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Story Canvas (100% Opaque Solid Black Behind Content) */}
      <div className="w-full max-w-md flex-1 relative flex items-center justify-center overflow-hidden bg-black">
        {currentItem.type === 'text' ? (
          <div
            className="w-full h-full flex items-center justify-center p-8 text-center"
            style={{
              background: currentItem.bgStyle || 'linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)',
              color: currentItem.textColor || '#ffffff',
            }}
          >
            <p className="text-xl sm:text-2xl font-bold leading-relaxed break-words whitespace-pre-wrap">
              {currentItem.caption || currentItem.url}
            </p>
          </div>
        ) : currentItem.type === 'video' ? (
          <video
            key={currentItem.id}
            src={currentItem.url}
            autoPlay
            playsInline
            muted={false}
            loop={false}
            onEnded={handleNextItem}
            className="w-full h-full object-contain pointer-events-none bg-black"
          />
        ) : (
          <img
            key={currentItem.id}
            src={currentItem.url}
            alt="Story"
            className="w-full h-full object-contain pointer-events-none bg-black"
          />
        )}

        {/* Left 30% tap -> Previous */}
        <div
          onPointerDown={handlePointerDown}
          onPointerUp={() => handlePointerUpZone('prev')}
          className="absolute inset-y-0 left-0 w-[30%] cursor-pointer z-10 flex items-center justify-start pl-2"
        >
          <span className="opacity-0 hover:opacity-60 transition bg-black/50 p-1 rounded-full">
            <ChevronLeft size={16} className="text-white" />
          </span>
        </div>

        {/* Center + Right 70% tap -> 1x Tap Skip Next Story */}
        <div
          onPointerDown={handlePointerDown}
          onPointerUp={() => handlePointerUpZone('next')}
          className="absolute inset-y-0 right-0 w-[70%] cursor-pointer z-10 flex items-center justify-end pr-2"
        >
          <span className="opacity-0 hover:opacity-60 transition bg-black/50 p-1 rounded-full">
            <ChevronRight size={16} className="text-white" />
          </span>
        </div>

        {isPaused && !showDeleteConfirm && !showViewersSheet && (
          <div className="absolute top-3 bg-zinc-900 border border-white/15 px-3 py-1 rounded-full text-[11px] text-white font-semibold pointer-events-none z-20">
            Dijeda
          </div>
        )}
      </div>

      {/* Bottom Footer: Caption + Viewers (for Owner) + Like / Reaction */}
      <div className="w-full max-w-md bg-black px-4 py-3 border-t border-white/10 z-20 space-y-2.5">
        {currentItem.caption && currentItem.type !== 'text' && (
          <p className="text-white text-sm font-medium text-center leading-snug">{currentItem.caption}</p>
        )}

        <div className="flex items-center justify-between gap-3">
          {isMyStory ? (
            <button
              type="button"
              onClick={() => {
                setIsPaused(true);
                setShowViewersSheet(true);
              }}
              className="min-h-[44px] px-3.5 py-2 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-white/15 flex items-center gap-2 text-xs font-bold text-white cursor-pointer transition"
            >
              <Eye size={15} className="text-sky-400" />
              <span>Dilihat oleh {viewersList.length}</span>
            </button>
          ) : (
            <div className="text-[11px] text-white/55 font-medium">
              Tap layar untuk story berikutnya
            </div>
          )}

          <button
            type="button"
            onClick={handleToggleLike}
            className={`min-h-[44px] px-4 py-2 rounded-full border flex items-center gap-2 text-xs font-bold transition active:scale-95 cursor-pointer ${
              isLiked
                ? 'bg-rose-600 text-white border-rose-500 shadow-lg'
                : 'bg-zinc-900 hover:bg-zinc-800 text-white border-white/15'
            }`}
          >
            <Heart size={16} className={isLiked ? 'fill-white text-white' : 'text-white'} />
            <span>{likesCount > 0 ? `${likesCount} Suka` : 'Suka'}</span>
          </button>
        </div>
      </div>

      {/* Viewers Sheet for Story Owner */}
      {showViewersSheet && isMyStory && (
        <div
          className="fixed inset-0 z-[125] bg-black/85 flex items-end justify-center"
          onClick={() => {
            setShowViewersSheet(false);
            setIsPaused(false);
          }}
        >
          <div
            className="w-full max-w-md bg-[#121318] border-t border-white/15 rounded-t-[28px] p-5 max-h-[65vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Eye size={16} className="text-sky-400" />
                <h4 className="text-sm font-bold text-white">
                  Dilihat oleh {viewersList.length} orang
                </h4>
                {likesCount > 0 && (
                  <span className="text-xs text-rose-400 font-bold ml-1">
                    • {likesCount} Suka
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowViewersSheet(false);
                  setIsPaused(false);
                }}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto py-3 space-y-2.5">
              {viewersList.length === 0 ? (
                <p className="text-xs text-white/50 text-center py-6">
                  Belum ada yang melihat story ini.
                </p>
              ) : (
                viewersList.map((v) => {
                  const viewerLiked = likesArr.some(
                    (id) => String(id).toUpperCase() === String(v.viewerId).toUpperCase()
                  );
                  return (
                    <div
                      key={v.viewerId}
                      className="flex items-center justify-between p-2.5 rounded-2xl bg-white/5 border border-white/10"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-800 border border-white/15 flex items-center justify-center shrink-0">
                          {v.viewerPhoto ? (
                            <img src={v.viewerPhoto} alt={v.viewerName} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xs font-bold text-white">
                              {(v.viewerName || 'U').charAt(0)}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">{v.viewerName}</p>
                          <p className="text-[10px] text-white/45 font-mono">
                            {new Date(v.viewedAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                      {viewerLiked && (
                        <Heart size={15} className="fill-rose-500 text-rose-500 shrink-0 mr-1" />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[130] bg-black/90 flex items-center justify-center p-4">
          <div className="bg-[#181818] border border-white/15 rounded-[28px] p-6 w-full max-w-xs text-center shadow-2xl">
            <Trash2 size={28} className="mx-auto text-red-400 mb-3" />
            <h4 className="text-base font-bold text-white mb-1">Hapus story ini?</h4>
            <p className="text-xs text-white/60 mb-5">
              Story ini tersimpan permanen sampai Anda menghapusnya secara manual. Yakin ingin menghapus?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setIsPaused(false);
                }}
                className="flex-1 py-2.5 rounded-full bg-white/10 text-white text-xs font-semibold hover:bg-white/20 active:scale-95 transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="flex-1 py-2.5 rounded-full bg-red-600 text-white text-xs font-bold hover:bg-red-500 active:scale-95 transition cursor-pointer shadow-lg"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
