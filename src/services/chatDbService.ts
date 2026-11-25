import {
  get,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  remove,
  set,
  update,
  type DataSnapshot,
  type Unsubscribe,
} from "firebase/database";
import { auth, rtdb } from "../config/firebase";
import { isValidGeneratedImageSource } from "../utils/cropGeneratedImage";
import { readAttachmentMetadata } from "../utils/attachmentMetadata";
import type { ChatMessageType } from "../store/store";

// Realtime Database keeps the full conversation thread at
// `chats/${uid}/${chatId}`. Only numeric millisecond timestamps are used so
// ordering stays deterministic on every device.
export interface PersistedChat {
  id: string;
  userId: string;
  title: string;
  messages: ChatMessageType[];
  createdAt: number;
  updatedAt: number;
  isTitleEdited?: boolean;
}

const MAX_MESSAGE_LENGTH = 20_000;
const MAX_MESSAGES_PER_CHAT = 200;

let activeChatUnsubscribe: Unsubscribe | null = null;
let activeChatUid: string | null = null;

// Every RTDB access must be tied to the currently authenticated Firebase user.
// This prevents stale app state from issuing PERMISSION_DENIED reads/writes
// after sign-out or during an account switch.
function assertAuthenticatedUid(uid: string): void {
  if (!uid || uid === "guest") {
    throw new Error("A signed-in user is required to access chats.");
  }
  if (auth.currentUser?.uid !== uid) {
    throw new Error("Not authenticated for this user.");
  }
}

function toTimestamp(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

function sanitizeMessage(message: Partial<ChatMessageType>, index: number): ChatMessageType {
  const rawContent =
    typeof message.content === "string"
      ? message.content
      : message.content == null
        ? ""
        : String(message.content);

  // Only a real generated payload (bounded jpeg/png/webp Data URL or valid
  // remote URL) is persisted on an assistant image message. Legacy stock paths
  // such as /imgs/bot.webp and oversized/invalid blobs are dropped entirely.
  const trimmed = rawContent.trim();
  const isAssistantImage = message.role === "assistant" && message.type === "image_url";
  const isGeneratedImage = isAssistantImage && isValidGeneratedImageSource(trimmed);
  const isBase64Payload =
    /data:[^;,\s]*;base64,/i.test(rawContent) ||
    /^[a-z0-9+/=\r\n]{1000,}$/i.test(trimmed);

  const content = isAssistantImage && !isGeneratedImage
    ? ""
    : isGeneratedImage
      ? trimmed
      : isBase64Payload
        ? "[Image attachment]"
        : rawContent.length > MAX_MESSAGE_LENGTH
          ? `${rawContent.slice(0, MAX_MESSAGE_LENGTH)}\n[truncated]`
          : rawContent;

  const role =
    message.role === "user" || message.role === "assistant" || message.role === "system"
      ? message.role
      : "user";

  const sanitized: ChatMessageType = {
    role,
    content,
    type: message.type === "image_url" ? "image_url" : "text",
    id:
      typeof message.id === "string" && message.id
        ? message.id
        : `restored_${index}_${Date.now()}`,
  };

  // Persist only bounded file metadata. Never write the File/Blob itself or the
  // extracted text that was used to build the in-memory Groq prompt.
  const attachment = readAttachmentMetadata(message);
  if (attachment) {
    sanitized.fileName = attachment.fileName;
    sanitized.fileType = attachment.fileType;
    sanitized.fileSize = attachment.fileSize;
  }

  return sanitized;
}

function normalizeChat(raw: unknown, uid: string, chatId: string): PersistedChat | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;

  let sourceMessages = value.messages;
  if (!Array.isArray(sourceMessages) && typeof value.content === "string") {
    // Backwards compatibility with older Firestore-shaped records.
    try {
      sourceMessages = JSON.parse(value.content);
    } catch {
      sourceMessages = [];
    }
  }

  // RTDB serializes arrays as numeric-keyed objects and may omit empty slots.
  // Object.values + filter(Boolean) yields a dense, ordered message list.
  const rawMessages: unknown[] = Array.isArray(sourceMessages)
    ? Array.from(sourceMessages)
    : sourceMessages && typeof sourceMessages === "object"
      ? Object.values(sourceMessages as Record<string, unknown>)
      : [];

  const messages = rawMessages
    .filter(Boolean)
    .slice(-MAX_MESSAGES_PER_CHAT)
    .map((message, index) => sanitizeMessage((message || {}) as Partial<ChatMessageType>, index))
    .filter((message) => message.content.length > 0);

  const now = Date.now();
  const createdAt = toTimestamp(value.createdAt, now);
  const updatedAt = toTimestamp(value.updatedAt, createdAt);
  const title =
    typeof value.title === "string" && value.title.trim()
      ? value.title
      : "New Chat";

  return {
    // The RTDB path key is authoritative; a stale embedded id would make
    // viewSelectedChat read the wrong node.
    id: chatId,
    userId: typeof value.userId === "string" && value.userId ? value.userId : uid,
    title,
    messages,
    createdAt,
    updatedAt,
    isTitleEdited: Boolean(value.isTitleEdited),
  };
}

