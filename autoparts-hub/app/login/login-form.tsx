'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { loginAction, type AuthFormState } from '@/app/(auth)/actions';

const initialState: AuthFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-signal hover:bg-signal-dim disabled:opacity-60 text-ink font-display font-bold py-2.5 rounded-plate transition-colors"
    >
      {pending ? 'Signing in…' : 'Sign in'}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useFormState(loginAction, initialState);

  return (
    <form action={formAction} className="grid gap-4">
      {state?.error && (
        <p className="text-sm text-alert bg-alert/10 border border-alert/30 rounded-plate px-3 py-2">{state.error}</p>
      )}
      <label className="grid gap-1 text-xs text-mute">
        Email
        <input name="email" type="email" required autoComplete="email"
          className="bg-ink-panel border border-ink-line rounded-plate px-3 py-2 text-sm text-paper" />
      </label>
      <label className="grid gap-1 text-xs text-mute">
        Password
        <input name="password" type="password" required autoComplete="current-password"
          className="bg-ink-panel border border-ink-line rounded-plate px-3 py-2 text-sm text-paper" />
      </label>
      <SubmitButton />
    </form>
  );
}
