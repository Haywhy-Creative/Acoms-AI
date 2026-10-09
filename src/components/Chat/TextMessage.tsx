import classNames from "classnames";
import Avatar from "../Avatar/Avatar";
import { clipboardOutline, checkmarkOutline } from "ionicons/icons";
import { IonIcon } from "@ionic/react";
import { SyncLoader } from "react-spinners";
import useClipboard from "../../hooks/useClipboard";
import useBot from "../../hooks/useBot";
import { ChatMessageType } from "../../store/store";
import Markdown from "react-markdown";
import CodeHighlight from "../CodeHighlight/CodeHighlight";

type Props = {
  index: number;
  chat: ChatMessageType;
};

export default function TextMessage({ index, chat }: Props) {
  const { copy, copied } = useClipboard();
  const { result, error, isStreamCompleted, cursorRef } = useBot({
    index,
    chat,
  });

  return (
    <div className="py-3 px-2 md:px-0 font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="max-w-2xl mx-auto bg-white dark:bg-[#1c1f2b]/40 border border-slate-200 dark:border-white/5 rounded-2xl p-4 shadow-md flex flex-col gap-3 group transition-colors duration-200">
        <div className="flex items-start w-full gap-3">
          <div className="rounded-xl flex items-center flex-shrink-0 bg-slate-100 dark:bg-[#252936] p-1 border border-slate-200 dark:border-white/10">
            <Avatar className="h-8 w-8" src="/imgs/logo.svg" />
          </div>

          {!result && !error ? (
            <div className="self-center py-2">
              <SyncLoader color="#7c4dff" size={7} speedMultiplier={0.6} />
            </div>
          ) : (
            <div
              className={classNames(
                "flex-1 w-full overflow-x-hidden text-sm leading-relaxed space-y-3",
                {
                  "text-red-500 dark:text-red-400": error,
                  "text-slate-800 dark:text-slate-200": !error,
                }
              )}
            >
              <Markdown
                children={result}
                components={{
                  code(props) {
                    const { children, className, node, ...rest } = props;
                    const match = /language-(\w+)/.exec(className || "");
                    return match ? (
                      <CodeHighlight language={match[1]}>
                        {String(children).replace(/\n$/, "")}
                      </CodeHighlight>
                    ) : (
                      <code
                        {...rest}
                        className="bg-slate-100 dark:bg-[#161923] border border-slate-200 dark:border-white/10 px-1.5 py-0.5 rounded text-[#7c4dff] dark:text-[#9670ff] text-xs font-mono"
                      >
                        {children}
                      </code>
                    );
                  },
                }}
              />

              {!isStreamCompleted && !chat.content && (
                <span
                  className="ml-1 blink bg-[#7c4dff] h-4 w-1 inline-block align-middle"
                  ref={cursorRef}
                ></span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end pt-2 border-t border-slate-200 dark:border-white/5">
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-[#252936] border border-slate-200 dark:border-white/10 px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer shadow-sm"
            onClick={() => copy(result)}
            title="Copy response"
          >
            {!copied ? (
              <>
                <IonIcon icon={clipboardOutline} className="text-base text-[#7c4dff] dark:text-[#9670ff]" />
                <span>Copy</span>
              </>
            ) : (
              <>
                <IonIcon icon={checkmarkOutline} className="text-base text-teal-500 dark:text-teal-400" />
                <span className="text-teal-500 dark:text-teal-400">Copied</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}