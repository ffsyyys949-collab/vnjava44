import React from 'react';
import { Pin, Archive, Trash2, UserMinus, X } from 'lucide-react';

interface ChatActionMenuModalProps {
  chatTitle: string;
  isPinned: boolean;
  isArchived: boolean;
  hasContact?: boolean;
  onClose: () => void;
  onPinToggle: () => void;
  onArchiveToggle: () => void;
  onDeleteChat: () => void;
  onDeleteContact?: () => void;
}

export function ChatActionMenuModal({
  chatTitle,
  isPinned,
  isArchived,
  hasContact = false,
  onClose,
  onPinToggle,
  onArchiveToggle,
  onDeleteChat,
  onDeleteContact,
}: ChatActionMenuModalProps) {
  return (
    <div
      className="fixed inset-0 z-[190] ze-solid-modal-backdrop flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[#121318] border border-white/15 rounded-t-3xl sm:rounded-3xl p-5 space-y-2 shadow-2xl"
      >
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="min-w-0 pr-3">
            <p className="text-xs text-zinc-400">Kelola Obrolan</p>
            <h3 className="text-sm font-bold text-white truncate">{chatTitle}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] rounded-xl bg-white/10 text-zinc-300 hover:text-white flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            onPinToggle();
            onClose();
          }}
          className="w-full min-h-[48px] px-4 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center gap-3 text-left text-sm font-semibold text-white transition"
        >
          <Pin className={`w-4 h-4 ${isPinned ? 'text-amber-400' : 'text-sky-400'}`} />
          <span>{isPinned ? 'Lepas Sematan Chat' : 'Sematkan Chat (Pin)'}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onArchiveToggle();
            onClose();
          }}
          className="w-full min-h-[48px] px-4 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center gap-3 text-left text-sm font-semibold text-white transition"
        >
          <Archive className="w-4 h-4 text-indigo-400" />
          <span>{isArchived ? 'Keluarkan dari Arsip' : 'Arsipkan Chat'}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onDeleteChat();
            onClose();
          }}
          className="w-full min-h-[48px] px-4 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 flex items-center gap-3 text-left text-sm font-semibold text-rose-400 transition"
        >
          <Trash2 className="w-4 h-4" />
          <span>Hapus Chat</span>
        </button>

        {hasContact && onDeleteContact && (
          <button
            type="button"
            onClick={() => {
              onDeleteContact();
              onClose();
            }}
            className="w-full min-h-[48px] px-4 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 flex items-center gap-3 text-left text-sm font-semibold text-rose-300 transition"
          >
            <UserMinus className="w-4 h-4" />
            <span>Hapus Kontak & Chat</span>
          </button>
        )}
      </div>
    </div>
  );
}
