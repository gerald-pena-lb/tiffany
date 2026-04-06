"use client";

interface CalendlyEmbedProps {
  url: string;
  email?: string;
  onClose: () => void;
}

export default function CalendlyEmbed({ url, email, onClose }: CalendlyEmbedProps) {
  const calendlyUrl = email
    ? `${url}?email=${encodeURIComponent(email)}`
    : url;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-lg mx-4 bg-dark rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-medium text-gray-300">
            Book Your Strategy Call
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <iframe
          src={calendlyUrl}
          className="w-full h-[550px] border-0"
          title="Book a strategy call"
        />
      </div>
    </div>
  );
}
