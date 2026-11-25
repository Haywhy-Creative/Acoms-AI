import { IonIcon } from "@ionic/react";
import { sparkles } from "ionicons/icons";

export default function GptIntro() {
  return (
    <div className="w-full pt-6 pb-2 flex flex-col items-center justify-start space-y-3 font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="flex items-center space-x-3 bg-white dark:bg-[#1c1f2b]/80 border border-slate-200 dark:border-white/10 px-5 py-2.5 rounded-full shadow-md dark:shadow-lg backdrop-blur-md transition-colors duration-200">
        <span className="text-[#7c4dff] text-xl flex items-center drop-shadow-[0_0_8px_rgba(124,77,255,0.4)]">
          <IonIcon icon={sparkles} />
        </span>
        <h1 className="text-2xl font-extrabold tracking-wide text-slate-900 dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-white dark:via-slate-200 dark:to-[#9670ff]">
          ACOMS-AI
        </h1>
      </div>
    </div>
  );
}