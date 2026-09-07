import React, { useRef, useState } from 'react';
import { useAuth } from './useAuth';
import { navigateTo } from './authRouting';
import { AuthLayout } from './components/AuthLayout';
import { AuthMessage } from './components/AuthMessage';
import { PasswordField } from './components/PasswordField';
import { AuthSubmitButton } from './components/AuthSubmitButton';
import { validateEmail } from './authValidation';

export const LoginPage: React.FC = () => {
  const { login, error: authError, clearAuthError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [pending, setPending] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    clearAuthError();
    const normalizedEmail = email.trim();
    const nextErrors: typeof errors = {};
    nextErrors.email = validateEmail(normalizedEmail) || undefined;
    if (!password) nextErrors.password = 'Enter your password.';
    setErrors(nextErrors);
    if (nextErrors.email) return emailRef.current?.focus();
    if (nextErrors.password) return passwordRef.current?.focus();

    setPending(true);
    try {
      await login({ email: normalizedEmail, password });
      navigateTo('/', true);
    } catch {
      // AuthContext owns the stable, sanitized error shown below.
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout title="Sign in" description="Use your organization-issued WidgetFlow account.">
      {authError && <AuthMessage tone="error">{authError.message}</AuthMessage>}
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-bold text-slate-700">Email</label>
          <input
            ref={emailRef}
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'email-error' : undefined}
            className={`w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:ring-2 ${errors.email ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20' : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/20'}`}
          />
          {errors.email && <p id="email-error" className="mt-1.5 text-xs font-medium text-rose-700">{errors.email}</p>}
        </div>
        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          error={errors.password}
          inputRef={passwordRef}
        />
        <AuthSubmitButton pending={pending} label="Sign In" pendingLabel="Signing in…" />
      </form>
    </AuthLayout>
  );
};
