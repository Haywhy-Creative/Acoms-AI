// Image-turn regeneration shared by edited prompts and restored empty
// placeholders. Generated images are cropped inside generateAiImage before
// they are written to the store, so display/download always use the safe URL.

import useChat, { beginAssistantStream, endAssistantStream } from "../store/store";
import { generateAiImage } from "../utils/imageGen";
import {
  assertImageQuotaAvailable,
  recordImageGeneration,
  toSafeImageError,
} from "../utils/imageGenerationGuard";
import { beginImageTurn, endImageTurn } from "./chatService";

export async function regenerateImageTurn(
  turnId: string,
  prompt: string
): Promise<void> {
  const controller = beginImageTurn(turnId);
  if (!controller) return;

  beginAssistantStream(turnId);

  try {
    const userId = useChat.getState().userId;
    await assertImageQuotaAvailable(userId);

    const generatedImageUrl = await generateAiImage(
      prompt,
      controller.signal
    );
    if (controller.signal.aborted) return;

    // Record before rendering so the composer cannot be released while the
    // quota write is still in flight.
    await recordImageGeneration(userId);
    useChat.getState().updateMessageContent(
      turnId,
      generatedImageUrl,
      "image_url"
    );
  } catch (error) {
    if (controller.signal.aborted) return;
    useChat
      .getState()
      .updateMessageContent(
        turnId,
        toSafeImageError(error).message,
        "text"
      );
  } finally {
    endAssistantStream(turnId);
    endImageTurn(turnId, controller);
  }
}
