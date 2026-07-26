import React from 'react';

interface SentryErrorFallbackProps {
  error: unknown;
  resetError: () => void;
  eventId: string;
}

export function SentryErrorFallback({ error, resetError, eventId }: SentryErrorFallbackProps) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  return (
    <div className="h-full flex flex-col items-center justify-center bg-gray-950 text-white p-8">
      <div className="w-full max-w-lg text-center">
        <h1 className="text-3xl font-bold text-red-500 mb-4">Something went wrong</h1>

        <p className="text-gray-400 mb-6">
          An unexpected error occurred. You can try to recover or reload the application.
        </p>

        <div className="flex gap-4 justify-center mb-8">
          <button
            onClick={resetError}
            className="px-6 py-3 bg-brand-600 hover:bg-brand-500 rounded-lg font-semibold text-white touch-target"
          >
            Retry
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold text-white touch-target"
          >
            Reload
          </button>
        </div>

        {eventId && <p className="text-gray-600 text-xs mb-2">Event ID: {eventId}</p>}

        {import.meta.env.DEV && (
          <details className="mt-4 text-left">
            <summary className="text-gray-500 text-sm cursor-pointer hover:text-gray-400">
              Error details (dev only)
            </summary>
            <pre className="mt-2 p-4 bg-gray-800 rounded-lg text-xs text-red-400 overflow-auto max-h-48">
              {errorMessage}
              {errorStack ? `\n\n${errorStack}` : ''}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
