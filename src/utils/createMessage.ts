import { ChatMessageType } from "../store/store";
import type { AttachmentMetadata } from "./attachmentMetadata";

// Native crypto UUID generator with fallback for older environments
function generateUniqueId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

export function createMessage(
  role: ChatMessageType["role"],
  content: string,
  type: ChatMessageType["type"] = "text",
  attachment?: AttachmentMetadata
): ChatMessageType {
  const message: ChatMessageType = {
    role,
    content,
    id: generateUniqueId(),
    type,
  };

  // Only bounded file metadata is attached. Extracted file text is passed
  // directly to Groq and is never included in a persisted message.
  if (attachment) {
    message.fileName = attachment.fileName;
    message.fileType = attachment.fileType;
    message.fileSize = attachment.fileSize;
  }

  return message;
}
