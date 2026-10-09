import useChat from "../../store/store";
import BotMessage from "./BotMessage";
import UserMessage from "./UserMessage";

export default function Chats() {
  const chats = useChat((state) => state.chats);

  return (
    <div className="md:mt-6 w-full flex flex-col space-y-2 font-['Plus_Jakarta_Sans',sans-serif]">
      {chats.map((chat, index) =>
        chat.role === "assistant" ? (
          <BotMessage index={index} key={chat.id} chat={chat} />
        ) : (
          <UserMessage chat={chat} chatIndex={index} key={chat.id} />
        )
      )}

      <div className="h-48 flex-shrink-0"></div>
    </div>
  );
}