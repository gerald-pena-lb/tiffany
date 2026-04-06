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

  // Parse agent code: find any keyless numeric param (e.g. &123)
  const agentCode = (() => {
    const params = searchParams.toString();
    const parts = params.split("&");
    for (const part of parts) {
      const clean = part.split("=")[0];
      if (/^\d+$/.test(clean) && !part.includes("=")) return clean;
    }
    return "";
  })();

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
  const conversationIdRef = useRef<string | null>(null);
  const processingRef = useRef(false);
  const interruptedRef = useRef(false);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      abortRef.current?.abort();
    };
  }, []);

  // Stop Tiffany immediately — kill audio and abort any in-flight request
  function interruptTiffany() {
    interruptedRef.current = true;

    // Stop audio playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setIsSpeaking(false);

    // Abort in-flight chat/TTS requests
    abortRef.current?.abort();
  }

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
    let hasInterrupted = false;

    let didSendMessage = false;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      finalTranscript = "";

      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      // If user starts talking while Tiffany is speaking, interrupt her
      if ((interim || finalTranscript) && !hasInterrupted && audioRef.current && !audioRef.current.paused) {
        hasInterrupted = true;
        interruptTiffany();
      }

      if (silenceTimer) clearTimeout(silenceTimer);
      if (finalTranscript.trim()) {
        silenceTimer = setTimeout(() => {
          didSendMessage = true;
          recognition.stop();
          sendMessage(finalTranscript);
        }, 1500);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      // Auto-restart if we didn't send a message (speech recognition timed out)
      if (!didSendMessage && !processingRef.current) {
        setTimeout(() => startListening(), 300);
      }
    };
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setIsListening(false);
      // Auto-restart on recoverable errors
      if (event.error === "no-speech" || event.error === "aborted") {
        if (!processingRef.current) {
          setTimeout(() => startListening(), 300);
        }
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  }

  async function playTTS(text: string) {
    interruptedRef.current = false;
    setIsSpeaking(true);

    // Start listening while speaking so user can interrupt
    startListening();

    try {
      abortRef.current = new AbortController();

      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || interruptedRef.current) {
        setIsSpeaking(false);
        return;
      }

      const audioBlob = await res.blob();
      if (interruptedRef.current) {
        setIsSpeaking(false);
        return;
      }

      const audioUrl = URL.createObjectURL(audioBlob);

      return new Promise<void>((resolve) => {
        if (interruptedRef.current) {
          URL.revokeObjectURL(audioUrl);
          setIsSpeaking(false);
          resolve();
          return;
        }

        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        audio.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
          resolve();
        };
        audio.onerror = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
          resolve();
        };
        audio.play().catch(() => {
          setIsSpeaking(false);
          resolve();
        });
      });
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("TTS error:", err);
      }
      setIsSpeaking(false);
    }
  }

  async function sendMessage(text: string) {
    if (!text.trim() || processingRef.current) return;
    processingRef.current = true;
    interruptedRef.current = false;

    chatHistoryRef.current = [...chatHistoryRef.current, { role: "user", content: text.trim() }];

    // Stop listening while we get the response
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
            else if (event.type === "stage" && conversationIdRef.current) {
              fetch("/api/track/stage", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ conversationId: conversationIdRef.current, stage: event.stage }),
              }).catch(() => {});
            }
          } catch {
            continue;
          }
        }
      }

      if (toolName === "show_calendly") {
        setShowCalendly(true);
        if (conversationIdRef.current) {
          fetch("/api/track/booked", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ conversationId: conversationIdRef.current }),
          }).catch(() => {});
        }
      }

      if (fullResponse) {
        // Strip [STAGE:N] tag before TTS and history
        const cleanResponse = fullResponse.replace(/\s*\[STAGE:\d\]\s*/g, "").trim();
        if (cleanResponse) {
          chatHistoryRef.current = [
            ...chatHistoryRef.current,
            { role: "assistant", content: cleanResponse },
          ];
          await playTTS(cleanResponse);
        }
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

      // Track conversation start in Supabase
      try {
        const res = await fetch("/api/track/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentCode: agentCode || null, prospectName: prospectName || "Unknown" }),
        });
        const data = await res.json();
        if (data.conversationId) conversationIdRef.current = data.conversationId;
      } catch {
        // Tracking failure shouldn't block the conversation
      }

      await playTTS(FIRST_MESSAGE);
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
      <TiffanyOrb isSpeaking={isSpeaking} isConnected={isConnected} />

      {!isConnected && (
        <button
          onClick={handleStart}
          className="mt-10 flex flex-col items-center gap-3 group"
        >
          <div className="w-14 h-14 rounded-full border border-gold/30 flex items-center justify-center group-hover:border-gold/60 group-hover:bg-gold/5 transition-all">
            <svg className="w-6 h-6 text-gold/50 group-hover:text-gold transition-colors" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          </div>
          <span className="text-gold/40 text-xs tracking-widest uppercase group-hover:text-gold/70 transition-colors">
            Start
          </span>
        </button>
      )}

      {isConnected && (
        <button
          onClick={handleEnd}
          className="mt-10 w-10 h-10 rounded-full border border-gold/20 flex items-center justify-center text-gold/30 hover:text-red-400 hover:border-red-400/50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

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
