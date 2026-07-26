import Link from 'next/link';
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <div className="max-w-sm mx-auto px-6 py-16">
      <h1 className="font-display text-2xl font-bold mb-1">Sign in</h1>
      <p className="text-sm text-mute mb-8">Access your pricing tier, orders, and admin tools.</p>

      <LoginForm />

      <p className="text-xs text-mute mt-6 text-center">
        No account yet?{' '}
        <Link href="/register" className="text-signal hover:underline">Create one</Link>
      </p>
    </div>
  );
}
