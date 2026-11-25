import useChat from "../../store/store";
import BotMessage from "./BotMessage";
import UserMessage from "./UserMessage";

export default function Chats() {
  const chats = useChat((state) => state.chats);

  return (
    <div className="md:mt-6 w-full flex flex-col space-y-2 font-['Plus_Jakarta_Sans',sans-serif]">
      {chats.map((chat, index) => {
        // Restored/legacy records can contain null holes or non-standard roles.
        // Skip them instead of throwing on `chat.role` / `chat.id`.
        if (!chat || typeof chat !== "object") return null;
        const messageId =
          typeof chat.id === "string" && chat.id
            ? chat.id
            : `message_${index}`;
        if (chat.role === "assistant") {
          return <BotMessage index={index} key={messageId} chat={chat} />;
        }
        if (chat.role === "system") return null;
        return <UserMessage chat={chat} chatIndex={index} key={messageId} />;
      })}

      <div className="h-48 flex-shrink-0"></div>
    </div>
  );
}