// Best-effort client-side text extraction for non-image attachments.
// The returned text is bundled into the Groq user prompt so answers stay
// grounded in the uploaded file content. It is never written to RTDB.

const TEXT_FILE_PATTERN =
  /\.(txt|md|markdown|json|js|jsx|ts|tsx|csv|html?|css|scss|xml|yaml|yml|toml|ini|log|py|java|rb|go|rs|sql|sh)$/i;

// Keep prompts and RTDB records well inside their size limits.
const MAX_EXTRACTED_TEXT = 100_000;

export const ATTACHED_FILE_SYSTEM_MESSAGE = `The user has attached a file. The text inside <attached_file> is the actual content of that file and is the only file content available to you.

Answer the user's question directly from that attached content. Never ask the user to paste, upload, or attach the file again, and never claim that you cannot see it. Quote or summarize the relevant parts when useful. If the answer is not present in the provided text, say exactly what is missing from that text.`;

// Extra instruction for the rare path where useBot regenerates an attached-file
// turn from in-memory context instead of UserQuery's direct submission.
export function buildAttachedFilePrompt(
  fileName: string,
  fileType: string,
  extractedText: string,
  userQuestion: string
): string {
  const safeName = fileName.trim() || "attachment";
  const safeType = fileType.trim() || "unknown";
  const question = userQuestion.trim() || "What can you tell me about this file?";
  const content = extractedText.trim() || "[The attached file contained no readable text.]";

  return [
    "Use the attached file below as the source of truth.",
    `<attached_file name="${escapeXmlAttribute(safeName)}" type="${escapeXmlAttribute(safeType)}">`,
    content,
    "</attached_file>",
    `<user_question>${question}</user_question>`,
  ].join("\n");
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function extractFileText(file: File): Promise<string> {
  const isTextFile =
    file.type.startsWith("text/") ||
    file.type === "application/json" ||
    file.type === "application/xml" ||
    TEXT_FILE_PATTERN.test(file.name);

  if (isTextFile) {
    return (await file.text()).trim().slice(0, MAX_EXTRACTED_TEXT);
  }

  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    // Compressed PDFs decoded as UTF-8 are mojibake. Only surface the text when
    // it is a genuinely uncompressed/lightweight PDF.
    const raw = await file.text();
    const rawText = raw.replace(/\0/g, "").trim();
    if (rawText.startsWith("%PDF-") || raw.length > MAX_EXTRACTED_TEXT) {
      return `[Attached PDF: ${file.name}]`;
    }
    return rawText.slice(0, MAX_EXTRACTED_TEXT) || `[Attached PDF: ${file.name}]`;
  }

  return `[Attached File: ${file.name} (${file.type || "unknown"})]`;
}
