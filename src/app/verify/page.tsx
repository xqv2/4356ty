'use client';

// src/app/verify/page.tsx
// 6-digit OTP entry. Mirrors mockups/screens/1b-verify.html:
//   <input class="otp-digit"> × 6 with auto-advance + paste handling.
// On a successful supabase.auth.verifyOtp() we redirect to '/' which will
// then bounce to /cycle/current via the root page.

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

const OTP_LEN = 6;

function VerifyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const email = (params.get('email') ?? '').trim();

  const [digits, setDigits] = useState<string[]>(() =>
    Array.from({ length: OTP_LEN }, () => ''),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputsRef = useRef<Array<HTMLInputElement | null>>(
    Array.from({ length: OTP_LEN }, () => null),
  );

  // Body chrome — login-page bg only on this route.
  useEffect(() => {
    document.body.classList.add('login-page');
    return () => {
      document.body.classList.remove('login-page');
    };
  }, []);

  // Without an email param we can't verify — bounce back to /login.
  useEffect(() => {
    if (!email) router.replace('/login');
  }, [email, router]);

  const code = useMemo(() => digits.join(''), [digits]);
  const isComplete = code.length === OTP_LEN && /^\d{6}$/.test(code);

  // Auto-submit when all 6 digits are filled.
  useEffect(() => {
    if (isComplete && !pending) {
      void submit(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComplete]);

  const focusAt = (index: number) => {
    const el = inputsRef.current[index];
    if (el) {
      el.focus();
      el.select();
    }
  };

  const updateDigit = (index: number, value: string) => {
    setDigits((prev) => {
      const next = prev.slice();
      next[index] = value;
      return next;
    });
  };

  const handleChange = (i: number) => (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Strip non-digits; if user pasted multi-char, distribute.
    const cleaned = raw.replace(/\D/g, '');
    if (cleaned.length === 0) {
      updateDigit(i, '');
      return;
    }
    if (cleaned.length === 1) {
      updateDigit(i, cleaned);
      if (i < OTP_LEN - 1) focusAt(i + 1);
      return;
    }
    // Multi-char input lands here when iOS autofills the SMS code into a single
    // box. Spread it across the remaining slots.
    setDigits((prev) => {
      const next = prev.slice();
      let cursor = i;
      for (const ch of cleaned) {
        if (cursor >= OTP_LEN) break;
        next[cursor++] = ch;
      }
      return next;
    });
    const lastFilled = Math.min(OTP_LEN - 1, i + cleaned.length - 1);
    focusAt(Math.min(OTP_LEN - 1, lastFilled + 1));
  };

  const handleKeyDown = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[i]) {
        updateDigit(i, '');
        return;
      }
      if (i > 0) {
        e.preventDefault();
        updateDigit(i - 1, '');
        focusAt(i - 1);
      }
      return;
    }
    if (e.key === 'ArrowLeft' && i > 0) {
      e.preventDefault();
      focusAt(i - 1);
    }
    if (e.key === 'ArrowRight' && i < OTP_LEN - 1) {
      e.preventDefault();
      focusAt(i + 1);
    }
  };

  const handlePaste = (i: number) => (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '');
    if (!text) return;
    e.preventDefault();
    setDigits((prev) => {
      const next = prev.slice();
      let cursor = i;
      for (const ch of text) {
        if (cursor >= OTP_LEN) break;
        next[cursor++] = ch;
      }
      return next;
    });
    const last = Math.min(OTP_LEN - 1, i + text.length - 1);
    focusAt(Math.min(OTP_LEN - 1, last + 1));
  };

  async function submit(token: string) {
    if (!email) {
      setError('Missing email — please sign in again.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email',
      });
      if (verifyErr) {
        setError(verifyErr.message);
        setPending(false);
        // Clear digits + refocus first cell so user can retry.
        setDigits(Array.from({ length: OTP_LEN }, () => ''));
        focusAt(0);
        return;
      }
      router.replace('/');
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Verification failed. Try again.',
      );
      setPending(false);
    }
  }

  return (
    <div className="login-shell">
      <Link href="/login" className="back-link">
        ← Back
      </Link>
      <div className="header">
        <div className="brand">
          Bills<span className="dot">.</span>
        </div>
        <h1>Check your email</h1>
      </div>
      <div className="sent-to">
        Code sent to <b>{email || 'your inbox'}</b>
        <br />
        Enter it below to sign in.
      </div>

      <div className="login-form">
        <div className="otp-input">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                inputsRef.current[i] = el;
              }}
              className={d ? 'otp-digit filled' : 'otp-digit'}
              type="text"
              inputMode="numeric"
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              maxLength={1}
              value={d}
              onChange={handleChange(i)}
              onKeyDown={handleKeyDown(i)}
              onPaste={handlePaste(i)}
              onFocus={(e) => e.currentTarget.select()}
              disabled={pending}
              aria-label={`Digit ${i + 1}`}
            />
          ))}
        </div>

        <button
          type="button"
          className="cta-inline"
          style={{ marginTop: 24 }}
          disabled={!isComplete || pending}
          onClick={() => submit(code)}
        >
          {pending ? 'Verifying…' : 'Verify & continue'}
        </button>

        {error ? (
          <div
            className="login-helper"
            role="alert"
            style={{ color: 'var(--accent)', marginTop: 12 }}
          >
            {error}
          </div>
        ) : null}

        <div className="resend-row">
          Didn&apos;t get it?{' '}
          <Link href={`/login?email=${encodeURIComponent(email)}`}>
            Resend
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="login-shell">
          <div className="header">
            <div className="brand">
              Bills<span className="dot">.</span>
            </div>
            <h1>Check your email</h1>
          </div>
        </div>
      }
    >
      <VerifyForm />
    </Suspense>
  );
}
