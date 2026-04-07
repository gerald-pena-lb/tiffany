"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import TiffanyOrb from "@/components/TiffanyOrb";
import Transcript, { type TranscriptMessage } from "@/components/Transcript";
import CalendlyEmbed from "@/components/CalendlyEmbed";

const CALENDLY_URL = "https://calendly.com/talktoalinka/author-call";

function TiffanyCall() {
  const searchParams = useSearchParams();
  const prospectName = searchParams.get("name") || "";
  const firstName = prospectName.split(" ")[0] || "";
  const agentCode = (() => {
    for (const key of Array.from(searchParams.keys())) {
      if (/^\d+$/.test(key)) return key;
    }
    return "";
  })();

  const FIRST_MESSAGE = firstName
    ? `Hey ${firstName}, welcome to the call. What was it about your conversation with our team on LinkedIn that caused you to want to dive in deeper with me today?`
    : "Hey, welcome to the call. What was it about your conversation with our team on LinkedIn that caused you to want to dive in deeper with me today?";

  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [showCalendly, setShowCalendly] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const history = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const audio = useRef<HTMLAudioElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const running = useRef(false);
  const lastStage = useRef(1);
  const didBook = useRef(false);

  useEffect(() => () => { running.current = false; stopAll(); }, []);

  function stopAll() {
    audio.current?.pause();
    audio.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }

  // ---- The entire voice loop ----

  async function voiceLoop() {
    while (running.current) {
      // 1. Record until silence
      const blob = await recordUntilSilence();
      if (!running.current || !blob) continue;

      // 2. Transcribe
      const text = await transcribe(blob);
      if (!running.current || !text) continue;

      // 3. Show what user said
      history.current.push({ role: "user", content: text });
      setMessages((m) => [...m, { role: "user", message: text }]);

      // 4. Get Claude's response
      const response = await chat(text);
      if (!running.current || !response) continue;

      // 5. Show + speak response
      history.current.push({ role: "assistant", content: response });
      setMessages((m) => [...m, { role: "ai", message: response }]);
      await speak(response);

      // 6. Loop back to listening
    }
  }

  // ---- Record audio until user stops talking ----

  function recordUntilSilence(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!stream.current || !running.current) { resolve(null); return; }

      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream.current);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const recorder = new MediaRecorder(stream.current, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus" : "audio/webm",
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        ctx.close();
        const blob = chunks.length > 0 ? new Blob(chunks, { type: recorder.mimeType }) : null;
        resolve(blob && blob.size > 1000 ? blob : null);
      };

      recorder.start();

      const data = new Float32Array(analyser.fftSize);
      let silenceStart: number | null = null;
      let hasSound = false;

      const check = () => {
        if (!running.current || recorder.state !== "recording") {
          if (recorder.state === "recording") recorder.stop();
          return;
        }

        analyser.getFloatTimeDomainData(data);
        const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);

        if (rms > 0.015) {
          hasSound = true;
          silenceStart = null;

          // Interrupt Tiffany if she's speaking
          if (audio.current && !audio.current.paused) {
            audio.current.pause();
            audio.current = null;
            setIsSpeaking(false);
          }
        } else if (hasSound) {
          if (!silenceStart) silenceStart = Date.now();
          else if (Date.now() - silenceStart > 1100) {
            recorder.stop();
            return;
          }
        }

        requestAnimationFrame(check);
      };

      requestAnimationFrame(check);
    });
  }

  // ---- ElevenLabs STT ----

  async function transcribe(blob: Blob): Promise<string | null> {
    try {
      const form = new FormData();
      form.append("audio", blob);
      const res = await fetch("/api/stt", { method: "POST", body: form });
      if (!res.ok) return null;
      const { text } = await res.json();
      return text?.trim() || null;
    } catch { return null; }
  }

  // ---- Claude ----

  async function chat(userText: string): Promise<string | null> {
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.current, prospectName: prospectName || undefined }),
      });
      if (!res.ok) return null;

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let full = "", toolName = "", toolJson = "", buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const e = JSON.parse(line.slice(6));
            if (e.type === "text") full += e.text;
            else if (e.type === "tool_start") toolName = e.name;
            else if (e.type === "tool_delta") toolJson += e.json;
            else if (e.type === "stage") lastStage.current = e.stage;
          } catch { continue; }
        }
      }

      if (toolName === "show_calendly") {
        didBook.current = true;
        setShowCalendly(true);
      }

      return full.replace(/\s*\[STAGE:\d\]\s*/g, "").trim() || null;
    } catch { return null; }
  }

  // ---- ElevenLabs TTS ----

  async function speak(text: string): Promise<void> {
    setIsSpeaking(true);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) { setIsSpeaking(false); return; }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      await new Promise<void>((resolve) => {
        const a = new Audio(url);
        audio.current = a;
        const done = () => { setIsSpeaking(false); URL.revokeObjectURL(url); audio.current = null; resolve(); };
        a.onended = done;
        a.onerror = done;
        a.onpause = done;
        a.play().catch(done);
      });
    } catch { setIsSpeaking(false); }
  }

  // ---- Start / End ----

  async function handleStart() {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      running.current = true;
      setIsConnected(true);
      history.current = [{ role: "assistant", content: FIRST_MESSAGE }];
      setMessages([{ role: "ai", message: FIRST_MESSAGE }]);
      lastStage.current = 1;
      didBook.current = false;

      await speak(FIRST_MESSAGE);
      voiceLoop();
    } catch (err) {
      console.error("Failed to start:", err);
    }
  }

  function handleEnd() {
    running.current = false;
    stopAll();
    fetch("/api/track/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentCode: agentCode || null, prospectName: prospectName || "Unknown", lastStage: lastStage.current, booked: didBook.current }),
    }).catch(() => {});
    setIsConnected(false);
    setIsSpeaking(false);
    setMessages([]);
    history.current = [];
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-8">
      <TiffanyOrb isSpeaking={isSpeaking} isConnected={isConnected} />

      {!isConnected && (
        <button onClick={handleStart} className="mt-10 flex flex-col items-center gap-3 group">
          <div className="w-14 h-14 rounded-full border border-gold/40 flex items-center justify-center group-hover:border-gold group-hover:bg-gold/10 transition-all">
            <svg className="w-6 h-6 text-gold/60 group-hover:text-gold transition-colors" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          </div>
          <span className="text-gold/60 text-xs tracking-widest uppercase group-hover:text-gold transition-colors">Start</span>
        </button>
      )}

      {isConnected && (
        <button onClick={handleEnd} className="mt-6 w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center text-gray-400 hover:text-red-500 hover:border-red-400 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {isConnected && (
        <div className="w-full max-w-md mt-6">
          <Transcript messages={messages} />
        </div>
      )}

      {showCalendly && (
        <CalendlyEmbed
          url={CALENDLY_URL}
          name={prospectName}
          onBooked={async () => {
            setShowCalendly(false);
            didBook.current = true;
            const msg = firstName
              ? `You're all set, ${firstName}. Before that call, I'll send you our latest book with case studies. Set aside 30 minutes to go through it. And send Alinka a few notes about your story so she's prepared. It was great talking with you.`
              : `You're all set. Before that call, I'll send you our latest book with case studies. Set aside 30 minutes to go through it. And send Alinka a few notes about your story so she's prepared. It was great talking with you.`;
            history.current.push({ role: "assistant", content: msg });
            setMessages((m) => [...m, { role: "ai", message: msg }]);
            await speak(msg);
          }}
          onClose={() => setShowCalendly(false)}
        />
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <TiffanyCall />
    </Suspense>
  );
}
