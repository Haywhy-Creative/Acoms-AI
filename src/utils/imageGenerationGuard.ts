// Unified, user-safe guards for image generation.
// Provider names, proxy paths and raw transport errors never reach chat UI.

import { get, ref as dbRef, runTransaction } from "firebase/database";
import { auth, rtdb } from "../config/firebase";

export const DAILY_IMAGE_LIMIT = 20;
export const IMAGE_GENERATION_ERROR_MESSAGE =
  "Image generation is temporarily unavailable. Please try again in a moment.";
export const DAILY_IMAGE_LIMIT_MESSAGE =
  "Image generation limit reached. Try again tomorrow.";
export const SHARED_QUOTA_ERROR_MESSAGE =
  "You can't generate image now, try another time.";

export class ImageLimitReachedError extends Error {
  constructor() {
    super(DAILY_IMAGE_LIMIT_MESSAGE);
    this.name = "ImageLimitReachedError";
  }
}

export class SharedQuotaExceededError extends Error {
  constructor() {
    super(SHARED_QUOTA_ERROR_MESSAGE);
    this.name = "SharedQuotaExceededError";
  }
}

// Fallback for browsers where localStorage is unavailable (private mode etc.).
const inMemoryCounts = new Map<string, number>();

function currentDateKey(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Prefer the authenticated UID so the RTDB path and local key always agree. */
function resolveUserId(userId: string): string {
  const authenticatedUid = auth.currentUser?.uid?.trim();
  if (authenticatedUid) return authenticatedUid;
  return (userId || "guest").trim() || "guest";
}

function quotaKey(userId: string): string {
  return `acoms-ai:image-quota:${encodeURIComponent(
    resolveUserId(userId)
  )}:${currentDateKey()}`;
}

function isTrackedUser(userId: string): string | null {
  const id = resolveUserId(userId);
  if (!id || id === "guest") return null;
  return auth.currentUser?.uid === id ? id : null;
}

function readCount(key: string): number {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return inMemoryCounts.get(key) ?? 0;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return inMemoryCounts.get(key) ?? 0;
  }
}

function writeCount(key: string, count: number): void {
  inMemoryCounts.set(key, count);
  try {
    window.localStorage.setItem(key, String(count));
  } catch {
    // Keep the in-memory count so the limit still works for this session.
  }
}

/** Read the persisted count for today, ignoring stale dates or bad payloads. */
async function readRemoteCount(userId: string): Promise<number> {
  const uid = isTrackedUser(userId);
  if (!uid) return 0;

  try {
    const snapshot = await get(dbRef(rtdb, `users/${uid}/dailyImageUsage`));
    const value = snapshot.val();
    if (!value || typeof value !== "object") return 0;
    const record = value as Record<string, unknown>;
    if (record.date !== currentDateKey()) return 0;
    const count = Number(record.count);
    return Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
  } catch {
    // A temporary RTDB failure must not bypass the local limit.
    return 0;
  }
}

/** Atomically increment the remote count, resetting it on a new calendar day. */
async function incrementRemoteCount(userId: string): Promise<number | null> {
  const uid = isTrackedUser(userId);
  if (!uid) return null;

  const date = currentDateKey();
  try {
    const result = await runTransaction(
      dbRef(rtdb, `users/${uid}/dailyImageUsage`),
      (current: unknown) => {
        const record =
          current && typeof current === "object"
            ? (current as Record<string, unknown>)
            : null;
        const previous =
          record &&
          record.date === date &&
          typeof record.count === "number" &&
          Number.isFinite(record.count) &&
          record.count >= 0
            ? Math.floor(record.count)
            : 0;

        return { date, count: previous + 1, updatedAt: Date.now() };
      }
    );

    if (!result.committed) return null;
    const value = result.snapshot.val();
    if (!value || typeof value !== "object") return null;
    const count = Number((value as Record<string, unknown>).count);
    return Number.isFinite(count) && count >= 0 ? Math.floor(count) : null;
  } catch {
    // Local counting already happened; the remote write is best-effort.
    return null;
  }
}

/**
 * Call before any generation request. The higher of the local and remote
 * counts wins so a limit reached on another device is still enforced here.
 */
export async function assertImageQuotaAvailable(userId: string): Promise<void> {
  const key = quotaKey(userId);
  const localCount = readCount(key);
  const remoteCount = await readRemoteCount(userId);
  const effectiveCount = Math.max(localCount, remoteCount);

  if (effectiveCount > localCount) writeCount(key, effectiveCount);
  if (effectiveCount >= DAILY_IMAGE_LIMIT) throw new ImageLimitReachedError();
}

/** Call only after a generated image has been accepted/rendered by the UI. */
export async function recordImageGeneration(userId: string): Promise<void> {
  const key = quotaKey(userId);
  const localNext = readCount(key) + 1;
  writeCount(key, localNext);

  const remoteCount = await incrementRemoteCount(userId);
  if (remoteCount !== null) writeCount(key, Math.max(localNext, remoteCount));
}

/** Convert any internal/provider failure into a safe chat-facing message. */
export function toSafeImageError(error: unknown): Error {
  if (error instanceof ImageLimitReachedError) return error;
  if (error instanceof SharedQuotaExceededError) return error;

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
      ? error
      : "";

  if (message === DAILY_IMAGE_LIMIT_MESSAGE) return new ImageLimitReachedError();
  if (message === SHARED_QUOTA_ERROR_MESSAGE) {
    return new SharedQuotaExceededError();
  }

  // Pass through real error messages from the proxy so users see the actual
  // failure reason (e.g. "Cloudflare Workers AI request failed (401 Unauthorized)
  // — invalid token"). Only fall back to the generic message when there is nothing
  // meaningful to show.
  if (message && message !== IMAGE_GENERATION_ERROR_MESSAGE) {
    return new Error(message);
  }

  return new Error(IMAGE_GENERATION_ERROR_MESSAGE);
}
