'use client';

import { Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { DEMO_MODE_MESSAGE, mapAuthError } from '@/lib/auth/errors';
import type { UserRole } from '@/lib/auth/validation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

interface OAuthButtonsProps {
  disabled?: boolean;
  role?: UserRole;
  onStatusMessage: (message: string) => void;
}

function GoogleGlyph() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 5.04c1.66 0 3.15.57 4.32 1.69l3.24-3.24C17.6 1.67 14.98.6 12 .6 7.52.6 3.66 3.17 1.79 6.91l3.77 2.93C6.46 7.09 9 5.04 12 5.04z"
      />
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.51h6.47c-.28 1.5-1.12 2.77-2.39 3.62l3.71 2.88c2.17-2 3.7-4.95 3.7-8.74z"
      />
      <path
        fill="#FBBC05"
        d="M5.56 14.16A7.19 7.19 0 0 1 5.18 12c0-.75.13-1.48.38-2.16L1.79 6.91A11.38 11.38 0 0 0 .6 12c0 1.84.44 3.58 1.19 5.09l3.77-2.93z"
      />
      <path
        fill="#34A853"
        d="M12 23.4c3.24 0 5.96-1.07 7.95-2.91l-3.71-2.88c-1.07.72-2.44 1.15-4.24 1.15-3 0-5.54-2.05-6.44-4.8l-3.77 2.93C3.66 20.83 7.52 23.4 12 23.4z"
      />
    </svg>
  );
}

export function OAuthButtons({
  disabled = false,
  role,
  onStatusMessage,
}: OAuthButtonsProps) {
  const [activeProvider, setActiveProvider] = useState<'google' | null>(null);
  const inFlightRef = useRef(false);

  async function handleGoogleSignIn() {
    if (disabled || inFlightRef.current) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      onStatusMessage(DEMO_MODE_MESSAGE);
      return;
    }

    inFlightRef.current = true;
    setActiveProvider('google');

    try {
      const callbackUrl = new URL('/auth/callback', window.location.origin);
      if (role) {
        callbackUrl.searchParams.set('role', role);
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl.toString(),
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        onStatusMessage(mapAuthError(error, 'oauth_google'));
        setActiveProvider(null);
        inFlightRef.current = false;
      }
    } catch (err) {
      onStatusMessage(mapAuthError(err, 'oauth_google'));
      setActiveProvider(null);
      inFlightRef.current = false;
    }
  }

  const isBusy = disabled || activeProvider !== null;

  return (
    <div className="mt-4">
      <div className="flex items-center gap-3 text-[11px] font-medium text-white/60">
        <span className="h-px flex-1 bg-white/15" />
        <span>Or continue with</span>
        <span className="h-px flex-1 bg-white/15" />
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isBusy}
          className="flex h-[46px] w-full cursor-pointer items-center justify-center gap-2.5 rounded-full border border-white/18 bg-white/[0.04] px-4 text-sm font-medium text-white/95 backdrop-blur-md transition hover:border-white/35 hover:bg-white/[0.09] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {activeProvider === 'google' ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <GoogleGlyph />
          )}
          <span>Continue with Google</span>
        </button>
      </div>
    </div>
  );
}
