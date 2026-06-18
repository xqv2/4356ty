'use client';

// src/app/login/page.tsx
// Email + password sign-in. Single-account admin login.

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
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add('login-page');
    return () => {
      document.body.classList.remove('login-page');
    };
  }, []);

  const clearError = () => {
    if (error) setError(null);
  };

  const handleEmailChange = (e: ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    clearError();
  };

  const handlePasswordChange = (e: ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    clearError();
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;

    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setPending(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmed,
        password,
      });
      if (signInError) {
        setError(signInError.message);
        setPending(false);
        return;
      }
      router.replace('/');
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not sign in. Try again in a moment.',
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
        <input
          type="password"
          name="password"
          value={password}
          onChange={handlePasswordChange}
          placeholder="Password"
          autoComplete="current-password"
          disabled={pending}
          aria-invalid={error ? 'true' : undefined}
          aria-label="Password"
          style={{ marginTop: 12 }}
        />
        <button
          type="submit"
          className="cta-inline"
          disabled={pending || !email.trim() || !password}
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
        {error ? (
          <div
            className="login-helper"
            role="alert"
            style={{ color: 'var(--accent)' }}
          >
            {error}
          </div>
        ) : null}
      </form>
    </div>
  );
}
