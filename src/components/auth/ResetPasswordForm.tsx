'use client';

import { CheckCircle2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useRef, useState } from 'react';
import { FrostedInput } from '@/components/auth/FrostedInput';
import { PasswordStrengthMeter } from '@/components/auth/PasswordStrengthMeter';
import {
  DEMO_MODE_MESSAGE,
  isRateLimitError,
  mapAuthError,
  RATE_LIMIT_MESSAGE,
} from '@/lib/auth/errors';
import {
  MIN_PASSWORD_LENGTH,
  validateEmail,
  validatePassword,
} from '@/lib/auth/validation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

interface ResetPasswordFormProps {
  isDemoMode: boolean;
  initialMode?: 'request' | 'update';
  initialNotice?: string;
}

export function ResetPasswordForm({
  isDemoMode,
  initialMode = 'request',
  initialNotice,
}: ResetPasswordFormProps) {
  const router = useRouter();
  const inFlightRef = useRef(false);

  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialNotice ?? null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [sentEmail, setSentEmail] = useState<string | null>(null);

  async function handleRequestSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlightRef.current || isLoading) return;

    setErrorMessage(null);

    const emailCheck = validateEmail(email);
    if (!emailCheck.valid) {
      setErrorMessage(emailCheck.message);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase || isDemoMode) {
      setErrorMessage(DEMO_MODE_MESSAGE);
      return;
    }

    inFlightRef.current = true;
    setIsLoading(true);

    try {
      const redirectTo = `${window.location.origin}/auth/callback?flow=recovery`;
      const { error } = await supabase.auth.resetPasswordForEmail(
        emailCheck.email,
        { redirectTo }
      );

      if (error && isRateLimitError(error)) {
        setErrorMessage(mapAuthError(error, 'reset'));
        return;
      }

      // Never reveal whether an email exists in the system.
      setSentEmail(emailCheck.email);
    } catch (err) {
      setErrorMessage(mapAuthError(err, 'reset'));
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  }

  async function handleUpdateSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlightRef.current || isLoading) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    const passwordCheck = validatePassword(newPassword, { enforceLength: true });
    if (!passwordCheck.valid) {
      setErrorMessage(passwordCheck.message);
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase || isDemoMode) {
      setErrorMessage(DEMO_MODE_MESSAGE);
      return;
    }

    inFlightRef.current = true;
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        if (isRateLimitError(error)) {
          setErrorMessage(RATE_LIMIT_MESSAGE);
          return;
        }
        const msg = error.message.toLowerCase();
        if (msg.includes('different from the old password') || msg.includes('same password')) {
          setErrorMessage('New password must be different from your current password.');
        } else if (msg.includes('weak') || msg.includes('at least')) {
          setErrorMessage(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
        } else {
          setErrorMessage(
            'Unable to update your password. Your recovery session may have expired — please request a new reset link.'
          );
        }
        return;
      }

      setNewPassword('');
      setConfirmPassword('');
      setSuccessMessage('Password updated! Redirecting to your dashboard...');
      router.replace('/dashboard?notice=password-updated');
      router.refresh();
    } catch (err) {
      if (isRateLimitError(err)) {
        setErrorMessage(RATE_LIMIT_MESSAGE);
      } else {
        setErrorMessage('Unable to update password right now. Please try again.');
      }
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  }

  if (initialMode === 'update') {
    return (
      <form onSubmit={handleUpdateSubmit} noValidate className="my-auto flex flex-col py-2">
        <div className="space-y-3.5">
          <div>
            <FrostedInput
              label="New password"
              name="newPassword"
              type="password"
              value={newPassword}
              onChange={setNewPassword}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              disabled={isLoading}
            />
            <PasswordStrengthMeter password={newPassword} />
          </div>

          <FrostedInput
            label="Confirm new password"
            name="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="Confirm your new password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            disabled={isLoading}
          />
        </div>

        {errorMessage ? (
          <div
            role="alert"
            className="mt-4 rounded-2xl border border-rose-300/25 bg-rose-950/50 px-4 py-2.5 text-center text-xs text-rose-100 backdrop-blur-md"
          >
            {errorMessage}
          </div>
        ) : null}

        {successMessage ? (
          <div
            role="status"
            className="mt-4 rounded-2xl border border-white/25 bg-white/[0.06] px-4 py-2.5 text-center text-xs text-white/85 backdrop-blur-md"
          >
            {successMessage}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isLoading}
          className="smoky-cta-btn mt-5 flex h-[46px] w-full cursor-pointer items-center justify-center gap-2 rounded-full text-sm font-medium text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/45 disabled:cursor-not-allowed disabled:opacity-65"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>Updating password...</span>
            </>
          ) : (
            <span>Update Password</span>
          )}
        </button>
      </form>
    );
  }

  if (sentEmail) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/30 bg-white/10 backdrop-blur-md">
          <CheckCircle2 className="h-7 w-7 text-white" aria-hidden="true" />
        </div>

        <h2 className="mt-5 text-lg font-semibold text-white">
          Check your email
        </h2>
        <p className="mt-2 max-w-xs text-xs leading-relaxed text-white/75">
          If an account exists for{' '}
          <span className="font-medium text-white">{sentEmail}</span>, a password
          reset link is on its way.
        </p>

        <Link
          href="/login"
          className="smoky-cta-btn mt-7 flex h-12 w-full items-center justify-center rounded-full text-sm font-medium text-white transition"
        >
          Back to Login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleRequestSubmit} noValidate className="my-auto flex flex-col py-4">
      <div className="space-y-4">
        <FrostedInput
          label="Email"
          name="email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="Enter your email"
          autoComplete="email"
          disabled={isLoading}
        />
      </div>

      {errorMessage ? (
        <div
          role="alert"
          className="mt-4 rounded-2xl border border-rose-300/25 bg-rose-950/50 px-4 py-2.5 text-center text-xs text-rose-100 backdrop-blur-md"
        >
          {errorMessage}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isLoading}
        className="smoky-cta-btn mt-5 flex h-[46px] w-full cursor-pointer items-center justify-center gap-2 rounded-full text-sm font-medium text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/45 disabled:cursor-not-allowed disabled:opacity-65"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>Sending link...</span>
          </>
        ) : (
          <span>Send Reset Link</span>
        )}
      </button>
    </form>
  );
}
