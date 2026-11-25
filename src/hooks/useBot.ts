import { useEffect, useRef, useState } from "react";
import useChat, {
  ChatMessageType,
  isStreamInProgress,
  useSettings,
} from "../store/store";
import {
  clearAssistantHandled,
  COMPUTING_REFUSAL,
  fetchResults,
  isAssistantHandled,
  isGroqTurnStarted,
  markGroqTurnStarted,
  takeAttachedFileContext,
  type GroqRequestMessage,
} from "../services/chatService";
import { ATTACHED_FILE_SYSTEM_MESSAGE } from "../utils/fileText";
import { useDebouncedCallback } from "use-debounce";
import { createMessage } from "../utils/createMessage";
import Swal from 'sweetalert2';

type Props = {
  index: number;
  chat: ChatMessageType;
};

export default function useBot({ index, chat }: Props) {
  const safeContent = typeof chat.content === "string" ? chat.content : "";
  const resultRef = useRef(safeContent);
  const cursorRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState(safeContent);
  const [error, setError] = useState("");
  const [isStreamCompleted, setIsStreamCompleted] = useState(false);
  // An assistant placeholder can be the first message in a legacy/restored
  // chat; never index `chats[-1]` or read `.content` from a null slot.
  const query = useChat((state) => state.chats[index - 1]?.content ?? "");
  const [chats, addChat] = useChat((state) => [state.chats, state.addChat]);
  const [sendHistory, selectedModal, systemMessage, useForAllChats] =
    useSettings((state) => [
      state.settings.sendChatHistory,
      state.settings.selectedModal,
      state.settings.systemMessage,
      state.settings.useSystemMessageForAllChats,
    ]);
  const chatsRef = useRef(chats);

  chatsRef.current = chats;

  const scrollToBottom = useDebouncedCallback(() => {
    if (!cursorRef.current) return;
    cursorRef.current.scrollIntoView(true);
  }, 50);

  const previousContentRef = useRef(safeContent);

  // UserQuery dispatches and streams handled placeholders itself. Mirror the
  // persisted reply into this hook's local view so TextMessage renders it
  // instead of staying on the loading indicator. When an edit clears the
  // reply, release the handled marker so the normal pipeline regenerates it.
  useEffect(() => {
    const contentWasCleared =
      Boolean(previousContentRef.current) && !chat.content;
    // A second edit can happen while a placeholder is already empty. The edit
    // path clears the handled marker; the shared ownership marker must go with
    // it or this hook would refuse to ever regenerate the turn.
    const orphanedEmptyTurn =
      !chat.content &&
      !isAssistantHandled(chat.id) &&
      !isStreamInProgress(chat.id) &&
      isGroqTurnStarted(chat.id);

    // An RTDB rehydration can briefly present an empty reply while a stream is
    // active; that must NOT clear the marker and fire a duplicate request.
    // A deliberate edit (resetChatAt) clears the handled marker first.
    if (
      (contentWasCleared || orphanedEmptyTurn) &&
      (!isAssistantHandled(chat.id) || !isStreamInProgress(chat.id))
    ) {
      clearAssistantHandled(chat.id);
      resultRef.current = "";
      setResult("");
      setIsStreamCompleted(false);
    }
    previousContentRef.current = chat.content;

    if (chat.type === "image_url") return;
    if (!isAssistantHandled(chat.id) || !chat.content) return;
    resultRef.current = chat.content;
    setResult(chat.content);
    setIsStreamCompleted(true);
  }, [chat.id, chat.content]);

  useEffect(() => {
    let completionHandled = false;

    function addMessage() {
      addChat(createMessage("assistant", resultRef.current, chat.type), index);
      setIsStreamCompleted(true);
    }

    function handleOnData(data: string) {
      resultRef.current += data;
      setResult((prev) => prev + data);
      scrollToBottom();
    }

    function handleOnError(error: Error | string) {
      const errorMessage = typeof error === "string" ? error : error.message;
      setError(errorMessage);

      const friendlyMessage = "Sorry! Please try again. Something went wrong.";

      completionHandled = true;
      // Update result stream reference and UI state
      resultRef.current = friendlyMessage;
      setResult(friendlyMessage);
      addMessage();

      // Trigger a sleek SweetAlert2 toast/popup notification
      Swal.fire({
        icon: 'error',
        title: 'Oops!',
        text: friendlyMessage,
        confirmButtonColor: '#7c4dff',
        timer: 3500,
        timerProgressBar: true,
      });
    }

    function handleOnCompletion() {
      // Persist exactly one terminal assistant message. A blocked/empty
      // response still needs a refusal reply so the full user turn is saved.
      if (completionHandled) return;
      completionHandled = true;

      if (!resultRef.current.trim()) {
        resultRef.current = COMPUTING_REFUSAL;
        setResult(COMPUTING_REFUSAL);
      }
      addMessage();
    }

    // UserQuery already dispatched this placeholder through fetchResults.
    if (isAssistantHandled(chat.id)) return;
    if (chat.content) return;
    // Image turns are owned by the image generation path, never by this hook.
    if (chat.type === "image_url") return;
    // Ownership is shared with chatService so an edit can release a stale turn.
    if (isGroqTurnStarted(chat.id)) return;
    markGroqTurnStarted(chat.id);

    setResult("");
    resultRef.current = "";
    setIsStreamCompleted(false);
    setError("");

    // Rebuild the file prompt with the edited question shown in the UI. The
    // persisted user message only carries bounded attachment metadata.
    const currentQuestion = query.replace(
      /^\[File Attachment:[^\]]*\]\s*/i,
      ""
    );
    const attachedFilePrompt = takeAttachedFileContext(
      chat.id,
      currentQuestion
    );

    let prevChats: GroqRequestMessage[] = sendHistory
      ? chatsRef.current
          .slice(0, index)
          .filter((m) => m.type === "text")
          .map((chat) => ({
            role: chat.role,
            content: chat.content,
          }))
      : [
          {
            role: chatsRef.current[index - 1]?.role ?? "user",
            content: chatsRef.current[index - 1]?.content ?? "",
          },
        ];

    if (attachedFilePrompt) {
      // RTDB stores only file metadata, so swap the last user turn back to the
      // in-memory prompt that actually contains the document text.
      let replaced = false;
      for (let i = prevChats.length - 1; i >= 0; i -= 1) {
        if (prevChats[i].role === "user" && typeof prevChats[i].content === "string") {
          prevChats[i] = { ...prevChats[i], content: attachedFilePrompt };
          replaced = true;
          break;
        }
      }
      if (!replaced) {
        prevChats.push({ role: "user", content: attachedFilePrompt });
      }
    }

    const systemMessages: GroqRequestMessage[] = [];
    if (useForAllChats && systemMessage) {
      systemMessages.push({ role: "system", content: systemMessage });
    }
    if (attachedFilePrompt) {
      systemMessages.push({
        role: "system",
        content: ATTACHED_FILE_SYSTEM_MESSAGE,
      });
    }
    if (systemMessages.length > 0) {
      prevChats = [...systemMessages, ...prevChats];
    }

    // fetchResults owns the abort controller for a keyed turn. Passing a fresh
    // signal only satisfies the API; it is intentionally not aborted here.
    const controller = new AbortController();

    void (async () => {
      try {
        await fetchResults(
          prevChats,
          controller.signal,
          handleOnData,
          handleOnCompletion,
          chat.id // dedupe: one request per assistant placeholder
        );
      } catch (err) {
        if (err instanceof Error || typeof err === "string") {
          handleOnError(err);
        }
      }
      // Do not call endAssistantStream here: updateMessageContent/addChat
      // releases the stream guard when the terminal reply is persisted, and an
      // effect rerun must never release another turn's guard.
    })();

    // No abort/cleanup on dependency changes. The stream must survive store
    // updates, StrictMode remounts and setting changes for the same message id.
  }, [
    query,
    addChat,
    index,
    scrollToBottom,
    chat.content,
    chat.id,
    chat.type,
    sendHistory,
    selectedModal,
    systemMessage,
    useForAllChats,
  ]);

  return { query, result, error, isStreamCompleted, cursorRef };
}
