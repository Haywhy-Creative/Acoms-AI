import { IonIcon } from "@ionic/react";
import { informationCircleOutline, closeCircleOutline } from "ionicons/icons";
import { useState } from "react";
import { motion } from "framer-motion";

const varinats = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0, scale: 0.8, transition: { duration: 0.15 } },
};
const apiKeyLength = 40;

export default function Apikey() {
  const [userapikey, setUserApikey] = useState("");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Key name must match chatService.getApiKey().
    localStorage.setItem("apikey", userapikey);
    alert("API key saved successfully!");
  }

  function handleClose() {
    localStorage.removeItem("apikey");
  }

  return (
    <motion.div
      variants={varinats}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="bg-[#1c1f2b] text-slate-300 border border-white/10 max-w-xl w-full p-6 rounded-2xl mx-2 md:mx-0 shadow-2xl font-['Plus_Jakarta_Sans',sans-serif]"
    >
      <div className="text-right">
        <button
          type="button"
          className="text-xl text-slate-400 hover:text-white transition-colors cursor-pointer"
          onClick={handleClose}
          title="Close"
        >
          <IonIcon icon={closeCircleOutline} />
        </button>
      </div>
      <h2 className="text-xl font-semibold text-center my-2 text-slate-200">
        Enter your API key
      </h2>
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          placeholder="sk-################################"
          onChange={(e) => setUserApikey(e.target.value)}
          autoFocus
          className="bg-[#161923] border border-white/10 text-slate-200 text-sm rounded-xl focus:ring-1 focus:ring-[#7c4dff] focus:border-[#7c4dff] block w-full p-3 outline-none placeholder:text-slate-600 transition-all"
        />
        <div className="flex items-center mt-4 text-slate-400">
          <span className="flex items-center text-base text-[#9670ff]">
            <IonIcon icon={informationCircleOutline} />
          </span>
          <span className="ml-2 text-xs font-medium text-slate-400">
            Your API key is stored securely in your browser's local storage.
          </span>
        </div>
        <div className="text-center mt-5">
          <button
            type="submit"
            disabled={userapikey.length < apiKeyLength}
            className="w-full py-3 px-5 text-sm font-semibold text-white bg-[#7c4dff] hover:bg-[#6b3fd4] rounded-xl transition-all shadow-md shadow-[#7c4dff]/20 disabled:cursor-not-allowed disabled:bg-[#252936] disabled:text-slate-500 disabled:shadow-none cursor-pointer"
          >
            Save API Key
          </button>
        </div>
      </form>
    </motion.div>
  );
}