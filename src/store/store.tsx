import { db } from '../appwriteConfig';
import { ID, Query } from 'appwrite';

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/shallow";
import { produce } from "immer";
import moment from "moment";
import { ImageSize } from "../services/chatService";
// ✅ FIX 1: Groq models instead of OpenAI models.
// (Verify current IDs at console.groq.com/docs/models)
// Replace the old array with this single constant
const DEFAULT_MODEL = import.meta.env.VITE_AI_MODEL || "openai/gpt-oss-120b";
export interface ChatMessageType {
  role: "user" | "assistant" | "system";
  content: string;
  type: "text" | "image_url";
  id: string;
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
export type ModalList = (typeof DEFAULT_MODEL)[number];
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
  loadUserHistory: (userId: string) => void;
  addChat: (chat: ChatMessageType, index?: number) => void;
  editChatMessage: (chat: string, updateIndex: number) => void;
  addNewChat: () => void;
  saveChats: () => void;
  viewSelectedChat: (chatId: string) => void;
  resetChatAt: (index: number) => void;
  handleDeleteChats: (chatid: string) => void;
  editChatsTitle: (id: string, title: string) => void;
  clearAllChats: () => void;
}
export const apikey = import.meta.env.VITE_GROQ_API_KEY || "";
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
  // Removed `apikey` and `setApiKey` since it's now handled globally via .env
}
// Helper to retrieve the current logged-in Appwrite user's ID from useAuth
// In src/store/store.ts, update getCurrentUserId:
const getCurrentUserId = () => {
  try {
    // Directly query the current state of the auth store
    const authState = (useAuth as any).getState?.();
    const userId = authState?.user?.id || authState?.user?.$id;
    return userId && userId.trim() !== "" ? userId : "guest";
  } catch (err) {
    return "guest";
  }
};
const DATABASE_ID = import.meta.env.VITE_APPWRITE_DB_ID;
const COLLECTION_ID = import.meta.env.VITE_APPWRITE_TABLE;
export const useChat = create<ChatType>((set, get) => ({
  userId: "guest",
  chats: [],
  chatHistory: [],

  // 🚀 Load user chat history from Appwrite Cloud
  loadUserHistory: async (userId: string) => {
    const activeUserId = userId && userId.trim() !== "" ? userId : "guest";
    const historyKey = `chatHistory_${activeUserId}`;
    
    // 1. Instantly set local cache state first to avoid UI flicker
    const stored = localStorage.getItem(historyKey);
    set(
      produce((state: ChatType) => {
        state.userId = activeUserId;
        state.chatHistory = stored ? JSON.parse(stored) : [];
        state.chats = [];
      })
    );

    // 2. Fetch remote documents from Appwrite if authenticated
    if (activeUserId !== "guest") {
      try {
        const response = await db.listDocuments(
          DATABASE_ID,
          COLLECTION_ID,
          [Query.equal('userId', activeUserId)]
        );

        // Fixed TypeScript type casting for string[]
        const remoteHistory = Array.from(
          new Set(response.documents.map((doc: any) => (doc.chatId || doc.$id) as string))
        ) as string[];

        set(
          produce((state: ChatType) => {
            state.chatHistory = remoteHistory;
          })
        );

        localStorage.setItem(historyKey, JSON.stringify(remoteHistory));
      } catch (error) {
        console.error("Appwrite history fetch failed, relying on local cache:", error);
      }
    }
  },

  addChat: (chat, index) => {
    set(
      produce((state: ChatType) => {
        if (index || index === 0) state.chats[index] = chat;
        else {
          state.chats.push(chat);
        }
      })
    );
    if (chat.role === "assistant" && chat.content) {
      get().saveChats();
    }
  },

  editChatMessage: (chat, updateIndex) => {
    set(
      produce((state: ChatType) => {
        state.chats[updateIndex].content = chat;
      })
    );
  },

  addNewChat: () => {
    set(
      produce((state: ChatType) => {
        state.chats = []; // Clear active conversation window
      })
    );
  },

  // ☁️ Save current conversation thread to Appwrite and localStorage
 // ☁️ Save current conversation thread to Appwrite and localStorage
saveChats: async () => {
  if (!get().chats || get().chats.length === 0) return;

  // 🛡️ Safely check if the first chat object exists, otherwise generate a new ID
  let chat_id = get().chats[0]?.id || ID.unique();
  const userId = get().userId || "guest";
  const chatKey = `${userId}_${chat_id}`;
  const historyKey = `chatHistory_${userId}`;
  
  let title;
  if (localStorage.getItem(chatKey)) {
    try {
      const localData = JSON.parse(localStorage.getItem(chatKey) ?? "{}");
      if (localData.isTitleEdited) {
        title = localData.title;
      }
    } catch (e) {
      console.warn("Failed to parse local storage chat data:", e);
    }
  }
  
  // Safe extraction for fallback title
  const computedTitle = title 
    ? title 
    : (get().chats[0]?.content?.slice(0, 30) || "New Conversation");

  // Save locally
  const data = {
    id: chat_id,
    createdAt: new Date().toISOString(),
    chats: get().chats,
    title: computedTitle,
    isTitleEdited: Boolean(title),
  };

  localStorage.setItem(chatKey, JSON.stringify(data));

  const currentHistory = get().chatHistory;
  if (!currentHistory.includes(chat_id)) {
    const updatedHistory = [...currentHistory, chat_id];
    localStorage.setItem(historyKey, JSON.stringify(updatedHistory));
    
    set(
      produce((state: ChatType) => {
        if (!state.chatHistory.includes(chat_id)) {
          state.chatHistory.push(chat_id);
        }
      })
    );
  }

  // ☁️ Appwrite Cloud Persistence
  if (userId !== "guest") {
    try {
      // 1. Safely handle string payload size limit (max ~60,000 chars)
      const rawContent = JSON.stringify(get().chats);
      const safeContent = rawContent.length > 60000 
        ? JSON.stringify(get().chats.slice(-15)) // Preserve last 15 messages if thread is long
        : rawContent;

      const payload = {
        userId: userId,
        chatId: chat_id,
        role: get().chats[get().chats.length - 1]?.role || "user",
        content: safeContent,
        title: computedTitle,
        timestamp: new Date().toISOString(),
      };

      // 2. Check if this conversation document already exists in Appwrite
      const existingDocs = await db.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [Query.equal("chatId", chat_id)]
      );

      if (existingDocs.documents.length > 0) {
        // Update existing row
        const docId = existingDocs.documents[0].$id;
        await db.updateDocument(
          DATABASE_ID,
          COLLECTION_ID,
          docId,
          payload
        );
        console.log("✅ Successfully updated conversation in Appwrite Cloud");
      } else {
        // Create new row
        await db.createDocument(
          DATABASE_ID,
          COLLECTION_ID,
          ID.unique(),
          payload
        );
        console.log("✅ Successfully created conversation in Appwrite Cloud");
      }
    } catch (err) {
      console.error("Failed to sync chat to Appwrite cloud:", err);
    }
  }
},

  // 🔍 View a selected conversation
  viewSelectedChat: async (chatId) => {
    const userId = get().userId;
    const chatKey = `${userId}_${chatId}`;
    
    const raw = localStorage.getItem(chatKey);
    if (raw) {
      set(
        produce((state: ChatType) => {
          state.chats = JSON.parse(raw)?.chats ?? [];
        })
      );
      return;
    }

    if (userId !== "guest") {
      try {
        const response = await db.listDocuments(
          DATABASE_ID,
          COLLECTION_ID,
          [
            Query.equal('userId', userId),
            Query.equal('chatId', chatId)
          ]
        );

        if (response.documents.length > 0) {
          const latestDoc: any = response.documents[response.documents.length - 1];
          const parsedChats = typeof latestDoc.content === 'string' 
            ? JSON.parse(latestDoc.content) 
            : latestDoc.content;

          set(
            produce((state: ChatType) => {
              state.chats = parsedChats;
            })
          );

          localStorage.setItem(chatKey, JSON.stringify({
            id: chatId,
            chats: parsedChats,
            title: latestDoc.title
          }));
        }
      } catch (err) {
        console.error("Failed to load conversation from Appwrite:", err);
      }
    }
  },

  resetChatAt: (index) => {
    set(
      produce((state: ChatType) => {
        state.chats[index].content = "";
      })
    );
  },

  // 🗑️ Delete chat session locally and on Appwrite Cloud
  handleDeleteChats: async (chatid) => {
    const userId = get().userId;
    const chatKey = `${userId}_${chatid}`;
    const historyKey = `chatHistory_${userId}`;

    set(
      produce((state: ChatType) => {
        state.chatHistory = state.chatHistory.filter((id) => id !== chatid);
        state.chats = [];
        localStorage.removeItem(chatKey);
        localStorage.setItem(historyKey, JSON.stringify(state.chatHistory));
      })
    );

    if (userId !== "guest") {
      try {
        const response = await db.listDocuments(
          DATABASE_ID,
          COLLECTION_ID,
          [
            Query.equal('userId', userId),
            Query.equal('chatId', chatid)
          ]
        );

        for (const doc of response.documents) {
          await db.deleteDocument(DATABASE_ID, COLLECTION_ID, doc.$id);
        }
      } catch (err) {
        console.error("Failed to delete chat from Appwrite:", err);
      }
    }
  },

  editChatsTitle: (id, title) => {
    const userId = get().userId;
    const chatKey = `${userId}_${id}`;
    set(
      produce((state: ChatType) => {
        const chatStr = localStorage.getItem(chatKey);
        if (!chatStr) return;
        const chat = JSON.parse(chatStr);
        chat.title = title;
        chat.isTitleEdited = true;
        localStorage.setItem(chatKey, JSON.stringify(chat));
      })
    );
  },

  clearAllChats: async () => {
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

    if (userId !== "guest") {
      try {
        const response = await db.listDocuments(
          DATABASE_ID,
          COLLECTION_ID,
          [Query.equal('userId', userId)]
        );

        for (const doc of response.documents) {
          await db.deleteDocument(DATABASE_ID, COLLECTION_ID, doc.$id);
        }
      } catch (err) {
        console.error("Failed to clear remote chats on Appwrite:", err);
      }
    }
  },
}));

