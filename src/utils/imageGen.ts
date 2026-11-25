import { cropGeneratedImage, MAX_CROPPED_IMAGE_DATA_URL_LENGTH } from "./cropGeneratedImage";
import {
  IMAGE_GENERATION_ERROR_MESSAGE,
  SharedQuotaExceededError,
} from "./imageGenerationGuard";

export { cropGeneratedImage, MAX_CROPPED_IMAGE_DATA_URL_LENGTH };

const API_ROOT = "https://api.cloudflare.com/client/v4/accounts";
const DEFAULT_IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";
const FALLBACK_IMAGE_MODEL = "@cf/black-forest-labs/flux-2-klein-9b";
const DEFAULT_PROXY_URLS = ["/api/cf-image", "/.netlify/functions/cf-image"] as const;
const REQUEST_TIMEOUT_MS = 120_000;

// Shared account quota / capacity failures must be surfaced with one exact,
// provider-free message instead of being retried against another model.
const SHARED_QUOTA_PATTERN =
  /(?:rate[\s_-]?limit|too many requests|quota|exceed(?:ed|s)?\s+(?:the\s+)?(?:daily\s+)?limit|limit\s+(?:reached|exceeded)|capacity|exhaust(?:ed|ion)|insufficient\s+(?:credits|balance|funds)|payment\s+required|billing\s+limit)/i;

// Static reads keep unused VITE_* values out of the client bundle.
function env(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function genericError(): Error {
  return new Error(IMAGE_GENERATION_ERROR_MESSAGE);
}

function sharedQuotaError(): Error {
  return new SharedQuotaExceededError();
}

function isQuotaStatus(status: number): boolean {
  return status === 429 || status === 402;
}

function isQuotaErrorText(text: string): boolean {
  return SHARED_QUOTA_PATTERN.test(text);
}

function cleanPrompt(prompt: string): string {
  const cleaned = prompt
    .replace(
      /^(give me (an? )?)?(generate|create|draw|make|design|render|show|paint|illustrate)\s+(an?\s+)?(image|picture|photo|illustration|art|drawing)\s+(of\s+)?/i,
      ""
    )
    .replace(/^(image|picture|photo|of)\s+/i, "")
    .trim();

  return cleaned || prompt.trim() || "abstract computing technology artwork";
}

function endpoint(accountId: string, model: string): string {
  return `${API_ROOT}/${encodeURIComponent(accountId)}/ai/run/${model}`;
}

function isKleinModel(model: string): boolean {
  return /flux-2-klein/i.test(model);
}

function isValidModel(model: string): boolean {
  return /^@cf\/[a-z0-9-]+\/[a-z0-9._-]+$/i.test(model);
}

function isLocalDevelopmentHost(): boolean {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname.toLowerCase();
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost")
  );
}

function getProxyUrls(): string[] {
  const configured = env(import.meta.env.VITE_CF_AI_PROXY_URL);
  if (!configured) return [...DEFAULT_PROXY_URLS];
  return [
    configured,
    ...DEFAULT_PROXY_URLS.filter((url) => url !== configured),
  ];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function extractImagePayload(payload: unknown): string | null {
  const root = asRecord(payload);
  if (!root) return null;

  const fromRoot = firstString(root, ["image", "image_data", "image_b64", "data"]);
  if (fromRoot) return fromRoot;

  const result = asRecord(root.result);
  if (result) {
    const fromResult = firstString(result, [
      "image",
      "image_data",
      "image_b64",
      "base64",
    ]);
    if (fromResult) return fromResult;

    const images = result.images;
    if (Array.isArray(images)) {
      const first = images[0];
      if (typeof first === "string" && first.trim()) return first.trim();
      const firstRecord = asRecord(first);
      if (firstRecord) {
        const fromImages = firstString(firstRecord, ["image", "image_data", "base64"]);
        if (fromImages) return fromImages;
      }
    }
  }

  if (typeof root.result === "string" && root.result.trim()) {
    return root.result.trim();
  }
  return null;
}

function errorTextFromPayload(payload: unknown): string {
  const root = asRecord(payload);
  if (!root) return "";
  const parts: string[] = [];
  const add = (value: unknown) => {
    if (typeof value === "string" && value.trim()) parts.push(value.trim());
  };

  add(root.error);
  add(root.message);
  add(root.detail);

  const errors = root.errors;
  if (Array.isArray(errors)) {
    for (const item of errors) {
      add(item);
      const record = asRecord(item);
      if (record) {
        add(record.error);
        add(record.message);
      }
    }
  } else {
    add(errors);
  }

  const result = asRecord(root.result);
  if (result) {
    add(result.error);
    add(result.message);
  }

  return parts.join(" ");
}

function detectBase64ImageMime(base64: string): string {
  try {
    const header = atob(base64.slice(0, 64));
    const bytes = Array.from(header, (char) => char.charCodeAt(0));
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return "image/jpeg";
    }
    if (header.startsWith("PNG")) return "image/png";
    if (header.startsWith("RIFF") && header.slice(8, 12) === "WEBP") {
      return "image/webp";
    }
  } catch {
    // Fall back to a safe default below.
  }
  return "image/png";
}

