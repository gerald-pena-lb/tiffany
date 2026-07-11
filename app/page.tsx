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
  const isDemo = searchParams.has("demo");
  const agentCode = (() => {
    for (const key of Array.from(searchParams.keys())) {
      if (/^\d+$/.test(key)) return key;
    }
    return "";
  })();

  const FIRST_MESSAGE = isDemo
    ? "Hi, I'm Tiffany — I'm an AI-powered publishing consultant for Leaders Brands. I qualify prospects through live voice conversations, handle objections, and book calls with our Co-Founder Alinka. Want to try a quick demo? Just talk to me like you would on a real call."
    : firstName
    ? `Hey ${firstName}. It's Tiffany, your publishing consultant. Welcome to the call. What was it about your conversation with our team on LinkedIn that caused you to want to dive in deeper with me today?`
    : "Hey. It's Tiffany, your publishing consultant. Welcome to the call. What was it about your conversation with our team on LinkedIn that caused you to want to dive in deeper with me today?";

  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [showCalendly, setShowCalendly] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const history = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const ttsSource = useRef<AudioBufferSourceNode | null>(null);
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
    try { ttsSource.current?.stop(); } catch {}
    ttsSource.current = null;
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
          if (ttsSource.current) {
            try { ttsSource.current.stop(); } catch {}
            ttsSource.current = null;
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
          demo: isDemo || undefined,
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

  // ---- ElevenLabs TTS (Web Audio API — no HTML Audio element) ----

  async function speak(text: string): Promise<void> {
    if (!audioCtx.current) return;
    setIsSpeaking(true);
    try {
      if (audioCtx.current.state === "suspended") {
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

      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await audioCtx.current.decodeAudioData(arrayBuffer);

      await new Promise<void>((resolve) => {
        const source = audioCtx.current!.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.current!.destination);

        const done = () => {
          setIsSpeaking(false);
          ttsSource.current = null;
          source.onended = null;
          resolve();
        };

        source.onended = done;
        ttsSource.current = source;
        source.start(0);
      });
    } catch {
      setIsSpeaking(false);
    }
  }

  // ---- Start / End ----

  async function handleStart() {
    try {
      // Request mic FIRST — this shows the permission dialog
      micStream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });

      // Create AudioContext after mic is granted and resume it
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      await ctx.resume();
      audioCtx.current = ctx;

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
      <p className="text-gold/70 text-xs sm:text-sm tracking-widest uppercase mb-4 sm:mb-6">Your Publishing Consultant</p>
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

      {/* Transcript hidden for now
      {isConnected && (
        <div className="w-full max-w-md mt-4 sm:mt-6 px-1">
          <Transcript messages={messages} />
        </div>
      )}
      */}

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
      <PageRouter />
    </Suspense>
  );
}

function PageRouter() {
  const searchParams = useSearchParams();
  if (searchParams.has("train")) {
    return <RoleplayTrainer />;
  }
  if (searchParams.has("interview")) {
    return <InterviewSimulator />;
  }
  return <TiffanyCall />;
}

type Mode = "training" | "guided" | "hardcore";
type Phase = "setup" | "active" | "report";
type SetterName = "Alain" | "Luis" | "Gerald" | "Alinka";

const SETTER_NAMES: SetterName[] = ["Alain", "Luis", "Gerald", "Alinka"];

const STAGE_NAMES = [
  "Connecting",
  "Situation",
  "Problem",
  "Consequence",
  "Solution",
  "Loss",
  "Wallet",
  "Booking",
  "Homework",
];

const MODE_HINTS: Record<Mode, string[]> = {
  training: [
    "1 CONNECTING: Why are they REALLY here? Reinforce the 1% frame (80% want, <1% do).",
    "2 SITUATION: Present authority (entrepreneurial publishing vs traditional/self, DHL/Mitsubishi, 500+ authors). Discover their goal + why it matters.",
    "3 PROBLEM: What are they seeing day-to-day? How long? Reflect back the time.",
    "4 CONSEQUENCE: Quantify the cost. Gold mine reframe. Get them to say 'we need to do something different.'",
    "5 SOLUTION: What should the book do for their prospects? Why professional help vs self-publish?",
    "6 LOSS: What's lost if the book stays in their head? Tie back to the number.",
    "7 WALLET: 'What have you set aside?' Car analogy if nothing. $6K-$50K range. First-impression reframe if anchored low.",
    "8 BOOKING: Strategy call with Alinka. Confirm time zone. Verbal confirmation of slot.",
    "9 HOMEWORK: 30-60 min prep materials before strategy call. Get commitment.",
  ],
  guided: [
    "Ask open-ended questions. Let silence do the work.",
    "Reference their exact words back throughout.",
    "Reframe: gold mine, first impression, car analogy.",
    "Never pitch. Only ask questions.",
    "Handle 'need to think about it' — what specifically?",
    "Tie every stage back to their goal + consequence.",
  ],
  hardcore: [],
};

