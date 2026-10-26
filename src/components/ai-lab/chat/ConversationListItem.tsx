"use client";

// ============================================================
// ConversationListItem — Single conversation in sidebar
// ============================================================
// Phase 69: Renders a conversation summary in the sidebar.
// Phase 73: Added rename (double-click / pencil icon) and
// delete confirmation dialog.
// ============================================================

import { useState, useRef, useCallback, useEffect } from "react";
import { MessageSquare, Trash2, Pencil, Check, X } from "lucide-react";
import type { ChatConversationSummary } from "@/lib/minimind/research/ChatHistoryStore";

// ============================================================
// Helpers
// ============================================================

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

// ============================================================
// ConversationListItem
// ============================================================

interface ConversationListItemProps {
  conversation: ChatConversationSummary;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  /** Phase 73: Rename callback */
  onRename: (id: string, newTitle: string) => void;
}

export function ConversationListItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
  onRename,
}: ConversationListItemProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(conversation.title);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  // Reset edit title when conversation changes
  useEffect(() => {
    setEditTitle(conversation.title);
  }, [conversation.title]);

  const handleStartEdit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditTitle(conversation.title);
      setIsEditing(true);
    },
    [conversation.title]
  );

  const handleSaveEdit = useCallback(() => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== conversation.title) {
      onRename(conversation.id, trimmed);
    }
    setIsEditing(false);
  }, [editTitle, conversation.id, conversation.title, onRename]);

  const handleCancelEdit = useCallback(() => {
    setEditTitle(conversation.title);
    setIsEditing(false);
  }, [conversation.title]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSaveEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleCancelEdit();
      }
    },
    [handleSaveEdit, handleCancelEdit]
  );

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setShowDeleteConfirm(true);
    },
    []
  );

  const handleConfirmDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete(conversation.id);
      setShowDeleteConfirm(false);
    },
    [conversation.id, onDelete]
  );

  const handleCancelDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setShowDeleteConfirm(false);
    },
    []
  );

  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      onDoubleClick={() => {
        setEditTitle(conversation.title);
        setIsEditing(true);
      }}
      className={`group relative w-full rounded-xl px-3 py-2.5 text-left transition-all duration-200 ${
        isActive
          ? "border border-brand/15 bg-brand/[0.06] dark:border-brand/20 dark:bg-brand/[0.08]"
          : "border border-transparent hover:border-brand/[0.06] hover:bg-brand/[0.02] dark:hover:border-white/[0.04] dark:hover:bg-white/[0.02]"
      }`}
    >
      <div className="flex items-start gap-2.5">
        {/* Icon */}
        <MessageSquare
          className={`mt-0.5 size-3.5 shrink-0 ${
            isActive
              ? "text-brand/70"
              : "text-slate-500/50 dark:text-slate-400/40"
          }`}
        />

        {/* Content */}
        <div className="min-w-0 flex-1">
          {isEditing ? (
            /* Inline rename */
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <input
                ref={inputRef}
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={60}
                className="min-w-0 flex-1 rounded-md border border-brand/20 bg-brand/[0.04] px-1.5 py-0.5 text-xs font-medium text-foreground outline-none focus:border-brand/40 dark:border-white/[0.08] dark:bg-white/[0.02]"
              />
              <button
                type="button"
                onClick={handleSaveEdit}
                className="shrink-0 rounded p-0.5 text-emerald-500/70 hover:text-emerald-500"
                aria-label="Save"
              >
                <Check className="size-3" />
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="shrink-0 rounded p-0.5 text-slate-400/50 hover:text-slate-600 dark:text-slate-500/50 dark:hover:text-slate-300"
                aria-label="Cancel"
              >
                <X className="size-3" />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`truncate text-xs font-medium ${
                    isActive
                      ? "text-brand"
                      : "text-foreground/80"
                  }`}
                >
                  {conversation.title}
                </span>
                <span className="shrink-0 font-mono text-[0.6rem] text-slate-500/40 dark:text-slate-400/30">
                  {formatRelativeTime(conversation.updatedAt)}
                </span>
              </div>
              {conversation.lastMessage && (
                <p className="mt-0.5 truncate text-[0.7rem] leading-relaxed text-slate-500/60 dark:text-slate-400/40">
                  {conversation.lastMessage}
                </p>
              )}
            </>
          )}
        </div>

        {/* Action buttons (visible on hover) — only when not editing */}
        {!isEditing && (
          <div className="flex shrink-0 items-center gap-0.5">
            {/* Rename button */}
            {!showDeleteConfirm && (
              <button
                type="button"
                onClick={handleStartEdit}
                aria-label="Rename conversation"
                className="rounded-md p-1 opacity-0 transition-all duration-200 hover:bg-brand/10 hover:text-brand/70 group-hover:opacity-100"
              >
                <Pencil className="size-3" />
              </button>
            )}

            {/* Delete button or confirmation */}
            {showDeleteConfirm ? (
              <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="rounded-md p-1 text-red-500/70 hover:bg-red-500/10 hover:text-red-500"
                  aria-label="Confirm delete"
                >
                  <Check className="size-3" />
                </button>
                <button
                  type="button"
                  onClick={handleCancelDelete}
                  className="rounded-md p-1 text-slate-400/50 hover:text-slate-600 dark:text-slate-500/50 dark:hover:text-slate-300"
                  aria-label="Cancel delete"
                >
                  <X className="size-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleDeleteClick}
                aria-label="Delete conversation"
                className="rounded-md p-1 opacity-0 transition-all duration-200 hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
              >
                <Trash2 className="size-3" />
              </button>
            )}
          </div>
        )}
      </div>
    </button>
  );
}
