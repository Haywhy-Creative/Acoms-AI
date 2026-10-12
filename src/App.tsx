import { useEffect, useState } from "react";
import DefaultIdeas from "./components/DefaultIdea/DefaultIdeas";
import UserQuery from "./components/UserInput/UserQuery";
import GptIntro from "./components/Ui/GptIntro";
import { IonIcon, setupIonicReact } from "@ionic/react";
import { menuOutline, addOutline, logOutOutline } from "ionicons/icons";
import Header from "./components/Header/Header";
import useChat, { chatsLength, useAuth, useTheme, ChatType } from "./store/store";
import classNames from "classnames";
import Chats from "./components/Chat/Chats";
import { account } from "./appwriteConfig";
import { AuthContainer } from "./components/Auth/AuthContainer";
import Navbar from "./components/Navbar/Navbar";

setupIonicReact();

function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [view, setView] = useState<string>(localStorage.getItem("auth_view") || "landing");
  const [recoveryParams, setRecoveryParams] = useState({ userId: "", secret: "" });

  const [active, setActive] = useState(false);
  const isChatsVisible = useChat(chatsLength);
  const addNewChat = useChat((state: ChatType) => state.addNewChat);
  const [theme] = useTheme((state) => [state.theme]);

  // Check session on mount & handle recovery URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get("userId");
    const secret = urlParams.get("secret");

    if (userId && secret) {
      setRecoveryParams({ userId, secret });
      setView("reset-password");
      localStorage.setItem("auth_view", "reset-password");
      setLoading(false);
    } else {
      checkUserStatus();
    }
  }, []);

  const checkUserStatus = async () => {
    try {
      const session = await account.get();
      setUser(session);

      // Fetch user preferences where custom avatar is stored
      let userAvatar = "/imgs/default-avatar.jpg";
      try {
        const prefs = await account.getPrefs();
        if (prefs?.avatar) {
          userAvatar = prefs.avatar;
        }
      } catch (prefErr) {
        console.warn("Could not load user preferences on startup:", prefErr);
      }

      useAuth.getState().setUser({
        id: session.$id,
        name: session.name,
        email: session.email,
        avatar: userAvatar, // Restores custom profile picture permanently!
      });

      useChat.getState().loadUserHistory(session.$id);
      setView("chat");
    } catch (err) {
      setUser(null);

      useAuth.getState().setUser({
        id: "",
        name: "Your name?",
        email: "",
        avatar: "/imgs/default-avatar.jpg",
      });

      useChat.getState().loadUserHistory("guest");

      const savedView = localStorage.getItem("auth_view");
      if (savedView === "signup" || savedView === "forgot-password" || savedView === "reset-password") {
        setView(savedView);
      } else {
        setView("login");
        localStorage.setItem("auth_view", "login");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await account.deleteSession("current");
      setUser(null);

      useAuth.getState().setUser({
        id: "",
        name: "Your name?",
        email: "",
        avatar: "/imgs/default-avatar.jpg",
      });

      useChat.getState().loadUserHistory("guest");

      setView("login");
      localStorage.setItem("auth_view", "login");
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0f111a] flex flex-col items-center justify-center text-slate-700 dark:text-slate-300 gap-3 font-['Plus_Jakarta_Sans',sans-serif] transition-colors duration-200">
        {/* Professional Rotating Spinner */}
        <div className="w-10 h-10 border-4 border-[#7c4dff]/20 border-t-[#7c4dff] rounded-full animate-spin"></div>
        <span className="text-sm font-medium tracking-wide text-slate-500 dark:text-slate-400">
          Loading ACOMS-AI Workspace...
        </span>
      </div>
    );
  }

  // Authentication & Landing Gate
  if (!user && view !== "chat") {
    return (
      <AuthContainer
        view={view}
        setView={(newView) => {
          setView(newView);
          localStorage.setItem("auth_view", newView);
        }}
        setUser={setUser}
        recoveryParams={recoveryParams}
      />
    );
  }

  // Authenticated ACOMS-AI Interface with full dual-theme support
  return (
    <div className="App font-['Plus_Jakarta_Sans',sans-serif] md:flex bg-slate-50 dark:bg-[#0f111a] min-h-screen text-slate-900 dark:text-slate-200 transition-colors duration-200 overflow-hidden">
      <Navbar active={active} setActive={setActive} />

      <div className="">
        <button
          type="button"
          className="fixed p-2 h-9 w-9 text-xs top-4 left-4 bg-white dark:bg-[#1c1f2b] border border-slate-200 dark:border-white/10 hidden md:inline-flex text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-xl items-center justify-center z-20 cursor-pointer transition-all shadow-md"
          onClick={() => setActive(true)}
          title="Open sidebar"
        >
          <i className="fa-regular fa-window-maximize rotate-90"></i>
        </button>
      </div>

      <div className="p-3 z-10 flex items-center justify-between bg-white dark:bg-[#161923] border-b border-slate-200 dark:border-white/10 sticky top-0 text-slate-800 dark:text-slate-200 md:hidden shadow-md transition-colors duration-200">
        <button onClick={() => setActive(true)} className="text-xl flex items-center text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer">
          <IonIcon icon={menuOutline} />
        </button>

        <h2 className="text-sm font-semibold tracking-wide">New chat</h2>

        <div className="flex items-center gap-3">
          <button className="text-xl flex items-center text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer" onClick={addNewChat} title="New chat">
            <IonIcon icon={addOutline} />
          </button>
          <button className="text-lg flex items-center text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 cursor-pointer" onClick={handleLogout} title="Logout">
            <IonIcon icon={logOutOutline} />
          </button>
        </div>
      </div>

      <main
        className={classNames("w-full transition-all duration-300 relative flex flex-col min-h-screen", {
          "md:ml-[260px]": active,
        })}
      >
        {/* User Identity & Logout Header badge for Desktop */}
        <div className="hidden md:flex justify-end items-center px-6 py-2 bg-transparent absolute right-4 top-2 z-20 gap-3 text-sm">
          <span className="text-slate-600 dark:text-slate-400 text-xs font-medium">
            Hello, <strong className="text-slate-900 dark:text-slate-200 font-semibold">{user?.name || user?.email}</strong>
          </span>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 dark:text-red-400 px-3 py-1.5 rounded-xl transition-all text-xs font-semibold cursor-pointer border border-red-500/20 shadow-sm"
          >
            <IonIcon icon={logOutOutline} /> Logout
          </button>
        </div>

        <div className="flex-1 pb-32">
          {isChatsVisible ? <Header /> : <GptIntro />}
          {isChatsVisible && <Chats />}
        </div>

        <div
          className={classNames(
            "fixed left-0 px-2 right-0 transition-all duration-300 bottom-0 py-3 bg-white/80 dark:bg-[#0f111a]/80 backdrop-blur-md border-t border-slate-200 dark:border-white/5",
            {
              "bg-white dark:bg-[#0f111a]": isChatsVisible,
              "md:ml-[260px]": active,
            }
          )}
        >
          <div className="max-w-2xl md:max-w-[calc(100%-260px)] mx-auto px-2">
            {!isChatsVisible && <DefaultIdeas />}

            <div className="bg-transparent">
              <UserQuery />

              <footer className="info text-xs py-1.5 text-slate-500 dark:text-slate-400 text-center font-medium">
                Made With
                <span className="mx-1.5">
                  <i className="fas fa-heart text-red-500" aria-hidden="true"></i>
                </span>
                By
                <a
                  href="https://adegbemiro-pamilerin-portfolio.netlify.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1.5 text-[#7c4dff] hover:underline font-semibold"
                >
                  Adegbemiro Pamilerin Ayomide
                </a>
              </footer>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;