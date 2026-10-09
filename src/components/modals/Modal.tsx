import classNames from "classnames";
import { AnimatePresence, motion } from "framer-motion";
import React from "react";

type Props = {
  children: React.ReactNode;
  className?: string;
  visible: boolean;
};

const variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

export default function Modal(props: Props) {
  const modal_cn = classNames(
    "modal font-['Plus_Jakarta_Sans',sans-serif] fixed top-0 left-0 right-0 bottom-0 bg-[#0f111a]/80 backdrop-blur-md z-50 flex items-center justify-center p-4",
    props.className
  );

  return (
    <AnimatePresence>
      {props.visible && (
        <motion.div
          variants={variants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className={modal_cn}
        >
          {props.children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}