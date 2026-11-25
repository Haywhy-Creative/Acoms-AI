import { useEffect, useRef, useState } from "react";
import useChat, { ChatMessageType } from "../store/store";
import { generateAiImage } from "../utils/imageGen";
import { isValidGeneratedImageSource } from "../utils/cropGeneratedImage";
import {
  assertImageQuotaAvailable,
  recordImageGeneration,
  toSafeImageError,
} from "../utils/imageGenerationGuard";

function readSavedImage(content: unknown): string | null {
  return isValidGeneratedImageSource(content) ? content.trim() : null;
}

function invalidImageError(content: unknown): string | null {
  const raw = typeof content === "string" ? content.trim() : "";
  if (!raw || isValidGeneratedImageSource(raw)) return null;
  return "This saved image is not a valid generated image. Generate a new one.";
}

export default function useImage(index: number, chat: ChatMessageType) {
  const initialImage = readSavedImage(chat.content);
  const [image, setImage] = useState<string | null>(initialImage);
  // No automatic fallback generation: UserQuery owns the first generation and
  // BotMessage owns the empty-placeholder skeleton. This hook only displays a
  // real generated payload or regenerates on an explicit user retry.
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(() =>
    invalidImageError(chat.content)
  );
  const mountedRef = useRef(true);
  const updateMessageContent = useChat((state) => state.updateMessageContent);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Safely select the previous user query from the Zustand store.
  const userQuery = useChat((state) => {
    const prevIndex = index - 1;
    if (prevIndex >= 0 && state.chats[prevIndex]) {
      const content = state.chats[prevIndex].content;
      return typeof content === "string" ? content : "";
    }
    return "";
  });

  useEffect(() => {
    const savedImage = readSavedImage(chat.content);
    setImage(savedImage);
    setLoading(false);
    setError(invalidImageError(chat.content));
  }, [chat.id, chat.content]);

  const refetchImages = async () => {
    const prompt = userQuery.trim();
    if (!prompt) {
      if (mountedRef.current) {
        setError("No prompt is available for this image. Send a new request.");
      }
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const currentUserId = useChat.getState().userId;
      await assertImageQuotaAvailable(currentUserId);

      const generatedUrl = await generateAiImage(prompt);
      if (!isValidGeneratedImageSource(generatedUrl)) {
        throw new Error("Image generation returned an invalid image payload.");
      }
      if (mountedRef.current) {
        setImage(generatedUrl);
        // Persist the regenerated image so a reload does not restore the old one.
        updateMessageContent(chat.id, generatedUrl, "image_url");
        // Count only after the regenerated image has been accepted for render.
        await recordImageGeneration(currentUserId);
      }
    } catch (err: any) {
      if (mountedRef.current) {
        setError(toSafeImageError(err).message);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  return { image, loading, error, refetchImages };
}
