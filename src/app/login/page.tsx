'use client';

// src/app/login/page.tsx
// Single-password admin gate. Email is fixed via NEXT_PUBLIC_ADMIN_EMAIL.

import {
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add('login-page');
    return () => {
      document.body.classList.remove('login-page');
    };
  }, []);

  const handlePasswordChange = (e: ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    if (error) setError(null);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;

    if (!password) {
      setError('Please enter the password.');
      return;
    }

    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
    if (!adminEmail) {
      setError('Login is not configured. Set NEXT_PUBLIC_ADMIN_EMAIL.');
      return;
    }

    setPending(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: adminEmail,
        password,
      });
      if (signInError) {
        setError('Wrong password.');
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
      </div>
      <form className="login-form" onSubmit={handleSubmit} noValidate>
        <input
          type="password"
          name="password"
          value={password}
          onChange={handlePasswordChange}
          placeholder="Password"
          autoComplete="current-password"
          autoFocus
          disabled={pending}
          aria-invalid={error ? 'true' : undefined}
          aria-label="Password"
        />
        <button
          type="submit"
          className="cta-inline"
          disabled={pending || !password}
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
