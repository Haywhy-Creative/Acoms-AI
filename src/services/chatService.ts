
import { useSettings } from "../store/store";
import Swal from "sweetalert2";
import { buildAttachedFilePrompt } from "../utils/fileText";

const GROQ_CHAT_COMPLETIONS_URL =
  "https://api.groq.com/openai/v1/chat/completions";

// Groq's active free-tier multimodal vision model.
const GROQ_VISION_MODEL = "qwen/qwen3.8-27b";

// ============================================================
// OPENAI-COMPATIBLE MESSAGE CONTENT (TEXT + VISION)
// ============================================================
// ChatMessageType in the store stays unchanged (`content: string`).
// These types are only used at the Groq request boundary so we can send
// multi-content user messages (text + base64 image_url) to the model.

export type GroqTextPart = { type: "text"; text: string };
export type GroqImagePart = {
  type: "image_url";
  image_url: { url: string };
};
export type GroqMessagePart = GroqTextPart | GroqImagePart;
export type GroqMessageContent = string | GroqMessagePart[];

export interface GroqRequestMessage {
  role: "user" | "assistant" | "system";
  content: GroqMessageContent;
}

// UserQuery owns the AI call for freshly submitted prompts. This marker keeps
// useBot from dispatching a second, duplicate request for the same placeholder.
const externallyHandledMessageIds = new Set<string>();

export function markAssistantAsHandled(id: string) {
  externallyHandledMessageIds.add(id);
}

export function isAssistantHandled(id: string) {
  return externallyHandledMessageIds.has(id);
}

// Editing a user message clears the following assistant reply; allow the
// normal useBot pipeline to regenerate it instead of staying marked as handled.
export function clearAssistantHandled(id: string) {
  externallyHandledMessageIds.delete(id);
  startedGroqTurns.delete(id);
}

// Attached-file text lives only in memory. Stash the raw pieces, not a fully
// built prompt, so an edited question can be rebuilt with the current text.
export interface AttachedFileContext {
  fileName: string;
  fileType: string;
  extractedText: string;
}

const attachedFileContextByTurn = new Map<string, AttachedFileContext>();
// Prompts can contain up to 100k characters of file text. Keep only the most
// recent turns so a long session cannot grow this in-memory map without bound.
const MAX_STASHED_FILE_CONTEXTS = 12;

export function stashAttachedFileContext(
  turnKey: string,
  context: AttachedFileContext
): void {
  if (!turnKey || !context) return;
  attachedFileContextByTurn.delete(turnKey);
  attachedFileContextByTurn.set(turnKey, context);
  while (attachedFileContextByTurn.size > MAX_STASHED_FILE_CONTEXTS) {
    const oldestKey = attachedFileContextByTurn.keys().next().value;
    if (!oldestKey) break;
    attachedFileContextByTurn.delete(oldestKey);
  }
}

export function takeAttachedFileContext(
  turnKey: string,
  userQuestion?: string
): string | null {
  const context = attachedFileContextByTurn.get(turnKey) ?? null;
  if (turnKey) attachedFileContextByTurn.delete(turnKey);
  if (!context) return null;
  return buildAttachedFilePrompt(
    context.fileName,
    context.fileType,
    context.extractedText,
    userQuestion ?? ""
  );
}

export function clearAttachedFileContext(turnKey: string): void {
  if (turnKey) attachedFileContextByTurn.delete(turnKey);
}

// A single assistant placeholder must never produce two concurrent requests.
// React StrictMode, effect re-runs and RTDB rehydration can all re-trigger the
// send path; the placeholder id is used as the stable turn key.
//
// The controller is owned by chatService, not by a React effect. Caller aborts
// are deliberately not forwarded: an effect cleanup/StrictMode remount must
// never abort the stream that is already writing into this placeholder. Only
// an explicit account switch/sign-out or message edit cancels a turn.
const activeGroqTurns = new Map<string, AbortController>();

// Image generation uses a separate abort controller because it does not go
// through fetchResults. Registering it here lets sign-out/account switch cancel
// a pending image turn instead of leaving the composer busy until it times out.
const activeImageTurns = new Map<string, AbortController>();

