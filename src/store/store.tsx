import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/shallow";
import { produce } from "immer";
import moment from "moment";
import { GROQ_MODELS, ImageSize } from "../services/chatService";
import { auth } from "../config/firebase";
import { readAttachmentMetadata } from "../utils/attachmentMetadata";
import {
  clearUserChats,
  createChatId,
  deleteChatRecord,
  getChatRecord,
  listUserChats,
  patchChatRecord,
  saveChatRecord,
  sanitizeChatMessages,
  type PersistedChat,
} from "../services/chatDbService";

export type Store = {
  chats: ChatMessageType[];
  addChat: (chat: ChatMessageType, index?: number) => void;
  // ➕ 1. Add updateMessageContent signature here:
  updateMessageContent: (
    id: string,
    newContent: string,
    newType?: ChatMessageType["type"]
  ) => void;
  // ... your other store methods (clearChat, etc.)
};

// ✅ FIX 1: Groq models instead of OpenAI models.
const DEFAULT_MODEL: string = String(
  import.meta.env.VITE_AI_MODEL || "openai/gpt-oss-120b"
);
const DEFAULT_CHAT_MODEL = "openai/gpt-oss-120b";
const MAX_LOCAL_MESSAGES_PER_CHAT = 200;

export interface ChatMessageType {
  role: "user" | "assistant" | "system";
  content: string;
  type: "text" | "image_url";
  id: string;
  // Optional, bounded attachment metadata for the persisted chat record.
  // Extracted file text is intentionally absent: it stays in memory/Groq only.
  fileName?: string;
  fileType?: string;
  fileSize?: number;
}
export interface SystemMessageType {
  message: string;
  useForAllChats: boolean;
}
export interface ModalPermissionType {
  id: string;
  object: string;
  created: number;
  allow_create_engine: boolean;
  allow_sampling: boolean;
  allow_logprobs: boolean;
  allow_search_indices: boolean;
  allow_view: boolean;
  allow_fine_tuning: boolean;
  organization: string;
  group: null;
  is_blocking: boolean;
}
export interface ModalType {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  permission: ModalPermissionType[];
  root: string;
  parent: null;
}
export type Theme = "light" | "dark";
export interface ThemeType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}
export type ModalList = string;
export interface SettingsType {
  settings: {
    sendChatHistory: boolean;
    systemMessage: string;
    useSystemMessageForAllChats: boolean;
    selectedModal: ModalList;
    dalleImageSize: { "dall-e-2": ImageSize; "dall-e-3": ImageSize };
  };
  modalsList: readonly string[];
  isSystemMessageModalVisible: boolean;
  isModalVisible: boolean;
  setSystemMessage: (value: SystemMessageType) => void;
  setSystemMessageModalVisible: (value: boolean) => void;
  setSendChatHistory: (value: boolean) => void;
  setModalVisible: (value: boolean) => void;
  setModalsList: (value: string[]) => void;
  setModal: (value: ModalList) => void;
  setDalleImageSize: (value: ImageSize, type: "dall-e-2" | "dall-e-3") => void;
}
export interface ChatType {
  userId: string;
  chats: any[];
  chatHistory: string[];
  loadUserHistory: (userId: string) => Promise<void>;
  applyRemoteChats: (chats: PersistedChat[], expectedUid?: string) => void;
  addChat: (chat: ChatMessageType, index?: number) => void;
  editChatMessage: (chat: string, updateIndex: number) => void;
  addNewChat: () => void;
  saveChats: () => Promise<void>;
  viewSelectedChat: (chatId: string) => void;
  resetChatAt: (index: number) => void;
  truncateChatAfter: (index: number) => void;
  handleDeleteChats: (chatid: string) => void;
  editChatsTitle: (id: string, title: string) => void;
  clearAllChats: () => void;
  updateMessageContent: (
    id: string,
    newContent: string,
    newType?: ChatMessageType["type"]
  ) => void;
}
export const apikey: string = String(import.meta.env.VITE_GROQ_API_KEY || "");
export interface AuthType {
  token: string;
  user: {
    id?: string;
    name: string;
    email: string;
    avatar: string;
  };
  setToken: (token: string) => void;
  setUser: (user: any) => void;
}

const DEFAULT_AVATAR = "/imgs/default-avatar.jpg";

type LocalChatRecord = PersistedChat & { chats?: ChatMessageType[] };

