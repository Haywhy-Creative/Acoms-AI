
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
    <div className="my-4 text-[#ECECF1] px-2 h-full">
      {historyKeys.length > 0 ? (
        historyKeys.map((month) => (
          <div key={month}>
            <h3 className="text-sm my-2 text-[#8E8EA0] pl-2">
              {month}
            </h3>

            {chatsHistory[month].map((chat) => (
              <ChatRef
                key={chat.id}
                chat={chat}
              />
            ))}
          </div>
        ))
      ) : (
        <div className="h-full flex justify-center items-center">
          <p className="text-center text-gray-400">
            No chats yet
          </p>
        </div>
      )}
    </div>
  );
}