// Serverless image proxy for deployed SPAs.
// Credentials stay server-side; responses are normalised to { image } / { error }.
// Netlify Functions v2: default export receives a Request and returns a Response.
// The .mjs extension makes ESM explicit regardless of the closest package.json.

const API_ROOT = "https://api.cloudflare.com/client/v4/accounts";
const DEFAULT_MODEL = "@cf/black-forest-labs/flux-1-schnell";
const MODEL_PATTERN = /^@cf\/[a-z0-9-]+\/[a-z0-9._-]+$/i;
const MAX_PROMPT_LENGTH = 4_000;
const SHARED_QUOTA_MESSAGE = "You can't generate image now, try another time.";
const QUOTA_PATTERN =
  /rate[\s_-]?limit|too many requests|quota|exceed(?:ed|s)?\s+(?:the\s+)?(?:daily\s+)?limit|limit\s+(?:reached|exceeded)|capacity|exhaust(?:ed|ion)|insufficient\s+(?:credits|balance|funds)|payment\s+required|billing\s+limit/i;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

// Setting `path` replaces Netlify's default function URL, so every route the
// browser may call must be listed here. This also keeps the endpoint working
// if the netlify.toml redirect is ever missing from a deploy.
export const config = {
  path: ["/api/cf-image", "/.netlify/functions/cf-image"],
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function fail(message, status = 502) {
  return json({ error: message }, status);
}

function quotaFail(status) {
  return fail(SHARED_QUOTA_MESSAGE, status === 402 ? 402 : 429);
}

function isQuotaDetail(detail) {
  return QUOTA_PATTERN.test(String(detail || ""));
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

  const fromResult = firstString(result, [
    "image",
    "image_data",
    "image_b64",
    "base64",
  ]);
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

function asciiAt(bytes, start, end) {
  let output = "";
  for (let index = start; index < end && index < bytes.length; index += 1) {
    output += String.fromCharCode(bytes[index]);
  }
  return output;
}

function mimeFromBytes(bytes, contentType) {
  const header = bytes.subarray(0, 16);
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return "image/jpeg";
  }
  if (asciiAt(header, 1, 4) === "PNG") return "image/png";
  if (asciiAt(header, 0, 4) === "RIFF" && asciiAt(header, 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (/image\/(jpeg|png|webp)/i.test(contentType || "")) {
    return contentType.split(";")[0].trim().toLowerCase();
  }
  return "image/png";
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(index, index + chunkSize)
    );
  }
  return btoa(binary);
}

function normalizeImage(value, bytes = null, contentType = "") {
  if (typeof value !== "string" || !value.trim()) return null;

  const source = value.trim();
  if (/^data:image\/(?:jpeg|png|webp);base64,/i.test(source)) return source;

  // A remote URL cannot be safely fetched into the browser canvas.
  if (/^https?:\/\//i.test(source)) return null;

  if (/^[a-z0-9+/=\r\n]+$/i.test(source)) {
    const base64 = source.replace(/\s/g, "");
    let mime = "image/png";
    try {
      const header = Uint8Array.from(
        atob(base64.slice(0, 64)),
        (char) => char.charCodeAt(0)
      );
      mime = mimeFromBytes(header, "");
    } catch {
      // Keep the safe default when the payload header is not decodable.
    }
    return `data:${mime};base64,${base64}`;
  }

  if (bytes && bytes.byteLength > 0) {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const mime = mimeFromBytes(view, contentType);
    return `data:${mime};base64,${bytesToBase64(view)}`;
  }

  return null;
}

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return fail("Use POST for image generation.", 405);
  }

  const accountId = String(
    process.env.CF_ACCOUNT_ID || process.env.VITE_CF_ACCOUNT_ID || ""
  ).trim();
  const token = String(
    process.env.CF_AI_TOKEN || process.env.VITE_CF_AI_TOKEN || ""
  ).trim();
  if (!accountId || !token) {
    return fail("Image generation is not configured.", 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return fail("Request body must be JSON.", 400);
  }

  const prompt =
    typeof body?.prompt === "string"
      ? body.prompt.trim().slice(0, MAX_PROMPT_LENGTH)
      : "";
  if (!prompt) {
    return fail("A non-empty prompt is required.", 400);
  }

  const model =
    typeof body.model === "string" && MODEL_PATTERN.test(body.model.trim())
      ? body.model.trim()
      : DEFAULT_MODEL;

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json, image/*",
  };
  let upstreamBody;

  if (/flux-2-klein/i.test(model)) {
    const form = new FormData();
    form.append("prompt", prompt);
    upstreamBody = form;
  } else {
    headers["Content-Type"] = "application/json";
    upstreamBody = JSON.stringify({ prompt });
  }

  try {
    const upstream = await fetch(
      `${API_ROOT}/${encodeURIComponent(accountId)}/ai/run/${model}`,
      { method: "POST", headers, body: upstreamBody }
    );

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      if (upstream.status === 429 || upstream.status === 402 || isQuotaDetail(detail)) {
        return quotaFail(upstream.status);
      }
      return fail("Image generation is temporarily unavailable.", 502);
    }

    const contentType = (upstream.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("json")) {
      const raw = await upstream.text().catch(() => "");
      let payload = null;
      try {
        payload = JSON.parse(raw);
      } catch {
        return fail("Image generation returned invalid JSON.", 502);
      }
      if (isQuotaDetail(errorTextFromPayload(payload))) return quotaFail(429);
      const image = normalizeImage(extractImage(payload));
      if (!image) {
        return fail("Image generation returned no usable image.", 502);
      }
      return json({ image });
    }

    const bytes = await upstream.arrayBuffer();
    const image = normalizeImage(null, bytes, contentType);
    if (!image) {
      return fail("Image generation returned no usable image.", 502);
    }
    return json({ image });
  } catch {
    return fail("Image generation is temporarily unavailable.", 502);
  }
}
