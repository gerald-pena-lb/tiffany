"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import TiffanyOrb from "@/components/TiffanyOrb";
import CalendlyEmbed from "@/components/CalendlyEmbed";

const CALENDLY_URL = "https://calendly.com/talktoalinka/author-call";

function TiffanyCall() {
  const searchParams = useSearchParams();
  const prospectName = searchParams.get("name") || "";
  const firstName = prospectName.split(" ")[0] || "";

  const FIRST_MESSAGE = firstName
    ? `Hey ${firstName}, welcome to the call. What was it about your conversation with our team on LinkedIn that caused you to want to dive in deeper with me today?`
    : "Hey, welcome to the call. What was it about your conversation with our team on LinkedIn that caused you to want to dive in deeper with me today?";

  const [showCalendly, setShowCalendly] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const chatHistoryRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const processingRef = useRef(false);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      abortRef.current?.abort();
    };
  }, []);

  function startListening() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    recognitionRef.current?.stop();

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    let finalTranscript = "";
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      finalTranscript = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }

      if (silenceTimer) clearTimeout(silenceTimer);
      if (finalTranscript.trim()) {
        silenceTimer = setTimeout(() => {
          recognition.stop();
          sendMessage(finalTranscript);
        }, 1500);
      }
    };

    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

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
    } catch {
      setIsSpeaking(false);
    }
  }

  async function sendMessage(text: string) {
    if (!text.trim() || processingRef.current) return;
    processingRef.current = true;

    chatHistoryRef.current = [...chatHistoryRef.current, { role: "user", content: text.trim() }];
    recognitionRef.current?.stop();
    setIsListening(false);

    try {
      abortRef.current = new AbortController();

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: chatHistoryRef.current, prospectName: prospectName || undefined }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        processingRef.current = false;
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

      if (toolName === "show_calendly") {
        setShowCalendly(true);
      }

      if (fullResponse) {
        chatHistoryRef.current = [
          ...chatHistoryRef.current,
          { role: "assistant", content: fullResponse },
        ];
        await playTTS(fullResponse);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("Message error:", err);
      }
    } finally {
      processingRef.current = false;
      startListening();
    }
  }

  async function handleStart() {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setIsConnected(true);
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
    processingRef.current = false;
    chatHistoryRef.current = [];
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center">
      {/* Sphere — the entire UI */}
      <div
        className={`cursor-pointer ${!isConnected ? "hover:scale-105 transition-transform" : ""}`}
        onClick={!isConnected ? handleStart : undefined}
      >
        <TiffanyOrb isSpeaking={isSpeaking} isConnected={isConnected} />
      </div>

      {/* Minimal end button — only when connected */}
      {isConnected && (
        <button
          onClick={handleEnd}
          className="mt-8 w-10 h-10 rounded-full border border-gold/20 flex items-center justify-center text-gold/40 hover:text-gold hover:border-gold/50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {/* Calendly overlay */}
      {showCalendly && (
        <CalendlyEmbed
          url={CALENDLY_URL}
          name={prospectName}
          onBooked={async () => {
            setShowCalendly(false);
            const closeMsg = firstName
              ? `You're all set, ${firstName}. Before that call, remember — I'll send you our latest book with case studies and results from clients we've worked with. Set aside 30 minutes to go through it so your conversation with Alinka is as productive as possible. And if you can, send Alinka a few notes about your story ahead of time so she can get familiar before you connect. It was great talking with you.`
              : "You're all set. Before that call, remember — I'll send you our latest book with case studies and results from clients we've worked with. Set aside 30 minutes to go through it so your conversation with Alinka is as productive as possible. And if you can, send Alinka a few notes about your story ahead of time so she can get familiar before you connect. It was great talking with you.";
            chatHistoryRef.current = [
              ...chatHistoryRef.current,
              { role: "assistant", content: closeMsg },
            ];
            await playTTS(closeMsg);
          }}
          onClose={() => setShowCalendly(false)}
        />
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <TiffanyCall />
    </Suspense>
  );
}
