import Link from 'next/link';
import { RegisterForm } from './register-form';

export default function RegisterPage() {
  return (
    <div className="max-w-sm mx-auto px-6 py-16">
      <h1 className="font-display text-2xl font-bold mb-1">Create an account</h1>
      <p className="text-sm text-mute mb-8">
        Retail accounts get instant access. Trade accounts start on the Retail tier and are
        reviewed by our team for a negotiated pricing tier.
      </p>

      <RegisterForm />

      <p className="text-xs text-mute mt-6 text-center">
        Already have an account?{' '}
        <Link href="/login" className="text-signal hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
