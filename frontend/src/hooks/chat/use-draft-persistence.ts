import { useRef, useCallback, useEffect } from "react";
import toast from "react-hot-toast";
import {
  getConversationState,
  setConversationState,
} from "#/utils/conversation-local-storage";

const DEBOUNCE_DELAY_MS = 300;
const STALE_DRAFT_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

interface UseDraftPersistenceParams {
  conversationId: string | null;
  chatInputRef: React.RefObject<HTMLDivElement | null>;
}

interface UseDraftPersistenceReturn {
  handleDraftChange: (text: string) => void;
  clearDraft: () => void;
  restoreDraft: () => void;
}

/**
 * Hook for persisting chat draft messages to localStorage with debouncing.
 * Drafts are keyed by conversation ID and automatically restored on mount.
 */
export function useDraftPersistence({
  conversationId,
  chatInputRef,
}: UseDraftPersistenceParams): UseDraftPersistenceReturn {
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDraftRef = useRef<string | null>(null);
  const previousConversationIdRef = useRef<string | null>(null);

  // Save draft to localStorage
  const saveDraft = useCallback(
    (text: string) => {
      if (!conversationId) return;

      const trimmedText = text.trim();

      if (trimmedText) {
        setConversationState(conversationId, {
          draftMessage: trimmedText,
          draftTimestamp: Date.now(),
        });
      } else {
        // Clear draft if empty
        setConversationState(conversationId, {
          draftMessage: null,
          draftTimestamp: null,
        });
      }
    },
    [conversationId],
  );

  // Flush any pending debounced save immediately
  const flushPendingDraft = useCallback(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }

    if (pendingDraftRef.current !== null) {
      saveDraft(pendingDraftRef.current);
      pendingDraftRef.current = null;
    }
  }, [saveDraft]);

  // Handle draft changes with debouncing
  const handleDraftChange = useCallback(
    (text: string) => {
      pendingDraftRef.current = text;

      // Clear existing timeout
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      // Set new debounced save
      debounceTimeoutRef.current = setTimeout(() => {
        saveDraft(text);
        pendingDraftRef.current = null;
        debounceTimeoutRef.current = null;
      }, DEBOUNCE_DELAY_MS);
    },
    [saveDraft],
  );

  // Clear draft from localStorage
  const clearDraft = useCallback(() => {
    // Clear any pending debounced save
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }
    pendingDraftRef.current = null;

    if (!conversationId) return;

    setConversationState(conversationId, {
      draftMessage: null,
      draftTimestamp: null,
    });
  }, [conversationId]);

  // Restore draft from localStorage to the input
  const restoreDraft = useCallback(() => {
    if (!conversationId || !chatInputRef.current) return;

    const state = getConversationState(conversationId);

    if (!state.draftMessage || !state.draftTimestamp) return;

    // Check if draft is stale (older than 24 hours)
    const age = Date.now() - state.draftTimestamp;
    if (age > STALE_DRAFT_THRESHOLD_MS) {
      // Clear stale draft
      setConversationState(conversationId, {
        draftMessage: null,
        draftTimestamp: null,
      });
      return;
    }

    // Restore draft to input
    // eslint-disable-next-line no-param-reassign
    chatInputRef.current.innerText = state.draftMessage;

    // Show toast notification
    toast.success("Draft restored", { duration: 2000 });
  }, [conversationId, chatInputRef]);

  // Restore draft on mount and when conversation changes
  useEffect(() => {
    const previousConversationId = previousConversationIdRef.current;

    // If switching conversations, flush the draft from the previous conversation
    if (
      previousConversationId &&
      previousConversationId !== conversationId &&
      pendingDraftRef.current !== null
    ) {
      // Save pending draft to the previous conversation
      const pendingText = pendingDraftRef.current;
      if (pendingText.trim()) {
        setConversationState(previousConversationId, {
          draftMessage: pendingText.trim(),
          draftTimestamp: Date.now(),
        });
      }
      pendingDraftRef.current = null;
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
    }

    // Restore draft for the new conversation
    restoreDraft();

    // Update previous conversation ID
    previousConversationIdRef.current = conversationId;
  }, [conversationId, restoreDraft]);

  // Cleanup on unmount - flush any pending draft
  useEffect(() => () => flushPendingDraft(), [flushPendingDraft]);

  return {
    handleDraftChange,
    clearDraft,
    restoreDraft,
  };
}
