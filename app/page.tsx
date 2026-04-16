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
    ? `Hey ${firstName}. It's Tiffany, your publishing consultant. Welcome to the call. What was it about your conversation with our team on LinkedIn that caused you to want to dive in deeper with me today?`
    : "Hey. It's Tiffany, your publishing consultant. Welcome to the call. What was it about your conversation with our team on LinkedIn that caused you to want to dive in deeper with me today?";

  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [showCalendly, setShowCalendly] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const history = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const audioEl = useRef<HTMLAudioElement | null>(null);
  const micStream = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const running = useRef(false);
  const processing = useRef(false);
  const pendingBlob = useRef<Blob | null>(null);
  const convoId = useRef<string | null>(null);
  const trackInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSentIdx = useRef(0);
  const lastStage = useRef(1);
  const didBook = useRef(false);
  const calendlyShown = useRef(false);
  const calendlyClosedWithoutBooking = useRef(false);

  useEffect(() => () => { running.current = false; cleanup(); }, []);

  function cleanup() {
    audioEl.current?.pause();
    audioEl.current = null;
    micStream.current?.getTracks().forEach((t) => t.stop());
    micStream.current = null;
    audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
    analyser.current = null;
  }

  function getMimeType(): string {
    const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", ""];
    for (const t of types) {
      if (!t || MediaRecorder.isTypeSupported(t)) return t;
    }
    return "";
  }

  // ---- Continuous recording loop (always runs, never stops) ----

  function recordLoop() {
    if (!micStream.current || !running.current || !analyser.current) return;

    if (audioCtx.current?.state === "suspended") {
      audioCtx.current.resume();
    }

    const mime = getMimeType();
    const recorder = new MediaRecorder(
      micStream.current,
      mime ? { mimeType: mime } : undefined
    );

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      if (!running.current) return;

      const blob = chunks.length > 0
        ? new Blob(chunks, { type: recorder.mimeType || "audio/webm" })
        : null;

      // If we got a valid recording, process it
      if (blob && blob.size > 500) {
        processBlob(blob);
      }

      // Immediately start next recording (never stop listening)
      if (running.current) {
        recordLoop();
      }
    };

    recorder.start();

    const data = new Float32Array(analyser.current!.fftSize);
    let silenceStart: number | null = null;
    let hasSound = false;
    let consecutiveLoudFrames = 0;
    let totalSpeechFrames = 0;

    // Require sustained speech (not just momentary noise) before activating
    // Keyboard clicks, tapping, etc. are sharp but brief — real speech is sustained and louder
    const SPEECH_THRESHOLD = 0.035; // filters keyboard noise but still picks up normal speech
    const MIN_CONSECUTIVE_FRAMES = 6; // ~100ms of sustained sound (filters clicks/taps)
    const MIN_TOTAL_SPEECH_FRAMES = 20; // require ~330ms total speech for valid recording

    const check = () => {
      if (!running.current || recorder.state !== "recording") {
        if (recorder.state === "recording") recorder.stop();
        return;
      }

      analyser.current!.getFloatTimeDomainData(data);
      const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);

      if (rms > SPEECH_THRESHOLD) {
        consecutiveLoudFrames++;
        totalSpeechFrames++;

        // Only register as "real speech" if sustained (filters out pops/clicks/short noises)
        if (consecutiveLoudFrames >= MIN_CONSECUTIVE_FRAMES) {
          hasSound = true;
          silenceStart = null;

          // Interrupt Tiffany if she's speaking
          if (audioEl.current && !audioEl.current.paused) {
            audioEl.current.pause();
            audioEl.current.currentTime = 0;
            setIsSpeaking(false);
          }
        }
      } else {
        consecutiveLoudFrames = 0;
        if (hasSound) {
          if (!silenceStart) silenceStart = Date.now();
          else if (Date.now() - silenceStart > 2200) {
            // If very little actual speech was detected, treat as noise and discard
            if (totalSpeechFrames < MIN_TOTAL_SPEECH_FRAMES) {
              // Discard: reset and keep listening on same recorder
              hasSound = false;
              silenceStart = null;
              totalSpeechFrames = 0;
              requestAnimationFrame(check);
              return;
            }
            recorder.stop();
            return;
          }
        }
      }

      requestAnimationFrame(check);
    };

    requestAnimationFrame(check);
  }

  // ---- Process a recorded blob ----

  // Simple similarity check: returns true if new message is likely a repeat of old
  function isRepeat(newText: string, oldText: string): boolean {
    if (!oldText) return false;
    const normalize = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter(Boolean);
    const newWords = normalize(newText);
    const oldWords = normalize(oldText);
    if (newWords.length === 0) return false;

    // If new message is much shorter than old, not a repeat (could be continuation)
    if (newWords.length < oldWords.length * 0.5) return false;

    // Count overlap
    const oldSet = new Set(oldWords);
    const matches = newWords.filter((w) => oldSet.has(w)).length;
    const similarity = matches / Math.max(newWords.length, oldWords.length);
    return similarity >= 0.75;
  }

  async function processBlob(blob: Blob) {
    // If already processing, queue this blob (latest wins)
    if (processing.current) {
      pendingBlob.current = blob;
      return;
    }

    processing.current = true;

    try {
      // Transcribe
      const text = await transcribe(blob);
      if (!running.current || !text) {
        processing.current = false;
        processPending();
        return;
      }

      // Duplicate detection
      const lastMsg = history.current[history.current.length - 1];
      const lastUserMsg = [...history.current].reverse().find((m) => m.role === "user");

      if (lastMsg?.role === "user") {
        // Tiffany hasn't responded yet — merge with the previous user message
        if (isRepeat(text, lastMsg.content)) {
          // Just a repeat — skip entirely
          processing.current = false;
          processPending();
          return;
        } else {
          // Merge the two user messages into one
          lastMsg.content = `${lastMsg.content} ${text}`;
          setMessages((m) => {
            const copy = [...m];
            const lastUserIdx = [...copy].reverse().findIndex((msg) => msg.role === "user");
            if (lastUserIdx !== -1) {
              const idx = copy.length - 1 - lastUserIdx;
              copy[idx] = { ...copy[idx], message: `${copy[idx].message} ${text}` };
            }
            return copy;
          });
        }
      } else if (lastUserMsg && isRepeat(text, lastUserMsg.content)) {
        // Tiffany already responded but user is repeating — skip, no need to re-respond
        processing.current = false;
        processPending();
        return;
      } else {
        // Normal new user message
        history.current.push({ role: "user", content: text });
        setMessages((m) => [...m, { role: "user", message: text }]);
      }

      // Get Claude's response
      const response = await chat();
      if (!running.current || !response) {
        processing.current = false;
        processPending();
        return;
      }

      // Add response + speak
      history.current.push({ role: "assistant", content: response });
      setMessages((m) => [...m, { role: "ai", message: response }]);
      await speak(response);
    } catch (err) {
      console.error("Process error:", err);
    }

    processing.current = false;
    processPending();
  }

  // Process any queued blob
  function processPending() {
    if (pendingBlob.current) {
      const blob = pendingBlob.current;
      pendingBlob.current = null;
      processBlob(blob);
    }
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
    } catch {
      return null;
    }
  }

  // ---- Claude ----

  async function chat(): Promise<string | null> {
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.current,
          prospectName: prospectName || undefined,
        }),
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
        // Always show when Claude calls the tool — Claude is now responsible for deciding when to reopen
        calendlyShown.current = true;
        calendlyClosedWithoutBooking.current = false;
        setShowCalendly(true);
      }

      return full.replace(/\s*\[STAGE:\d\]\s*/g, "").trim() || null;
    } catch {
      return null;
    }
  }

  // ---- ElevenLabs TTS ----

  async function speak(text: string): Promise<void> {
    setIsSpeaking(true);
    try {
      // Ensure AudioContext is active (mobile browsers suspend it)
      if (audioCtx.current?.state === "suspended") {
        await audioCtx.current.resume().catch(() => {});
      }

      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        setIsSpeaking(false);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      await new Promise<void>((resolve) => {
        const a = audioEl.current || new Audio();
        audioEl.current = a;

        const done = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(url);
          a.onended = null;
          a.onerror = null;
          a.onpause = null;
          resolve();
        };

        a.onended = done;
        a.onerror = done;
        a.onpause = done;
        a.src = url;
        a.play().catch(done);
      });
    } catch {
      setIsSpeaking(false);
    }
  }

  // ---- Start / End ----

  async function handleStart() {
    try {
      // Unlock audio playback on mobile — play a tiny silent WAV in the tap gesture
      const audio = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=");
      try { await audio.play(); } catch {}
      audio.pause();
      audio.currentTime = 0;
      audioEl.current = audio;

      // Create AudioContext in user gesture context
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      await ctx.resume();
      audioCtx.current = ctx;

      // Request mic
      micStream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });

      const source = ctx.createMediaStreamSource(micStream.current);
      const anal = ctx.createAnalyser();
      anal.fftSize = 512;
      source.connect(anal);
      analyser.current = anal;

      running.current = true;
      processing.current = false;
      pendingBlob.current = null;
      setIsConnected(true);
      history.current = [{ role: "assistant", content: FIRST_MESSAGE }];
      setMessages([{ role: "ai", message: FIRST_MESSAGE }]);
      lastStage.current = 1;
      didBook.current = false;
      calendlyShown.current = false;
      calendlyClosedWithoutBooking.current = false;

      fetch("/api/track/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentCode: agentCode || null, prospectName: prospectName || "Unknown" }),
      })
        .then((r) => r.json())
        .then((d) => { if (d.conversationId) convoId.current = d.conversationId; })
        .catch(() => {});

      lastSentIdx.current = 0;
      trackInterval.current = setInterval(() => {
        if (!convoId.current || history.current.length <= lastSentIdx.current) return;
        const chunk = history.current.slice(lastSentIdx.current);
        lastSentIdx.current = history.current.length;
        fetch("/api/track/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: convoId.current, stage: lastStage.current, chunk }),
        }).catch(() => {});
      }, 20000);

      await speak(FIRST_MESSAGE);

      // Start continuous recording (never stops until call ends)
      recordLoop();
    } catch (err) {
      console.error("Failed to start:", err);
    }
  }

  function handleEnd() {
    running.current = false;
    cleanup();

    if (trackInterval.current) {
      clearInterval(trackInterval.current);
      trackInterval.current = null;
    }

    if (convoId.current) {
      const remainingChunk = history.current.slice(lastSentIdx.current);
      fetch("/api/track/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: convoId.current,
          stage: lastStage.current,
          booked: didBook.current,
          chunk: remainingChunk.length > 0 ? remainingChunk : undefined,
          messages: history.current,
        }),
      }).catch(() => {});
    }

    convoId.current = null;
    setIsConnected(false);
    setIsSpeaking(false);
    setMessages([]);
    history.current = [];
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-3 py-4 sm:px-4 sm:py-8">
      <TiffanyOrb isSpeaking={isSpeaking} isConnected={isConnected} />

      {!isConnected && (
        <button onClick={handleStart} className="mt-6 sm:mt-10 flex flex-col items-center gap-2 sm:gap-3 group">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border border-gold/40 flex items-center justify-center group-hover:border-gold group-hover:bg-gold/10 transition-all">
            <svg className="w-5 h-5 sm:w-6 sm:h-6 text-gold/60 group-hover:text-gold transition-colors" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          </div>
          <span className="text-gold/60 text-xs tracking-widest uppercase group-hover:text-gold transition-colors">Start</span>
        </button>
      )}

      {isConnected && (
        <button onClick={handleEnd} className="mt-4 sm:mt-6 w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center text-gray-400 hover:text-red-500 hover:border-red-400 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {isConnected && (
        <div className="w-full max-w-md mt-4 sm:mt-6 px-1">
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
            calendlyClosedWithoutBooking.current = false;
            // Inject system context so Claude knows the booking was confirmed
            history.current.push({ role: "user", content: "[System: Calendly booking confirmed]" });
            const msg = firstName
              ? `You're all set, ${firstName}. Before that call, I'll send you our latest book with case studies. Set aside 30 minutes to go through it. And send Alinka a few notes about your story so she's prepared. It was great talking with you.`
              : `You're all set. Before that call, I'll send you our latest book with case studies. Set aside 30 minutes to go through it. And send Alinka a few notes about your story so she's prepared. It was great talking with you.`;
            history.current.push({ role: "assistant", content: msg });
            setMessages((m) => [...m, { role: "ai", message: msg }]);
            await speak(msg);
          }}
          onClose={() => {
            setShowCalendly(false);
            // If they closed without booking, inject system context so Claude asks them about it
            if (!didBook.current) {
              calendlyClosedWithoutBooking.current = true;
              history.current.push({
                role: "user",
                content: "[System: Calendly popup was closed without a booking]",
              });
              // Trigger Tiffany to ask about it
              (async () => {
                if (processing.current) return;
                processing.current = true;
                try {
                  const response = await chat();
                  if (response && running.current) {
                    history.current.push({ role: "assistant", content: response });
                    setMessages((m) => [...m, { role: "ai", message: response }]);
                    await speak(response);
                  }
                } catch (err) {
                  console.error(err);
                }
                processing.current = false;
                processPending();
              })();
            }
          }}
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
