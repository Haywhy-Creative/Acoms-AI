import { get, onValue, ref as dbRef, update, type Unsubscribe } from "firebase/database";
import { auth, rtdb } from "../config/firebase";

export const DEFAULT_AVATAR = "/imgs/default-avatar.jpg";
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

// Firestore/Storage is not required for avatars. Images are resized in the
// browser and the compact Data URL is stored directly in RTDB so the profile
// survives refreshes and syncs across devices on the Spark plan.
const AVATAR_MAX_DIMENSION = 200;
const AVATAR_QUALITIES = [0.75, 0.6, 0.45, 0.3];
const AVATAR_MAX_DATA_URL_LENGTH = 40_000;

let activeProfileUnsubscribe: Unsubscribe | null = null;
let activeProfileUid: string | null = null;

function validateAvatarFile(file: File): void {
  // SVG can reference external resources and taint the canvas; animated formats
  // are not meaningful as a 200x200 JPEG either.
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowed.includes(file.type)) {
    throw new Error("Please select a JPG, PNG, WEBP or GIF image.");
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error("Profile pictures must be 5 MB or smaller.");
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode the selected image."));
    image.src = dataUrl;
  });
}

function resizeAndCompressImage(file: File): Promise<string> {
  validateAvatarFile(file);

  return readAsDataUrl(file)
    .then(loadImage)
    .then((image) => {
      const naturalWidth = image.naturalWidth || image.width;
      const naturalHeight = image.naturalHeight || image.height;
      if (!naturalWidth || !naturalHeight) {
        throw new Error("The selected image has no readable dimensions.");
      }

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Image compression is not supported in this browser.");
      }

      let dataUrl = "";
      // Progressively shrink the canvas as well as lowering JPEG quality so the
      // final Data URL is always bounded before it is written to RTDB.
      for (const dimension of [AVATAR_MAX_DIMENSION, 160, 128, 96, 64]) {
        const scale = Math.min(
          1,
          dimension / naturalWidth,
          dimension / naturalHeight
        );
        const width = Math.max(1, Math.round(naturalWidth * scale));
        const height = Math.max(1, Math.round(naturalHeight * scale));
        canvas.width = width;
        canvas.height = height;

        for (const quality of AVATAR_QUALITIES) {
          context.clearRect(0, 0, width, height);
          // JPEG has no alpha channel; paint white so transparent PNGs do not
          // become black rectangles.
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);
          dataUrl = canvas.toDataURL("image/jpeg", quality);
          if (dataUrl.length <= AVATAR_MAX_DATA_URL_LENGTH) break;
        }
        if (dataUrl.length <= AVATAR_MAX_DATA_URL_LENGTH) break;
      }

      if (
        !dataUrl.startsWith("data:image/jpeg;base64,") ||
        dataUrl.length > AVATAR_MAX_DATA_URL_LENGTH
      ) {
        throw new Error("Image is too large to store; choose a smaller picture.");
      }
      return dataUrl;
    });
}

// Resizes/compresses the selected image and persists the resulting Data URL at
// `users/${uid}/photoURL`. Firebase Auth photoURL is intentionally untouched.
export async function uploadUserAvatar(file: File): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in to upload a profile picture.");

  const photoURL = await resizeAndCompressImage(file);
  // The account may have changed while the canvas was compressing.
  if (auth.currentUser?.uid !== user.uid) {
    throw new Error("Account changed while processing the image. Please retry.");
  }
  await update(dbRef(rtdb, `users/${user.uid}`), {
    photoURL,
    updatedAt: Date.now(),
  });

  return photoURL;
}

export async function loadUserPhotoURL(uid: string): Promise<string | null> {
  if (!uid || auth.currentUser?.uid !== uid) return null;
  try {
    const snapshot = await get(dbRef(rtdb, `users/${uid}`));
    const value = snapshot.val();
    const photoURL = value && typeof value === "object" ? (value as Record<string, unknown>).photoURL : null;
    return typeof photoURL === "string" && photoURL ? photoURL : null;
  } catch (error) {
    console.warn("Could not load profile photo from Realtime Database:", error);
    return null;
  }
}

export function stopWatchingUserProfile(): void {
  activeProfileUnsubscribe?.();
  activeProfileUnsubscribe = null;
  activeProfileUid = null;
}

export function watchUserProfile(
  uid: string,
  onPhotoURL: (photoURL: string | null) => void
): Unsubscribe {
  if (!uid || auth.currentUser?.uid !== uid) return () => undefined;
  if (activeProfileUid === uid && activeProfileUnsubscribe) return activeProfileUnsubscribe;

  stopWatchingUserProfile();
  activeProfileUid = uid;

  const unsubscribe = onValue(dbRef(rtdb, `users/${uid}`), (snapshot) => {
    const value = snapshot.val();
    const photoURL = value && typeof value === "object" ? (value as Record<string, unknown>).photoURL : null;
    onPhotoURL(typeof photoURL === "string" && photoURL ? photoURL : null);
  });

  activeProfileUnsubscribe = unsubscribe;
  return unsubscribe;
}
