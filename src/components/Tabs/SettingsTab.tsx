import { useChat, useSettings, useTheme } from "../../store/store";
import { motion } from "framer-motion";
import { useState } from "react";
import Modal from "../modals/Modal";
import ConfirmDelete from "../ConfirmDelete/ConfirmDelete";
import classNames from "classnames";
import { handleExportChats, handleImportChats } from "../../utils/importexport";

const variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

export default function SettingsTab({ visible }: { visible: boolean }) {
  const sendChatHistory = useSettings((state) => state.settings.sendChatHistory);
  const setSendChatHistory = useSettings((state) => state.setSendChatHistory);

  const theme = useTheme((state) => state.theme);
  const setTheme = useTheme((state) => state.setTheme);

  const clearAllChats = useChat((state) => state.clearAllChats);

  const [confirmDeleteChats, setConfirmDeleteChats] = useState(false);
  const [, setImportExportStatus] = useState({
    importing: false,
    exporting: false,
  });

  function handleOnChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSendChatHistory(e.target.checked);
  }

  const handleThemeToggle = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    if (typeof window !== "undefined") {
      const root = document.documentElement;
      if (newTheme === "dark") {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }
  };

  return (
    <motion.div
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={classNames("settings font-['Plus_Jakarta_Sans',sans-serif]", {
        hidden: !visible,
      })}
    >
      <div className="p-4 space-y-3">
        {/* Dark Mode Toggle */}
        <div className="flex items-center justify-between bg-white dark:bg-[#161923] border border-slate-200 dark:border-white/10 rounded-xl p-3.5 shadow-sm transition-colors duration-200">
          <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">Dark Mode</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={theme === "dark"}
              onChange={handleThemeToggle}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 dark:bg-[#252936] border border-slate-300 dark:border-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#7c4dff]"></div>
          </label>
        </div>

        {/* Clear All Chats */}
        <div className="flex items-center justify-between bg-white dark:bg-[#161923] border border-slate-200 dark:border-white/10 rounded-xl p-3.5 shadow-sm transition-colors duration-200">
          <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">
            Clear All Chats
          </span>
          <button
            type="button"
            className="bg-red-600 hover:bg-red-700 text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shadow-md cursor-pointer"
            onClick={() => setConfirmDeleteChats(true)}
          >
            Clear
          </button>
        </div>

        {/* Remember Past Conversations Toggle */}
        <div className="flex items-center justify-between bg-white dark:bg-[#161923] border border-slate-200 dark:border-white/10 rounded-xl p-3.5 shadow-sm transition-colors duration-200">
          <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">
            Remember Past Conversations
          </span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={sendChatHistory}
              className="sr-only peer"
              onChange={handleOnChange}
            />
            <div className="w-11 h-6 bg-slate-200 dark:bg-[#252936] border border-slate-300 dark:border-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#7c4dff]"></div>
          </label>
        </div>
      </div>

      <Modal visible={confirmDeleteChats}>
        <ConfirmDelete
          onDelete={() => {
            clearAllChats();
            setConfirmDeleteChats(false);
          }}
          onCancel={() => setConfirmDeleteChats(false)}
        >
          <p className="text-slate-600 dark:text-slate-400 text-sm">
            This will delete all your chats and messages. This action cannot be
            undone.
          </p>
        </ConfirmDelete>
      </Modal>
    </motion.div>
  );
}