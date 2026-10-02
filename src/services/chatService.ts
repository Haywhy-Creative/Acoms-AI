
import { ChatMessageType, useSettings } from "../store/store";
import Swal from "sweetalert2";

const IMAGE_GENERATION_API_URL =
  "https://api.openai.com/v1/images/generations";

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

function getApiKey(): string {
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

const GROQ_MODELS = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.6-27b",
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
  messages: Omit<ChatMessageType, "id" | "type">[],
  signal: AbortSignal,
  onData: (data: string) => void,
  onCompletion: () => void
) {
  try {
    console.log("🟢 fetchResults CALLED");
    console.log("📦 messages:", JSON.stringify(messages));

    // ========================================================
    // CHECK ONLY THE LATEST USER QUESTION
    // ========================================================

    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user");

    const latestQuestion =
      latestUserMessage?.content?.trim() || "";

    console.log(
      "❓ Latest user question:",
      latestQuestion
    );

    // ========================================================
    // SWEETALERT FOR OBVIOUSLY UNRELATED QUESTIONS
    // ========================================================

    if (isObviouslyUnrelated(latestQuestion)) {
      await Swal.fire({
        icon: "warning",
        title: "Computing & Informatics Only",
        text: "I'm a Computing & Informatics AI assistant. I can only help with Computer Science, Cybersecurity, Software Engineering, Information Technology, AI, Data Science, Programming, Networking, and other computing-related questions.",
        confirmButtonText: "Got it",
        confirmButtonColor: "#dc2626",
      });

      // Tell the existing chat system that processing has finished.
      onCompletion();

      return;
    }

    // ========================================================
    // API KEY
    // ========================================================

    const apiKey = getApiKey();

    console.log(
      "🔑 key present:",
      Boolean(apiKey),
      "| starts with gsk_:",
      apiKey?.startsWith("gsk_")
    );

    // ========================================================
    // SELECTED MODEL
    // ========================================================

    const selectedModel =
      useSettings.getState().settings.selectedModal;

    console.log(
      "🧠 model from store:",
      selectedModel,
      "| resolved:",
      resolveModel(selectedModel)
    );

    // ========================================================
    // ADD SYSTEM MESSAGE
    // ========================================================

    const messagesWithSystem: Omit<
      ChatMessageType,
      "id" | "type"
    >[] = [
      {
        role: "system",
        content: COMPUTING_SYSTEM_MESSAGE,
      },
      ...messages,
    ];

    // ========================================================
    // GROQ REQUEST
    // ========================================================

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",

        signal:
          signal instanceof AbortSignal
            ? signal
            : undefined,

        headers: {
          "content-type": "application/json",
          accept: "text/event-stream",
          Authorization: `Bearer ${apiKey}`,
        },

        body: JSON.stringify({
          model: resolveModel(selectedModel),
          temperature: 0.7,
          max_tokens: 4096,
          stream: true,
          messages: messagesWithSystem,
        }),
      }
    );

    console.log(
      "📡 Groq responded:",
      response.status,
      response.statusText
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => "");

      console.error(
        "❌ Groq error body:",
        errText
      );

      throw new Error(
        `Groq API ${response.status}: ${
          errText || response.statusText
        }`
      );
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
  } catch (error: any) {
    if (error?.name === "AbortError") {
      console.log("⚠️ request was aborted");
      return;
    }

    console.error(
      "❌ fetchResults FAILED:",
      error
    );

    throw new Error(
      error?.message ||
        "Error fetching results"
    );
  }
}

// ============================================================
// FETCH GROQ MODELS
// ============================================================

export async function fetchModals() {
  try {
    const apiKey = getApiKey();

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
// IMAGE TYPES
// ============================================================

export type ImageSize =
  | "256x256"
  | "512x512"
  | "1024x1024"
  | "1280x720"
  | "1920x1080"
  | "1792x1024"
  | "1024x1792";

export type IMAGE_RESPONSE = {
  created_at: string;
  data: IMAGE[];
};

export type IMAGE = {
  url: string;
};

export type DallEImageModel =
  | "dall-e-2"
  | "dall-e-3";

// ============================================================
// IMAGE GENERATION
// ============================================================

export async function generateImage(
  prompt: string,
  size: ImageSize,
  numberOfImages: number
) {
  const selectedModal =
    useSettings.getState().settings.selectedModal;

  const openaiKey =
    localStorage.getItem("apikey");

  if (!openaiKey) {
    throw new Error(
      "Image generation needs an OpenAI key (entered in the UI)"
    );
  }

  const response = await fetch(
    IMAGE_GENERATION_API_URL,
    {
      method: "POST",

      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },

      body: JSON.stringify({
        model: selectedModal,
        prompt,
        n: numberOfImages,
        size,
      }),
    }
  );

  if (!response.ok) {
    const errText =
      await response.text().catch(() => "");

    throw new Error(
      `Image API ${response.status}: ${
        errText ||
        "Failed to generate image"
      }`
    );
  }

  const body: IMAGE_RESPONSE =
    await response.json();

  return body;
}
