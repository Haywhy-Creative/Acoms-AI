import classNames from "classnames";
import useChat, {
  ChatMessageType,
  isStreamInProgress,
} from "../../store/store";
import { regenerateImageTurn } from "../../services/imageTurnService";
import { motion } from "framer-motion";
import { useState } from "react";
import { IonIcon } from "@ionic/react";
import { shareOutline, checkmarkOutline, imageOutline } from "ionicons/icons";

import TextMessage from "./TextMessage";
import ImageMessage from "./ImageMessage";

const variants = {
  hidden: { scale: 0.95, opacity: 0 },
  visible: { scale: 1, opacity: 1, transition: { duration: 0.2 } },
};

type Props = {
  index: number;
  chat: ChatMessageType;
};

export default function BotMessage({ index, chat }: Props) {
  const [copied, setCopied] = useState(false);

  const handleShareResponse = async () => {
    if (!navigator.clipboard?.writeText) return;
    try {
      const shareUrl = new URL(window.location.href);
      shareUrl.searchParams.set("chat", String(index));
      shareUrl.searchParams.set("msg", chat.id || String(index));
      await navigator.clipboard.writeText(shareUrl.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy response link:", err);
    }
  };

  // Restored records may contain non-string content; treat those as empty.
  const content = typeof chat.content === "string" ? chat.content : "";
  const isImageMessage = chat.type === "image_url";

  // 🔄 Check if the assistant is still generating (empty content placeholder)
  const isGenerating = isImageMessage && content.trim() === "";
  const canRetryImage = isGenerating && !isStreamInProgress(chat.id);

  function retryImage() {
    const previous = useChat.getState().chats[index - 1];
    const prompt =
      typeof previous?.content === "string" ? previous.content : "";
    void regenerateImageTurn(
      chat.id,
      prompt.replace(/^\[Image Attachment:[^\]]*\]\s*/i, "").trim() ||
        "Generate an image."
    );
  }

  return (
    <div
      className={classNames(
        "py-4 bg-slate-100/50 dark:bg-[#161923]/40 border-y border-slate-200 dark:border-white/5 px-4 md:px-6 font-['Plus_Jakarta_Sans',sans-serif] transition-colors duration-200"
      )}
    >
      <motion.div
        variants={variants}
        initial="hidden"
        animate="visible"
        className="max-w-2xl mx-auto w-full flex items-start gap-3.5 relative group"
      >
        {/* Custom Assistant Logo / Avatar Badge */}
        <div className="w-8 h-8 rounded-full bg-white dark:bg-[#1c1f2b] border border-slate-200 dark:border-white/10 flex items-center justify-center overflow-hidden shadow-sm flex-shrink-0 mt-0.5">
          <img
            src="/imgs/logo.svg"
            alt="ACOMS-AI Logo"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Message Content Container with Loading State Protection */}
        <div className="flex-1 min-w-0 text-slate-800 dark:text-slate-200">
          {isGenerating && canRetryImage ? (
            <div className="flex items-center gap-3 py-3 px-4 rounded-2xl bg-white dark:bg-[#1c1f2b] border border-slate-200 dark:border-white/10 shadow-sm w-fit">
              <IonIcon icon={imageOutline} className="text-[#7c4dff] text-xl" />
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  This image could not be generated.
                </span>
                <button
                  type="button"
                  onClick={retryImage}
                  className="text-[11px] font-semibold text-[#7c4dff] hover:underline self-start"
                >
                  Try again
                </button>
              </div>
            </div>
          ) : isGenerating ? (
            <div className="flex items-center gap-3 py-3 px-4 rounded-2xl bg-white dark:bg-[#1c1f2b] border border-slate-200 dark:border-white/10 shadow-sm animate-pulse w-fit">
              <IonIcon icon={imageOutline} className="text-[#7c4dff] text-xl animate-spin" />
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Generating your masterpiece...
                </span>
                <span className="text-[10px] text-slate-400">
                  Rendering high-resolution visuals via AI
                </span>
              </div>
            </div>
          ) : isImageMessage ? (
            <ImageMessage index={index} chat={chat} />
          ) : (
            <TextMessage index={index} chat={chat} />
          )}
        </div>

        {/* Floating Share Button on Message Card (Hidden while generating) */}
        {!isGenerating && (
          <div className="flex-shrink-0">
            <button
              type="button"
              onClick={handleShareResponse}
              className="flex items-center gap-1.5 text-xs bg-white dark:bg-[#252936] hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 px-2.5 py-1.5 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer shadow-sm"
              title="Share response"
            >
              <IonIcon
                icon={copied ? checkmarkOutline : shareOutline}
                className={copied ? "text-teal-500 dark:text-teal-400 text-base" : "text-[#7c4dff] dark:text-[#9670ff] text-base"}
              />
              <span className="hidden sm:inline">{copied ? "Copied!" : "Share"}</span>
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}