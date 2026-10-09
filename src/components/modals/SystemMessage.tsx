import { motion } from "framer-motion";
import { useSettings } from "../../store/store";
import { useState } from "react";

const variants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.8, transition: { duration: 0.15 } },
};

export default function SystemMessage() {
  const [
    systemMessage,
    useSystemMessageForAllChats,
    setSystemMessage,
    setSystemMessageModalVisible,
  ] = useSettings((state) => [
    state.settings.systemMessage,
    state.settings.useSystemMessageForAllChats,
    state.setSystemMessage,
    state.setSystemMessageModalVisible,
  ]);
  const [message, setMessage] = useState(systemMessage);
  const [useForAllChats, setUseForAllChats] = useState(
    useSystemMessageForAllChats
  );

  function handleOnSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSystemMessage({ message, useForAllChats });
    setSystemMessageModalVisible(false);
  }

  return (
    <motion.div
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="sys-msg p-5 rounded-2xl bg-white dark:bg-[#1c1f2b] border border-slate-200 dark:border-white/10 mx-2 md:mx-0 text-slate-800 dark:text-slate-300 w-full max-w-xl py-5 shadow-2xl font-['Plus_Jakarta_Sans',sans-serif] transition-colors duration-200"
    >
      <form onSubmit={handleOnSubmit}>
        <label htmlFor="sysmsg" className="inline-block mb-2 text-sm font-semibold text-slate-900 dark:text-slate-200">
          Custom System Instructions
        </label>

        <textarea
          name="sysmsg"
          id="sysmsg"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full h-32 bg-slate-50 dark:bg-[#161923] text-slate-900 dark:text-slate-200 border border-slate-200 dark:border-white/10 focus:outline-none focus:border-[#7c4dff] focus:ring-1 focus:ring-[#7c4dff] rounded-xl p-3 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 resize-none transition-all"
          placeholder="Enter custom instructions for the AI behavior..."
          maxLength={1500}
        ></textarea>

        <div className="mt-3 flex items-center mb-5 justify-between border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#161923] rounded-xl p-3 transition-colors duration-200">
          <label
            htmlFor="default-checkbox"
            className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none"
          >
            Use for all chats
          </label>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              id="default-checkbox"
              checked={useForAllChats}
              onChange={(e) => setUseForAllChats(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 dark:bg-[#252936] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all border border-slate-300 dark:border-white/10 peer-checked:bg-[#7c4dff]"></div>
          </label>
        </div>

        <div className="flex justify-end gap-2.5 mt-4">
          <button
            type="button"
            className="bg-slate-100 dark:bg-[#252936] hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer border border-slate-200 dark:border-white/10 shadow-sm"
            onClick={() => setSystemMessageModalVisible(false)}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="bg-[#7c4dff] hover:bg-[#6b3fd4] text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-md shadow-[#7c4dff]/20 cursor-pointer"
          >
            Save Changes
          </button>
        </div>
      </form>
    </motion.div>
  );
}