// useBot tracks ownership by assistant placeholder id. Keeping the marker in
// this module lets an edit cancel a turn that is still owned by a component.
const startedGroqTurns = new Set<string>();

export function isGroqTurnStarted(turnKey: string): boolean {
  return startedGroqTurns.has(turnKey);
}

export function markGroqTurnStarted(turnKey: string): void {
  if (turnKey) startedGroqTurns.add(turnKey);
}

export function clearGroqTurnStarted(turnKey: string): void {
  if (turnKey) startedGroqTurns.delete(turnKey);
}

export function beginImageTurn(turnKey: string): AbortController | null {
  if (!turnKey || activeImageTurns.has(turnKey)) return null;
  const controller = new AbortController();
  activeImageTurns.set(turnKey, controller);
  return controller;
}

export function endImageTurn(
  turnKey: string,
  controller: AbortController
): void {
  if (activeImageTurns.get(turnKey) === controller) {
    activeImageTurns.delete(turnKey);
  }
}

export function cancelImageTurn(turnKey: string): void {
  if (!turnKey) return;
  const controller = activeImageTurns.get(turnKey);
  if (!controller) return;
  activeImageTurns.delete(turnKey);
  controller.abort();
}

// Shared, user-facing refusal string. Both the SweetAlert filter and the useBot
// fallback use it so a blocked prompt is always persisted with the right text.
export const COMPUTING_REFUSAL =
  "I'm a Computing and Informatics AI assistant. I can only help with questions related to Computer Science, Cybersecurity, Software Engineering, Information Technology, Data Science, AI, Networking, Programming, and other computing-related fields.";

export type FetchResultStatus =
  | "completed"
  | "blocked"
  | "suppressed"
  | "aborted";

// Called on sign-out / account switch so an in-flight turn from the previous
// session cannot suppress the first request of the next one.
export function resetGroqTurnState(): void {
  externallyHandledMessageIds.clear();
  attachedFileContextByTurn.clear();
  startedGroqTurns.clear();
  const controllers = [
    ...Array.from(activeGroqTurns.values()),
    ...Array.from(activeImageTurns.values()),
  ];
  activeGroqTurns.clear();
  activeImageTurns.clear();
  controllers.forEach((controller) => controller.abort());
}

// Editing an assistant turn reuses its placeholder id. Cancel the old request
// explicitly before beginning the replacement regeneration.
export function cancelGroqTurn(turnKey: string): void {
  const controller = activeGroqTurns.get(turnKey);
  if (controller) {
    activeGroqTurns.delete(turnKey);
    controller.abort();
  }
  startedGroqTurns.delete(turnKey);
  cancelImageTurn(turnKey);
}

function beginGroqTurn(turnKey: string): AbortController | null {
  if (activeGroqTurns.has(turnKey)) return null;
  const controller = new AbortController();
  activeGroqTurns.set(turnKey, controller);
  return controller;
}

function endGroqTurn(turnKey: string, controller: AbortController): void {
  // Never delete a newer turn that might have replaced this key.
  if (activeGroqTurns.get(turnKey) === controller) {
    activeGroqTurns.delete(turnKey);
  }
}

