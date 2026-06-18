'use client';

// src/app/login/page.tsx
// Magic-code sign-in. Mirrors mockups/screens/1-login.html: brand wordmark,
// "Sign in" header, "welcome back" subtitle, single email field + cta-inline
// "Send magic code" button. Uses body class="login-page" by toggling the
// class at mount/unmount so the editor pages keep their default chrome.

import {
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Body chrome — login-page bg + flex-center, only on this route.
  useEffect(() => {
    document.body.classList.add('login-page');
    return () => {
      document.body.classList.remove('login-page');
    };
  }, []);

  const handleEmailChange = (e: ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    if (error) setError(null);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;

    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }

    setPending(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { shouldCreateUser: true },
      });
      if (otpError) {
        setError(otpError.message);
        setPending(false);
        return;
      }
      router.push(`/verify?email=${encodeURIComponent(trimmed)}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not send code. Try again in a moment.',
      );
      setPending(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="header">
        <div className="brand">
          Bills<span className="dot">.</span>
        </div>
        <h1>Sign in</h1>
        <div className="cycle-label" style={{ marginTop: 8 }}>
          welcome back
        </div>
      </div>
      <form className="login-form" onSubmit={handleSubmit} noValidate>
        <input
          type="email"
          name="email"
          value={email}
          onChange={handleEmailChange}
          placeholder="your@email.com"
          autoComplete="email"
          inputMode="email"
          autoFocus
          disabled={pending}
          aria-invalid={error ? 'true' : undefined}
          aria-label="Email address"
        />
        <button
          type="submit"
          className="cta-inline"
          disabled={pending || !email.trim()}
        >
          {pending ? 'Sending…' : 'Send magic code'}
        </button>
        <div
          className="login-helper"
          role={error ? 'alert' : undefined}
          style={error ? { color: 'var(--accent)' } : undefined}
        >
          {error ? (
            error
          ) : (
            <>
              We&apos;ll email you a 6-digit verification code.
              <br />
              No password needed.
            </>
          )}
        </div>
      </form>
    </div>
  );
}
