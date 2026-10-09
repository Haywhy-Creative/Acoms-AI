import classNames from "classnames";
import { ChatMessageType } from "../../store/store";
import { motion } from "framer-motion";
import { useState } from "react";
import { IonIcon } from "@ionic/react";
import { shareOutline, checkmarkOutline } from "ionicons/icons";

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
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy response link:", err);
    }
  };

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

        {/* Message Content Container */}
        <div className="flex-1 min-w-0 text-slate-800 dark:text-slate-200">
          {chat.type && chat.type === "image_url" ? (
            <ImageMessage index={index} chat={chat} />
          ) : (
            <TextMessage index={index} chat={chat} />
          )}
        </div>

        {/* Floating Share Button on Message Card */}
        <div className="flex-shrink-0">
          <button
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
      </motion.div>
    </div>
  );
}