function parseChatsSnapshot(snapshot: DataSnapshot, uid: string): PersistedChat[] {
  const value = snapshot.val();
  if (!value || typeof value !== "object") return [];

  return Object.entries(value as Record<string, unknown>)
    .map(([chatId, raw]) => normalizeChat(raw, uid, chatId))
    .filter((chat): chat is PersistedChat => chat !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function createChatId(): string {
  return (
    push(ref(rtdb, "chats")).key ||
    `chat_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  );
}

export async function listUserChats(uid: string): Promise<PersistedChat[]> {
  assertAuthenticatedUid(uid);
  const snapshot = await get(ref(rtdb, `chats/${uid}`));
  return parseChatsSnapshot(snapshot, uid);
}

export async function getChatRecord(
  uid: string,
  chatId: string
): Promise<PersistedChat | null> {
  assertAuthenticatedUid(uid);
  const snapshot = await get(ref(rtdb, `chats/${uid}/${chatId}`));
  return snapshot.exists() ? normalizeChat(snapshot.val(), uid, chatId) : null;
}

export async function saveChatRecord(
  uid: string,
  chatId: string,
  chat: Omit<PersistedChat, "userId">
): Promise<void> {
  assertAuthenticatedUid(uid);
  // Apply the same sanitation and size cap on write as on read so a long chat
  // can never exceed RTDB node limits.
  const messages = sanitizeChatMessages(chat.messages)
    .filter((message) => message.content.length > 0)
    .slice(-MAX_MESSAGES_PER_CHAT);
  await set(ref(rtdb, `chats/${uid}/${chatId}`), {
    id: chatId,
    userId: uid,
    title: chat.title,
    messages,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    isTitleEdited: Boolean(chat.isTitleEdited),
  });
}

export async function patchChatRecord(
  uid: string,
  chatId: string,
  patch: Partial<Pick<PersistedChat, "title" | "isTitleEdited">>
): Promise<void> {
  assertAuthenticatedUid(uid);
  await update(ref(rtdb, `chats/${uid}/${chatId}`), {
    ...patch,
    updatedAt: Date.now(),
  });
}

export async function deleteChatRecord(uid: string, chatId: string): Promise<void> {
  assertAuthenticatedUid(uid);
  await remove(ref(rtdb, `chats/${uid}/${chatId}`));
}

export async function clearUserChats(uid: string): Promise<void> {
  assertAuthenticatedUid(uid);
  await remove(ref(rtdb, `chats/${uid}`));
}

export function stopWatchingUserChats(): void {
  activeChatUnsubscribe?.();
  activeChatUnsubscribe = null;
  activeChatUid = null;
}

// One listener per signed-in account. Calling this again for the same uid is a
// no-op; calling it for another uid detaches the previous listener first so no
// chat data can leak across accounts.
export function watchUserChats(
  uid: string,
  onChats: (chats: PersistedChat[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  if (!uid || auth.currentUser?.uid !== uid) {
    const message = "Not authenticated for this user; chat listener not attached.";
    console.warn(message);
    onError?.(new Error(message));
    return () => undefined;
  }
  if (activeChatUid === uid && activeChatUnsubscribe) return activeChatUnsubscribe;

  stopWatchingUserChats();
  activeChatUid = uid;

  const chatsQuery = query(ref(rtdb, `chats/${uid}`), orderByChild("updatedAt"));
  const unsubscribe = onValue(
    chatsQuery,
    (snapshot) => {
      try {
        onChats(parseChatsSnapshot(snapshot, uid));
      } catch (error) {
        console.error("Failed to apply Realtime Database chat snapshot:", error);
        onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    },
    (error) => {
      console.error("Realtime Database chat listener failed:", error);
      onError?.(error);
    }
  );

  activeChatUnsubscribe = unsubscribe;
  return unsubscribe;
}

export function sanitizeChatMessages(messages: ChatMessageType[]): ChatMessageType[] {
  return messages.map((message, index) => sanitizeMessage(message, index));
}
