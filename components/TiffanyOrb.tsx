"use client";

interface TiffanyOrbProps {
  isSpeaking: boolean;
  isConnected: boolean;
}

export default function TiffanyOrb({ isSpeaking, isConnected }: TiffanyOrbProps) {
  const active = isConnected && isSpeaking;

  return (
    <div className="relative flex items-center justify-center w-80 h-80">
      {/* Outer particle ring — always visible when connected */}
      {isConnected && (
        <div className="absolute w-72 h-72 rounded-full animate-spin-slow">
          <div className="absolute top-0 left-1/2 w-1.5 h-1.5 -ml-0.5 rounded-full bg-gold/60" />
          <div className="absolute bottom-0 left-1/2 w-1 h-1 -ml-0.5 rounded-full bg-gold/40" />
          <div className="absolute top-1/2 left-0 w-1 h-1 -mt-0.5 rounded-full bg-gold/50" />
          <div className="absolute top-1/2 right-0 w-1.5 h-1.5 -mt-0.5 rounded-full bg-gold/30" />
        </div>
      )}

      {/* Orbital rings */}
      {isConnected && (
        <>
          <div className="absolute w-64 h-64 rounded-full border border-gold/10 animate-spin-slow" />
          <div
            className="absolute w-56 h-56 rounded-full border border-gold/15 animate-spin-reverse"
            style={{ transform: "rotateX(60deg)" }}
          />
          <div
            className="absolute w-60 h-60 rounded-full border border-gold/8 animate-spin-slow"
            style={{ transform: "rotateX(60deg) rotateZ(90deg)" }}
          />
        </>
      )}

      {/* Speaking wave rings */}
      {active && (
        <>
          <div className="absolute w-48 h-48 rounded-full border border-gold/30 animate-wave-1" />
          <div className="absolute w-48 h-48 rounded-full border border-gold/20 animate-wave-2" />
          <div className="absolute w-48 h-48 rounded-full border border-gold/10 animate-wave-3" />
        </>
      )}

      {/* Ambient glow */}
      <div
        className={`absolute w-44 h-44 rounded-full blur-3xl transition-all duration-700 ${
          active
            ? "bg-gold/30 scale-110"
            : isConnected
            ? "bg-gold/15"
            : "bg-gold/5"
        }`}
      />

      {/* Secondary inner glow */}
      <div
        className={`absolute w-32 h-32 rounded-full blur-2xl transition-all duration-500 ${
          active
            ? "bg-amber-400/25"
            : isConnected
            ? "bg-amber-400/10"
            : "bg-transparent"
        }`}
      />

      {/* Core sphere */}
      <div
        className={`relative w-36 h-36 rounded-full transition-all duration-500 ${
          active
            ? "shadow-[0_0_80px_rgba(212,175,55,0.5),0_0_40px_rgba(212,175,55,0.3),inset_0_0_40px_rgba(212,175,55,0.2)] animate-pulse-gold"
            : isConnected
            ? "shadow-[0_0_40px_rgba(212,175,55,0.25),0_0_20px_rgba(212,175,55,0.15),inset_0_0_20px_rgba(212,175,55,0.1)]"
            : "shadow-[0_0_15px_rgba(212,175,55,0.1),inset_0_0_10px_rgba(212,175,55,0.05)]"
        }`}
        style={{
          background: isConnected
            ? "radial-gradient(circle at 35% 30%, rgba(255,215,0,0.3), rgba(212,175,55,0.15) 40%, rgba(180,140,20,0.1) 60%, rgba(0,0,0,0.8))"
            : "radial-gradient(circle at 35% 30%, rgba(212,175,55,0.15), rgba(100,80,20,0.1) 40%, rgba(0,0,0,0.9))",
        }}
      >
        {/* Surface highlight — top left specular */}
        <div
          className="absolute top-4 left-5 w-12 h-8 rounded-full blur-sm"
          style={{
            background: isConnected
              ? "radial-gradient(ellipse, rgba(255,223,100,0.4), transparent)"
              : "radial-gradient(ellipse, rgba(212,175,55,0.15), transparent)",
          }}
        />

        {/* Core light point */}
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full blur-md transition-all duration-500 ${
            active
              ? "bg-gold/40 scale-125"
              : isConnected
              ? "bg-gold/20"
              : "bg-gold/5"
          }`}
        />

        {/* Surface grid lines — Jarvis-style hexagonal feel */}
        {isConnected && (
          <svg
            className="absolute inset-0 w-full h-full opacity-20"
            viewBox="0 0 100 100"
          >
            <circle cx="50" cy="50" r="35" fill="none" stroke="rgb(212,175,55)" strokeWidth="0.3" />
            <circle cx="50" cy="50" r="25" fill="none" stroke="rgb(212,175,55)" strokeWidth="0.2" />
            <circle cx="50" cy="50" r="15" fill="none" stroke="rgb(212,175,55)" strokeWidth="0.2" />
            <line x1="50" y1="15" x2="50" y2="85" stroke="rgb(212,175,55)" strokeWidth="0.15" />
            <line x1="15" y1="50" x2="85" y2="50" stroke="rgb(212,175,55)" strokeWidth="0.15" />
            <line x1="25" y1="25" x2="75" y2="75" stroke="rgb(212,175,55)" strokeWidth="0.1" />
            <line x1="75" y1="25" x2="25" y2="75" stroke="rgb(212,175,55)" strokeWidth="0.1" />
          </svg>
        )}
      </div>
    </div>
  );
}