function RoleplayTrainer() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [persona, setPersona] = useState("");
  const [mode, setMode] = useState<Mode>("guided");
  const [userName, setUserName] = useState<SetterName>("Alain");
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentStage, setCurrentStage] = useState(1);
  const [coachTip, setCoachTip] = useState<string | null>(null);
  const [coachModeActive, setCoachModeActive] = useState(false);
  const [report, setReport] = useState<string>("");
  const [reportScore, setReportScore] = useState<number | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [savedSessionId, setSavedSessionId] = useState<string | null>(null);

  const history = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const ttsSource = useRef<AudioBufferSourceNode | null>(null);
  const micStream = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const running = useRef(false);
  const processing = useRef(false);
  const pendingBlob = useRef<Blob | null>(null);
  const personaRef = useRef("");
  const modeRef = useRef<Mode>("guided");
  const userNameRef = useRef<SetterName>("Alain");
  const coachModeRef = useRef(false);

  function isBreakCharacterPhrase(text: string): boolean {
    const n = text.toLowerCase().replace(/[^a-z ]/g, "").trim();
    return (
      /\benough tiffany\b/.test(n) ||
      /\benough tiff\b/.test(n) ||
      /\bstop tiffany\b/.test(n) ||
      /\bpause tiffany\b/.test(n) ||
      /\bbreak character\b/.test(n)
    );
  }

  useEffect(() => () => { running.current = false; cleanupRoleplay(); }, []);

  function cleanupRoleplay() {
    try { ttsSource.current?.stop(); } catch {}
    ttsSource.current = null;
    micStream.current?.getTracks().forEach((t) => t.stop());
    micStream.current = null;
    audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
    analyser.current = null;
  }

  function getMime(): string {
    const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", ""];
    for (const t of types) {
      if (!t || MediaRecorder.isTypeSupported(t)) return t;
    }
    return "";
  }

  function recordLoop() {
    if (!micStream.current || !running.current || !analyser.current) return;
    if (audioCtx.current?.state === "suspended") audioCtx.current.resume();

    const mime = getMime();
    const recorder = new MediaRecorder(micStream.current, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      if (!running.current) return;
      const blob = chunks.length > 0 ? new Blob(chunks, { type: recorder.mimeType || "audio/webm" }) : null;
      if (blob && blob.size > 500) processBlob(blob);
      if (running.current) recordLoop();
    };
    recorder.start();

    const data = new Float32Array(analyser.current!.fftSize);
    let silenceStart: number | null = null;
    let hasSound = false;
    let consecutive = 0;
    let total = 0;
    const THRESHOLD = 0.035;
    const MIN_CONSEC = 6;
    const MIN_TOTAL = 20;

    const check = () => {
      if (!running.current || recorder.state !== "recording") {
        if (recorder.state === "recording") recorder.stop();
        return;
      }
      analyser.current!.getFloatTimeDomainData(data);
      const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
      if (rms > THRESHOLD) {
        consecutive++;
        total++;
        if (consecutive >= MIN_CONSEC) {
          hasSound = true;
          silenceStart = null;
          if (ttsSource.current) {
            try { ttsSource.current.stop(); } catch {}
            ttsSource.current = null;
            setIsSpeaking(false);
          }
        }
      } else {
        consecutive = 0;
        if (hasSound) {
          if (!silenceStart) silenceStart = Date.now();
          else if (Date.now() - silenceStart > 2200) {
            if (total < MIN_TOTAL) {
              hasSound = false;
              silenceStart = null;
              total = 0;
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

  async function processBlob(blob: Blob) {
    if (processing.current) {
      pendingBlob.current = blob;
      return;
    }
    processing.current = true;
    try {
      const form = new FormData();
      form.append("audio", blob);
      const sttRes = await fetch("/api/stt", { method: "POST", body: form });
      if (!sttRes.ok) throw new Error("STT failed");
      const { text } = await sttRes.json();
      const userText = text?.trim();
      if (!userText || !running.current) { processing.current = false; processPending(); return; }

      if (!coachModeRef.current && isBreakCharacterPhrase(userText)) {
        coachModeRef.current = true;
        setCoachModeActive(true);
        setCoachTip(null);
      }

      history.current.push({ role: "user", content: userText });
      setMessages((m) => [...m, { role: "user", message: userText }]);

      const response = await chatRoleplay();
      if (!running.current || !response) { processing.current = false; processPending(); return; }

      history.current.push({ role: "assistant", content: response.spoken });
      setMessages((m) => [...m, { role: "ai", message: response.spoken }]);

      if (response.coach && !coachModeRef.current) {
        setCoachTip(response.coach);
        await speak(`Hold on. ${response.coach} Let's continue.`);
        setCoachTip(null);
      }
      await speak(response.spoken);
    } catch (err) {
      console.error(err);
    }
    processing.current = false;
    processPending();
  }

  function processPending() {
    if (pendingBlob.current) {
      const b = pendingBlob.current;
      pendingBlob.current = null;
      processBlob(b);
    }
  }

  async function chatRoleplay(): Promise<{ spoken: string; coach: string | null } | null> {
    try {
      const res = await fetch("/api/roleplay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.current,
          persona: personaRef.current,
          mode: modeRef.current,
          userName: userNameRef.current,
          coachMode: coachModeRef.current,
        }),
      });
      if (!res.ok) return null;
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let full = "", buf = "", coach: string | null = null;

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
            else if (e.type === "stage") setCurrentStage(e.stage);
            else if (e.type === "coach") coach = e.tip;
          } catch { continue; }
        }
      }
      const spoken = full
        .replace(/\[COACH\][\s\S]*?\[\/COACH\]/g, "")
        .replace(/\s*\[STAGE:\d\]\s*/g, "")
        .replace(/\*[^*\n]{1,80}\*/g, "")
        .replace(/\([^)\n]{1,80}\)/g, (match) => {
          const inner = match.slice(1, -1).trim().toLowerCase();
          const isAction = /^(pause|slight pause|small pause|laugh|laughs|laughing|small laugh|chuckle|chuckles|sigh|sighs|sighing|thinking|beat|silence|clears throat|breath|breathes|smile|smiles|smiling|nod|nods|nodding)( |,|\.|$)/.test(inner);
          return isAction ? "" : match;
        })
        .replace(/\s+/g, " ")
        .trim();
      return { spoken, coach };
    } catch {
      return null;
    }
  }

  async function speak(text: string): Promise<void> {
    if (!audioCtx.current || !text) return;
    setIsSpeaking(true);
    try {
      if (audioCtx.current.state === "suspended") await audioCtx.current.resume().catch(() => {});
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) { setIsSpeaking(false); return; }
      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await audioCtx.current.decodeAudioData(arrayBuffer);
      await new Promise<void>((resolve) => {
        const src = audioCtx.current!.createBufferSource();
        src.buffer = audioBuffer;
        src.connect(audioCtx.current!.destination);
        const done = () => { setIsSpeaking(false); ttsSource.current = null; src.onended = null; resolve(); };
        src.onended = done;
        ttsSource.current = src;
        src.start(0);
      });
    } catch {
      setIsSpeaking(false);
    }
  }

  async function handleStartRoleplay() {
    if (!persona.trim()) return;
    personaRef.current = persona.trim();
    modeRef.current = mode;
    userNameRef.current = userName;

    try {
      micStream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      await ctx.resume();
      audioCtx.current = ctx;
      const source = ctx.createMediaStreamSource(micStream.current);
      const anal = ctx.createAnalyser();
      anal.fftSize = 512;
      source.connect(anal);
      analyser.current = anal;

      running.current = true;
      processing.current = false;
      pendingBlob.current = null;
      coachModeRef.current = false;
      setCoachModeActive(false);
      history.current = [];
      setMessages([]);
      setCurrentStage(1);
      setCoachTip(null);
      setSavedSessionId(null);
      setReport("");
      setReportScore(null);
      setPhase("active");

      // Prospect opens with something short and neutral — like picking up a call
      const opener = "Hey. Yeah, this is me. Who's this?";
      history.current.push({ role: "assistant", content: opener });
      setMessages([{ role: "ai", message: opener }]);
      await speak(opener);
      recordLoop();
    } catch (err) {
      console.error("Failed to start roleplay:", err);
    }
  }

  async function handleEndRoleplay() {
    running.current = false;
    cleanupRoleplay();
    setPhase("report");
    setLoadingReport(true);

    // Compact transcript: single-line role prefix, one turn per line
    const compactTranscript = history.current
      .map((m) => `${m.role === "assistant" ? "P" : "S"}: ${m.content.replace(/\s+/g, " ").trim()}`)
      .join("\n");

    // Verbose transcript for the report prompt
    const reportTranscript = history.current
      .map((m) => `${m.role === "assistant" ? "Prospect" : "Setter"}: ${m.content}`)
      .join("\n\n");

    let generatedReport = "";
    let generatedScore: number | null = null;

    try {
      const res = await fetch("/api/roleplay/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: reportTranscript,
          persona: personaRef.current,
          userName: userNameRef.current,
        }),
      });
      const data = await res.json();
      generatedReport = data.report || "Failed to generate report.";
      generatedScore = typeof data.score === "number" ? data.score : null;
      setReport(generatedReport);
      setReportScore(generatedScore);
    } catch {
      setReport("Failed to generate report.");
    }
    setLoadingReport(false);

    // Save session to Supabase (fire-and-forget after render)
    if (history.current.length > 0) {
      try {
        const saveRes = await fetch("/api/training/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userName: userNameRef.current,
            persona: personaRef.current,
            mode: modeRef.current,
            transcript: compactTranscript,
            assessment: generatedReport,
            score: generatedScore,
          }),
        });
        const saveData = await saveRes.json();
        if (saveData.id) setSavedSessionId(saveData.id);
      } catch {}
    }
  }

  function handleReset() {
    setPhase("setup");
    setPersona("");
    setMessages([]);
    setReport("");
    setReportScore(null);
    setCurrentStage(1);
    setCoachTip(null);
    coachModeRef.current = false;
    setCoachModeActive(false);
    setSavedSessionId(null);
    history.current = [];
  }

  // ---- SETUP PHASE ----
  if (phase === "setup") {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg space-y-6">
          <div className="text-center">
            <h1 className="text-gray-800 text-2xl font-light">NEPQ Roleplay Trainer</h1>
            <p className="text-gray-500 text-sm mt-2">Practice as the setter. Tiffany plays the prospect.</p>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm space-y-4">
            <div>
              <label className="text-gray-600 text-xs uppercase tracking-wider mb-2 block">Setter</label>
              <select
                value={userName}
                onChange={(e) => setUserName(e.target.value as SetterName)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-700 text-sm focus:outline-none focus:border-gold/50"
              >
                {SETTER_NAMES.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-gray-600 text-xs uppercase tracking-wider mb-2 block">Prospect Persona</label>
              <textarea
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                placeholder="e.g. Sarah, 48, founder of a wellness clinic in Toronto. Has been thinking about writing a book on gut health for 4 years. Never took action. Skeptical of publishing companies after bad experience with a vanity press. Budget-conscious. Married, husband is supportive but cautious with money."
                className="w-full h-32 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-700 text-sm focus:outline-none focus:border-gold/50 resize-none"
              />
            </div>

            <div>
              <label className="text-gray-600 text-xs uppercase tracking-wider mb-2 block">Difficulty</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: "training", title: "Training Wheels", desc: "Stage shown + live coaching" },
                  { key: "guided", title: "Guided", desc: "Subtle hints during call" },
                  { key: "hardcore", title: "Hardcore", desc: "No help. Real difficulty." },
                ] as { key: Mode; title: string; desc: string }[]).map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setMode(m.key)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      mode === m.key
                        ? "border-gold bg-gold/5"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <p className="text-gray-800 text-sm font-medium">{m.title}</p>
                    <p className="text-gray-400 text-[10px] mt-1 leading-tight">{m.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={handleStartRoleplay}
            disabled={!persona.trim()}
            className="w-full bg-gold/90 hover:bg-gold disabled:bg-gray-200 disabled:cursor-not-allowed rounded-lg px-4 py-3 text-white text-sm transition-colors shadow-sm"
          >
            Start Roleplay
          </button>

          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Say &quot;that&apos;s enough Tiffany&quot; to break character during the call.</span>
            <a href="/data/training" className="text-gray-500 hover:text-gold transition-colors">
              Past sessions →
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ---- ACTIVE CALL PHASE ----
  if (phase === "active") {
    const hints = MODE_HINTS[mode];
    const currentHint = hints[Math.min(currentStage - 1, hints.length - 1)];

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start px-4 py-6">
        {coachModeActive ? (
          <div className="w-full max-w-lg mb-4">
            <div className="bg-gold/10 border border-gold/30 rounded-lg p-3">
              <p className="text-gold text-[10px] uppercase tracking-wider mb-1">Coach Mode</p>
              <p className="text-gray-700 text-xs leading-relaxed">
                Tiffany is out of character. Ask her about the call or how she works as an AI.
              </p>
            </div>
          </div>
        ) : mode === "training" ? (
          <div className="w-full max-w-lg mb-4">
            <div className="bg-white border border-gray-100 rounded-lg p-3 shadow-sm">
              <p className="text-gray-400 text-[10px] uppercase tracking-wider mb-1">
                Stage {currentStage}/9 — {STAGE_NAMES[currentStage - 1]}
              </p>
              <div className="flex gap-0.5">
                {STAGE_NAMES.map((name, i) => (
                  <div
                    key={name}
                    className={`flex-1 text-center py-0.5 text-[9px] rounded ${
                      i + 1 === currentStage
                        ? "bg-gold/20 text-gold font-medium"
                        : i + 1 < currentStage
                        ? "bg-gray-100 text-gray-400"
                        : "text-gray-300"
                    }`}
                  >
                    {name}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <TiffanyOrb isSpeaking={isSpeaking} isConnected={true} />

        {coachTip && !coachModeActive && (
          <div className="w-full max-w-lg mt-4 bg-gold/10 border border-gold/30 rounded-lg p-3">
            <p className="text-gold text-[10px] uppercase tracking-wider mb-1">Coach</p>
            <p className="text-gray-700 text-sm">{coachTip}</p>
          </div>
        )}

        {!coachModeActive && mode === "training" && currentHint && !coachTip && (
          <div className="w-full max-w-lg mt-4 bg-white border border-gray-100 rounded-lg p-3 shadow-sm">
            <p className="text-gray-400 text-[10px] uppercase tracking-wider mb-1">Prompt</p>
            <p className="text-gray-600 text-xs leading-relaxed">{currentHint}</p>
          </div>
        )}

        {!coachModeActive && (
          <p className="text-gray-400 text-[10px] mt-3 italic">
            Say &quot;that&apos;s enough Tiffany&quot; to break character
          </p>
        )}

        <button
          onClick={handleEndRoleplay}
          className="mt-6 w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center text-gray-400 hover:text-red-500 hover:border-red-400 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {(mode === "training" || coachModeActive) && (
          <div className="w-full max-w-md mt-6">
            <Transcript messages={messages} />
          </div>
        )}
      </div>
    );
  }

  // ---- REPORT PHASE ----
  const transcriptText = history.current
    .map((m) => `${m.role === "assistant" ? "Prospect" : "Setter"}: ${m.content}`)
    .join("\n\n");

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start px-4 py-8">
      <div className="w-full max-w-2xl space-y-4">
        <div className="flex items-center justify-between print:hidden">
          <h1 className="text-gray-800 text-2xl font-light">Coaching Report</h1>
          <div className="flex items-center gap-4">
            <button
              onClick={() => window.print()}
              disabled={loadingReport}
              className="text-gray-500 hover:text-gray-800 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Save PDF
            </button>
            <button
              onClick={handleReset}
              className="text-gray-500 hover:text-gray-800 text-sm transition-colors"
            >
              New Roleplay →
            </button>
          </div>
        </div>

        {loadingReport ? (
          <div className="bg-white border border-gray-100 rounded-xl p-8 shadow-sm text-center">
            <p className="text-gray-500 text-sm">Analyzing your call...</p>
          </div>
        ) : (
          <div id="printable-report" className="space-y-6">
            <div className="print-only hidden print:block mb-6">
              <h1 className="text-2xl font-light text-gray-800">NEPQ Roleplay — Coaching Report</h1>
              <p className="text-xs text-gray-500 mt-1">Generated {new Date().toLocaleString()}</p>
            </div>

            {savedSessionId && (
              <div className="print:hidden bg-green-50 border border-green-200 rounded-lg px-4 py-2 flex items-center justify-between">
                <p className="text-green-700 text-xs">
                  Session saved{reportScore !== null && <span className="ml-2 font-medium">· Score {reportScore}/100</span>}
                </p>
                <a href="/data/training" className="text-green-700 hover:text-green-900 text-xs underline">
                  View all
                </a>
              </div>
            )}

            <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm print:shadow-none print:border-0 print:p-0">
              <h2 className="text-gray-500 text-xs uppercase tracking-wider mb-3 print:mb-2">Prospect Persona</h2>
              <p className="text-gray-700 text-sm leading-relaxed">{personaRef.current || "Not specified"}</p>
              <p className="text-gray-400 text-xs mt-3">Mode: {modeRef.current}</p>
            </div>

            <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm print:shadow-none print:border-0 print:p-0 print:break-inside-avoid">
              <h2 className="text-gray-500 text-xs uppercase tracking-wider mb-3 print:mb-2">Analysis</h2>
              <pre className="text-gray-700 text-sm whitespace-pre-wrap font-sans leading-relaxed">
                {report}
              </pre>
            </div>

            <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm print:shadow-none print:border-0 print:p-0 print:break-before-page">
              <h2 className="text-gray-500 text-xs uppercase tracking-wider mb-3 print:mb-2">Full Transcript</h2>
              <pre className="text-gray-600 text-xs whitespace-pre-wrap font-sans leading-relaxed">
                {transcriptText || "No conversation recorded."}
              </pre>
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        @media print {
          body {
            background: white !important;
          }
          @page {
            margin: 0.75in;
          }
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// INTERVIEW SIMULATOR
// ============================================================================

type InterviewPhase = "setup" | "active" | "report";

function InterviewSimulator() {
  const [phase, setPhase] = useState<InterviewPhase>("setup");
  const [jobDescription, setJobDescription] = useState("");
  const [resume, setResume] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [report, setReport] = useState("");
  const [reportScore, setReportScore] = useState<number | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const history = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const ttsSource = useRef<AudioBufferSourceNode | null>(null);
  const micStream = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const running = useRef(false);
  const processing = useRef(false);
  const pendingBlob = useRef<Blob | null>(null);
  const jdRef = useRef("");
  const resumeRef = useRef("");
  const nameRef = useRef("");

  useEffect(() => () => { running.current = false; cleanupInterview(); }, []);

  function cleanupInterview() {
    try { ttsSource.current?.stop(); } catch {}
    ttsSource.current = null;
    micStream.current?.getTracks().forEach((t) => t.stop());
    micStream.current = null;
    audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
    analyser.current = null;
  }

  function getMime(): string {
    const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", ""];
    for (const t of types) {
      if (!t || MediaRecorder.isTypeSupported(t)) return t;
    }
    return "";
  }

  function recordLoop() {
    if (!micStream.current || !running.current || !analyser.current) return;
    if (audioCtx.current?.state === "suspended") audioCtx.current.resume();

    const mime = getMime();
    const recorder = new MediaRecorder(micStream.current, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      if (!running.current) return;
      const blob = chunks.length > 0 ? new Blob(chunks, { type: recorder.mimeType || "audio/webm" }) : null;
      if (blob && blob.size > 500) processBlob(blob);
      if (running.current) recordLoop();
    };
    recorder.start();

    const data = new Float32Array(analyser.current!.fftSize);
    let silenceStart: number | null = null;
    let hasSound = false;
    let consecutive = 0;
    let total = 0;
    const THRESHOLD = 0.035;
    const MIN_CONSEC = 6;
    const MIN_TOTAL = 20;

    const check = () => {
      if (!running.current || recorder.state !== "recording") {
        if (recorder.state === "recording") recorder.stop();
        return;
      }
      analyser.current!.getFloatTimeDomainData(data);
      const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
      if (rms > THRESHOLD) {
        consecutive++;
        total++;
        if (consecutive >= MIN_CONSEC) {
          hasSound = true;
          silenceStart = null;
          if (ttsSource.current) {
            try { ttsSource.current.stop(); } catch {}
            ttsSource.current = null;
            setIsSpeaking(false);
          }
        }
      } else {
        consecutive = 0;
        if (hasSound) {
          if (!silenceStart) silenceStart = Date.now();
          else if (Date.now() - silenceStart > 2200) {
            if (total < MIN_TOTAL) {
              hasSound = false;
              silenceStart = null;
              total = 0;
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

  async function processBlob(blob: Blob) {
    if (processing.current) {
      pendingBlob.current = blob;
      return;
    }
    processing.current = true;
    try {
      const form = new FormData();
      form.append("audio", blob);
      const sttRes = await fetch("/api/stt", { method: "POST", body: form });
      if (!sttRes.ok) throw new Error("STT failed");
      const { text } = await sttRes.json();
      const userText = text?.trim();
      if (!userText || !running.current) { processing.current = false; processPending(); return; }

      history.current.push({ role: "user", content: userText });
      setMessages((m) => [...m, { role: "user", message: userText }]);

      const response = await chatInterview();
      if (!running.current || !response) { processing.current = false; processPending(); return; }

      history.current.push({ role: "assistant", content: response });
      setMessages((m) => [...m, { role: "ai", message: response }]);
      await speak(response);
    } catch (err) {
      console.error(err);
    }
    processing.current = false;
    processPending();
  }

  function processPending() {
    if (pendingBlob.current) {
      const b = pendingBlob.current;
      pendingBlob.current = null;
      processBlob(b);
    }
  }

  async function chatInterview(): Promise<string | null> {
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.current,
          jobDescription: jdRef.current,
          resume: resumeRef.current,
          candidateName: nameRef.current,
        }),
      });
      if (!res.ok) return null;
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let full = "", buf = "";

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
          } catch { continue; }
        }
      }
      const spoken = full
        .replace(/\*[^*\n]{1,80}\*/g, "")
        .replace(/\([^)\n]{1,80}\)/g, (match) => {
          const inner = match.slice(1, -1).trim().toLowerCase();
          const isAction = /^(pause|slight pause|laughs?|laughing|chuckles?|sighs?|thinking|beat|silence|clears throat|breathes?|smiles?|nods?)( |,|\.|$)/.test(inner);
          return isAction ? "" : match;
        })
        .replace(/\s+/g, " ")
        .trim();
      return spoken || null;
    } catch {
      return null;
    }
  }

  async function speak(text: string): Promise<void> {
    if (!audioCtx.current || !text) return;
    setIsSpeaking(true);
    try {
      if (audioCtx.current.state === "suspended") await audioCtx.current.resume().catch(() => {});
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) { setIsSpeaking(false); return; }
      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await audioCtx.current.decodeAudioData(arrayBuffer);
      await new Promise<void>((resolve) => {
        const src = audioCtx.current!.createBufferSource();
        src.buffer = audioBuffer;
        src.connect(audioCtx.current!.destination);
        const done = () => { setIsSpeaking(false); ttsSource.current = null; src.onended = null; resolve(); };
        src.onended = done;
        ttsSource.current = src;
        src.start(0);
      });
    } catch {
      setIsSpeaking(false);
    }
  }

  async function handleStart() {
    if (!jobDescription.trim() || !resume.trim() || starting) return;
    setStarting(true);
    setStartError(null);
    jdRef.current = jobDescription.trim();
    resumeRef.current = resume.trim();
    nameRef.current = candidateName.trim();

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone not available in this browser. Try Chrome or Safari.");
      }

      // Check current permission state (helps surface iOS OS-level blocks that don't re-prompt)
      let preState: string | null = null;
      try {
        if ("permissions" in navigator) {
          const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
          preState = status.state;
        }
      } catch {}

      if (preState === "denied") {
        throw new Error("PERMISSION_DENIED_PRE");
      }

      micStream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      await ctx.resume();
      audioCtx.current = ctx;
      const source = ctx.createMediaStreamSource(micStream.current);
      const anal = ctx.createAnalyser();
      anal.fftSize = 512;
      source.connect(anal);
      analyser.current = anal;

      running.current = true;
      processing.current = false;
      pendingBlob.current = null;
      history.current = [];
      setMessages([]);
      setReport("");
      setReportScore(null);
      setPhase("active");
      setStarting(false);

      const opener = candidateName
        ? `Hi ${candidateName.split(" ")[0]}, thanks for joining. I'm going to take you through some questions today to get a better sense of your background and see how you'd fit for this role. Whenever you're ready, why don't you start by walking me through your background?`
        : "Hi, thanks for joining. I'm going to take you through some questions today to get a sense of your background and see how you'd fit for this role. Whenever you're ready, why don't you start by walking me through your background?";
      history.current.push({ role: "assistant", content: opener });
      setMessages([{ role: "ai", message: opener }]);
      await speak(opener);
      recordLoop();
    } catch (err) {
      console.error("Failed to start interview:", err);
      const msg = err instanceof Error ? err.message : String(err);
      const denied = msg === "PERMISSION_DENIED_PRE" || /permission|denied|notallowed/i.test(msg);
      const friendly = denied
        ? "MIC_DENIED"
        : /notfound|no.*device/i.test(msg)
        ? "No microphone found. Connect a mic and try again."
        : msg || "Failed to start. Please try again.";
      setStartError(friendly);
      setStarting(false);
    }
  }

  function detectPlatform(): "ios-chrome" | "ios-safari" | "android" | "desktop" {
    if (typeof navigator === "undefined") return "desktop";
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua);
    if (isIOS && /CriOS/.test(ua)) return "ios-chrome";
    if (isIOS) return "ios-safari";
    if (/Android/.test(ua)) return "android";
    return "desktop";
  }

  async function handleEnd() {
    running.current = false;
    cleanupInterview();
    setPhase("report");
    setLoadingReport(true);

    const transcript = history.current
      .map((m) => `${m.role === "assistant" ? "Interviewer" : "Candidate"}: ${m.content}`)
      .join("\n\n");

    try {
      const res = await fetch("/api/interview/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          jobDescription: jdRef.current,
          resume: resumeRef.current,
          candidateName: nameRef.current,
        }),
      });
      const data = await res.json();
      setReport(data.report || "Failed to generate report.");
      setReportScore(typeof data.score === "number" ? data.score : null);
    } catch {
      setReport("Failed to generate report.");
    }
    setLoadingReport(false);
  }

  function handleReset() {
    setPhase("setup");
    setMessages([]);
    setReport("");
    setReportScore(null);
    history.current = [];
  }

  // ---- SETUP PHASE ----
  if (phase === "setup") {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start sm:justify-center px-3 sm:px-4 py-6 sm:py-8">
        <div className="w-full max-w-2xl space-y-4 sm:space-y-6">
          <div className="text-center">
            <h1 className="text-gray-800 text-xl sm:text-2xl font-light">Interview Simulator</h1>
            <p className="text-gray-500 text-xs sm:text-sm mt-1 sm:mt-2 px-2">
              Paste a job description and your resume. Tiffany will interview you.
            </p>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl p-4 sm:p-5 shadow-sm space-y-3 sm:space-y-4">
            <div>
              <label className="text-gray-600 text-[10px] sm:text-xs uppercase tracking-wider mb-1.5 sm:mb-2 block">
                Your Name <span className="text-gray-300 normal-case">(optional)</span>
              </label>
              <input
                type="text"
                value={candidateName}
                onChange={(e) => { setCandidateName(e.target.value); setStartError(null); }}
                placeholder="e.g. Alex Chen"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-700 text-sm focus:outline-none focus:border-gold/50"
              />
            </div>

            <div>
              <label className="text-gray-600 text-[10px] sm:text-xs uppercase tracking-wider mb-1.5 sm:mb-2 block">
                Job Description
              </label>
              <textarea
                value={jobDescription}
                onChange={(e) => { setJobDescription(e.target.value); setStartError(null); }}
                placeholder="Paste the full job description here — role, responsibilities, required skills, qualifications..."
                className="w-full h-32 sm:h-40 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-700 text-sm focus:outline-none focus:border-gold/50 resize-none"
              />
            </div>

            <div>
              <label className="text-gray-600 text-[10px] sm:text-xs uppercase tracking-wider mb-1.5 sm:mb-2 block">
                Your Resume
              </label>
              <textarea
                value={resume}
                onChange={(e) => { setResume(e.target.value); setStartError(null); }}
                placeholder="Paste your resume as plain text — experience, education, skills, achievements..."
                className="w-full h-32 sm:h-40 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-700 text-sm focus:outline-none focus:border-gold/50 resize-none"
              />
            </div>
          </div>

          {startError === "MIC_DENIED" ? (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 sm:px-4 py-3">
              <p className="text-red-700 text-xs sm:text-sm font-medium mb-2">
                Microphone access is blocked.
              </p>
              <p className="text-red-700 text-xs mb-2">Enable it, then tap Start Interview again:</p>
              {(() => {
                const p = detectPlatform();
                if (p === "ios-chrome") {
                  return (
                    <ol className="text-red-700 text-xs list-decimal pl-4 space-y-1">
                      <li>Open the iOS <strong>Settings</strong> app</li>
                      <li>Scroll down and tap <strong>Chrome</strong></li>
                      <li>Turn on <strong>Microphone</strong></li>
                      <li>Return here and tap Start Interview</li>
                    </ol>
                  );
                }
                if (p === "ios-safari") {
                  return (
                    <ol className="text-red-700 text-xs list-decimal pl-4 space-y-1">
                      <li>Tap the <strong>&quot;AA&quot;</strong> icon in the Safari address bar</li>
                      <li>Tap <strong>Website Settings</strong></li>
                      <li>Set <strong>Microphone</strong> to <strong>Allow</strong></li>
                      <li>If not shown: iOS Settings → Safari → Microphone → Allow for this site</li>
                    </ol>
                  );
                }
                if (p === "android") {
                  return (
                    <ol className="text-red-700 text-xs list-decimal pl-4 space-y-1">
                      <li>Tap the <strong>padlock icon</strong> in the address bar</li>
                      <li>Tap <strong>Permissions</strong> or <strong>Site settings</strong></li>
                      <li>Set <strong>Microphone</strong> to <strong>Allow</strong></li>
                      <li>Reload the page, then tap Start Interview</li>
                    </ol>
                  );
                }
                return (
                  <ol className="text-red-700 text-xs list-decimal pl-4 space-y-1">
                    <li>Click the <strong>padlock icon</strong> in the address bar</li>
                    <li>Set <strong>Microphone</strong> to <strong>Allow</strong></li>
                    <li>Reload the page, then click Start Interview</li>
                  </ol>
                );
              })()}
            </div>
          ) : startError ? (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 sm:px-4 py-2 sm:py-3">
              <p className="text-red-700 text-xs sm:text-sm">{startError}</p>
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleStart}
            disabled={!jobDescription.trim() || !resume.trim() || starting}
            className="w-full bg-gold/90 hover:bg-gold active:bg-gold disabled:bg-gray-200 disabled:cursor-not-allowed rounded-lg px-4 py-3 text-white text-sm transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            {starting ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Requesting mic...
              </>
            ) : (
              "Start Interview"
            )}
          </button>

          <p className="text-center text-[10px] sm:text-xs text-gray-400 px-2">
            Voice interview. Grant mic access when prompted. Assessment generated when you end.
          </p>
        </div>
      </div>
    );
  }

  // ---- ACTIVE PHASE ----
  if (phase === "active") {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-3 sm:px-4 py-4 sm:py-6">
        <p className="text-gray-500 text-[10px] sm:text-xs tracking-widest uppercase mb-3 sm:mb-4">Mock Interview</p>
        <TiffanyOrb isSpeaking={isSpeaking} isConnected={true} />

        <button
          onClick={handleEnd}
          className="mt-6 sm:mt-8 w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center text-gray-400 hover:text-red-500 hover:border-red-400 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <p className="text-gray-400 text-[10px] mt-3 sm:mt-4 italic text-center px-4">
          Tap the X when done to end and get your assessment.
        </p>
      </div>
    );
  }

  // ---- REPORT PHASE ----
  const transcriptText = history.current
    .map((m) => `${m.role === "assistant" ? "Interviewer" : "Candidate"}: ${m.content}`)
    .join("\n\n");

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start px-3 sm:px-4 py-4 sm:py-8">
      <div className="w-full max-w-2xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <h1 className="text-gray-800 text-xl sm:text-2xl font-light">Interview Assessment</h1>
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              onClick={() => window.print()}
              disabled={loadingReport}
              className="text-gray-500 hover:text-gray-800 text-xs sm:text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span className="hidden sm:inline">Save PDF</span>
              <span className="sm:hidden">PDF</span>
            </button>
            <button
              onClick={handleReset}
              className="text-gray-500 hover:text-gray-800 text-xs sm:text-sm transition-colors"
            >
              New <span className="hidden sm:inline">Interview</span> →
            </button>
          </div>
        </div>

        {loadingReport ? (
          <div className="bg-white border border-gray-100 rounded-xl p-6 sm:p-8 shadow-sm text-center">
            <p className="text-gray-500 text-sm">Analyzing your interview...</p>
          </div>
        ) : (
          <div id="printable-interview-report" className="space-y-4 sm:space-y-6">
            <div className="hidden print:block mb-6">
              <h1 className="text-2xl font-light text-gray-800">Interview Assessment</h1>
              <p className="text-xs text-gray-500 mt-1">
                {nameRef.current || "Candidate"} · {new Date().toLocaleString()}
                {reportScore !== null && ` · Score ${reportScore}/100`}
              </p>
            </div>

            <div className="bg-white border border-gray-100 rounded-xl p-4 sm:p-6 shadow-sm print:shadow-none print:border-0 print:p-0 print:break-inside-avoid">
              <pre className="text-gray-700 text-xs sm:text-sm whitespace-pre-wrap font-sans leading-relaxed">
                {report}
              </pre>
            </div>

            <div className="bg-white border border-gray-100 rounded-xl p-4 sm:p-6 shadow-sm print:shadow-none print:border-0 print:p-0 print:break-before-page">
              <h2 className="text-gray-500 text-[10px] sm:text-xs uppercase tracking-wider mb-2 sm:mb-3">Full Transcript</h2>
              <pre className="text-gray-600 text-[11px] sm:text-xs whitespace-pre-wrap font-sans leading-relaxed">
                {transcriptText || "No conversation recorded."}
              </pre>
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        @media print {
          body { background: white !important; }
          @page { margin: 0.75in; }
        }
      `}</style>
    </div>
  );
}
