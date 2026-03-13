import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  clearConversationLocalStorage,
  getConversationState,
  isTaskConversationId,
  setConversationState,
  LOCAL_STORAGE_KEYS,
} from "#/utils/conversation-local-storage";

describe("conversation localStorage utilities", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("isTaskConversationId", () => {
    it("returns true for IDs starting with task-", () => {
      expect(isTaskConversationId("task-abc-123")).toBe(true);
      expect(isTaskConversationId("task-")).toBe(true);
    });

    it("returns false for normal conversation IDs", () => {
      expect(isTaskConversationId("conv-123")).toBe(false);
      expect(isTaskConversationId("abc")).toBe(false);
    });
  });

  describe("getConversationState", () => {
    it("returns default state including conversationMode for task IDs without reading localStorage", () => {
      const state = getConversationState("task-uuid-123");

      expect(state.conversationMode).toBe("code");
      expect(state.selectedTab).toBe("editor");
      expect(state.rightPanelShown).toBe(true);
      expect(
        localStorage.getItem(
          `${LOCAL_STORAGE_KEYS.CONVERSATION_STATE}-task-uuid-123`,
        ),
      ).toBeNull();
    });

    it("returns merged state from localStorage for real conversation ID including conversationMode", () => {
      const key = `${LOCAL_STORAGE_KEYS.CONVERSATION_STATE}-conv-1`;
      localStorage.setItem(
        key,
        JSON.stringify({ conversationMode: "plan", selectedTab: "terminal" }),
      );

      const state = getConversationState("conv-1");

      expect(state.conversationMode).toBe("plan");
      expect(state.selectedTab).toBe("terminal");
      expect(state.rightPanelShown).toBe(true);
    });

    it("returns default state when key is missing or invalid", () => {
      expect(getConversationState("conv-missing").conversationMode).toBe(
        "code",
      );

      const key = `${LOCAL_STORAGE_KEYS.CONVERSATION_STATE}-conv-bad`;
      localStorage.setItem(key, "not json");
      expect(getConversationState("conv-bad").conversationMode).toBe("code");
    });
  });

  describe("setConversationState", () => {
    it("does not persist when conversationId is a task ID", () => {
      setConversationState("task-xyz", { conversationMode: "plan" });

      expect(
        localStorage.getItem(
          `${LOCAL_STORAGE_KEYS.CONVERSATION_STATE}-task-xyz`,
        ),
      ).toBeNull();
    });

    it("persists conversationMode for real conversation ID and getConversationState returns it", () => {
      setConversationState("conv-2", { conversationMode: "plan" });

      const state = getConversationState("conv-2");
      expect(state.conversationMode).toBe("plan");
    });
  });

  describe("clearConversationLocalStorage", () => {
    it("removes the consolidated conversation-state localStorage entry", () => {
      const conversationId = "conv-123";

      // Set up the consolidated key
      const consolidatedKey = `${LOCAL_STORAGE_KEYS.CONVERSATION_STATE}-${conversationId}`;
      localStorage.setItem(
        consolidatedKey,
        JSON.stringify({
          selectedTab: "editor",
          rightPanelShown: true,
          unpinnedTabs: [],
        }),
      );

      clearConversationLocalStorage(conversationId);

      expect(localStorage.getItem(consolidatedKey)).toBeNull();
    });

    it("does not throw if conversation keys do not exist", () => {
      expect(() => {
        clearConversationLocalStorage("non-existent-id");
      }).not.toThrow();
    });
  });

  describe("getConversationState", () => {
    it("returns default state with subConversationTaskId as null when no state exists", () => {
      const conversationId = "conv-123";
      const state = getConversationState(conversationId);

      expect(state.subConversationTaskId).toBeNull();
      expect(state.selectedTab).toBe("editor");
      expect(state.rightPanelShown).toBe(true);
      expect(state.unpinnedTabs).toEqual([]);
    });

    it("retrieves subConversationTaskId from localStorage when it exists", () => {
      const conversationId = "conv-123";
      const taskId = "task-uuid-123";
      const consolidatedKey = `${LOCAL_STORAGE_KEYS.CONVERSATION_STATE}-${conversationId}`;

      localStorage.setItem(
        consolidatedKey,
        JSON.stringify({
          selectedTab: "editor",
          rightPanelShown: true,
          unpinnedTabs: [],
          subConversationTaskId: taskId,
        }),
      );

      const state = getConversationState(conversationId);

      expect(state.subConversationTaskId).toBe(taskId);
    });

    it("merges stored state with defaults when partial state exists", () => {
      const conversationId = "conv-123";
      const consolidatedKey = `${LOCAL_STORAGE_KEYS.CONVERSATION_STATE}-${conversationId}`;

      localStorage.setItem(
        consolidatedKey,
        JSON.stringify({
          subConversationTaskId: "task-123",
        }),
      );

      const state = getConversationState(conversationId);

      expect(state.subConversationTaskId).toBe("task-123");
      expect(state.selectedTab).toBe("editor");
      expect(state.rightPanelShown).toBe(true);
      expect(state.unpinnedTabs).toEqual([]);
    });
  });

  describe("setConversationState", () => {
    it("persists subConversationTaskId to localStorage", () => {
      const conversationId = "conv-123";
      const taskId = "task-uuid-456";
      const consolidatedKey = `${LOCAL_STORAGE_KEYS.CONVERSATION_STATE}-${conversationId}`;

      setConversationState(conversationId, {
        subConversationTaskId: taskId,
      });

      const stored = localStorage.getItem(consolidatedKey);
      expect(stored).not.toBeNull();

      const parsed = JSON.parse(stored!);
      expect(parsed.subConversationTaskId).toBe(taskId);
    });

    it("merges subConversationTaskId with existing state", () => {
      const conversationId = "conv-123";
      const consolidatedKey = `${LOCAL_STORAGE_KEYS.CONVERSATION_STATE}-${conversationId}`;

      // Set initial state
      localStorage.setItem(
        consolidatedKey,
        JSON.stringify({
          selectedTab: "changes",
          rightPanelShown: false,
          unpinnedTabs: ["tab-1"],
          subConversationTaskId: "old-task-id",
        }),
      );

      // Update only subConversationTaskId
      setConversationState(conversationId, {
        subConversationTaskId: "new-task-id",
      });

      const stored = localStorage.getItem(consolidatedKey);
      const parsed = JSON.parse(stored!);

      expect(parsed.subConversationTaskId).toBe("new-task-id");
      expect(parsed.selectedTab).toBe("changes");
      expect(parsed.rightPanelShown).toBe(false);
      expect(parsed.unpinnedTabs).toEqual(["tab-1"]);
    });

    it("clears subConversationTaskId when set to null", () => {
      const conversationId = "conv-123";
      const consolidatedKey = `${LOCAL_STORAGE_KEYS.CONVERSATION_STATE}-${conversationId}`;

      // Set initial state with task ID
      localStorage.setItem(
        consolidatedKey,
        JSON.stringify({
          subConversationTaskId: "task-123",
        }),
      );

      // Clear the task ID
      setConversationState(conversationId, {
        subConversationTaskId: null,
      });

      const stored = localStorage.getItem(consolidatedKey);
      const parsed = JSON.parse(stored!);

      expect(parsed.subConversationTaskId).toBeNull();
    });
  });

  describe("draft message persistence", () => {
    it("returns default state with draftMessage as null when no state exists", () => {
      const conversationId = "conv-123";
      const state = getConversationState(conversationId);

      expect(state.draftMessage).toBeNull();
      expect(state.draftTimestamp).toBeNull();
    });

    it("retrieves draftMessage from localStorage when it exists", () => {
      const conversationId = "conv-123";
      const consolidatedKey = `${LOCAL_STORAGE_KEYS.CONVERSATION_STATE}-${conversationId}`;
      const timestamp = Date.now();

      localStorage.setItem(
        consolidatedKey,
        JSON.stringify({
          draftMessage: "My draft message",
          draftTimestamp: timestamp,
        }),
      );

      const state = getConversationState(conversationId);

      expect(state.draftMessage).toBe("My draft message");
      expect(state.draftTimestamp).toBe(timestamp);
    });

    it("persists draftMessage and draftTimestamp to localStorage", () => {
      const conversationId = "conv-123";
      const consolidatedKey = `${LOCAL_STORAGE_KEYS.CONVERSATION_STATE}-${conversationId}`;
      const timestamp = Date.now();

      setConversationState(conversationId, {
        draftMessage: "Test draft",
        draftTimestamp: timestamp,
      });

      const stored = localStorage.getItem(consolidatedKey);
      expect(stored).not.toBeNull();

      const parsed = JSON.parse(stored!);
      expect(parsed.draftMessage).toBe("Test draft");
      expect(parsed.draftTimestamp).toBe(timestamp);
    });

    it("merges draftMessage with existing state", () => {
      const conversationId = "conv-123";
      const consolidatedKey = `${LOCAL_STORAGE_KEYS.CONVERSATION_STATE}-${conversationId}`;

      // Set initial state
      localStorage.setItem(
        consolidatedKey,
        JSON.stringify({
          selectedTab: "changes",
          rightPanelShown: false,
        }),
      );

      // Update only draftMessage
      const timestamp = Date.now();
      setConversationState(conversationId, {
        draftMessage: "New draft",
        draftTimestamp: timestamp,
      });

      const stored = localStorage.getItem(consolidatedKey);
      const parsed = JSON.parse(stored!);

      expect(parsed.draftMessage).toBe("New draft");
      expect(parsed.draftTimestamp).toBe(timestamp);
      expect(parsed.selectedTab).toBe("changes");
      expect(parsed.rightPanelShown).toBe(false);
    });

    it("clears draftMessage when set to null", () => {
      const conversationId = "conv-123";
      const consolidatedKey = `${LOCAL_STORAGE_KEYS.CONVERSATION_STATE}-${conversationId}`;

      // Set initial state with draft
      localStorage.setItem(
        consolidatedKey,
        JSON.stringify({
          draftMessage: "Existing draft",
          draftTimestamp: Date.now(),
        }),
      );

      // Clear the draft
      setConversationState(conversationId, {
        draftMessage: null,
        draftTimestamp: null,
      });

      const stored = localStorage.getItem(consolidatedKey);
      const parsed = JSON.parse(stored!);

      expect(parsed.draftMessage).toBeNull();
      expect(parsed.draftTimestamp).toBeNull();
    });

    it("does not persist draft for task conversation IDs", () => {
      const conversationId = "task-123";

      setConversationState(conversationId, {
        draftMessage: "Should not persist",
        draftTimestamp: Date.now(),
      });

      const key = `${LOCAL_STORAGE_KEYS.CONVERSATION_STATE}-${conversationId}`;
      expect(localStorage.getItem(key)).toBeNull();
    });
  });
});
