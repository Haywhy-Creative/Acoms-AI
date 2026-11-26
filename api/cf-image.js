// Vercel serverless function: /api/cf-image
// Proxies image generation requests to Cloudflare Workers AI.
// Credentials stay server-side; the response is normalised to { image } / { error }.

const API_ROOT = "https://api.cloudflare.com/client/v4/accounts";
const DEFAULT_MODEL = "@cf/black-forest-labs/flux-1-schnell";
const MODEL_PATTERN = /^@cf\/[a-z0-9-]+\/[a-z0-9._-]+$/i;
const MAX_PROMPT_LENGTH = 4_000;
const QUOTA_PATTERN =
  /rate[\s_-]?limit|too many requests|quota|exceed(?:ed|s)?\s+(?:the\s+)?(?:daily\s+)?limit|limit\s+(?:reached|exceeded)|capacity|exhaust(?:ed|ion)|insufficient\s+(?:credits|balance|funds)|payment\s+required|billing\s+limit/i;

// Tell Vercel to allow up to 60 s for this function (hobby plan max).
export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function firstString(record, keys) {
  if (!record || typeof record !== "object") return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function extractImage(payload) {
  if (!payload || typeof payload !== "object") return null;

  const fromRoot = firstString(payload, ["image", "image_data", "image_b64", "data"]);
  if (fromRoot) return fromRoot;

  const result = payload.result;
  if (typeof result === "string" && result.trim()) return result.trim();
  if (!result || typeof result !== "object") return null;

  const fromResult = firstString(result, ["image", "image_data", "image_b64", "base64"]);
  if (fromResult) return fromResult;

  if (Array.isArray(result.images)) {
    const first = result.images[0];
    if (typeof first === "string" && first.trim()) return first.trim();
    const fromImages = firstString(first, ["image", "image_data", "base64"]);
    if (fromImages) return fromImages;
  }

  return null;
}

function errorTextFromPayload(payload) {
  if (!payload || typeof payload !== "object") return "";
  const parts = [];
  const add = (value) => {
    if (typeof value === "string" && value.trim()) parts.push(value.trim());
  };

  add(payload.error);
  add(payload.message);
  add(payload.detail);

  if (Array.isArray(payload.errors)) {
    for (const item of payload.errors) {
      add(item);
      if (item && typeof item === "object") {
        add(item.error);
        add(item.message);
      }
    }
  } else {
    add(payload.errors);
  }

  if (payload.result && typeof payload.result === "object") {
    add(payload.result.error);
    add(payload.result.message);
  }

  return parts.join(" ");
}

function detectMime(base64) {
  try {
    const header = atob(base64.slice(0, 64));
    const bytes = Array.from(header, (c) => c.charCodeAt(0));
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (header.startsWith("PNG")) return "image/png";
    if (header.startsWith("RIFF") && header.slice(8, 12) === "WEBP") return "image/webp";
  } catch {
    // ignore header parse errors
  }
  return "image/png";
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST for image generation." });
  }

  // --- Read credentials from server-side environment (never from client) ---
  const accountId = String(
    process.env.CLOUDFLARE_ACCOUNT_ID ||
      process.env.CF_ACCOUNT_ID ||
      process.env.VITE_CF_ACCOUNT_ID ||
      ""
  ).trim();
  const apiToken = String(
    process.env.CLOUDFLARE_API_TOKEN ||
      process.env.CF_AI_TOKEN ||
      process.env.VITE_CF_AI_TOKEN ||
      ""
  ).trim();

  if (!accountId || !apiToken) {
    console.error("❌ cf-image: Missing Cloudflare credentials in environment.");
    return res
      .status(503)
      .json({ error: "Image generation is not configured (missing credentials)." });
  }

  // --- Parse body ---
  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch {
    return res.status(400).json({ error: "Request body must be valid JSON." });
  }

  const prompt =
    typeof body?.prompt === "string" ? body.prompt.trim().slice(0, MAX_PROMPT_LENGTH) : "";
  if (!prompt) {
    return res.status(400).json({ error: "A non-empty prompt is required." });
  }

  const model =
    typeof body.model === "string" && MODEL_PATTERN.test(body.model.trim())
      ? body.model.trim()
      : DEFAULT_MODEL;

  // --- Call Cloudflare Workers AI ---
  let cfResponse;
  try {
    cfResponse = await fetch(
      `${API_ROOT}/${encodeURIComponent(accountId)}/ai/run/${model}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
          Accept: "application/json, image/*",
        },
        body: JSON.stringify({ prompt }),
      }
    );
  } catch (networkError) {
    const msg = networkError instanceof Error ? networkError.message : String(networkError);
    console.error("❌ cf-image: Network error reaching Cloudflare:", msg);
    return res.status(502).json({
      error: "Could not reach Cloudflare Workers AI.",
      details: msg,
    });
  }

  // --- Handle non-OK status from Cloudflare ---
  if (!cfResponse.ok) {
    const errText = await cfResponse.text().catch(() => "");
    console.error(
      `❌ cf-image: Cloudflare returned ${cfResponse.status} ${cfResponse.statusText}:`,
      errText
    );

    // Surface quota / rate-limit errors with a distinct status.
    if (cfResponse.status === 429 || cfResponse.status === 402 || QUOTA_PATTERN.test(errText)) {
      return res.status(cfResponse.status === 402 ? 402 : 429).json({
        error: "Image generation quota exceeded. Please try again later.",
        details: errText,
      });
    }

    return res.status(cfResponse.status).json({
      error: `Cloudflare Workers AI request failed (${cfResponse.status} ${cfResponse.statusText}).`,
      details: errText,
    });
  }

  // --- Parse the successful response ---
  const contentType = (cfResponse.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("json")) {
    let payload;
    try {
      payload = await cfResponse.json();
    } catch {
      return res.status(502).json({ error: "Image generation returned invalid JSON." });
    }

    const errorText = errorTextFromPayload(payload);
    if (QUOTA_PATTERN.test(errorText)) {
      return res.status(429).json({
        error: "Image generation quota exceeded. Please try again later.",
        details: errorText,
      });
    }

    const base64Image = extractImage(payload);
    if (!base64Image) {
      console.error(
        "❌ cf-image: No image in Cloudflare response:",
        JSON.stringify(payload).slice(0, 500)
      );
      return res.status(502).json({
        error: "Image generation returned no usable image.",
        details: errorText || "No image field found in response.",
      });
    }

    // Normalise to a data URL and return as JSON { image } matching what the
    // frontend's finishImageResponse() already knows how to consume.
    const mime = detectMime(base64Image);
    return res.status(200).json({ image: `data:${mime};base64,${base64Image}` });
  }

  // Binary response (image/png, image/jpeg, etc.)
  const arrayBuffer = await cfResponse.arrayBuffer();
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    return res.status(502).json({ error: "Image generation returned an empty response." });
  }

  // Convert binary to base64 data URL to keep a consistent JSON envelope.
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mime = contentType.match(/image\/(jpeg|png|webp)/i)?.[0] || "image/png";
  return res.status(200).json({ image: `data:${mime};base64,${base64}` });
}
