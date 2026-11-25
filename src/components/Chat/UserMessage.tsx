import { IonIcon } from "@ionic/react";
import Avatar from "../Avatar/Avatar";
import { createOutline } from "ionicons/icons";
import classNames from "classnames";
import { useEffect, useRef, useState } from "react";
import useChat, {
  beginAssistantStream,
  ChatMessageType,
  endAssistantStream,
} from "../../store/store";
import { createMessage } from "../../utils/createMessage";
import { cancelGroqTurn, clearAssistantHandled } from "../../services/chatService";
import { regenerateImageTurn } from "../../services/imageTurnService";

type Props = {
  chat: ChatMessageType;
  chatIndex: number;
};

export default function UserMessage({ chat, chatIndex }: Props) {
  const [edit, setEdit] = useState(false);
  const [updatedQuery, setUpdatedQuery] = useState(chat.content);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editChatMessage = useChat((state) => state.editChatMessage);
  const resetChatAt = useChat((state) => state.resetChatAt);
  const truncateChatAfter = useChat((state) => state.truncateChatAfter);
  const addChat = useChat((state) => state.addChat);
  const nextMessage = useChat((state) => state.chats[chatIndex + 1] as any);

  function handelChatEdit() {
    const trimmed = updatedQuery.trim();
    if (!trimmed) return;

    editChatMessage(trimmed, chatIndex);

    if (nextMessage && nextMessage.role === "assistant") {
      // Reusing this placeholder id means the old stream must be cancelled
      // before the regenerated request can claim the same turn key.
      cancelGroqTurn(nextMessage.id);
      truncateChatAfter(chatIndex + 1);
      clearAssistantHandled(nextMessage.id);
      endAssistantStream(nextMessage.id);

      if (nextMessage.type === "image_url") {
        // The old image must actually be removed, then a fresh placeholder is
        // generated with the edited prompt by the shared image-turn service.
        truncateChatAfter(chatIndex);
        const imagePlaceholder = createMessage("assistant", "", "image_url");
        addChat(imagePlaceholder, chatIndex + 1);
        beginAssistantStream(imagePlaceholder.id);
        void regenerateImageTurn(imagePlaceholder.id, trimmed);
      } else {
        // Reuse the text placeholder id so useBot issues exactly one request.
        resetChatAt(chatIndex + 1);
        beginAssistantStream(nextMessage.id);
      }
    } else {
      // No reply exists (failed/aborted turn): create a fresh placeholder and
      // let useBot own the single regeneration request.
      truncateChatAfter(chatIndex);
      addChat(createMessage("assistant", "", "text"));
    }

    setUpdatedQuery(trimmed);
    setEdit(false);
  }

  useEffect(() => {
    if (edit && editTextareaRef.current) {
      editTextareaRef.current.style.height =
        editTextareaRef.current.scrollHeight + "px";
    }
  }, [edit]);

  return (
    <div className={classNames("py-3 px-2 md:px-0 font-['Plus_Jakarta_Sans',sans-serif]")}>
      <div className="max-w-2xl mx-auto bg-white dark:bg-[#1c1f2b]/60 border border-slate-200 dark:border-white/5 rounded-2xl p-4 shadow-md md:flex md:items-start justify-between group transition-colors duration-200">
        <div className="flex items-start w-full gap-3">
          <div className="rounded-xl flex items-center flex-shrink-0 bg-slate-100 dark:bg-[#252936] p-1 border border-slate-200 dark:border-white/10">
            <Avatar className="h-8 w-8" />
          </div>

          <div className="flex-1 w-full overflow-hidden">
            {!edit ? (
              <p className="text-slate-800 dark:text-slate-200 text-sm leading-relaxed overflow-x-auto whitespace-pre-wrap">
                {chat.content}
              </p>
            ) : (
              <textarea
                name="query"
                ref={editTextareaRef}
                value={updatedQuery}
                onChange={(e) => {
                  setUpdatedQuery(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                className="w-full bg-slate-50 dark:bg-[#161923] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-200 text-sm rounded-xl p-3 outline-none resize-none focus:border-[#7c4dff] focus:ring-1 focus:ring-[#7c4dff]"
                autoFocus
              ></textarea>
            )}
          </div>
        </div>

        <div className="md:invisible group-hover:visible text-right mt-2 md:mt-0 flex-shrink-0">
          {!edit && (
            <button
              type="button"
              className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors text-lg cursor-pointer p-1 rounded-lg bg-slate-100 dark:bg-[#252936] border border-slate-200 dark:border-white/10 shadow-sm"
              onClick={() => setEdit((prev) => !prev)}
              title="Edit message"
            >
              <IonIcon icon={createOutline} />
            </button>
          )}
        </div>
      </div>

      {edit && (
        <div className="max-w-2xl mx-auto flex items-center justify-end gap-2.5 mt-3">
          <button
            type="button"
            className="px-4 py-2 bg-slate-100 dark:bg-[#252936] hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 rounded-xl text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors cursor-pointer shadow-sm"
            onClick={() => setEdit((prev) => !prev)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="px-4 py-2 bg-[#7c4dff] hover:bg-[#6b3fd4] rounded-xl text-white text-xs font-semibold shadow-md shadow-[#7c4dff]/20 transition-all cursor-pointer"
            onClick={handelChatEdit}
          >
            Save & Submit
          </button>
        </div>
      )}
    </div>
  );
}