function normalizeImageSource(value: string): string {
  const trimmed = value.trim();
  if (/^data:image\/(jpeg|png|webp);base64,/i.test(trimmed)) return trimmed;
  // A remote URL cannot be drawn into the crop canvas reliably.
  if (/^https?:\/\//i.test(trimmed)) throw genericError();
  if (/^[a-z0-9+/=\r\n]+$/i.test(trimmed)) {
    const base64 = trimmed.replace(/\s/g, "");
    return `data:${detectBase64ImageMime(base64)};base64,${base64}`;
  }
  throw genericError();
}

async function readGeneratedImage(response: Response): Promise<string | Blob> {
  const contentType = (response.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("json")) {
    const raw = await response.text();
    if (!raw) throw genericError();

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw genericError();
    }
    if (isQuotaErrorText(errorTextFromPayload(payload))) {
      throw sharedQuotaError();
    }
    const image = extractImagePayload(payload);
    if (!image) throw genericError();
    return normalizeImageSource(image);
  }

  const blob = await response.blob();
  if (!blob || blob.size === 0) throw genericError();
  return blob;
}

async function finishImageResponse(response: Response): Promise<string> {
  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    if (isQuotaStatus(response.status) || isQuotaErrorText(raw)) {
      throw sharedQuotaError();
    }
    throw genericError();
  }

  // Every generated image is cropped on the client before it is stored,
  // rendered, or offered for download. This removes the bottom logo strip.
  const source = await readGeneratedImage(response);
  const cropped = await cropGeneratedImage(source);
  if (cropped.length > MAX_CROPPED_IMAGE_DATA_URL_LENGTH) {
    throw genericError();
  }
  return cropped;
}

function directRequest(
  accountId: string,
  token: string,
  model: string,
  prompt: string,
  signal: AbortSignal
): RequestInit {
  // One model variant requires multipart input; the other uses JSON.
  if (isKleinModel(model)) {
    const form = new FormData();
    form.append("prompt", prompt);
    return {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json, image/*",
      },
      body: form,
    };
  }
  return {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, image/*",
    },
    body: JSON.stringify({ prompt }),
  };
}

async function requestThroughProxy(
  proxyUrl: string,
  model: string,
  prompt: string,
  callerSignal?: AbortSignal
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();

  if (callerSignal) {
    if (callerSignal.aborted) {
      clearTimeout(timeout);
      throw genericError();
    }
    callerSignal.addEventListener("abort", forwardAbort, { once: true });
  }

  try {
    let response: Response;
    try {
      response = await fetch(proxyUrl, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, image/*",
        },
        body: JSON.stringify({ model, prompt }),
      });
    } catch {
      if (callerSignal?.aborted) throw genericError();
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    if (
      response.status === 404 ||
      response.status === 405 ||
      (response.ok && !/json|image/i.test(contentType))
    ) {
      // Not an image endpoint (SPA fallback or missing function). Try the next one.
      return null;
    }

    try {
      return await finishImageResponse(response);
    } catch (error) {
      // A shared quota error is account-wide: stop immediately instead of
      // retrying the next proxy/model with the same exhausted quota.
      if (error instanceof SharedQuotaExceededError) throw error;
      if (callerSignal?.aborted) throw genericError();
      return null;
    }
  } finally {
    clearTimeout(timeout);
    if (callerSignal) callerSignal.removeEventListener("abort", forwardAbort);
  }
}

async function requestDirect(
  accountId: string,
  token: string,
  model: string,
  prompt: string,
  callerSignal?: AbortSignal
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();

  if (callerSignal) {
    if (callerSignal.aborted) {
      clearTimeout(timeout);
      throw genericError();
    }
    callerSignal.addEventListener("abort", forwardAbort, { once: true });
  }

  try {
    const response = await fetch(
      endpoint(accountId, model),
      directRequest(accountId, token, model, prompt, controller.signal)
    );
    return await finishImageResponse(response);
  } catch (error) {
    if (error instanceof SharedQuotaExceededError) throw error;
    if (callerSignal?.aborted) throw genericError();
    return null;
  } finally {
    clearTimeout(timeout);
    if (callerSignal) callerSignal.removeEventListener("abort", forwardAbort);
  }
}

/**
 * Generate an image, crop it locally, and return a bounded Data URL that is
 * ready for chat rendering and persistence. Same-origin proxies are always
 * preferred; direct credentials are available only in local development.
 */
export async function generateAiImage(
  prompt: string,
  signal?: AbortSignal
): Promise<string> {
  const allowDirect = import.meta.env.DEV && isLocalDevelopmentHost();
  const accountId = allowDirect ? env(import.meta.env.VITE_CF_ACCOUNT_ID) : "";
  const token = allowDirect ? env(import.meta.env.VITE_CF_AI_TOKEN) : "";
  const proxyUrls = getProxyUrls();

  const primaryModel = env(import.meta.env.VITE_CF_AI_MODEL) || DEFAULT_IMAGE_MODEL;
  const fallbackModel = env(import.meta.env.VITE_CF_AI_FALLBACK_MODEL) || FALLBACK_IMAGE_MODEL;
  const models = [primaryModel];
  if (fallbackModel && fallbackModel !== primaryModel) models.push(fallbackModel);

  const finalPrompt = cleanPrompt(prompt);

  for (const model of models) {
    if (!isValidModel(model)) continue;

    for (const proxyUrl of proxyUrls) {
      const generated = await requestThroughProxy(proxyUrl, model, finalPrompt, signal);
      if (generated) return generated;
    }

    // Production browsers must never attempt a direct upstream request.
    if (allowDirect && accountId && token) {
      const generated = await requestDirect(
        accountId,
        token,
        model,
        finalPrompt,
        signal
      );
      if (generated) return generated;
    }
  }

  throw genericError();
}
