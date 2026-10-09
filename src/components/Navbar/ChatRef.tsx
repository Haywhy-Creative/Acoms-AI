import { IonIcon } from "@ionic/react";
import {
  chatboxOutline,
  trashOutline,
  pencilOutline,
  checkmarkOutline,
  closeOutline,
} from "ionicons/icons";

import useChat, { isChatSelected } from "../../store/store";
import classNames from "classnames";
import { useEffect, useState } from "react";
import Modal from "../modals/Modal";
import ConfirmDelete from "../ConfirmDelete/ConfirmDelete";
import { createPortal } from "react-dom";

export default function ChatRef({
  chat,
}: {
  chat: { id: string; title: string };
}) {
  const viewSelectedChat = useChat((state) => state.viewSelectedChat);
  const isSelected = useChat(isChatSelected(chat.id));
  const [deleteChat, editChatsTitle] = useChat((state) => [
    state.handleDeleteChats,
    state.editChatsTitle,
  ]);
  const [editTitle, setEditTitle] = useState(chat.title);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [confirmDeleteChat, setConfirmDeleteChat] = useState(false);
  const isTitleEditeble = isSelected && isEditingTitle;

  useEffect(() => {
    setIsEditingTitle(false);
  }, [isSelected]);

  function handleEditTitle(id: string, title: string) {
    if (title.trim() === "") {
      return;
    }
    setIsEditingTitle(false);
    setEditTitle(title);
    editChatsTitle(id, title);
  }
  function handleDeleteChats(id: string) {
    deleteChat(id);
    setConfirmDeleteChat(false);
  }

  return (
    <div
      className={classNames(
        "btn-wrap flex items-center w-full p-1.5 rounded-xl text-sm font-medium transition-all cursor-pointer group text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white",
        {
          "bg-[#7c4dff]/15 text-slate-900 dark:text-white border border-[#7c4dff]/30 shadow-sm":
            isSelected,
        }
      )}
    >
      {!isTitleEditeble && (
        <button
          className="py-1.5 w-3/4 flex items-center flex-grow transition text-left cursor-pointer"
          onClick={() => viewSelectedChat(chat.id)}
          title={chat.title}
        >
          <span className="mr-2.5 flex text-base text-[#7c4dff] dark:text-[#9670ff]">
            <IonIcon icon={chatboxOutline} />
          </span>

          <span className="truncate capitalize text-xs sm:text-sm">
            {editTitle ? editTitle : chat.title}
          </span>
        </button>
      )}
      {isTitleEditeble && (
        <input
          type="text"
          value={editTitle}
          className="bg-slate-100 dark:bg-[#252936] text-slate-900 dark:text-white border border-[#7c4dff] w-4/5 ml-1 p-1.5 rounded-lg outline-none text-xs"
          autoFocus
          onChange={(e) => setEditTitle(e.target.value)}
        />
      )}
      {isSelected && !isEditingTitle && (
        <div className="inline-flex w-1/4 mx-1 items-center justify-end space-x-1.5">
          <button
            className={classNames(
              "p-1 flex text-slate-500 dark:text-slate-400 hover:text-[#7c4dff] dark:hover:text-[#9670ff] transition-colors"
            )}
            onClick={() => setIsEditingTitle(true)}
            title="Edit title"
          >
            <IonIcon icon={pencilOutline} />
          </button>
          <button
            className={classNames(
              "p-1 flex text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            )}
            onClick={() => setConfirmDeleteChat(true)}
            title="Delete chat"
          >
            <IonIcon icon={trashOutline} />
          </button>
        </div>
      )}
      {isSelected && isEditingTitle && (
        <div className="inline-flex w-1/5 mx-1 items-center justify-end space-x-1.5">
          <button
            className={classNames(
              "p-1 flex text-teal-600 dark:text-teal-400 hover:text-teal-500 dark:hover:text-teal-300 transition-colors"
            )}
            onClick={() => handleEditTitle(chat.id, editTitle)}
            title="Confirm"
          >
            <IonIcon icon={checkmarkOutline} />
          </button>
          <button
            className={classNames(
              "p-1 flex text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            )}
            onClick={() => setIsEditingTitle(false)}
            title="Cancel"
          >
            <IonIcon icon={closeOutline} />
          </button>
        </div>
      )}
      {createPortal(
        <Modal visible={confirmDeleteChat}>
          <ConfirmDelete
            onDelete={() => handleDeleteChats(chat.id)}
            onCancel={() => setConfirmDeleteChat(false)}
          >
            <p className="text-slate-600 dark:text-slate-300 text-sm">
              Are you sure you want to delete this chat? This action cannot be
              undone.
            </p>
          </ConfirmDelete>
        </Modal>,
        document.getElementById("modal") as HTMLElement,
        "confirm-delete-chat"
      )}
    </div>
  );
}