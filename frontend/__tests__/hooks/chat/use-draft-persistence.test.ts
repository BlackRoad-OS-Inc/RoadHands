import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDraftPersistence } from "#/hooks/chat/use-draft-persistence";
import {
  getConversationState,
  LOCAL_STORAGE_KEYS,
} from "#/utils/conversation-local-storage";
import toast from "react-hot-toast";

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
  },
}));

describe("useDraftPersistence", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createMockRef = (innerText: string = "") => ({
    current: { innerText } as HTMLDivElement,
  });

  describe("handleDraftChange", () => {
    it("saves draft to localStorage after debounce delay", async () => {
      const conversationId = "conv-123";
      const chatInputRef = createMockRef();

      const { result } = renderHook(() =>
        useDraftPersistence({
          conversationId,
          chatInputRef: chatInputRef as React.RefObject<HTMLDivElement | null>,
        }),
      );

      act(() => {
        result.current.handleDraftChange("my draft text");
      });

      // Draft should not be saved immediately
      const stateBefore = getConversationState(conversationId);
      expect(stateBefore.draftMessage).toBeNull();

      // Advance timers past debounce delay (300ms)
      act(() => {
        vi.advanceTimersByTime(300);
      });

      // Draft should now be saved
      const stateAfter = getConversationState(conversationId);
      expect(stateAfter.draftMessage).toBe("my draft text");
      expect(stateAfter.draftTimestamp).toBeDefined();
    });

    it("debounces multiple rapid changes", async () => {
      const conversationId = "conv-123";
      const chatInputRef = createMockRef();

      const { result } = renderHook(() =>
        useDraftPersistence({
          conversationId,
          chatInputRef: chatInputRef as React.RefObject<HTMLDivElement | null>,
        }),
      );

      // Simulate rapid typing
      act(() => {
        result.current.handleDraftChange("h");
        vi.advanceTimersByTime(100);
        result.current.handleDraftChange("he");
        vi.advanceTimersByTime(100);
        result.current.handleDraftChange("hel");
        vi.advanceTimersByTime(100);
        result.current.handleDraftChange("hello");
      });

      // Only the final value should be saved after debounce
      act(() => {
        vi.advanceTimersByTime(300);
      });

      const state = getConversationState(conversationId);
      expect(state.draftMessage).toBe("hello");
    });

    it("clears draft when empty text is provided", async () => {
      const conversationId = "conv-123";
      const chatInputRef = createMockRef();
      const key = `${LOCAL_STORAGE_KEYS.CONVERSATION_STATE}-${conversationId}`;

      // Pre-populate with existing draft
      localStorage.setItem(
        key,
        JSON.stringify({
          draftMessage: "existing draft",
          draftTimestamp: Date.now(),
        }),
      );

      const { result } = renderHook(() =>
        useDraftPersistence({
          conversationId,
          chatInputRef: chatInputRef as React.RefObject<HTMLDivElement | null>,
        }),
      );

      act(() => {
        result.current.handleDraftChange("   "); // Whitespace only
        vi.advanceTimersByTime(300);
      });

      const state = getConversationState(conversationId);
      expect(state.draftMessage).toBeNull();
      expect(state.draftTimestamp).toBeNull();
    });
  });

  describe("clearDraft", () => {
    it("removes draft from localStorage immediately", () => {
      const conversationId = "conv-123";
      const chatInputRef = createMockRef();
      const key = `${LOCAL_STORAGE_KEYS.CONVERSATION_STATE}-${conversationId}`;

      // Pre-populate with existing draft
      localStorage.setItem(
        key,
        JSON.stringify({
          draftMessage: "existing draft",
          draftTimestamp: Date.now(),
        }),
      );

      const { result } = renderHook(() =>
        useDraftPersistence({
          conversationId,
          chatInputRef: chatInputRef as React.RefObject<HTMLDivElement | null>,
        }),
      );

      act(() => {
        result.current.clearDraft();
      });

      const state = getConversationState(conversationId);
      expect(state.draftMessage).toBeNull();
      expect(state.draftTimestamp).toBeNull();
    });

    it("cancels pending debounced save", () => {
      const conversationId = "conv-123";
      const chatInputRef = createMockRef();

      const { result } = renderHook(() =>
        useDraftPersistence({
          conversationId,
          chatInputRef: chatInputRef as React.RefObject<HTMLDivElement | null>,
        }),
      );

      // Start a draft change
      act(() => {
        result.current.handleDraftChange("pending draft");
      });

      // Clear before debounce completes
      act(() => {
        vi.advanceTimersByTime(100); // Only 100ms, not full 300ms
        result.current.clearDraft();
      });

      // Advance past debounce time
      act(() => {
        vi.advanceTimersByTime(300);
      });

      // Draft should remain cleared, not saved
      const state = getConversationState(conversationId);
      expect(state.draftMessage).toBeNull();
    });
  });

  describe("restoreDraft", () => {
    it("restores draft from localStorage to input ref", () => {
      const conversationId = "conv-123";
      const key = `${LOCAL_STORAGE_KEYS.CONVERSATION_STATE}-${conversationId}`;
      const chatInputRef = createMockRef();

      // Pre-populate with draft
      localStorage.setItem(
        key,
        JSON.stringify({
          draftMessage: "saved draft",
          draftTimestamp: Date.now(),
        }),
      );

      renderHook(() =>
        useDraftPersistence({
          conversationId,
          chatInputRef: chatInputRef as React.RefObject<HTMLDivElement | null>,
        }),
      );

      // Draft should be restored to input ref on mount
      expect(chatInputRef.current?.innerText).toBe("saved draft");
    });

    it("shows toast when draft is restored", () => {
      const conversationId = "conv-123";
      const key = `${LOCAL_STORAGE_KEYS.CONVERSATION_STATE}-${conversationId}`;
      const chatInputRef = createMockRef();

      // Pre-populate with draft
      localStorage.setItem(
        key,
        JSON.stringify({
          draftMessage: "saved draft",
          draftTimestamp: Date.now(),
        }),
      );

      renderHook(() =>
        useDraftPersistence({
          conversationId,
          chatInputRef: chatInputRef as React.RefObject<HTMLDivElement | null>,
        }),
      );

      expect(toast.success).toHaveBeenCalledWith("Draft restored", { duration: 2000 });
    });

    it("does not restore stale draft (older than 24 hours)", () => {
      const conversationId = "conv-123";
      const key = `${LOCAL_STORAGE_KEYS.CONVERSATION_STATE}-${conversationId}`;
      const chatInputRef = createMockRef();

      // Create a stale draft (25 hours old)
      const staleTimestamp = Date.now() - 25 * 60 * 60 * 1000;
      localStorage.setItem(
        key,
        JSON.stringify({
          draftMessage: "stale draft",
          draftTimestamp: staleTimestamp,
        }),
      );

      renderHook(() =>
        useDraftPersistence({
          conversationId,
          chatInputRef: chatInputRef as React.RefObject<HTMLDivElement | null>,
        }),
      );

      // Stale draft should not be restored
      expect(chatInputRef.current?.innerText).toBe("");

      // Stale draft should be cleared from localStorage
      const state = getConversationState(conversationId);
      expect(state.draftMessage).toBeNull();
    });

    it("does not restore when conversationId is null", () => {
      const chatInputRef = createMockRef();

      renderHook(() =>
        useDraftPersistence({
          conversationId: null,
          chatInputRef: chatInputRef as React.RefObject<HTMLDivElement | null>,
        }),
      );

      expect(toast.success).not.toHaveBeenCalled();
    });
  });

  describe("conversation switching", () => {
    it("saves pending draft when conversation changes", () => {
      const chatInputRef = createMockRef();

      const { result, rerender } = renderHook(
        ({ conversationId }) =>
          useDraftPersistence({
            conversationId,
            chatInputRef: chatInputRef as React.RefObject<HTMLDivElement | null>,
          }),
        { initialProps: { conversationId: "conv-A" } },
      );

      // Start typing in conv-A
      act(() => {
        result.current.handleDraftChange("draft for A");
      });

      // Switch to conv-B before debounce completes
      act(() => {
        vi.advanceTimersByTime(100);
      });

      rerender({ conversationId: "conv-B" });

      // Draft for conv-A should be saved when switching
      const stateA = getConversationState("conv-A");
      expect(stateA.draftMessage).toBe("draft for A");
    });

    it("restores draft for new conversation", () => {
      const chatInputRef = createMockRef();
      const keyB = `${LOCAL_STORAGE_KEYS.CONVERSATION_STATE}-conv-B`;

      // Pre-populate conv-B with draft
      localStorage.setItem(
        keyB,
        JSON.stringify({
          draftMessage: "draft for B",
          draftTimestamp: Date.now(),
        }),
      );

      const { rerender } = renderHook(
        ({ conversationId }) =>
          useDraftPersistence({
            conversationId,
            chatInputRef: chatInputRef as React.RefObject<HTMLDivElement | null>,
          }),
        { initialProps: { conversationId: "conv-A" } },
      );

      // Switch to conv-B
      rerender({ conversationId: "conv-B" });

      // Draft for conv-B should be restored
      expect(chatInputRef.current?.innerText).toBe("draft for B");
    });
  });

  describe("unmount behavior", () => {
    it("flushes pending draft on unmount", () => {
      const conversationId = "conv-123";
      const chatInputRef = createMockRef();

      const { result, unmount } = renderHook(() =>
        useDraftPersistence({
          conversationId,
          chatInputRef: chatInputRef as React.RefObject<HTMLDivElement | null>,
        }),
      );

      // Start a draft change
      act(() => {
        result.current.handleDraftChange("unsaved draft");
      });

      // Unmount before debounce completes
      act(() => {
        vi.advanceTimersByTime(100);
        unmount();
      });

      // Draft should be saved on unmount
      const state = getConversationState(conversationId);
      expect(state.draftMessage).toBe("unsaved draft");
    });
  });
});
