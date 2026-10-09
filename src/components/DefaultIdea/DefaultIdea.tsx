import { IonIcon } from "@ionic/react";
import { sendOutline } from "ionicons/icons";
import useChat from "../../store/store";
import classNames from "classnames";
import { createMessage } from "../../utils/createMessage";

export default function DefaultIdea({
  ideas,
  myclassNames,
}: {
  ideas: { idea: string; moreContext: string }[];
  myclassNames?: string;
}) {
  const addChat = useChat((state) => state.addChat);
  
  return (
    <div
      className={classNames(
        "grid grid-cols-1 md:grid-cols-2 gap-3 w-full font-['Plus_Jakarta_Sans',sans-serif]",
        myclassNames
      )}
    >
      {ideas.map((i) => (
        <button
          key={i.idea}
          className="border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1f2b] hover:bg-slate-50 dark:hover:bg-[#252936] hover:border-[#7c4dff]/40 transition-all duration-200 w-full text-left p-4 group rounded-2xl shadow-sm dark:shadow-lg flex items-center justify-between cursor-pointer"
          onClick={() => {
            addChat(createMessage("user", i.moreContext, "text"));
            addChat(createMessage("assistant", "", "text"));
          }}
        >
          <div className="flex-1 pr-3">
            <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-200 group-hover:text-[#7c4dff] dark:group-hover:text-white transition-colors">
              {i.idea}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
              {i.moreContext}
            </p>
          </div>

          <div className="text-slate-400 dark:text-slate-400 group-hover:text-[#7c4dff] dark:group-hover:text-[#9670ff] text-lg transition-transform group-hover:scale-110 flex items-center justify-center p-2 rounded-xl bg-slate-100 dark:bg-[#161923] border border-slate-200 dark:border-white/5 shadow-xs">
            <IonIcon icon={sendOutline} />
          </div>
        </button>
      ))}
    </div>
  );
}