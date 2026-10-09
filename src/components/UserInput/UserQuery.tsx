import { IonIcon } from "@ionic/react";
import classNames from "classnames";
import { sendOutline, send } from "ionicons/icons";
import { useRef, useState } from "react";
import useChat, { useSettings } from "../../store/store";
import { createMessage } from "../../utils/createMessage";

export default function UserQuery() {
  const [query, setQuery] = useState("");
  const formRef = useRef<null | HTMLFormElement>(null);
  const addChat = useChat((state) => state.addChat);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectedModal = useSettings((state) => state.settings.selectedModal);

  function handleOnKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const target = e.target as HTMLTextAreaElement;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (formRef.current) {
        formRef.current.requestSubmit();
        target.style.height = "32px";
      }
    }
  }

  function handleOnInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const target = e.target as HTMLTextAreaElement;
    setQuery(target.value);
    target.style.height = "0px";
    target.style.height = `${target.scrollHeight}px`;
  }

  async function handleOnSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (query.trim()) {
      addChat(createMessage("user", query, "text"));
      addChat(
        createMessage(
          "assistant",
          "",
          selectedModal?.startsWith("dall-e") ? "image_url" : "text"
        )
      );
      setQuery("");
      if (textareaRef.current) textareaRef.current.style.height = "32px";
    }
  }

  return (
    <form
      className="input bg-white dark:bg-[#1c1f2b] border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl dark:shadow-2xl flex items-center p-2.5 font-['Plus_Jakarta_Sans',sans-serif] transition-all focus-within:border-[#7c4dff]/50 focus-within:ring-1 focus-within:ring-[#7c4dff]/30"
      onSubmit={handleOnSubmit}
      ref={formRef}
    >
      <div className="flex-1 px-2">
        <textarea
          name="query"
          ref={textareaRef}
          className="min-h-[32px] max-h-36 w-full outline-none resize-none bg-transparent text-slate-900 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm py-1.5"
          placeholder="Send a message..."
          onKeyDown={handleOnKeyDown}
          onChange={handleOnInputChange}
          value={query}
          autoFocus
        ></textarea>
      </div>
      <div className="flex items-center justify-center pl-2">
        <button
          type="submit"
          disabled={!query.trim()}
          className={classNames(
            "transition-all inline-flex items-center justify-center p-2.5 rounded-xl cursor-pointer disabled:cursor-not-allowed",
            query.trim()
              ? "bg-[#7c4dff] text-white hover:bg-[#6b3fd4] shadow-md shadow-[#7c4dff]/20"
              : "bg-slate-100 dark:bg-[#252936] text-slate-400 dark:text-slate-500"
          )}
          title="Send message"
        >
          <IonIcon icon={query.trim() ? send : sendOutline} className="text-lg" />
        </button>
      </div>
    </form>
  );
}