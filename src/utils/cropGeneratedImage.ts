// Canvas-based post-processing for generated images.
// Generated models can leave a thin frame or a small logo strip at the bottom
// / corner. This crops those edges without stretching the artwork, then emits
// a compact JPEG Data URL that is small enough to persist in RTDB.

export type CropOptions = {
  /** Symmetric outer border trim, as a fraction of the shorter side. */
  borderTrimPercent?: number;
  /** Extra strip removed from the bottom edge (where logos usually sit). */
  bottomTrimPercent?: number;
  /** Extra strip removed from the right edge for corner logos. */
  cornerStripPercent?: number;
  /** Longest output edge before quality reduction. */
  maxDimension?: number;
  /** Initial JPEG quality; lowered automatically if the result is too large. */
  quality?: number;
  mimeType?: "image/jpeg" | "image/webp";
};

export const MAX_CROPPED_IMAGE_DATA_URL_LENGTH = 400_000;

const GENERATED_IMAGE_DATA_URL_PATTERN =
  /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/]+={0,2}$/i;

// These shipped with the app as decorative assets. A persisted assistant
// message containing one of them is legacy/fallback data, not a generation.
const LEGACY_STOCK_IMAGE_NAMES = [
  "bot.webp",
  "bot.png",
  "bot.jpg",
  "default-avatar.jpg",
  "default-avatar.png",
  "logo.svg",
  "logo.png",
];

export function isLegacyStockImageSource(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const source = value.trim().toLowerCase();
  return LEGACY_STOCK_IMAGE_NAMES.some(
    (name) => source === name || source.endsWith(`/${name}`)
  );
}

/**
 * Accept only payloads that can actually be a generated image: a bounded
 * jpeg/png/webp Data URL or an http(s) URL that is not a bundled stock asset.
 * This prevents `/imgs/bot.webp` or oversized blobs from being rendered as a
 * generation result.
 */
export function isValidGeneratedImageSource(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const source = value.trim();
  if (!source || source.length > MAX_CROPPED_IMAGE_DATA_URL_LENGTH) return false;
  if (isLegacyStockImageSource(source)) return false;

  if (GENERATED_IMAGE_DATA_URL_PATTERN.test(source)) return true;

  try {
    const url = new URL(source);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return !isLegacyStockImageSource(url.pathname);
  } catch {
    return false;
  }
}

const DEFAULT_OPTIONS: Required<CropOptions> = {
  borderTrimPercent: 0.02,
  bottomTrimPercent: 0.04,
  cornerStripPercent: 0.015,
  maxDimension: 1024,
  quality: 0.82,
  mimeType: "image/jpeg",
};

const OUTPUT_DIMENSIONS = [1024, 768, 640, 512] as const;
const OUTPUT_QUALITIES = [0.82, 0.72, 0.62, 0.5] as const;

function clampPercent(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(0.25, Math.max(0, value));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read the generated image blob."));
    };
    reader.onerror = () =>
      reject(new Error("Could not read the generated image blob."));
    reader.readAsDataURL(blob);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // Data URLs are unaffected; a CORS-enabled remote source can still be
    // exported from the canvas without a SecurityError.
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Generated image could not be decoded."));
    image.src = src;
  });
}

/**
 * Trims outer borders / bottom-corner logo strips and returns a compact Data
 * URL. The crop uses a uniform scale so the main artwork is never distorted.
 */
export async function cropGeneratedImage(
  source: string | Blob,
  options: CropOptions = {}
): Promise<string> {
  const config: Required<CropOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
    borderTrimPercent: clampPercent(
      options.borderTrimPercent ?? DEFAULT_OPTIONS.borderTrimPercent,
      DEFAULT_OPTIONS.borderTrimPercent
    ),
    bottomTrimPercent: clampPercent(
      options.bottomTrimPercent ?? DEFAULT_OPTIONS.bottomTrimPercent,
      DEFAULT_OPTIONS.bottomTrimPercent
    ),
    cornerStripPercent: clampPercent(
      options.cornerStripPercent ?? DEFAULT_OPTIONS.cornerStripPercent,
      DEFAULT_OPTIONS.cornerStripPercent
    ),
  };

  const dataUrl = typeof source === "string" ? source : await blobToDataUrl(source);
  const image = await loadImage(dataUrl);

  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) {
    throw new Error("Generated image has no readable dimensions.");
  }

  const shorterSide = Math.min(width, height);
  const border = Math.round(shorterSide * config.borderTrimPercent);
  const rightInset =
    border + Math.round(width * config.cornerStripPercent);
  const bottomInset =
    border +
    Math.round(height * config.bottomTrimPercent) +
    Math.round(shorterSide * config.cornerStripPercent);

  const cropX = border;
  const cropY = border;
  const cropWidth = Math.max(1, width - border - rightInset);
  const cropHeight = Math.max(1, height - border - bottomInset);

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is not available for image cropping.");
  }

  const requestedMax = Number.isFinite(config.maxDimension)
    ? Math.max(64, Math.floor(config.maxDimension))
    : DEFAULT_OPTIONS.maxDimension;
  const dimensions = [requestedMax, ...OUTPUT_DIMENSIONS.filter((d) => d < requestedMax)];
  const qualities = [
    Number.isFinite(config.quality) ? config.quality : DEFAULT_OPTIONS.quality,
    ...OUTPUT_QUALITIES,
  ];

  let result = "";
  for (const maxDimension of dimensions) {
    const scale = Math.min(1, maxDimension / Math.max(cropWidth, cropHeight));
    canvas.width = Math.max(1, Math.round(cropWidth * scale));
    canvas.height = Math.max(1, Math.round(cropHeight * scale));

    for (const quality of qualities) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      // JPEG has no alpha channel; white avoids black edges on transparent PNGs.
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(
        image,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        canvas.width,
        canvas.height
      );

      result = canvas.toDataURL(config.mimeType, Math.min(1, Math.max(0, quality)));
      if (result.length <= MAX_CROPPED_IMAGE_DATA_URL_LENGTH) return result;
    }
  }

  throw new Error(
    "The generated image is still too large to store after cropping. Please retry with a shorter prompt."
  );
}
