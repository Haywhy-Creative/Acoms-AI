import { IonIcon } from "@ionic/react";
import { informationCircleOutline } from "ionicons/icons";
import { useSettings } from "../../store/store";

export default function Header() {
  const [systemMessage, useSystemMessageForAllChats] = useSettings(
    (state) => [
      state.settings.systemMessage,
      state.settings.useSystemMessageForAllChats,
    ]
  );

  return (
    <header className="bg-white dark:bg-[#161923] text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-white/10 py-3 px-4 grid grid-cols-3 items-center font-['Plus_Jakarta_Sans',sans-serif] relative z-10 transition-colors duration-200">
      {/* Left Section: System Instructions Info */}
      <div className="flex items-center justify-start">
        {useSystemMessageForAllChats && (
          <span className="flex text-lg group cursor-pointer text-[#7c4dff] dark:text-[#9670ff] hover:text-slate-900 dark:hover:text-white transition-colors relative">
            <IonIcon icon={informationCircleOutline} />
            <span className="absolute z-30 left-0 w-72 top-[calc(100%+0.5rem)] text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-[#1c1f2b] border border-slate-200 dark:border-white/10 p-3 rounded-xl shadow-2xl invisible pointer-events-none group-hover:visible group-hover:pointer-events-auto transition-all text-left">
              <span className="block font-semibold text-[#7c4dff] dark:text-[#9670ff] mb-1">
                Custom System Instructions Active
              </span>
              <span className="text-slate-500 dark:text-slate-400 block max-h-32 overflow-y-auto">
                {systemMessage || "No custom message defined."}
              </span>
            </span>
          </span>
        )}
      </div>

      {/* Center Section: Workspace Title */}
      <div className="text-xs text-slate-500 dark:text-slate-400 font-medium text-center truncate">
        ACOMS-AI Workspace
      </div>

      {/* Right Section: Reserved for layout actions */}
      <div className="flex items-center justify-end gap-2"></div>
    </header>
  );
}