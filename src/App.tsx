import { useEffect, useState } from "react";
import Navbar from "./components/Navbar/Navbar";
import DefaultIdeas from "./components/DefaultIdea/DefaultIdeas";
import UserQuery from "./components/UserInput/UserQuery";
import GptIntro from "./components/Ui/GptIntro";
import { IonIcon, setupIonicReact } from "@ionic/react";
import { menuOutline, addOutline, logOutOutline } from "ionicons/icons";
import Header from "./components/Header/Header";
import useChat, { chatsLength, useAuth, useTheme , ChatType } from "./store/store";
import classNames from "classnames";
import Chats from "./components/Chat/Chats";
import Modal from "./components/modals/Modal";
import { account } from "./appwriteConfig";
import { AuthContainer } from "./components/Auth/AuthContainer";

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

    // 1. Sync user data to Zustand useAuth store
    useAuth.getState().setUser({
      id: session.$id,
      name: session.name,
      email: session.email,
      avatar: "/imgs/default-avatar.jpg",
    });

    // 2. 🔒 TaskMaster Partition: Load this specific user's chat history immediately
    useChat.getState().loadUserHistory(session.$id);

    setView("chat");
  } catch (err) {
    setUser(null);

    // 3. Reset Zustand useAuth store state on failure/logged out state
    useAuth.getState().setUser({
      id: "",
      name: "Your name?",
      email: "",
      avatar: "/imgs/default-avatar.jpg",
    });

    // 4. Fallback chat history to guest/empty state partition
    useChat.getState().loadUserHistory("guest");

    // Redirect to login instead of landing if they aren't authenticated
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

     // Clear auth state
     useAuth.getState().setUser({
       id: "",
       name: "Your name?",
       email: "",
       avatar: "/imgs/default-avatar.jpg",
     });

     // 🔒 TaskMaster Partition: Flush chat store memory on logout
     useChat.getState().loadUserHistory("guest");

     // Redirect straight to login page
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
      <div className="min-h-screen bg-[#0f111a] flex items-center justify-center text-white text-lg font-medium">
        Loading session...
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

  // Authenticated PedroBroo ChatGPT Interface
  return (
    <div className="App font-montserrat md:flex">
      <Navbar active={active} setActive={setActive} />

      <div className="">
        <button
          type="button"
          className="shadow fixed p-2 h-8 w-8 text-sm top-4 left-4 border-2 hidden md:inline-flex dark:text-white text-gray-700 dark:border border-gray-400 rounded-md items-center justify-center z-20"
          onClick={() => setActive(true)}
        >
          <i className="fa-regular fa-window-maximize rotate-90"></i>
        </button>
      </div>

      <div className="p-3 z-10 flex items-center justify-between bg-[#202123] dark:bg-[#343541] border-b sticky top-0 text-gray-300 md:hidden">
        <button onClick={() => setActive(true)} className="text-2xl flex">
          <IonIcon icon={menuOutline} />
        </button>

        <h2>New chat</h2>

        <div className="flex items-center gap-3">
          <button className="text-2xl flex items-center" onClick={addNewChat}>
            <IonIcon icon={addOutline} />
          </button>
          <button className="text-xl flex items-center text-red-400" onClick={handleLogout} title="Logout">
            <IonIcon icon={logOutOutline} />
          </button>
        </div>
      </div>

      <main
        className={classNames("w-full transition-all duration-500", {
          "md:ml-[260px]": active,
        })}
      >
        {/* User Identity & Logout Header badge for Desktop */}
        <div className="hidden md:flex justify-end items-center px-6 py-2 bg-transparent absolute right-4 top-2 z-20 gap-3 text-sm">
          <span className="text-gray-400 dark:text-gray-300">
            Hello, <strong className="text-white">{user?.name || user?.email}</strong>
          </span>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-1.5 rounded-lg transition-all text-xs font-semibold cursor-pointer border border-red-500/20"
          >
            <IonIcon icon={logOutOutline} /> Logout
          </button>
        </div>

        {isChatsVisible ? <Header /> : <GptIntro />}

        {isChatsVisible && <Chats />}

        <div
          className={classNames(
            "fixed left-0 px-2 right-0 transition-all duration-500 bottom-0 dark:shadow-lg py-1 shadow-md backdrop-blur-sm bg-white/10 dark:bg-dark-primary/10",
            {
              "dark:bg-dark-primary bg-white": isChatsVisible,
              "md:ml-[260px]": active,
            }
          )}
        >
          <div className="max-w-2xl md:max-w-[calc(100% - 260px)] mx-auto">
            {!isChatsVisible && <DefaultIdeas />}

            <div className="dark:bg-inherit">
              <UserQuery />

              <footer className="info text-sm py-2 text-gray-700 dark:text-white text-center">
                Made With
                <span className="mx-2">
                  <i className="fas fa-heart text-red-500" aria-hidden="true"></i>
                </span>
                By
                <a
                  href="https://adegbemiro-pamilerin-portfolio.netlify.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 underline"
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
