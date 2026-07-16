"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Session {
  id: string;
  user_name: string;
  persona: string | null;
  mode: string;
  transcript: string;
  assessment: string | null;
  score: number | null;
  created_at: string;
}

export default function SessionDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/training/${id}`)
      .then((r) => r.json())
      .then((data) => setSession(data))
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Session not found</p>
      </div>
    );
  }

  // Expand compact transcript for display
  const transcriptLines = (session.transcript || "").split("\n").map((line) => {
    if (line.startsWith("S: ")) return { role: "Setter", text: line.slice(3) };
    if (line.startsWith("P: ")) return { role: "Prospect", text: line.slice(3) };
    return { role: "", text: line };
  });

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between print:hidden">
          <div>
            <Link href="/data/training" className="text-gray-400 hover:text-gold text-xs transition-colors">
              ← All sessions
            </Link>
            <h1 className="text-gray-800 text-2xl font-light mt-1">
              {session.user_name}&apos;s roleplay
            </h1>
            <p className="text-gray-400 text-xs mt-1">
              {new Date(session.created_at).toLocaleString()} · {session.mode} mode
              {session.score !== null && ` · Score ${session.score}/27`}
            </p>
          </div>
          <button
            onClick={() => window.print()}
            className="text-gray-500 hover:text-gray-800 text-sm transition-colors flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Save PDF
          </button>
        </div>

        <div className="hidden print:block mb-4">
          <h1 className="text-2xl font-light">{session.user_name}&apos;s NEPQ Roleplay</h1>
          <p className="text-xs text-gray-500">
            {new Date(session.created_at).toLocaleString()} · {session.mode} mode
            {session.score !== null && ` · Score ${session.score}/27`}
          </p>
        </div>

        {session.persona && (
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm print:shadow-none print:border-0 print:p-0">
            <h2 className="text-gray-500 text-xs uppercase tracking-wider mb-2">Prospect Persona</h2>
            <p className="text-gray-700 text-sm leading-relaxed">{session.persona}</p>
          </div>
        )}

        {session.assessment && (
          <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm print:shadow-none print:border-0 print:p-0 print:break-inside-avoid">
            <h2 className="text-gray-500 text-xs uppercase tracking-wider mb-3">Assessment</h2>
            <pre className="text-gray-700 text-sm whitespace-pre-wrap font-sans leading-relaxed">
              {session.assessment}
            </pre>
          </div>
        )}

        <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm print:shadow-none print:border-0 print:p-0 print:break-before-page">
          <h2 className="text-gray-500 text-xs uppercase tracking-wider mb-3">Full Transcript</h2>
          <div className="space-y-3">
            {transcriptLines.map((line, i) => (
              <div key={i} className={`flex gap-3 ${line.role === "Setter" ? "" : ""}`}>
                <span className={`text-xs w-16 flex-shrink-0 ${
                  line.role === "Setter" ? "text-gold" : "text-gray-400"
                }`}>
                  {line.role}
                </span>
                <span className="text-gray-700 text-sm leading-relaxed">{line.text}</span>
              </div>
            ))}
          </div>
        </div>
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
