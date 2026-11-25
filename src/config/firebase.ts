import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

// Static property reads let Vite inline only the variables actually used here.
// A dynamic `import.meta.env[key]` would embed every VITE_* value (including a
// legacy Storage bucket) into the production bundle.
const env = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const firebaseConfig = {
  apiKey: env(import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: env(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: env(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  messagingSenderId: env(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: env(import.meta.env.VITE_FIREBASE_APP_ID),
};

// Report the exact variable names developers must set, not derived keys.
const requiredConfig: Array<[keyof typeof firebaseConfig, string]> = [
  ["apiKey", "VITE_FIREBASE_API_KEY"],
  ["authDomain", "VITE_FIREBASE_AUTH_DOMAIN"],
  ["projectId", "VITE_FIREBASE_PROJECT_ID"],
  ["messagingSenderId", "VITE_FIREBASE_MESSAGING_SENDER_ID"],
  ["appId", "VITE_FIREBASE_APP_ID"],
];
for (const [key, envName] of requiredConfig) {
  if (!firebaseConfig[key]) {
    throw new Error(`Missing Firebase configuration: ${envName}`);
  }
}
// RTDB URL is env-driven. The fallback covers the default database for this
// project when VITE_FIREBASE_DATABASE_URL is intentionally left blank.
const databaseURL =
  env(import.meta.env.VITE_FIREBASE_DATABASE_URL) ||
  `https://${firebaseConfig.projectId}-default-rtdb.firebaseio.com`;

const existingApp = getApps().find((candidate) => candidate.name === "[DEFAULT]");
export const app = existingApp || initializeApp(firebaseConfig);
export const rtdb = getDatabase(app, databaseURL);
export const auth = getAuth(app);
