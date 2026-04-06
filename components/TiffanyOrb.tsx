"use client";

interface TiffanyOrbProps {
  isSpeaking: boolean;
  isConnected: boolean;
}

export default function TiffanyOrb({ isSpeaking, isConnected }: TiffanyOrbProps) {
  const active = isConnected && isSpeaking;

  return (
    <div className="relative flex items-center justify-center w-64 h-64">
      {/* Wave rings — only when speaking */}
      {active && (
        <>
          <div className="absolute inset-0 rounded-full border border-accent/30 animate-wave-1" />
          <div className="absolute inset-[-16px] rounded-full border border-accent/20 animate-wave-2" />
          <div className="absolute inset-[-32px] rounded-full border border-accent-light/10 animate-wave-3" />
        </>
      )}

      {/* Glow backdrop */}
      <div
        className={`absolute w-40 h-40 rounded-full blur-3xl transition-colors duration-500 ${
          active
            ? "bg-accent/40"
            : isConnected
            ? "bg-accent/20"
            : "bg-gray-500/20"
        }`}
      />

      {/* Main sphere */}
      <div
        className={`relative w-32 h-32 rounded-full transition-all duration-500 ${
          active
            ? "bg-gradient-to-br from-accent to-accent-light shadow-[0_0_60px_rgba(99,102,241,0.6)] animate-pulse-glow"
            : isConnected
            ? "bg-gradient-to-br from-accent/80 to-accent-light/80 shadow-[0_0_30px_rgba(99,102,241,0.3)]"
            : "bg-gradient-to-br from-gray-500 to-gray-600 shadow-[0_0_15px_rgba(107,114,128,0.3)]"
        }`}
      >
        {/* Inner highlight */}
        <div className="absolute top-3 left-4 w-10 h-10 rounded-full bg-white/20 blur-sm" />
      </div>
    </div>
  );
}
