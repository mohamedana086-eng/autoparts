'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { registerAction, type AuthFormState } from '@/app/(auth)/actions';

const initialState: AuthFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-signal hover:bg-signal-dim disabled:opacity-60 text-ink font-display font-bold py-2.5 rounded-plate transition-colors"
    >
      {pending ? 'Creating account…' : 'Create account'}
    </button>
  );
}

export function RegisterForm() {
  const [state, formAction] = useFormState(registerAction, initialState);
  const [role, setRole] = useState<'RETAIL' | 'B2B'>('RETAIL');

  return (
    <form action={formAction} className="grid gap-4">
      {state?.error && (
        <p className="text-sm text-alert bg-alert/10 border border-alert/30 rounded-plate px-3 py-2">{state.error}</p>
      )}

      <div className="grid gap-1">
        <span className="text-xs text-mute">Account type</span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setRole('RETAIL')}
            className={`rounded-plate border px-3 py-2 text-sm text-left transition-colors ${
              role === 'RETAIL' ? 'border-signal bg-signal/10 text-paper' : 'border-ink-line text-mute'
            }`}
          >
            <span className="block font-medium">Retail</span>
            <span className="block text-[11px] text-mute">Buy at listed retail price</span>
          </button>
          <button
            type="button"
            onClick={() => setRole('B2B')}
            className={`rounded-plate border px-3 py-2 text-sm text-left transition-colors ${
              role === 'B2B' ? 'border-signal bg-signal/10 text-paper' : 'border-ink-line text-mute'
            }`}
          >
            <span className="block font-medium">Trade / B2B</span>
            <span className="block text-[11px] text-mute">Apply for a wholesale tier</span>
          </button>
        </div>
        <input type="hidden" name="role" value={role} />
      </div>

      <label className="grid gap-1 text-xs text-mute">
        {role === 'B2B' ? 'Company / contact name' : 'Full name'}
        <input name="name" required
          className="bg-ink-panel border border-ink-line rounded-plate px-3 py-2 text-sm text-paper" />
      </label>
      <label className="grid gap-1 text-xs text-mute">
        Email
        <input name="email" type="email" required autoComplete="email"
          className="bg-ink-panel border border-ink-line rounded-plate px-3 py-2 text-sm text-paper" />
      </label>
      <label className="grid gap-1 text-xs text-mute">
        City
        <input name="city"
          className="bg-ink-panel border border-ink-line rounded-plate px-3 py-2 text-sm text-paper" />
      </label>
      <label className="grid gap-1 text-xs text-mute">
        Password
        <input name="password" type="password" required minLength={6} autoComplete="new-password"
          className="bg-ink-panel border border-ink-line rounded-plate px-3 py-2 text-sm text-paper" />
      </label>

      <SubmitButton />
    </form>
  );
}
