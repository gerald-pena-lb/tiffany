"use client";

import { useState, useRef, useEffect } from "react";
import TiffanyOrb from "@/components/TiffanyOrb";
import Transcript, { type TranscriptMessage } from "@/components/Transcript";
import CalendlyEmbed from "@/components/CalendlyEmbed";
import TypeInput from "@/components/TypeInput";

const CALENDLY_URL = "https://calendly.com/talktoalinka/author-call";
const FIRST_MESSAGE =
  "Hey, welcome to the call. What was it about your conversation with our team on LinkedIn that caused you to want to dive in deeper with me today?";

export default function Page() {
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [showCalendly, setShowCalendly] = useState(false);
  const [prospectEmail, setProspectEmail] = useState("");
  const [inputMode, setInputMode] = useState<"voice" | "type">("voice");
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [interimText, setInterimText] = useState("");

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const chatHistoryRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      abortRef.current?.abort();
    };
  }, []);

  // --- Core functions (no useCallback to avoid circular deps) ---

  function startListening() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error("Speech recognition not supported in this browser");
      return;
    }

    recognitionRef.current?.stop();

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    let finalTranscript = "";
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      finalTranscript = "";

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      setInterimText(interim || finalTranscript);

      if (silenceTimer) clearTimeout(silenceTimer);
      if (finalTranscript.trim()) {
        silenceTimer = setTimeout(() => {
          recognition.stop();
          sendMessage(finalTranscript);
        }, 1500);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      if (silenceTimer) clearTimeout(silenceTimer);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== "aborted" && event.error !== "no-speech") {
        console.error("Speech recognition error:", event.error);
      }
      setIsListening(false);
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  }

  async function playTTS(text: string) {
    setIsSpeaking(true);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        const errData = await res.text();
        console.error("TTS error:", res.status, errData);
        setIsSpeaking(false);
        return;
      }

      const audioBlob = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      return new Promise<void>((resolve) => {
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        audio.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
        audio.onerror = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
        audio.play().catch(() => {
          setIsSpeaking(false);
          resolve();
        });
      });
    } catch (err) {
      console.error("TTS playback error:", err);
      setIsSpeaking(false);
    }
  }

  async function sendMessage(text: string) {
    if (!text.trim()) return;

    const userMsg = { role: "user" as const, content: text.trim() };
    chatHistoryRef.current = [...chatHistoryRef.current, userMsg];
    setMessages((prev) => [...prev, { role: "user", message: text.trim() }]);
    setIsProcessing(true);
    setInterimText("");

    recognitionRef.current?.stop();
    setIsListening(false);

    try {
      abortRef.current = new AbortController();

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: chatHistoryRef.current }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        console.error("Chat API error:", res.status);
        setIsProcessing(false);
        startListening();
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";
      let toolName = "";
      let toolJson = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "text") fullResponse += event.text;
            else if (event.type === "tool_start") toolName = event.name;
            else if (event.type === "tool_delta") toolJson += event.json;
          } catch {
            continue;
          }
        }
      }

      if (toolName === "show_calendly" && toolJson) {
        try {
          const params = JSON.parse(toolJson);
          setShowCalendly(true);
          if (params.email) setProspectEmail(params.email);
        } catch {
          // ignore
        }
      }

      if (fullResponse) {
        chatHistoryRef.current = [
          ...chatHistoryRef.current,
          { role: "assistant", content: fullResponse },
        ];
        setMessages((prev) => [...prev, { role: "ai", message: fullResponse }]);

        await playTTS(fullResponse);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("Message error:", err);
      }
    } finally {
      setIsProcessing(false);
      startListening();
    }
  }

  // --- Event handlers ---

  async function handleStart() {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setIsConnected(true);
      setMessages([]);
      chatHistoryRef.current = [];

      // First message
      setMessages([{ role: "ai", message: FIRST_MESSAGE }]);
      chatHistoryRef.current = [{ role: "assistant", content: FIRST_MESSAGE }];

      await playTTS(FIRST_MESSAGE);
      startListening();
    } catch (err) {
      console.error("Failed to start:", err);
    }
  }

  function handleEnd() {
    recognitionRef.current?.stop();
    abortRef.current?.abort();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsConnected(false);
    setIsSpeaking(false);
    setIsListening(false);
    setIsProcessing(false);
    setMessages([]);
    chatHistoryRef.current = [];
    setInterimText("");
  }

  function handleTypeSend(text: string) {
    if (isConnected) sendMessage(text);
  }

  const statusText = !isConnected
    ? "Click the mic to start your consultation"
    : isSpeaking
    ? "Tiffany is speaking..."
    : isProcessing
    ? "Thinking..."
    : isListening
    ? "Listening..."
    : "Ready";

  return (
    <div className="min-h-screen bg-dark flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md flex flex-col items-center gap-8">
        <TiffanyOrb isSpeaking={isSpeaking} isConnected={isConnected} />

        <div className="text-center">
          <p className="text-gray-400 text-sm">{statusText}</p>
          {interimText && isListening && (
            <p className="text-gray-500 text-xs mt-2 italic">
              &ldquo;{interimText}&rdquo;
            </p>
          )}
        </div>

        <div className="flex items-center gap-4">
          {!isConnected ? (
            <button
              onClick={handleStart}
              className="w-16 h-16 rounded-full bg-accent hover:bg-accent-light transition-colors flex items-center justify-center shadow-lg shadow-accent/25"
            >
              <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleEnd}
              className="w-16 h-16 rounded-full bg-red-500/80 hover:bg-red-500 transition-colors flex items-center justify-center shadow-lg shadow-red-500/25"
            >
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          {isConnected && (
            <button
              onClick={() => setInputMode((m) => (m === "voice" ? "type" : "voice"))}
              className="px-4 py-2 rounded-xl border border-white/10 text-gray-400 text-sm hover:text-white hover:border-white/20 transition-colors"
            >
              {inputMode === "voice" ? "Switch to Type" : "Switch to Voice"}
            </button>
          )}
        </div>

        {isConnected && inputMode === "type" && (
          <div className="w-full">
            <TypeInput onSend={handleTypeSend} disabled={isProcessing} />
          </div>
        )}

        <div className="w-full">
          <Transcript messages={messages} />
        </div>
      </div>

      {showCalendly && (
        <CalendlyEmbed
          url={CALENDLY_URL}
          email={prospectEmail}
          onClose={() => setShowCalendly(false)}
        />
      )}
    </div>
  );
}
