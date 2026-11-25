// Lightweight attachment metadata is the only upload-related data that may be
// persisted. Extracted file text stays in browser memory and is sent to Groq
// through the in-flight prompt only.

export interface AttachmentMetadata {
  fileName: string;
  fileType: string;
  fileSize: number;
}

const MAX_FILE_NAME_LENGTH = 200;
const MAX_FILE_TYPE_LENGTH = 100;
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

function boundedString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

// Returns null for ordinary messages so RTDB records never gain empty or
// undefined metadata fields (Firebase rejects undefined values on write).
export function readAttachmentMetadata(value: unknown): AttachmentMetadata | null {
  if (!value || typeof value !== "object") return null;

  const source = value as Record<string, unknown>;
  const fileName = boundedString(source.fileName, MAX_FILE_NAME_LENGTH);
  const fileType = boundedString(source.fileType, MAX_FILE_TYPE_LENGTH);
  const rawSize = source.fileSize;
  const fileSize =
    typeof rawSize === "number" && Number.isFinite(rawSize) && rawSize >= 0
      ? Math.min(Math.floor(rawSize), MAX_FILE_SIZE_BYTES)
      : 0;

  if (!fileName && !fileType && !fileSize) return null;

  return {
    fileName: fileName || "attachment",
    fileType: fileType || "application/octet-stream",
    fileSize,
  };
}