const useAuth = create<AuthType>()(
  persist(
    (set) => ({
      token: localStorage.getItem("token") || "",
      apikey: localStorage.getItem("apikey") || "",
      user: {
        id: "",
        name: "Your name?",
        email: "",
        avatar: "/imgs/default-avatar.jpg",
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
            state.user = user;
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
selectedModal: "openai/gpt-oss-120b",
        dalleImageSize: { "dall-e-2": "256x256", "dall-e-3": "1024x1024" },
      },
      modalsList: DEFAULT_MODEL,
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
        const state = persistedState as SettingsType;
        const valid = (DEFAULT_MODEL as readonly string[]).includes(
          state?.settings?.selectedModal as string
        );
        if (version < 2 || !valid) {
          state.settings.selectedModal = "openai/gpt-oss-120b";
          state.settings.dalleImageSize = {
            "dall-e-2": "256x256",
            "dall-e-3": "1024x1024",
          };
        }
        return state;
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
  "Januray",
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
    const myDate = moment(createdAt || new Date(), "YYYY-MM-DD");
    const currentDate = moment();
    const month = myDate.toDate().getMonth();
    const data = {
      title: title || "New Chat",
      id: id || chat_id,
      month: months[month] || "Unknown",
      month_id: month,
    };
    if (myDate.isSame(currentDate.format("YYYY-MM-DD"))) {
      if (!sortedData.hasOwnProperty("Today")) {
        sortedData["Today"] = [];
      }
      sortedData["Today"].push(data);
      return;
    } else if (currentDate.clone().subtract(7, "days").isBefore(myDate)) {
      if (!sortedData.hasOwnProperty("Previous 7 Days")) {
        sortedData["Previous 7 Days"] = [];
      }
      sortedData["Previous 7 Days"].push(data);
      return;
    } else if (currentDate.clone().subtract(30, "days").isBefore(myDate)) {
      if (!sortedData.hasOwnProperty("Previous 30 Days")) {
        sortedData["Previous 30 Days"] = [];
      }
      sortedData["Previous 30 Days"].push(data);
      return;
    } else {
      const monthName = months[month] || "Older";
      if (!sortedData.hasOwnProperty(monthName)) {
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