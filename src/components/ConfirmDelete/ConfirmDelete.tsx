import { motion } from "framer-motion";
import React from "react";

type Props = {
  onDelete: () => void;
  onCancel: () => void;
  children: React.ReactNode;
};

const variants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.8, transition: { duration: 0.15 } },
};

export default function ConfirmDelete({ children, onDelete, onCancel }: Props) {
  return (
    <motion.div
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="p-6 bg-white dark:bg-[#1c1f2b] border border-slate-200 dark:border-white/10 rounded-2xl mx-2 md:mx-0 max-w-md w-full shadow-2xl text-slate-800 dark:text-slate-300 font-['Plus_Jakarta_Sans',sans-serif] transition-colors duration-200"
    >
      <h2 className="text-lg font-semibold mb-2 text-slate-900 dark:text-slate-200">
        Are you sure?
      </h2>
      <div className="text-slate-600 dark:text-slate-400 text-sm mb-6">
        {children}
      </div>
      <div className="flex items-center justify-end gap-2.5">
        <button
          type="button"
          className="bg-slate-100 dark:bg-[#252936] hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer border border-slate-200 dark:border-white/10 shadow-sm"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-md shadow-red-600/20 cursor-pointer"
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
    </motion.div>
  );
}