// Realtime Database stores arrays as numeric-keyed objects and can omit empty
// slots. localStorage mirrors can therefore contain null holes as well. Every
// message list is normalized here before it can reach chat state, so index
// based actions (resetChatAt/editChatMessage) can never touch undefined.
export function normalizeMessages(raw: unknown): ChatMessageType[] {
  if (!raw) return [];
  const values: unknown[] = Array.isArray(raw)
    ? Array.from(raw)
    : typeof raw === "object"
      ? Object.values(raw as Record<string, unknown>)
      : [];

  return values.filter(Boolean).map((value, index) => {
    const message = value as Partial<ChatMessageType>;
    const normalized: ChatMessageType = {
      role:
        message.role === "user" ||
        message.role === "assistant" ||
        message.role === "system"
          ? message.role
          : "user",
      content: typeof message.content === "string" ? message.content : "",
      type: message.type === "image_url" ? "image_url" : "text",
      id:
        typeof message.id === "string" && message.id
          ? message.id
          : `restored_${index}_${Date.now()}`,
    };

    const attachment = readAttachmentMetadata(message);
    if (attachment) {
      normalized.fileName = attachment.fileName;
      normalized.fileType = attachment.fileType;
      normalized.fileSize = attachment.fileSize;
    }

    return normalized;
  });
}

// Serialize RTDB writes so a snapshot captured for the user prompt cannot land
// after the final snapshot containing the assistant response.
let chatSaveQueue: Promise<void> = Promise.resolve();

// The assistant placeholder with an empty body is deliberately filtered out of
// persisted messages. While a reply is being generated, an RTDB `onValue`
// snapshot therefore contains only the user prompt — applying it to the live
// store would delete the placeholder the reply is written into. Track the
// in-flight placeholder so remote sync can skip the active thread.
let activeStreamMessageId: string | null = null;

export function isStreamInProgress(messageId: string): boolean {
  return activeStreamMessageId === messageId;
}

// Called when an edited prompt is about to regenerate an existing placeholder.
// The placeholder is temporarily empty, so remote snapshots must skip it until
// the first streamed chunk arrives.
export function beginAssistantStream(messageId: string): void {
  activeStreamMessageId = messageId;
}

// Abort, logout, delete and account switches must always release the guard.
// Without an id, the currently open stream is released.
export function endAssistantStream(messageId?: string): void {
  if (!messageId || activeStreamMessageId === messageId) {
    activeStreamMessageId = null;
  }
}

// localStorage can throw (quota exceeded / privacy mode). A failed mirror must
// never abort message sending or the RTDB write that follows it.
function safeLocalSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn(`Could not update local cache key ${key}:`, error);
  }
}

function enqueueChatSave(task: () => Promise<void>): Promise<void> {
  chatSaveQueue = chatSaveQueue.catch(() => undefined).then(task);
  return chatSaveQueue;
}

