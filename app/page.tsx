"use client";

import { useState, useCallback, useEffect } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import TiffanyOrb from "@/components/TiffanyOrb";
import Transcript, { type TranscriptMessage } from "@/components/Transcript";
import CalendlyEmbed from "@/components/CalendlyEmbed";
import TypeInput from "@/components/TypeInput";

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID || "";
const CALENDLY_URL = "https://calendly.com/talktoalinka/author-call";

function TiffanyApp() {
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [showCalendly, setShowCalendly] = useState(false);
  const [prospectEmail, setProspectEmail] = useState("");
  const [inputMode, setInputMode] = useState<"voice" | "type">("voice");

  // Runtime safety net: catch unhandled promise rejections from SDK
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      if (
        event.reason?.message?.includes("error_type") ||
        event.reason?.message?.includes("error_event")
      ) {
        event.preventDefault();
        console.warn("Suppressed ElevenLabs SDK error:", event.reason.message);
      }
    };
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, []);

  const conversation = useConversation({
    onConnect: () => console.log("Connected to Tiffany"),
    onDisconnect: () => console.log("Disconnected from Tiffany"),
    onError: (message, context) =>
      console.warn("Conversation error:", message, context),
    onDebug: (info) => console.log("ElevenLabs debug:", JSON.stringify(info)),
    onMessage: (payload) => {
      setMessages((prev) => {
        const role = payload.role === "user" ? "user" : "ai";
        const last = prev[prev.length - 1];
        if (last && last.role === role && last.message === payload.message) {
          return prev;
        }
        return [...prev, { role, message: payload.message }];
      });
    },
    clientTools: {
      show_calendly: async (params: { email?: string; notes?: string }) => {
        setShowCalendly(true);
        if (params.email) setProspectEmail(params.email);
        return "Calendly booking page is now showing for the prospect.";
      },
    },
  });

  const isConnected = conversation.status === "connected";
  const isSpeaking = conversation.isSpeaking;

  const handleStart = useCallback(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      conversation.startSession({
        agentId: AGENT_ID,
      });
    } catch (err) {
      console.error("Failed to start:", err);
    }
  }, [conversation]);

  const handleEnd = useCallback(() => {
    conversation.endSession();
    setMessages([]);
  }, [conversation]);

  const handleTypeSend = useCallback(
    (text: string) => {
      if (isConnected) {
        conversation.sendUserMessage(text);
      }
    },
    [conversation, isConnected]
  );

  return (
    <div className="min-h-screen bg-dark flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md flex flex-col items-center gap-8">
        <TiffanyOrb isSpeaking={isSpeaking} isConnected={isConnected} />

        <div className="text-center">
          <p className="text-gray-400 text-sm">
            {conversation.status === "connecting"
              ? "Connecting..."
              : isConnected
              ? isSpeaking
                ? "Tiffany is speaking..."
                : "Listening..."
              : "Click the mic to start your consultation"}
          </p>
        </div>

        <div className="flex items-center gap-4">
          {!isConnected ? (
            <button
              onClick={handleStart}
              disabled={conversation.status === "connecting"}
              className="w-16 h-16 rounded-full bg-accent hover:bg-accent-light transition-colors flex items-center justify-center shadow-lg shadow-accent/25 disabled:opacity-50"
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
            <TypeInput onSend={handleTypeSend} disabled={!isConnected} />
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

export default function Page() {
  return (
    <ConversationProvider>
      <TiffanyApp />
    </ConversationProvider>
  );
}