// Groq rejects message objects that carry unknown keys (id/createdAt/etc.).
// Only role + content may cross the request boundary.
function sanitizeGroqMessages(
  messages: GroqRequestMessage[]
): GroqRequestMessage[] {
  return messages
    .filter(
      (message) =>
        message &&
        (message.role === "user" ||
          message.role === "assistant" ||
          message.role === "system")
    )
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

function groqHttpError(response: Response, body: string): Error {
  const detail = body.replace(/\s+/g, " ").trim().slice(0, 240);
  console.error(`❌ Groq API ${response.status} ${response.statusText}:`, detail || "(empty error body)");
  return new Error(
    `Groq API ${response.status} ${response.statusText}${
      detail ? `: ${detail}` : ""
    }`
  );
}

function getMessageText(content: GroqMessageContent): string {
  if (typeof content === "string") return content;
  return content
    .filter((part): part is GroqTextPart => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

// Attached-file prompts wrap the real question in <user_question>. Use only
// that for topic filtering so words inside the attached document cannot make a
// valid question look unrelated.
function getLatestQuestion(messages: GroqRequestMessage[]): string {
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  if (!latestUserMessage) return "";

  const text = getMessageText(latestUserMessage.content).trim();
  const taggedQuestion = text.match(/<user_question>([\s\S]*?)<\/user_question>/i);
  return (taggedQuestion ? taggedQuestion[1] : text).trim();
}

function isImageUrlPart(part: GroqMessagePart): part is GroqImagePart {
  return (
    part.type === "image_url" &&
    typeof part.image_url?.url === "string" &&
    part.image_url.url.length > 0
  );
}

function hasVisionPayload(messages: GroqRequestMessage[]): boolean {
  // Only the latest user turn decides the request mode. Attached-file prompts
  // embed arbitrary document text, which must never flip a text Q&A to vision.
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  if (!latestUserMessage) return false;

  if (Array.isArray(latestUserMessage.content)) {
    return latestUserMessage.content.some(isImageUrlPart);
  }

  // Raw data URLs are supported, but only when the entire string is one.
  return /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+$/i.test(
    latestUserMessage.content.trim()
  );
}

// ============================================================
// COMPUTING & INFORMATICS SYSTEM INSTRUCTION
// ============================================================

const COMPUTING_SYSTEM_MESSAGE = `
You are an AI assistant dedicated to the Faculty of Computing and Informatics.

Your main purpose is to help students and users with Computing and
Informatics-related questions.

You can answer questions about:

Computer Science, Cybersecurity, Information Technology,
Information Systems, Software Engineering, Computer Engineering,
Programming, Web Development, Mobile Development, Databases,
SQL, NoSQL, Data Structures, Algorithms, Operating Systems,
Computer Architecture, Computer Networks, Networking, Cloud Computing,
DevOps, Distributed Systems, Artificial Intelligence, Machine Learning,
Deep Learning, Data Science, Computer Vision, Natural Language Processing,
Cryptography, Digital Forensics, Ethical Hacking, Penetration Testing,
Network Security, Application Security, Software Testing, APIs,
Backend Development, Frontend Development, Full-stack Development,
Embedded Systems, IoT, Robotics related to computing, Computer Graphics,
UI/UX related to technology, Blockchain, Programming Languages,
Git, GitHub, Linux, Docker, Kubernetes, and other closely related
Computing and Informatics subjects.

You may also answer interdisciplinary questions when the COMPUTING or
TECHNOLOGY aspect is the main subject.

Examples of allowed questions:

- How is AI used in agriculture?
- How can IoT be used in farming?
- How can I build a hospital management system?
- How is cybersecurity used in hospitals?
- How can I develop an accounting application?

These are allowed because they involve computing or technology.

Do NOT answer questions whose main subject is unrelated to Computing
and Informatics.

Examples of questions that should NOT be answered:

- How do I treat malaria?
- What medicine should I take?
- How do I plant maize?
- What fertilizer should I use?
- Explain human anatomy.
- What are the symptoms of a disease?
- Explain accounting principles.
- Explain civil engineering structures.

For unrelated questions, respond ONLY with:

"I'm a Computing and Informatics AI assistant. I can only help with
questions related to Computer Science, Cybersecurity, Software
Engineering, Information Technology, Data Science, AI, Networking,
Programming, and other computing-related fields."

Do not provide the unrelated answer.

For cybersecurity questions, provide legal, ethical, educational,
defensive, and authorized security guidance.

Always prioritize Computing and Informatics.
`;

// ============================================================
// SIMPLE FRONTEND CHECK
// ============================================================
//
// This is intentionally small.
// It only blocks obviously unrelated questions.
// The system prompt above performs the detailed AI-level filtering.
//

const OBVIOUSLY_UNRELATED_TOPICS = [
  "how to treat malaria",
  "treat malaria",
  "malaria treatment",
  "what medicine should i take",
  "what medicine should i use",
  "how do i plant maize",
  "how to plant maize",
  "planting maize",
  "crop production",
  "animal husbandry",
  "veterinary medicine",
  "human anatomy",
  "medical treatment",
  "symptoms of malaria",
  "symptoms of cancer",
  "dosage of medicine",
];

function isObviouslyUnrelated(question: string): boolean {
  const text = question.toLowerCase().trim();

  return OBVIOUSLY_UNRELATED_TOPICS.some((topic) =>
    text.includes(topic)
  );
}

// ============================================================
// API KEY
// ============================================================

export function getGroqApiKey(): string {
  const key =
    import.meta.env.VITE_GROQ_API_KEY ||
    localStorage.getItem("apikey");

  if (!key) {
    throw new Error(
      "No API key found. Add it in the UI or as VITE_GROQ_API_KEY in .env"
    );
  }

  return key;
}

// ============================================================
// GROQ MODELS
// ============================================================

export const GROQ_MODELS = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.8-27b",
] as const;

function resolveModel(selected: string): string {
  return (GROQ_MODELS as readonly string[]).includes(selected)
    ? selected
    : "openai/gpt-oss-120b";
}

// ============================================================
// CHAT / GROQ
// ============================================================

export async function fetchResults(
  messages: GroqRequestMessage[],
  callerSignal: AbortSignal,
  onData: (data: string) => void,
  onCompletion: () => void,
  turnKey?: string
): Promise<FetchResultStatus> {
  let turnController: AbortController | null = null;
  try {
    if (turnKey) {
      turnController = beginGroqTurn(turnKey);
      if (!turnController) {
        console.log(
          `⏭️ duplicate Groq request suppressed for turn ${turnKey}`
        );
        // Do not call onCompletion here: the winning request still owns this
        // placeholder. Callers use this status to leave the reply untouched.
        return "suppressed";
      }
    }

    // Own the signal for the whole request lifetime. Caller signals are only
    // used for untyped/legacy calls without a turn key; forwarding them here
    // would let a React effect cleanup kill its own active stream.
    const requestSignal = turnController?.signal ?? callerSignal;

    console.log(`🟢 fetchResults CALLED (${messages.length} messages)`);

    // ========================================================
    // CHECK ONLY THE LATEST USER QUESTION
    // ========================================================

    const latestQuestion = getLatestQuestion(messages);

    console.log(`❓ Latest user question length: ${latestQuestion.length}`);

    // ========================================================
    // SWEETALERT FOR OBVIOUSLY UNRELATED QUESTIONS
    // ========================================================

    if (isObviouslyUnrelated(latestQuestion)) {
      await Swal.fire({
        icon: "warning",
        title: "Computing & Informatics Only",
        text: COMPUTING_REFUSAL,
        confirmButtonText: "Got it",
        confirmButtonColor: "#dc2626",
      });

      // Persist the same refusal that the user just saw instead of allowing the
      // caller to write a generic "No response received." placeholder.
      onData(COMPUTING_REFUSAL);
      onCompletion();

      return "blocked";
    }

    // ========================================================
    // API KEY
    // ========================================================

    const apiKey = getGroqApiKey();

    // ========================================================
    // SELECTED MODEL (image payloads force Groq's free vision model)
    // ========================================================

    const selectedModel =
      useSettings.getState().settings.selectedModal;
    const isVisionRequest = hasVisionPayload(messages);
    const model = isVisionRequest
      ? GROQ_VISION_MODEL
      : resolveModel(selectedModel);

    console.log(
      "🧠 model from store:",
      selectedModel,
      "| resolved:",
      model,
      "| multimodal:",
      isVisionRequest
    );

    // ========================================================
    // ADD SYSTEM MESSAGE (Computing & Informatics prompt unchanged)
    // ========================================================

    const messagesWithSystem: GroqRequestMessage[] = [
      {
        role: "system",
        content: COMPUTING_SYSTEM_MESSAGE,
      },
      ...messages,
    ];

    // Strip store-only metadata before the payload reaches Groq.
    const requestMessages = sanitizeGroqMessages(messagesWithSystem);

    const requestOptions: RequestInit = {
      method: "POST",
      signal: requestSignal instanceof AbortSignal ? requestSignal : undefined,
      headers: {
        "content-type": "application/json",
        accept: isVisionRequest ? "application/json" : "text/event-stream",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: isVisionRequest ? 0.3 : 0.7,
        max_tokens: 4096,
        stream: !isVisionRequest,
        messages: requestMessages,
      }),
    };

    // ========================================================
    // GROQ VISION REQUEST (multimodal, non-streaming JSON)
    // ========================================================

    if (isVisionRequest) {
      const visionResponse = await fetch(
        GROQ_CHAT_COMPLETIONS_URL,
        requestOptions
      );

      console.log(
        "🖼️ Groq vision responded:",
        visionResponse.status,
        visionResponse.statusText
      );

      if (!visionResponse.ok) {
        const errText = await visionResponse.text().catch(() => "");
        throw groqHttpError(visionResponse, errText);
      }

      const visionData = await visionResponse.json();
      const visionContent =
        visionData?.choices?.[0]?.message?.content;

      if (visionContent) onData(visionContent);
      onCompletion();
      return "completed";
    }

    // ========================================================
    // GROQ TEXT REQUEST (streaming SSE)
    // ========================================================

    const response = await fetch(
      GROQ_CHAT_COMPLETIONS_URL,
      requestOptions
    );

    console.log(
      "📡 Groq responded:",
      response.status,
      response.statusText
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw groqHttpError(response, errText);
    }

    const reader = response.body?.getReader();

    if (!reader) {
      throw new Error("Response body is null");
    }

    const decoder = new TextDecoder("utf-8");

    let buffer = "";
    let chunkCount = 0;

    // ========================================================
    // STREAM RESPONSE
    // ========================================================

    while (true) {
      const { done, value } =
        await reader.read();

      if (done) {
        console.log(
          `🏁 stream finished — received ${chunkCount} content chunks`
        );

        onCompletion();

        break;
      }

      buffer += decoder.decode(value, {
        stream: true,
      });

      const lines = buffer.split("\n");

      buffer = lines.pop() || "";

      for (let line of lines) {
        line = line.trim();

        if (!line || line.startsWith(":")) {
          continue;
        }

        if (line === "data: [DONE]") {
          console.log("🏁 received [DONE]");
          continue;
        }

        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(
              line.replace("data: ", "")
            );

            const content =
              data.choices?.[0]?.delta?.content;

            if (content) {
              chunkCount++;

              onData(content);
            }
          } catch (e) {
            console.error(
              "Failed to parse SSE JSON chunk:",
              line,
              e
            );
          }
        }
      }
    }

    return "completed";
  } catch (error: any) {
    if (error?.name === "AbortError") {
      console.log("⚠️ request was aborted");
      return "aborted";
    }

    console.error(
      "❌ fetchResults FAILED:",
      error
    );

    throw new Error(
      error?.message ||
        "Error fetching results"
    );
  } finally {
    // The key is released only after the request actually settles, never when
    // a caller effect merely re-runs.
    if (turnController && turnKey) endGroqTurn(turnKey, turnController);
  }
}

// ============================================================
// FETCH GROQ MODELS
// ============================================================

export async function fetchModals() {
  try {
    const apiKey = getGroqApiKey();

    const response = await fetch(
      "https://api.groq.com/openai/v1/models",
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    console.log(
      "📡 fetchModals — status:",
      response.status
    );

    if (!response.ok) {
      const errText =
        await response.text().catch(() => "");

      throw new Error(
        `Failed to fetch models — ${response.status}: ${errText}`
      );
    }

    const data = await response.json();

    const supported = (data.data || [])
      .map((m: any) => m.id)
      .filter((id: string) =>
        (GROQ_MODELS as readonly string[]).includes(
          id
        )
      );

    return {
      data: supported.map((id: string) => ({
        id,
      })),
    };
  } catch (error: any) {
    throw new Error(
      error?.message ||
        "Error fetching models"
    );
  }
}

// ============================================================
// IMAGE SIZE (legacy settings shape; image generation now lives in
// src/utils/imageGen.ts and uses the image service)
// ============================================================

export type ImageSize =
  | "256x256"
  | "512x512"
  | "1024x1024"
  | "1280x720"
  | "1920x1080"
  | "1792x1024"
  | "1024x1792";
