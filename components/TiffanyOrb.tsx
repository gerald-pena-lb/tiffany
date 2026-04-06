"use client";

interface TiffanyOrbProps {
  isSpeaking: boolean;
  isConnected: boolean;
}

export default function TiffanyOrb({ isSpeaking, isConnected }: TiffanyOrbProps) {
  const active = isConnected && isSpeaking;

  return (
    <div className="relative flex items-center justify-center w-72 h-72">
      {/* Speaking solar flare surges */}
      {active && (
        <>
          <div className="absolute w-44 h-44 rounded-full bg-gold/20 blur-2xl animate-surge-1" />
          <div className="absolute w-40 h-40 rounded-full bg-amber-500/15 blur-2xl animate-surge-2" />
          <div className="absolute w-48 h-48 rounded-full bg-yellow-400/10 blur-3xl animate-surge-3" />
          <div className="absolute w-36 h-36 rounded-full bg-orange-400/15 blur-2xl animate-surge-4" />
        </>
      )}

      {/* Ambient glow */}
      <div
        className={`absolute w-52 h-52 rounded-full blur-3xl transition-all duration-700 ${
          active
            ? "bg-gold/35 scale-110"
            : isConnected
            ? "bg-gold/20"
            : "bg-gold/10"
        }`}
      />

      {/* Core sphere */}
      <div
        className={`relative w-40 h-40 rounded-full transition-all duration-500 overflow-hidden ${
          active
            ? "shadow-[0_0_100px_rgba(255,215,0,0.5),0_0_50px_rgba(212,175,55,0.4)] animate-glow-breathe"
            : isConnected
            ? "shadow-[0_0_60px_rgba(212,175,55,0.3),0_0_30px_rgba(212,175,55,0.2)]"
            : "shadow-[0_0_30px_rgba(212,175,55,0.15),0_0_15px_rgba(212,175,55,0.1)]"
        }`}
        style={{
          background: active
            ? "radial-gradient(circle at 40% 35%, #ffd700, #daa520 35%, #b8860b 60%, #8b6914 80%, #6b4f10)"
            : isConnected
            ? "radial-gradient(circle at 40% 35%, #f0c850, #c8a020 35%, #a08018 60%, #786010 80%, #604a0c)"
            : "radial-gradient(circle at 40% 35%, #c8a030, #a08020 35%, #806818 60%, #605010 80%, #48380c)",
        }}
      >
        {/* Solar surface turbulence when speaking */}
        {active && (
          <>
            <div
              className="absolute w-16 h-16 rounded-full blur-md animate-flare-1"
              style={{ top: "15%", left: "20%", background: "radial-gradient(circle, rgba(255,235,120,0.6), transparent)" }}
            />
            <div
              className="absolute w-12 h-12 rounded-full blur-md animate-flare-2"
              style={{ top: "50%", right: "10%", background: "radial-gradient(circle, rgba(255,220,80,0.5), transparent)" }}
            />
            <div
              className="absolute w-14 h-10 rounded-full blur-md animate-flare-3"
              style={{ bottom: "15%", left: "30%", background: "radial-gradient(circle, rgba(255,200,50,0.5), transparent)" }}
            />
            <div
              className="absolute w-10 h-14 rounded-full blur-md animate-flare-4"
              style={{ top: "25%", right: "25%", background: "radial-gradient(circle, rgba(255,240,140,0.4), transparent)" }}
            />
          </>
        )}
      </div>

      {/* Expanding wave rings when speaking */}
      {active && (
        <>
          <div className="absolute w-40 h-40 rounded-full border border-gold/25 animate-wave-1" />
          <div className="absolute w-40 h-40 rounded-full border border-gold/15 animate-wave-2" />
          <div className="absolute w-40 h-40 rounded-full border border-gold/10 animate-wave-3" />
        </>
      )}
    </div>
  );
}
