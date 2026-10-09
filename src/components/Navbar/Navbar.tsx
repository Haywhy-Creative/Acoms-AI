import classnames from "classnames";
import ChatHistory from "./ChatHistory";
import { IonIcon } from "@ionic/react";
import Avatar from "../Avatar/Avatar";
import {
  addOutline,
  chatboxEllipsesOutline,
  settingsOutline,
  ellipsisHorizontalOutline,
  closeOutline,
} from "ionicons/icons";
import useChat, { useAuth, useSettings } from "../../store/store";
import Settings from "../modals/Settings";
import Modal from "../modals/Modal";
import SystemMessage from "../modals/SystemMessage";

export default function Navbar({
  active,
  setActive,
}: {
  active: boolean;
  setActive: (v: boolean) => void;
}) {
  const addNewChat = useChat((state) => state.addNewChat);
  const [
    isVisible,
    setModalVisible,
    isSystemMessageModalVisible,
    setSystemMessageModalVisible,
  ] = useSettings((state) => [
    state.isModalVisible,
    state.setModalVisible,
    state.isSystemMessageModalVisible,
    state.setSystemMessageModalVisible,
  ]);
  const name = useAuth((state) => state.user.name);

  return (
    <>
      <div
        className={classnames(
          "navwrap fixed duration-500 top-0 left-0 bottom-0 right-0 md:right-[calc(100vw-260px)] z-30 bg-black/40 dark:bg-[#0f111a]/80 backdrop-blur-sm md:bg-opacity-0",
          { "bg-opacity-80": active, "opacity-0 pointer-events-none": !active }
        )}
      >
        <nav
          className={classnames(
            "absolute left-0 bottom-0 top-0 md:flex-grow-1 w-9/12 md:w-[260px] bg-white dark:bg-[#161923] border-r border-slate-200 dark:border-white/10 text-slate-800 dark:text-white z-10 flex flex-col transition duration-500 shadow-2xl font-['Plus_Jakarta_Sans',sans-serif]",
            { "translate-x-0": active, "-translate-x-[150%]": !active }
          )}
        >
          {/* Header section with New Chat button */}
          <div className="flex mb-2 items-center justify-between gap-2 p-3">
            <button
              type="button"
              className="bg-slate-100 dark:bg-[#252936] hover:bg-[#7c4dff]/10 dark:hover:bg-[#7c4dff]/20 hover:border-[#7c4dff]/40 border border-slate-200 dark:border-white/10 p-2.5 w-full md:w-auto rounded-xl text-left flex-grow flex items-center transition-all shadow-sm group cursor-pointer"
              onClick={addNewChat}
            >
              <span className="mr-2 text-lg text-[#7c4dff] dark:text-[#9670ff] group-hover:scale-110 transition-transform">
                <IonIcon icon={addOutline} />
              </span>
              <span className="text-sm font-semibold text-slate-800 dark:text-white">New chat</span>
            </button>
            <button
              type="button"
              className="border h-10 w-10 border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-[#252936] hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl p-2 hidden md:inline-flex items-center justify-center text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
              onClick={() => setActive(false)}
            >
              <i className="fa-regular fa-window-maximize rotate-90"></i>
            </button>
          </div>

          {/* History scrollable container */}
          <div className="history overflow-y-auto h-[calc(100%-130px)] px-2 space-y-1">
            <ChatHistory />
          </div>

          {/* Account Profile Footer */}
          <div className="account font-bold z-20 bg-white dark:bg-[#161923] border-t border-slate-200 dark:border-white/10 mt-auto transition-colors duration-200">
            <div className="[&>.options]:focus-within:visible">
              <button
                type="button"
                className="px-3 relative py-3 inline-flex w-full items-center hover:bg-slate-100 dark:hover:bg-white/5 transition group cursor-pointer"
              >
                <Avatar className="h-9 w-9 rounded-xl border border-[#7c4dff]/30" />
                <span className="p-2 text-sm font-semibold truncate text-slate-800 dark:text-slate-200">{name}</span>
                <span className="ml-auto text-slate-500 dark:text-slate-400 text-xl group-hover:text-slate-800 dark:group-hover:text-white">
                  <IonIcon icon={ellipsisHorizontalOutline} />
                </span>
              </button>
              
              <div className="options absolute bottom-16 rounded-2xl left-2 right-2 bg-white dark:bg-[#1c1f2b] border border-slate-200 dark:border-white/10 font-normal invisible transition m-2 z-30 text-slate-700 dark:text-slate-300 shadow-2xl p-1.5">
                <button
                  className="p-2.5 hover:bg-[#7c4dff]/10 dark:hover:bg-[#7c4dff]/20 hover:text-slate-900 dark:hover:text-white rounded-xl w-full text-left flex items-center transition-colors cursor-pointer text-sm"
                  onClick={() => setSystemMessageModalVisible(true)}
                >
                  <span className="mr-2.5 text-lg text-[#7c4dff] dark:text-[#9670ff] flex items-center">
                    <IonIcon icon={chatboxEllipsesOutline} />
                  </span>
                  <span>Custom instructions</span>
                </button>
                <button
                  className="p-2.5 hover:bg-[#7c4dff]/10 dark:hover:bg-[#7c4dff]/20 hover:text-slate-900 dark:hover:text-white rounded-xl w-full text-left flex items-center transition-colors cursor-pointer text-sm"
                  onClick={() => setModalVisible(true)}
                >
                  <span className="mr-2.5 text-lg text-[#7c4dff] dark:text-[#9670ff] flex items-center">
                    <IonIcon icon={settingsOutline} />
                  </span>
                  <span>Settings</span>
                </button>
                <div className="h-[1px] bg-slate-200 dark:bg-white/10 my-1"></div>
              </div>
            </div>
          </div>

          {/* Mobile close sidebar button */}
          <button
            type="button"
            onClick={() => setActive(false)}
            className="close md:hidden absolute top-3 h-10 w-10 border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1f2b] rounded-xl -right-12 p-2 flex items-center justify-center text-slate-800 dark:text-white shadow-lg cursor-pointer"
          >
            <span className="text-xl flex">
              <IonIcon icon={closeOutline} />
            </span>
          </button>
        </nav>
      </div>

      <Modal visible={isVisible}>
        <Settings />
      </Modal>
      <Modal visible={isSystemMessageModalVisible}>
        <SystemMessage />
      </Modal>
    </>
  );
}