// Groq Whisper transcription for recorded voice prompts.

import { getGroqApiKey } from "../services/chatService";

export async function transcribeAudioWithGroq(
  audioBlob: Blob,
  callerSignal?: AbortSignal
): Promise<string> {
  const apiKey = getGroqApiKey();

  if (audioBlob.size === 0) {
    throw new Error("Recorded audio is empty. Please try again.");
  }
  // Groq imposes an audio upload limit; fail early with a readable error.
  if (audioBlob.size > 25 * 1024 * 1024) {
    throw new Error("Recorded audio exceeds Groq's 25MB transcription limit.");
  }

  const mediaType = audioBlob.type.toLowerCase();
  const extension = /wav/.test(mediaType)
    ? "wav"
    : /ogg/.test(mediaType)
    ? "ogg"
    : /mp4|m4a/.test(mediaType)
    ? "m4a"
    : "webm";
  const audioFile = new File([audioBlob], `recording.${extension}`, {
    type: audioBlob.type || (extension === "m4a" ? "audio/mp4" : `audio/${extension}`),
  });

  const formData = new FormData();
  formData.append("file", audioFile);
  formData.append("model", "whisper-large-v3-turbo");

  const controller = new AbortController();
  let timedOut = false;
  const onCallerAbort = () => controller.abort();

  if (callerSignal?.aborted) {
    controller.abort();
  } else {
    callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
  }

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 60_000);

  let response: Response;
  try {
    response = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          // Do not set Content-Type: the browser adds the multipart boundary.
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      }
    );
  } catch (error) {
    if (timedOut) {
      throw new Error("Transcription timed out. Please try again.");
    }
    if (callerSignal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", onCallerAbort);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(
      `Groq transcription ${response.status}: ${errText || response.statusText}`
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    console.error("Groq transcription returned invalid JSON:", error);
    throw new Error("Transcription response was not valid JSON.");
  }
  const text = (data as { text?: unknown } | null)?.text;
  return typeof text === "string" ? text.trim() : "";
}
