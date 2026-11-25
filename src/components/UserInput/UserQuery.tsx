import { IonIcon } from "@ionic/react";
import classNames from "classnames";
import {
  sendOutline,
  send,
  micOutline,
  square,
  pause,
  play,
  close,
  attachOutline,
  closeOutline,
  documentTextOutline,
  imageOutline,
} from "ionicons/icons";
import { useRef, useState, useEffect } from "react";
import useChat, { endAssistantStream } from "../../store/store";
import { createMessage } from "../../utils/createMessage";
import {
  beginImageTurn,
  COMPUTING_REFUSAL,
  endImageTurn,
  fetchResults,
  markAssistantAsHandled,
  stashAttachedFileContext,
  type FetchResultStatus,
  type GroqRequestMessage,
} from "../../services/chatService";
import { transcribeAudioWithGroq } from "../../utils/groqTranscription";
import {
  ATTACHED_FILE_SYSTEM_MESSAGE,
  buildAttachedFilePrompt,
  extractFileText,
} from "../../utils/fileText";
import { readAttachmentMetadata } from "../../utils/attachmentMetadata";
import { generateAiImage } from "../../utils/imageGen";
import {
  assertImageQuotaAvailable,
  recordImageGeneration,
  toSafeImageError,
} from "../../utils/imageGenerationGuard";

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function UserQuery() {
  const [query, setQuery] = useState("");
  // Native MediaRecorder states mirrored into UI state: a paused recorder keeps
  // the same session/chunks, so Stop still transcribes the full audio.
  const [recordingState, setRecordingState] = useState<
    "idle" | "starting" | "recording" | "paused"
  >("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  // Live analyser-driven bars replace the CSS fallback when Web Audio is ready.
  const [hasLiveWaveform, setHasLiveWaveform] = useState(false);

  const isRecording = recordingState !== "idle";
  const isPaused = recordingState === "paused";
  const canControlRecording =
    recordingState === "recording" || recordingState === "paused";

  // 📂 File & Image Attachment State
  const [attachedFile, setAttachedFile] = useState<{
    name: string;
    content: string;
    type: string;
    fileObj?: File;
  } | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [isParsingFile, setIsParsingFile] = useState(false);

  const recognitionRef = useRef<any>(null);
  const accumulatedSpeechRef = useRef<string>("");
  // Text captured before a pause must survive restarting the fallback
  // SpeechRecognition instance on resume.
  const speechPrefixRef = useRef<string>("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  // Web Audio visualizer: analyser levels are written straight to bar refs so
  // 60fps animation does not force React re-renders.
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const waveformFrameRef = useRef<number | null>(null);
  const waveformBarsRef = useRef<Array<HTMLSpanElement | null>>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // A late getUserMedia permission prompt must not revive a discarded take.
  const recordingTokenRef = useRef(0);
  const transcriptionControllerRef = useRef<AbortController | null>(null);
  const recordingSegmentStartRef = useRef<number>(0);
  const elapsedBeforeSegmentRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<null | HTMLFormElement>(null);
  const activeRequestControllerRef = useRef<AbortController | null>(null);
  // Tracks the placeholder currently owning the composer's busy state so the
  // mic/send controls unlock as soon as its final content is written.
  const activeAssistantIdRef = useRef<string | null>(null);
  const activeTurnIsImageRef = useRef(false);
  // Synchronous guard: React state does not flush before a second Enter/click,
  // so `isProcessingAI` alone can still admit a duplicate submission.
  const submitLockRef = useRef(false);
  // Account switches invalidate in-flight submissions so a stale finally block
  // cannot clear the new account's busy state.
  const submitGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const cancelRecordingRef = useRef<() => void>(() => {});

  const addChat = useChat((state) => state.addChat);
  const updateMessageContent = useChat((state) => state.updateMessageContent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // --- Recording timer: only accumulates while MediaRecorder is recording. ---
  function clearRecordingTimer() {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function startRecordingTimer() {
    clearRecordingTimer();
    recordingSegmentStartRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const total =
        elapsedBeforeSegmentRef.current +
        (Date.now() - recordingSegmentStartRef.current);
      setElapsedSeconds(Math.floor(total / 1000));
    }, 250);
  }

  function pauseRecordingTimer() {
    if (timerRef.current === null) return;
    elapsedBeforeSegmentRef.current +=
      Date.now() - recordingSegmentStartRef.current;
    clearRecordingTimer();
  }

  function formatDuration(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  // --- Live mic waveform (Web Audio AnalyserNode with CSS fallback) ---
  function stopWaveformFrame() {
    if (waveformFrameRef.current === null) return;
    cancelAnimationFrame(waveformFrameRef.current);
    waveformFrameRef.current = null;
  }

  function settleWaveformBars() {
    stopWaveformFrame();
    waveformBarsRef.current.forEach((bar) => {
      if (bar) bar.style.height = "8px";
    });
  }

  function teardownAudioVisualizer() {
    stopWaveformFrame();
    micSourceRef.current?.disconnect();
    micSourceRef.current = null;
    analyserRef.current = null;

    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") {
      void context.close().catch((e) => {
        console.error("Failed to close audio visualizer context:", e);
      });
    }

    waveformBarsRef.current.forEach((bar) => {
      if (bar) bar.style.removeProperty("height");
    });
    if (mountedRef.current) setHasLiveWaveform(false);
  }

  function startWaveformFrame() {
    stopWaveformFrame();
    const analyser = analyserRef.current;
    const bars = waveformBarsRef.current;
    if (!analyser || !bars.length) return;

    const bins = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      analyser.getByteFrequencyData(bins);
      const now = performance.now();
      const perBand = Math.max(1, Math.floor(bins.length / bars.length));
      bars.forEach((bar, index) => {
        if (!bar) return;
        let sum = 0;
        const offset = index * perBand;
        for (let i = offset; i < offset + perBand && i < bins.length; i += 1) {
          sum += bins[i];
        }
        const level = sum / (perBand * 255);
        // Keep a visible floor even in quiet rooms so the bars never look
        // frozen; real mic level adds the larger movement on top.
        const idleMotion = 2 + (Math.sin(now / 130 + index * 0.9) + 1) * 2;
        const height = Math.round(
          4 + Math.min(1, level * 2.2) * 16 + idleMotion
        );
        bar.style.height = `${height}px`;
      });
      waveformFrameRef.current = requestAnimationFrame(draw);
    };
    waveformFrameRef.current = requestAnimationFrame(draw);
  }

  function setupAudioVisualizer(stream: MediaStream) {
    teardownAudioVisualizer();
    try {
      const AudioContextCtor =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) return;

      const context = new AudioContextCtor() as AudioContext;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      // Do not connect to destination: that would play the mic back to speakers.
      source.connect(analyser);

      audioContextRef.current = context;
      micSourceRef.current = source;
      analyserRef.current = analyser;
      setHasLiveWaveform(true);
      void context.resume().catch(() => undefined);
      startWaveformFrame();
    } catch (e) {
      console.error("Live waveform unavailable; using CSS animation:", e);
      teardownAudioVisualizer();
    }
  }

  // Setup SpeechRecognition listener in background. A fresh instance is created
  // whenever recording (re)starts so pause → resume cannot hit InvalidStateError.
  useEffect(() => {
    createFallbackRecognition();
  }, []);

  // Release microphone hardware and timer if the composer unmounts mid-recording.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      recordingTokenRef.current += 1;
      if (waveformFrameRef.current !== null) {
        cancelAnimationFrame(waveformFrameRef.current);
        waveformFrameRef.current = null;
      }
      micSourceRef.current?.disconnect();
      micSourceRef.current = null;
      analyserRef.current = null;
      const context = audioContextRef.current;
      audioContextRef.current = null;
      if (context && context.state !== "closed") {
        void context.close().catch((e) => {
          console.error("Failed to close audio visualizer context:", e);
        });
      }
      activeRequestControllerRef.current?.abort();
      activeRequestControllerRef.current = null;
      transcriptionControllerRef.current?.abort();
      transcriptionControllerRef.current = null;
      submitGenerationRef.current += 1;
      if (timerRef.current !== null) clearInterval(timerRef.current);
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        try {
          recorder.stop();
        } catch (e) {
          console.error("Failed to stop recorder on unmount:", e);
        }
      }
      try {
        recognitionRef.current?.stop();
      } catch (e) {
        console.error("Failed to stop speech recognition on unmount:", e);
      }
      audioStreamRef.current?.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
      mediaRecorderRef.current = null;
    };
  }, []);

  // Completion safety net for text replies. Image turns stay busy until the
  // quota record and the outer submit finally have both settled.
  useEffect(() => {
    return useChat.subscribe((state) => {
      const activeId = activeAssistantIdRef.current;
      if (!activeId || activeTurnIsImageRef.current) return;
      const activeMessage = state.chats.find((item) => item.id === activeId);
      if (!activeMessage || !activeMessage.content.trim()) return;

      activeAssistantIdRef.current = null;
      endAssistantStream(activeId);
      setIsProcessingAI(false);
    });
  }, []);

  // A sign-out/account switch must cancel voice capture, transcription and the
  // active submission instead of leaving the composer disabled for the old user.
  useEffect(() => {
    let previousUserId = useChat.getState().userId;
    return useChat.subscribe((state) => {
      if (state.userId === previousUserId) return;
      previousUserId = state.userId;

      recordingTokenRef.current += 1;
      cancelRecordingRef.current();
      transcriptionControllerRef.current?.abort();
      transcriptionControllerRef.current = null;
      activeRequestControllerRef.current?.abort();
      activeRequestControllerRef.current = null;
      activeAssistantIdRef.current = null;
      activeTurnIsImageRef.current = false;
      submitGenerationRef.current += 1;
      submitLockRef.current = false;
      setIsTranscribing(false);
      setIsProcessingAI(false);
    });
  }, []);

  function createFallbackRecognition() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let fullTranscript = "";
      for (let i = 0; i < event.results.length; ++i) {
        fullTranscript += event.results[i][0].transcript + " ";
      }
      const prefix = speechPrefixRef.current;
      accumulatedSpeechRef.current = (
        prefix ? `${prefix} ${fullTranscript}` : fullTranscript
      ).trim();
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    return recognition;
  }

  function startFallbackRecognition() {
    const recognition =
      recognitionRef.current ?? createFallbackRecognition();
    if (!recognition) return;
    try {
      recognition.start();
    } catch (e) {
      console.error("Speech recognition start failed:", e);
    }
  }

  function stopFallbackRecognition() {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      recognition.stop();
    } catch (e) {
      console.error("Speech recognition stop failed:", e);
    }
    // Drop the finished instance so a later resume can safely create a new one.
    recognitionRef.current = null;
  }

  // 1. START RECORDING (MediaRecorder for Groq Whisper + browser fallback)
  async function startRecording() {
    const token = ++recordingTokenRef.current;
    accumulatedSpeechRef.current = "";
    speechPrefixRef.current = "";
    elapsedBeforeSegmentRef.current = 0;
    setElapsedSeconds(0);
    // Show a distinct starting state until the microphone is actually live.
    setRecordingState("starting");

    try {
      if (canRecordAudio) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!mountedRef.current || token !== recordingTokenRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        audioStreamRef.current = stream;
        setupAudioVisualizer(stream);

        const recorder = new MediaRecorder(stream);
        audioChunksRef.current = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };
        recorder.start();
        mediaRecorderRef.current = recorder;
      }

      if (!mountedRef.current || token !== recordingTokenRef.current) return;
      setRecordingState("recording");
      startRecordingTimer();
      // Browser SpeechRecognition stays active as a fallback transcript source.
      startFallbackRecognition();
    } catch (e) {
      console.error("Failed to start audio capture:", e);
      if (token === recordingTokenRef.current) cancelRecording();
    }
  }

  // 2. PAUSE / RESUME — the same MediaRecorder session and its chunk array are
  // kept, so a later Stop transcribes one continuous recording.
  function pauseRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      try {
        recorder.pause();
      } catch (e) {
        console.error("Failed to pause recording:", e);
        return;
      }
    }
    pauseRecordingTimer();
    settleWaveformBars();
    speechPrefixRef.current = accumulatedSpeechRef.current;
    stopFallbackRecognition();
    setRecordingState("paused");
  }

  function resumeRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "paused") {
      try {
        recorder.resume();
      } catch (e) {
        console.error("Failed to resume recording:", e);
        return;
      }
    }
    // Only drop the pre-pause transcript after the native recorder resumed.
    accumulatedSpeechRef.current = speechPrefixRef.current;
    startRecordingTimer();
    startWaveformFrame();
    startFallbackRecognition();
    setRecordingState("recording");
  }

  // Discard the current take without sending anything to Whisper.
  function cancelRecording() {
    recordingTokenRef.current += 1;
    transcriptionControllerRef.current?.abort();
    transcriptionControllerRef.current = null;
    setIsTranscribing(false);
    teardownAudioVisualizer();
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      recorder.onstop = null;
      recorder.ondataavailable = null;
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch (e) {
          console.error("Failed to stop recorder on cancel:", e);
        }
      }
    }
    stopFallbackRecognition();
    clearRecordingTimer();
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = null;
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    accumulatedSpeechRef.current = "";
    speechPrefixRef.current = "";
    elapsedBeforeSegmentRef.current = 0;
    setElapsedSeconds(0);
    setRecordingState("idle");
  }

  cancelRecordingRef.current = cancelRecording;

  // 3. STOP RECORDING & TRANSCRIBE INTO INPUT (Groq Whisper)
  async function stopRecordingAndTranscribe(): Promise<string> {
    if (recordingState !== "recording" && recordingState !== "paused") return "";
    const token = ++recordingTokenRef.current;
    stopFallbackRecognition();
    teardownAudioVisualizer();
    clearRecordingTimer();
    setRecordingState("idle");
    setIsTranscribing(true);

    const controller = new AbortController();
    transcriptionControllerRef.current = controller;
    let transcript = "";
    try {
      const audioBlob = await new Promise<Blob | null>((resolve, reject) => {
        const recorder = mediaRecorderRef.current;
        if (!recorder || recorder.state === "inactive") {
          resolve(null);
          return;
        }

        const stopTimeout = setTimeout(() => {
          recorder.onstop = null;
          reject(new Error("Audio capture did not finish."));
        }, 5_000);

        recorder.onstop = () => {
          clearTimeout(stopTimeout);
          resolve(
            new Blob(audioChunksRef.current, {
              type: recorder.mimeType || "audio/webm",
            })
          );
        };
        try {
          recorder.stop();
        } catch (e) {
          clearTimeout(stopTimeout);
          reject(e);
        }
      });

      if (audioBlob && audioBlob.size > 0) {
        transcript = await transcribeAudioWithGroq(audioBlob, controller.signal);
      }
    } catch (e) {
      if (controller.signal.aborted) {
        console.log("Transcription cancelled.");
      } else {
        console.error("Groq Whisper transcription failed:", e);
      }
    } finally {
      transcriptionControllerRef.current = null;
      audioStreamRef.current?.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
      mediaRecorderRef.current = null;
      audioChunksRef.current = [];
      elapsedBeforeSegmentRef.current = 0;
      setElapsedSeconds(0);
      setIsTranscribing(false);
    }

    if (!mountedRef.current || token !== recordingTokenRef.current) return "";

    if (!transcript) transcript = accumulatedSpeechRef.current;

    if (transcript) {
      setQuery((prev) => (prev ? `${prev} ${transcript}` : transcript));
    }

    setTimeout(() => {
      if (!mountedRef.current || token !== recordingTokenRef.current) return;
      if (textareaRef.current) {
        textareaRef.current.style.height = "0px";
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        textareaRef.current.focus();
      }
    }, 50);

    return transcript;
  }

  // 📂 Handle File & Image Selection natively
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsingFile(true);

    try {
      if (file.type.startsWith("image/")) {
        const previewUrl = URL.createObjectURL(file);
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });

        setImagePreviewUrl(previewUrl);
        setImageDataUrl(dataUrl);
        setAttachedFile({
          name: file.name,
          content: "[Image Attached]",
          type: file.type,
          fileObj: file,
        });
      } else {
        const extractedText = await extractFileText(file);

        setAttachedFile({
          name: file.name,
          content: extractedText,
          type: file.type,
          fileObj: file,
        });
      }
    } catch (err) {
      console.error("Error reading file:", err);
      alert("Failed to read file contents.");
    } finally {
      setIsParsingFile(false);
      if (e.target) e.target.value = "";
    }
  }

  function removeAttachment() {
    setAttachedFile(null);
    setImageDataUrl(null);
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
      setImagePreviewUrl(null);
    }
  }

  function handleOnKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const target = e.target as HTMLTextAreaElement;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isRecording || isTranscribing || isProcessingAI) return;
      if (formRef.current) {
        formRef.current.requestSubmit();
        target.style.height = "32px";
      }
    }
  }

  function handleOnInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setQuery(e.target.value);
    e.target.style.height = "0px";
    e.target.style.height = `${e.target.scrollHeight}px`;
  }

  async function handleOnSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (recordingState === "starting") return;
    if (submitLockRef.current || isProcessingAI || isTranscribing) return;
    submitLockRef.current = true;
    const generation = submitGenerationRef.current;

    try {
      let userQueryText = query.trim();
      if (isRecording) {
        const transcript = await stopRecordingAndTranscribe();
        if (transcript.trim() && !userQueryText) userQueryText = transcript.trim();
      }
      if (!userQueryText && !attachedFile) return;

      const isImageAttachment =
        !!imagePreviewUrl && !!imageDataUrl && !!attachedFile?.fileObj;

      const lowerQuery = userQueryText.toLowerCase();
      const hasVisualKeywords =
        lowerQuery.includes("image") ||
        lowerQuery.includes("picture") ||
        lowerQuery.includes("photo") ||
        lowerQuery.includes("drawing") ||
        lowerQuery.includes("component") ||
        lowerQuery.includes("ui") ||
        lowerQuery.includes("layout") ||
        lowerQuery.includes("screen");

      const isImageGenIntent =
        !isImageAttachment &&
        !attachedFile &&
        hasVisualKeywords &&
        (/^(generate|create|draw|make|design|render|show|paint|illustrate)\b/i.test(
          userQueryText
        ) ||
          lowerQuery.includes("picture of") ||
          lowerQuery.includes("image of") ||
          lowerQuery.includes("photo of"));

      const attachmentMetadata = attachedFile?.fileObj
        ? readAttachmentMetadata({
            fileName: attachedFile.name,
            fileType:
              attachedFile.type ||
              attachedFile.fileObj.type ||
              "application/octet-stream",
            fileSize: attachedFile.fileObj.size,
          })
        : null;

      let displayPrompt = userQueryText;
      let groqPrompt = userQueryText;

      if (isImageAttachment && attachedFile) {
        const imageFallback = "What would you like to know about this image?";
        displayPrompt = `[Image Attachment: ${attachedFile.name}]\n${userQueryText || imageFallback}`;
        groqPrompt = userQueryText || imageFallback;
      } else if (attachedFile) {
        const metadata = attachedFile.type
          ? `${attachedFile.name} (${attachedFile.type})`
          : attachedFile.name;
        const fileFallback = "What can you tell me about this file?";
        const question = userQueryText || fileFallback;
        displayPrompt = `[File Attachment: ${metadata}]\n${question}`;
        groqPrompt = buildAttachedFilePrompt(
          attachedFile.name,
          attachedFile.type,
          attachedFile.content,
          question
        );
        console.log(
          `📎 Attached file context prepared: ${attachedFile.name} ` +
            `(${attachedFile.content.length} characters)`
        );
      }

      const activeImageDataUrl = imageDataUrl;

      addChat(
        createMessage(
          "user",
          displayPrompt,
          isImageAttachment ? "image_url" : "text",
          attachmentMetadata ?? undefined
        )
      );

      const assistantMessage = createMessage(
        "assistant",
        "",
        isImageGenIntent ? "image_url" : "text"
      );
      markAssistantAsHandled(assistantMessage.id);
      if (attachedFile && !isImageAttachment) {
        stashAttachedFileContext(assistantMessage.id, {
          fileName: attachedFile.name,
          fileType: attachedFile.type,
          extractedText: attachedFile.content,
        });
      }
      addChat(assistantMessage);

      setQuery("");
      removeAttachment();
      if (textareaRef.current) textareaRef.current.style.height = "32px";

      const controller = isImageGenIntent
        ? beginImageTurn(assistantMessage.id) ?? new AbortController()
        : new AbortController();
      activeRequestControllerRef.current = controller;
      activeAssistantIdRef.current = assistantMessage.id;
      activeTurnIsImageRef.current = isImageGenIntent;
      setIsProcessingAI(true);
      let requestStatus: FetchResultStatus | null = null;

      try {
        if (isImageGenIntent) {
          const currentUserId = useChat.getState().userId;
          await assertImageQuotaAvailable(currentUserId);

          const generatedImageUrl = await generateAiImage(
            userQueryText,
            controller.signal
          );
          if (controller.signal.aborted) return;
          await recordImageGeneration(currentUserId);
          updateMessageContent(
            assistantMessage.id,
            generatedImageUrl,
            "image_url"
          );
        } else {
          const content: GroqRequestMessage["content"] =
            isImageAttachment && activeImageDataUrl
              ? [
                  { type: "text", text: groqPrompt },
                  {
                    type: "image_url",
                    image_url: { url: activeImageDataUrl },
                  },
                ]
              : groqPrompt;

          const requestMessages: GroqRequestMessage[] = [
            { role: "user", content },
          ];
          if (attachedFile && !isImageAttachment) {
            requestMessages.unshift({
              role: "system",
              content: ATTACHED_FILE_SYSTEM_MESSAGE,
            });
          }

          let reply = "";
          const status = await fetchResults(
            requestMessages,
            controller.signal,
            (chunk) => {
              reply += chunk;
            },
            () => {},
            assistantMessage.id
          );
          requestStatus = status;

          if (
            generation !== submitGenerationRef.current ||
            status === "suppressed" ||
            status === "aborted" ||
            controller.signal.aborted
          ) {
            return;
          }

          updateMessageContent(
            assistantMessage.id,
            reply || COMPUTING_REFUSAL
          );
        }
      } catch (err: any) {
        if (
          controller.signal.aborted ||
          generation !== submitGenerationRef.current
        ) {
          console.log("Pipeline cancelled by account switch or edit.");
          return;
        }
        console.error("❌ Pipeline failure:", err);
        updateMessageContent(
          assistantMessage.id,
          isImageGenIntent
            ? toSafeImageError(err).message
            : `⚠️ ${err?.message || "Request failed."}`,
          "text"
        );
      } finally {
        if (isImageGenIntent) {
          endImageTurn(assistantMessage.id, controller);
        }
        if (generation !== submitGenerationRef.current) return;
        activeRequestControllerRef.current = null;
        activeAssistantIdRef.current = null;
        activeTurnIsImageRef.current = false;
        if (
          requestStatus === null ||
          requestStatus === "completed" ||
          requestStatus === "blocked"
        ) {
          endAssistantStream(assistantMessage.id);
        }
        setIsProcessingAI(false);
      }
    } finally {
      if (generation === submitGenerationRef.current) {
        submitLockRef.current = false;
      }
    }
  }

  const canRecordAudio =
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;
  const hasSpeechSupport =
    typeof window !== "undefined" &&
    (canRecordAudio ||
      !!(window.SpeechRecognition || window.webkitSpeechRecognition));

  return (
    <form
      className={classNames(
        "input bg-white dark:bg-[#1c1f2b] border rounded-2xl shadow-xl dark:shadow-2xl flex flex-col p-2.5 font-['Plus_Jakarta_Sans',sans-serif] transition-all duration-200",
        isRecording
          ? "border-[#7c4dff]/50 ring-2 ring-[#7c4dff]/15"
          : "border-slate-200 dark:border-white/10 focus-within:border-[#7c4dff]/50 focus-within:ring-1 focus-within:ring-[#7c4dff]/30"
      )}
      onSubmit={handleOnSubmit}
      ref={formRef}
    >
      {/* 📎 Attached File or Image Thumbnail Preview Chip */}
      {attachedFile && (
        <div className="flex items-center justify-between bg-slate-100 dark:bg-[#252936] px-3 py-2 rounded-xl mb-2 border border-slate-200 dark:border-white/5 animate-fadeIn">
          <div className="flex items-center gap-2.5 truncate">
            {imagePreviewUrl ? (
              <img
                src={imagePreviewUrl}
                alt="Preview"
                className="w-8 h-8 object-cover rounded-lg border border-slate-300 dark:border-white/10 shrink-0"
              />
            ) : (
              <IonIcon
                icon={documentTextOutline}
                className="text-[#7c4dff] text-lg shrink-0"
              />
            )}
            <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
              {attachedFile.name}
            </span>
          </div>
          <button
            type="button"
            onClick={removeAttachment}
            className="text-slate-400 hover:text-red-500 transition-colors p-1"
            title="Remove attachment"
          >
            <IonIcon icon={closeOutline} className="text-base" />
          </button>
        </div>
      )}

      {isParsingFile && (
        <div className="flex items-center gap-2 px-2 py-1 text-xs text-[#7c4dff] animate-pulse">
          <span className="w-3 h-3 border-2 border-[#7c4dff] border-t-transparent rounded-full animate-spin"></span>
          Reading file contents...
        </div>
      )}

      <div className="flex items-center w-full gap-1.5">
        {/* Hidden File Input supporting Images and Documents */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
          accept="image/*, .txt, .md, .json, .js, .jsx, .ts, .tsx, .csv, .pdf, .html, .css, .xml, .yaml, .yml, .py, .java, .sql"
        />

        {/* Attachment Button (hidden while the ChatGPT-style voice bar is active) */}
        {!isRecording && !isTranscribing && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer shrink-0"
            title="Attach file or image"
          >
            <IonIcon
              icon={imagePreviewUrl ? imageOutline : attachOutline}
              className="text-xl"
            />
          </button>
        )}

        <div className="flex-1 min-w-0 flex items-center relative">
          {/* 1. CHATGPT-STYLE LIVE RECORDING PILL */}
          {isRecording && (
            <div
              className="w-full flex items-center justify-between gap-3 px-3 py-1.5 rounded-xl bg-slate-100/90 dark:bg-[#252936]/90 border border-slate-200/80 dark:border-white/10 animate-fadeIn"
              role="status"
              aria-live="polite"
            >
              {/* Left: Live mic/pulse indicator + timer */}
              <div className="flex items-center gap-2.5 shrink-0">
                <span
                  className={classNames(
                    "w-2 h-2 rounded-full transition-colors",
                    recordingState === "recording"
                      ? "bg-[#7c4dff] animate-pulse"
                      : recordingState === "paused"
                      ? "bg-amber-400"
                      : "bg-slate-400 animate-pulse"
                  )}
                  aria-hidden="true"
                />
                <span className="text-xs font-mono font-medium text-slate-700 dark:text-slate-200 tabular-nums">
                  {recordingState === "starting"
                    ? "00:00"
                    : formatDuration(elapsedSeconds)}
                </span>
              </div>

              {/* Center: Moving ChatGPT-style waveform bars */}
              <div
                className="flex-1 flex items-center justify-center gap-[3px] h-6 max-w-[180px]"
                aria-hidden="true"
              >
                {[0, 1, 2, 3, 4].map((index) => (
                  <span
                    key={index}
                    ref={(node) => {
                      waveformBarsRef.current[index] = node;
                    }}
                    className={classNames(
                      "w-[3px] rounded-full origin-center transition-[height,opacity] duration-75",
                      isPaused
                        ? "bg-slate-400/70 dark:bg-slate-500/70 opacity-75"
                        : "bg-[#7c4dff] dark:bg-[#9b7bff]",
                      !hasLiveWaveform && "voice-wave-bar",
                      !hasLiveWaveform &&
                        recordingState === "recording" &&
                        "voice-wave-bar--active"
                    )}
                    style={{
                      animationDelay: hasLiveWaveform
                        ? undefined
                        : `${index * 110}ms`,
                    }}
                  />
                ))}
              </div>

              {/* Right: Subtle state label */}
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 shrink-0 hidden sm:inline">
                {recordingState === "starting"
                  ? "Connecting..."
                  : isPaused
                  ? "Paused"
                  : "Listening"}
              </span>
            </div>
          )}

          {/* 2. TRANSCRIBING STATE */}
          {isTranscribing && (
            <div
              className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-100/90 dark:bg-[#252936]/90 border border-slate-200/80 dark:border-white/10 animate-fadeIn"
              role="status"
              aria-live="polite"
            >
              <span
                className="w-4 h-4 border-2 border-[#7c4dff] border-t-transparent rounded-full animate-spin shrink-0"
                aria-hidden="true"
              />
              <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200">
                Transcribing voice...
              </span>
            </div>
          )}

          {/* 3. STANDARD TEXTAREA INPUT */}
          <textarea
            name="query"
            ref={textareaRef}
            className={classNames(
              "min-h-[32px] max-h-36 w-full outline-none resize-none bg-transparent text-slate-900 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm py-1.5",
              (isRecording || isTranscribing) && "sr-only"
            )}
            placeholder={
              attachedFile
                ? "Ask something about this attachment..."
                : "Send a message or attach file/image..."
            }
            onKeyDown={handleOnKeyDown}
            onChange={handleOnInputChange}
            value={query}
            disabled={isRecording || isTranscribing}
            autoFocus
          ></textarea>
        </div>

        {/* Right Controls: Mic / Pause / Resume / Stop / Discard / Send */}
        <div className="flex items-center gap-1.5 pl-1 shrink-0 z-20">
          {hasSpeechSupport && !isRecording && !isTranscribing && (
            <button
              type="button"
              onClick={() => void startRecording()}
              disabled={isTranscribing || isProcessingAI}
              className="transition-all duration-200 inline-flex items-center justify-center w-9 h-9 rounded-full cursor-pointer disabled:opacity-50 bg-slate-100 dark:bg-[#252936] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#2f3445] hover:text-slate-900 dark:hover:text-white"
              title="Record voice prompt"
              aria-label="Record voice prompt"
            >
              <IonIcon icon={micOutline} className="text-lg" />
            </button>
          )}

          {/* Pause icon button while actively recording */}
          {recordingState === "recording" && (
            <button
              type="button"
              onClick={pauseRecording}
              className="inline-flex items-center justify-center w-9 h-9 rounded-full cursor-pointer bg-slate-100 dark:bg-[#252936] text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#2f3445] border border-slate-200 dark:border-white/10 transition-all"
              title="Pause recording"
              aria-label="Pause recording"
            >
              <IonIcon icon={pause} className="text-base" />
            </button>
          )}

          {/* Resume (Play) icon button while paused */}
          {recordingState === "paused" && (
            <button
              type="button"
              onClick={resumeRecording}
              className="inline-flex items-center justify-center w-9 h-9 rounded-full cursor-pointer bg-[#7c4dff]/15 text-[#7c4dff] dark:text-[#9b7bff] hover:bg-[#7c4dff]/25 border border-[#7c4dff]/30 transition-all"
              title="Resume recording"
              aria-label="Resume recording"
            >
              <IonIcon icon={play} className="text-base" />
            </button>
          )}

          {/* Stop (Square) icon button to finish & transcribe */}
          {isRecording && canControlRecording && (
            <button
              type="button"
              onClick={() => void stopRecordingAndTranscribe()}
              className="inline-flex items-center justify-center w-9 h-9 rounded-full cursor-pointer bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 shadow-sm transition-all"
              title="Stop and transcribe"
              aria-label="Stop and transcribe"
            >
              <IonIcon icon={square} className="text-sm" />
            </button>
          )}

          {/* Discard (Close) icon button */}
          {isRecording && (
            <button
              type="button"
              onClick={cancelRecording}
              className="inline-flex items-center justify-center w-8 h-8 rounded-full cursor-pointer text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-[#252936] transition-colors"
              title={
                recordingState === "starting"
                  ? "Cancel recording"
                  : "Discard recording"
              }
              aria-label={
                recordingState === "starting"
                  ? "Cancel recording"
                  : "Discard recording"
              }
            >
              <IonIcon icon={close} className="text-base" />
            </button>
          )}

          {/* Send Action — hidden while the voice bar owns the composer */}
          {!isRecording && !isTranscribing && (
            <button
              type="submit"
              disabled={(!query.trim() && !attachedFile) || isProcessingAI}
              className={classNames(
                "transition-all inline-flex items-center justify-center w-9 h-9 rounded-xl cursor-pointer disabled:cursor-not-allowed",
                (query.trim() || attachedFile) && !isProcessingAI
                  ? "bg-[#7c4dff] text-white hover:bg-[#6b3fd4] shadow-md shadow-[#7c4dff]/20"
                  : "bg-slate-100 dark:bg-[#252936] text-slate-400 dark:text-slate-500"
              )}
              title="Send message"
            >
              <IonIcon
                icon={
                  isProcessingAI
                    ? documentTextOutline
                    : query.trim() || attachedFile
                    ? send
                    : sendOutline
                }
                className={`text-lg ${isProcessingAI ? "animate-spin" : ""}`}
              />
            </button>
          )}
        </div>
      </div>
    </form>
  );
}