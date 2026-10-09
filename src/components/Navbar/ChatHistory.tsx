import useChat, {
  priority,
  selectChatsHistory,
} from "../../store/store";
import ChatRef from "./ChatRef";

interface ChatHistoryItem {
  title: string;
  id: string;
  month: string;
  month_id: number;
}

type ChatsHistory = Record<string, ChatHistoryItem[]>;

export default function ChatHistory() {
  const chatsHistory = useChat(selectChatsHistory) as ChatsHistory;

  const historyKeys = Object.keys(chatsHistory).sort(
    (a, b) => priority.indexOf(a) - priority.indexOf(b)
  );

  return (
    <div className="my-3 text-slate-800 dark:text-slate-200 px-1 h-full space-y-3 font-['Plus_Jakarta_Sans',sans-serif]">
      {historyKeys.length > 0 ? (
        historyKeys.map((month) => (
          <div key={month} className="space-y-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider my-2 text-slate-500 dark:text-slate-400 pl-2">
              {month}
            </h3>

            <div className="space-y-0.5">
              {chatsHistory[month].map((chat) => (
                <ChatRef
                  key={chat.id}
                  chat={chat}
                />
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="h-full flex justify-center items-center p-4">
          <p className="text-center text-slate-500 dark:text-slate-400 text-sm font-medium">
            No chats yet. Start a new conversation!
          </p>
        </div>
      )}
    </div>
  );
}