function readLocalChat(userId: string, chatId: string): LocalChatRecord | null {
  const raw = localStorage.getItem(`${userId}_${chatId}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LocalChatRecord;
    const messages = normalizeMessages(parsed.messages);
    const chats = normalizeMessages(parsed.chats);
    return {
      ...parsed,
      messages,
      chats: chats.length > 0 ? chats : messages,
    };
  } catch {
    return null;
  }
}

function readStoredHistory(userId: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(`chatHistory_${userId}`) || "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function deriveTitle(messages: ChatMessageType[]): string {
  const firstUserMessage = messages.find((message) => message.role === "user");
  const content =
    typeof firstUserMessage?.content === "string" ? firstUserMessage.content : "";

  const cleaned = content
    .replace(/^\[Image Attachment:[^\]]*\]\s*/i, "")
    .replace(/^\[File Attachment:[^\]]*\]\s*/i, "")
    .replace(/^\[Context from file:[^\]]*\]\s*/i, "")
    .replace(/\[User Query\]:\s*/i, "")
    .trim();

  return cleaned.slice(0, 30) || "New Chat";
}

function numericTimestamp(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

export const useChat = create<ChatType>((set, get) => ({
  userId: "guest",
  chats: [],
  chatHistory: [],

  // 🚀 Hydrate from localStorage immediately, then reconcile with RTDB.
  loadUserHistory: async (userId: string) => {
    const activeUserId = userId && userId.trim() !== "" ? userId : "guest";
    const previousUserId = get().userId;

    // Never carry an active conversation across account boundaries.
    if (previousUserId !== activeUserId) {
      endAssistantStream();
      set(
        produce((state: ChatType) => {
          state.userId = activeUserId;
          state.chats = [];
          state.chatHistory = [];
        })
      );
    } else {
      set(
        produce((state: ChatType) => {
          state.userId = activeUserId;
        })
      );
    }

    const storedHistory = readStoredHistory(activeUserId);
    let activeSessionChats: ChatMessageType[] = [];

    if (get().chats.length === 0 && storedHistory.length > 0) {
      const latestChatId = storedHistory[storedHistory.length - 1];
      activeSessionChats = readLocalChat(activeUserId, latestChatId)?.chats || [];
    }

    set(
      produce((state: ChatType) => {
        state.chatHistory = storedHistory;
        state.chats = normalizeMessages(
          state.chats.length > 0 ? state.chats : activeSessionChats
        );
      })
    );

    if (activeUserId === "guest") return;

    try {
      get().applyRemoteChats(await listUserChats(activeUserId), activeUserId);
    } catch (error) {
      console.warn("Realtime Database history fetch failed, using local cache:", error);
    }
  },

  // Called by the onValue listener in App; RTDB is the source of truth.
  applyRemoteChats: (remoteChats, expectedUid) => {
    const sorted = [...remoteChats].sort((a, b) => b.updatedAt - a.updatedAt);
    const userId = get().userId;

    // A read that started for account A can resolve after a switch to B. Never
    // let that snapshot write A's conversations under B's storage keys.
    if (expectedUid && userId !== expectedUid) return;
    if (userId === "guest") return;
    if (auth.currentUser && auth.currentUser.uid !== userId) return;

    sorted.forEach((chat) => {
      const messages = chat.messages.slice(-MAX_LOCAL_MESSAGES_PER_CHAT);
      safeLocalSet(
        `${userId}_${chat.id}`,
        JSON.stringify({ ...chat, messages, chats: messages })
      );
    });
    safeLocalSet(
      `chatHistory_${userId}`,
      JSON.stringify(sorted.map((chat) => chat.id))
    );

    set(
      produce((state: ChatType) => {
        state.chatHistory = sorted.map((chat) => chat.id);

        // Never replace the open thread while Groq is streaming into its
        // assistant placeholder. The remote snapshot is written before the
        // reply exists, so applying it here would cancel the response in the UI.
        if (activeStreamMessageId) return;

        const activeChatId = state.chats[0]?.id as string | undefined;
        const activeRecord = activeChatId
          ? sorted.find((chat) => chat.id === activeChatId)
          : undefined;

        // Refresh the open thread from another device, but leave a brand-new
        // empty composer untouched.
        if (
          activeRecord &&
          (state.chats.length === 0 ||
            JSON.stringify(state.chats) !== JSON.stringify(activeRecord.messages))
        ) {
          state.chats = normalizeMessages(activeRecord.messages);
        }
      })
    );
  },

  // 🔄 Update a specific message content & force immediate persistence.
  updateMessageContent: (id, newContent, newType) => {
    set(
      produce((state: ChatType) => {
        state.chats = normalizeMessages(state.chats).map((chat) =>
          chat.id === id
            ? {
                ...chat,
                content: newContent,
                type: newType ?? chat.type,
              }
            : chat
        );
      })
    );
    // A non-empty reply means the stream finished; remote snapshots may now
    // safely reconcile the active thread again.
    if (activeStreamMessageId === id && newContent.trim()) {
      activeStreamMessageId = null;
    }
    if (get().chats.length > 0) {
      get().saveChats();
    }
  },

  addChat: (chat, index) => {
    if (chat.role === "assistant") {
      activeStreamMessageId = chat.content ? null : chat.id;
    }
    set(
      produce((state: ChatType) => {
        state.chats = normalizeMessages(state.chats);
        if (index !== undefined && index >= 0 && index < state.chats.length) {
          state.chats[index] = chat;
        } else {
          state.chats.push(chat);
        }
      })
    );
    // Persist as soon as the user prompt exists, then again when the assistant
    // response completes. Both snapshots write the same chat id/record.
    if (chat.role === "user" || (chat.role === "assistant" && chat.content)) {
      get().saveChats();
    }
  },

  editChatMessage: (chat, updateIndex) => {
    let changed = false;
    set(
      produce((state: ChatType) => {
        const messages = normalizeMessages(state.chats);
        const target = messages[updateIndex];
        if (!target) return;
        messages[updateIndex] = { ...target, content: chat };
        state.chats = messages;
        changed = true;
      })
    );
    if (changed) get().saveChats();
  },

  addNewChat: () => {
    set(
      produce((state: ChatType) => {
        state.chats = []; // Clear active conversation window
      })
    );
  },

  // ☁️ Mirror the active conversation to localStorage + `chats/${uid}/${chatId}`.
  saveChats: () => {
    const messages = normalizeMessages(get().chats);
    if (messages.length === 0) return Promise.resolve();

    const userId = get().userId || "guest";
    const chatId = messages[0]?.id || createChatId();
    const chatKey = `${userId}_${chatId}`;
    const historyKey = `chatHistory_${userId}`;
    const existingLocal = readLocalChat(userId, chatId);
    const now = Date.now();
    const isTitleEdited = Boolean(existingLocal?.isTitleEdited);

    const record: PersistedChat = {
      id: chatId,
      userId,
      title:
        isTitleEdited && existingLocal?.title
          ? existingLocal.title
          : deriveTitle(messages),
      // Drop empty streaming placeholders. The final snapshot contains the
      // complete user + assistant turn.
      messages: sanitizeChatMessages(messages).filter(
        (message) => message.content.trim().length > 0
      ),
      createdAt: numericTimestamp(existingLocal?.createdAt, now),
      updatedAt: now,
      isTitleEdited,
    };

    const localMessages = record.messages.slice(-MAX_LOCAL_MESSAGES_PER_CHAT);
    safeLocalSet(
      chatKey,
      JSON.stringify({ ...record, messages: localMessages, chats: localMessages })
    );

    const updatedHistory = [
      chatId,
      ...get().chatHistory.filter((id) => id !== chatId),
    ];
    safeLocalSet(historyKey, JSON.stringify(updatedHistory));
    set(
      produce((state: ChatType) => {
        state.chatHistory = updatedHistory;
      })
    );

    if (userId === "guest") return Promise.resolve();

    return enqueueChatSave(async () => {
      try {
        await saveChatRecord(userId, chatId, record);
      } catch (error) {
        console.error("Failed to sync chat to Realtime Database:", error);
      }
    });
  },

  // 🔍 View a selected conversation (local mirror first, remote fallback).
  viewSelectedChat: async (chatId) => {
    const userId = get().userId;
    const chatKey = `${userId}_${chatId}`;
    const localChat = readLocalChat(userId, chatId);

    if (localChat) {
      set(
        produce((state: ChatType) => {
          state.chats = normalizeMessages(
            (localChat.chats && localChat.chats.length > 0
              ? localChat.chats
              : localChat.messages
            ) || []
          );
        })
      );
      return;
    }

    if (userId === "guest") return;

    try {
      const record = await getChatRecord(userId, chatId);
      if (!record) return;
      // The read is async; the active account may have changed while it was in
      // flight. Never apply the previous account's chat to the new session.
      if (get().userId !== userId || auth.currentUser?.uid !== userId) return;

      safeLocalSet(
        chatKey,
        JSON.stringify({ ...record, chats: record.messages })
      );
      set(
        produce((state: ChatType) => {
          state.chats = normalizeMessages(record.messages);
          if (!state.chatHistory.includes(chatId)) state.chatHistory.unshift(chatId);
        })
      );
    } catch (error) {
      console.error("Failed to load conversation from Realtime Database:", error);
    }
  },

  resetChatAt: (index) => {
    if (!Number.isInteger(index) || index < 0) return;
    const current = normalizeMessages(get().chats);
    const target = current[index];
    if (!target) return;
    if (activeStreamMessageId === target.id) {
      activeStreamMessageId = null;
    }
    set(
      produce((state: ChatType) => {
        const messages = normalizeMessages(state.chats);
        const message = messages[index];
        if (!message) return;
        messages[index] = { ...message, content: "" };
        state.chats = messages;
      })
    );
  },

  // Drop turns that followed an edited prompt. No RTDB write here: the reply
  // regenerated by useBot performs the single final save.
  truncateChatAfter: (index) => {
    if (!Number.isInteger(index) || index < 0) return;
    set(
      produce((state: ChatType) => {
        state.chats = normalizeMessages(state.chats).slice(0, index + 1);
      })
    );
  },

  // 🗑️ Delete chat session locally and in Realtime Database.
  handleDeleteChats: async (chatid) => {
    endAssistantStream();
    const userId = get().userId;
    const historyKey = `chatHistory_${userId}`;
    const updatedHistory = get().chatHistory.filter((id) => id !== chatid);

    set(
      produce((state: ChatType) => {
        state.chatHistory = updatedHistory;
        state.chats = [];
        localStorage.removeItem(`${userId}_${chatid}`);
        localStorage.setItem(historyKey, JSON.stringify(updatedHistory));
      })
    );

    if (userId === "guest") return;

    try {
      await deleteChatRecord(userId, chatid);
    } catch (error) {
      console.error("Failed to delete chat from Realtime Database:", error);
    }
  },

  editChatsTitle: async (id, title) => {
    const userId = get().userId;
    const chatKey = `${userId}_${id}`;
    const localChat = readLocalChat(userId, id);

    if (localChat) {
      localStorage.setItem(
        chatKey,
        JSON.stringify({ ...localChat, title, isTitleEdited: true })
      );
    }

    // Force selector subscribers (ChatHistory) to re-read the localStorage mirror.
    set(
      produce((state: ChatType) => {
        state.chatHistory = [...state.chatHistory];
      })
    );

    if (userId === "guest") return;

    try {
      await patchChatRecord(userId, id, { title, isTitleEdited: true });
    } catch (error) {
      console.error("Failed to update chat title in Realtime Database:", error);
    }
  },

  clearAllChats: async () => {
    endAssistantStream();
    const userId = get().userId;
    const historyKey = `chatHistory_${userId}`;

    set(
      produce((state: ChatType) => {
        state.chatHistory.forEach((id) => {
          localStorage.removeItem(`${userId}_${id}`);
        });
        state.chats = [];
        state.chatHistory = [];
        localStorage.removeItem(historyKey);
      })
    );

    if (userId === "guest") return;

    try {
      await clearUserChats(userId);
    } catch (error) {
      console.error("Failed to clear remote chats on Realtime Database:", error);
    }
  },
}));

const useAuth = create<AuthType>()(
  persist(
    (set) => ({
      token: localStorage.getItem("token") || "",
      user: {
        id: "",
        name: "Your name?",
        email: "",
        avatar: DEFAULT_AVATAR,
      },
      setToken: (token) => {
        set(
          produce((state) => {
            state.token = token;
          })
        );
      },
      setUser: (user) => {
        set(
          produce((state) => {
            // Merge so partial profile updates never drop the signed-in uid.
            state.user = { ...state.user, ...user };
          })
        );
      },
    }),
    {
      name: "auth",
    }
  )
);
const useSettings = createWithEqualityFn<SettingsType>()(
  persist(
    (set) => ({
      settings: {
        sendChatHistory: false,
        systemMessage: "",
        useSystemMessageForAllChats: false,
        // ✅ FIX 2: Groq model as default
        selectedModal: DEFAULT_CHAT_MODEL,
        dalleImageSize: { "dall-e-2": "256x256", "dall-e-3": "1024x1024" },
      },
      modalsList: GROQ_MODELS,
      isSystemMessageModalVisible: false,
      isModalVisible: false,
      setSystemMessage: (value) => {
        set(
          produce((state: SettingsType) => {
            state.settings.systemMessage = value.message;
            state.settings.useSystemMessageForAllChats = value.useForAllChats;
          })
        );
      },
      setSystemMessageModalVisible: (value) => {
        set(
          produce((state: SettingsType) => {
            state.isSystemMessageModalVisible = value;
          })
        );
      },
      setSendChatHistory: (value) => {
        set(
          produce((state: SettingsType) => {
            state.settings.sendChatHistory = value;
          })
        );
      },
      setModal: (value) => {
        set(
          produce((state: SettingsType) => {
            state.settings.selectedModal = value;
          })
        );
      },
      setModalVisible: (value) => {
        set(
          produce((state: SettingsType) => {
            state.isModalVisible = value;
          })
        );
      },
      setModalsList: (value) => {
        set(
          produce((state: SettingsType) => {
            state.modalsList = value;
          })
        );
      },
      setDalleImageSize: (value, type) => {
        set(
          produce((state: SettingsType) => {
            state.settings.dalleImageSize[type] = value;
          })
        );
      },
    }),
    {
      name: "settings",
      // ✅ FIX 3: version bumped — old saved settings (with gpt-3.5-turbo)
      // are auto-reset on refresh, no manual LocalStorage wipe needed
      version: 3,
      partialize: (state: SettingsType) => ({ settings: state.settings }),
      migrate: (persistedState: unknown, version: number) => {
        // `partialize` only stores `settings`; a corrupt/null payload must not
        // throw during rehydration.
        const state = (
          persistedState && typeof persistedState === "object"
            ? persistedState
            : {}
        ) as { settings?: Partial<SettingsType["settings"]> };
        if (!state.settings || typeof state.settings !== "object") {
          state.settings = {};
        }
        const settings = state.settings;
        if (
          version < 2 ||
          typeof settings.selectedModal !== "string" ||
          !(GROQ_MODELS as readonly string[]).includes(settings.selectedModal)
        ) {
          settings.selectedModal = DEFAULT_CHAT_MODEL;
          settings.dalleImageSize = {
            "dall-e-2": "256x256",
            "dall-e-3": "1024x1024",
          };
        }
        // Only `settings` is persisted; zustand merges this partial over the
        // initial state, which supplies the actions and modal list.
        return state as unknown as SettingsType;
      },
    }
  ),
  shallow
);
const useTheme = create<ThemeType>()(
  persist(
    (set) => ({
      theme: "dark",
      setTheme: (theme) => {
        if (typeof window !== "undefined") {
          const root = document.documentElement;
          if (theme === "dark") {
            root.classList.add("dark");
          } else {
            root.classList.remove("dark");
          }
        }
        set(
          produce((state) => {
            state.theme = theme;
          })
        );
      },
    }),
    {
      name: "theme",
      onRehydrateStorage: () => (state) => {
        if (state && typeof window !== "undefined") {
          const root = document.documentElement;
          if (state.theme === "dark") {
            root.classList.add("dark");
          } else {
            root.classList.remove("dark");
          }
        }
      },
    }
  )
);
export const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
export const priority = [
  "Today",
  "Previous 7 Days",
  "Previous 30 Days",
  "This month",
].concat(months);

export const selectChatsHistory = (state: ChatType) => {
  const sortedData: Record<
    string,
    { title: string; id: string; month: string; month_id: number }[]
  > = {};
  // ✅ Use the userId directly from the store state
  const userId = state.userId || "guest";
  state.chatHistory.forEach((chat_id) => {
    const storageKey = `${userId}_${chat_id}`;
    const rawData = localStorage.getItem(storageKey);
    // Skip if the chat item doesn't exist in localStorage
    if (!rawData) return;
    let parsed;
    try {
      parsed = JSON.parse(rawData);
    } catch {
      return; // Skip malformed JSON entries safely
    }
    if (!parsed) return;
    const { title, id, createdAt } = parsed;
    const myDate = moment(createdAt || Date.now());
    if (!myDate.isValid()) return;
    const currentDate = moment();
    const month = myDate.toDate().getMonth();
    const data = {
      title: title || "New Chat",
      id: id || chat_id,
      month: months[month] || "Unknown",
      month_id: month,
    };
    if (myDate.isSame(currentDate, "day")) {
      if (!Object.prototype.hasOwnProperty.call(sortedData, "Today")) {
        sortedData["Today"] = [];
      }
      sortedData["Today"].push(data);
      return;
    } else if (currentDate.clone().subtract(7, "days").isBefore(myDate)) {
      if (!Object.prototype.hasOwnProperty.call(sortedData, "Previous 7 Days")) {
        sortedData["Previous 7 Days"] = [];
      }
      sortedData["Previous 7 Days"].push(data);
      return;
    } else if (currentDate.clone().subtract(30, "days").isBefore(myDate)) {
      if (!Object.prototype.hasOwnProperty.call(sortedData, "Previous 30 Days")) {
        sortedData["Previous 30 Days"] = [];
      }
      sortedData["Previous 30 Days"].push(data);
      return;
    } else {
      const monthName = months[month] || "Older";
      if (!Object.prototype.hasOwnProperty.call(sortedData, monthName)) {
        sortedData[monthName] = [];
      }
      sortedData[monthName].push(data);
    }
  });
  return sortedData;
};
export const selectUser = (state: AuthType) => state.user;
export const chatsLength = (state: ChatType) => state.chats.length > 0;
export const isDarkTheme = (state: ThemeType) => state.theme === "dark";
export const isChatSelected = (id: string) => (state: ChatType) =>
  state.chats[0]?.id === id;
export default useChat;
export { useAuth, useSettings, useTheme };
