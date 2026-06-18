'use client';

// src/app/login/page.tsx
// PIN-only login. Email and password live server-side in ADMIN_EMAIL /
// ADMIN_PASSWORD env vars. The user only types their 4-digit ADMIN_PIN.

import {
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { loginWithPin } from '@/actions/auth';

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add('login-page');
    return () => {
      document.body.classList.remove('login-page');
    };
  }, []);

  const handlePinChange = (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 4);
    setPin(v);
    if (error) setError(null);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending || pin.length !== 4) return;

    setPending(true);
    setError(null);

    const result = await loginWithPin(pin);
    if (result.error) {
      setError(result.error);
      setPending(false);
      setPin('');
      return;
    }

    router.replace('/');
    router.refresh();
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
          inputMode="numeric"
          pattern="[0-9]{4}"
          maxLength={4}
          name="pin"
          value={pin}
          onChange={handlePinChange}
          placeholder="4-digit PIN"
          autoComplete="current-password"
          autoFocus
          disabled={pending}
          aria-invalid={error ? 'true' : undefined}
          aria-label="PIN"
        />
        <button
          type="submit"
          className="cta-inline"
          disabled={pending || pin.length !== 4}
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
