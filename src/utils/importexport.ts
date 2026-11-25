import useChat, {
  ChatMessageType,
  normalizeMessages,
  useSettings,
  useTheme,
} from "../store/store";
import { saveChatRecord } from "../services/chatDbService";

type BackupConversation = {
  id: string;
  createdAt: string;
  chats: ChatMessageType[];
};

type Backup = {
  conversations: Record<string, BackupConversation>;
  settings: Record<string, unknown>;
};

function storageKeys() {
  const userId = useChat.getState().userId || "guest";
  return { userId, historyKey: `chatHistory_${userId}`, prefix: `${userId}_` };
}

export function handleExportChats(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      const { prefix } = storageKeys();
      const backup: Backup = { conversations: {}, settings: {} };

      useChat.getState().chatHistory.forEach((chatId) => {
        const raw = localStorage.getItem(`${prefix}${chatId}`);
        if (!raw) return;
        try {
          const value = JSON.parse(raw) as Record<string, unknown>;
          if (!value || typeof value !== "object") return;
          const messages = Array.isArray(value.chats)
            ? (value.chats as ChatMessageType[])
            : Array.isArray(value.messages)
              ? (value.messages as ChatMessageType[])
              : [];
          backup.conversations[chatId] = {
            id: chatId,
            createdAt:
              typeof value.createdAt === "number"
                ? new Date(value.createdAt).toISOString()
                : new Date().toISOString(),
            chats: messages,
          };
        } catch {
          // Skip corrupt local entries instead of failing the whole export.
        }
      });

      backup.settings = {
        ...JSON.parse(JSON.stringify(useSettings.getState().settings)),
        theme: useTheme.getState().theme,
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `backup-${new Date().toISOString()}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      resolve(true);
    } catch (error) {
      console.error("Chat export failed:", error);
      reject(new Error("Error exporting chats"));
    }
  });
}

export function handleImportChats(file: File): Promise<boolean> {
  if (!file) return Promise.reject(new Error("No file selected"));
  if (file.type !== "application/json" && !/\.json$/i.test(file.name)) {
    return Promise.reject(new Error("File is not a JSON file"));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the backup file."));
    reader.onabort = () => reject(new Error("Backup import was cancelled."));

    reader.onload = (event) => {
      void (async () => {
        try {
          const parsed = JSON.parse(String(event.target?.result ?? "")) as Backup;
          const conversations =
            parsed && typeof parsed.conversations === "object" && parsed.conversations
              ? parsed.conversations
              : {};
          const settings =
            parsed && typeof parsed.settings === "object" && parsed.settings
              ? parsed.settings
              : {};
          const { userId, historyKey, prefix } = storageKeys();

          const importedIds = Object.keys(conversations).filter(
            (id) => conversations[id] && Array.isArray(conversations[id].chats)
          );

          importedIds.forEach((id) => {
            const conversation = conversations[id];
            const messages = conversation.chats;
            localStorage.setItem(
              `${prefix}${id}`,
              JSON.stringify({
                id,
                userId,
                title: "Imported Chat",
                messages,
                chats: messages,
                createdAt: Date.parse(conversation.createdAt) || Date.now(),
                updatedAt: Date.now(),
              })
            );
          });

          const merged = Array.from(
            new Set([...importedIds, ...useChat.getState().chatHistory])
          );
          localStorage.setItem(historyKey, JSON.stringify(merged));

          if (settings.theme === "light" || settings.theme === "dark") {
            useTheme.getState().setTheme(settings.theme);
          }

          const current = useSettings.getState().settings;
          useSettings.setState({
            settings: {
              ...current,
              sendChatHistory:
                typeof settings.sendChatHistory === "boolean"
                  ? settings.sendChatHistory
                  : current.sendChatHistory,
              systemMessage:
                typeof settings.systemMessage === "string"
                  ? settings.systemMessage
                  : current.systemMessage,
              useSystemMessageForAllChats:
                typeof settings.useSystemMessageForAllChats === "boolean"
                  ? settings.useSystemMessageForAllChats
                  : current.useSystemMessageForAllChats,
            },
          });

          // Imported chats must live at chats/${uid}/${chatId} too, otherwise
          // the next RTDB reconciliation removes them from the sidebar.
          if (userId !== "guest") {
            for (const id of importedIds) {
              const conversation = conversations[id];
              try {
                await saveChatRecord(userId, id, {
                  id,
                  title: "Imported Chat",
                  messages: normalizeMessages(conversation.chats),
                  createdAt: Date.parse(conversation.createdAt) || Date.now(),
                  updatedAt: Date.now(),
                });
              } catch (error) {
                console.warn(`Could not persist imported chat ${id} to RTDB:`, error);
              }
            }
          }

          await useChat.getState().loadUserHistory(userId);
          resolve(true);
        } catch (error) {
          reject(
            error instanceof Error ? error : new Error("Invalid backup file")
          );
        }
      })();
    };

    reader.readAsText(file);
  });
}
