import { useEffect, useState, type FormEvent } from 'react';
import { authClient, signIn } from '../lib/auth-client';

export function SignInForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    const supported =
      typeof PublicKeyCredential !== 'undefined' &&
      typeof PublicKeyCredential.isConditionalMediationAvailable === 'function';

    if (!supported) return;

    void PublicKeyCredential.isConditionalMediationAvailable().then((available) => {
      if (!available) return;
      void authClient.signIn.passkey({
        autoFill: true,
        fetchOptions: {
          onSuccess() {
            window.location.href = '/dashboard';
          },
        },
      });
    });
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn.email({ email, password });

    if (result.error) {
      setError(result.error.message ?? 'Invalid credentials. Please try again.');
      setLoading(false);
      return;
    }

    window.location.href = '/dashboard';
  }

  async function handlePasskeySignIn() {
    setError(null);
    setPasskeyLoading(true);

    const result = await authClient.signIn.passkey();

    if (result.error) {
      setError(result.error.message ?? 'Passkey sign-in failed. Please try again.');
      setPasskeyLoading(false);
      return;
    }

    window.location.href = '/dashboard';
  }

  async function handleGoogleSignIn() {
    setError(null);
    setGoogleLoading(true);
    const result = await authClient.signIn.social({ provider: 'google', callbackURL: '/dashboard' });
    if (result.error) {
      setError(result.error.message ?? 'Google sign-in failed. Please try again.');
      setGoogleLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-zinc-300">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="username webauthn"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-zinc-500 outline-none transition-colors focus:border-indigo-500 focus:bg-white/10"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-zinc-300">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password webauthn"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-zinc-500 outline-none transition-colors focus:border-indigo-500 focus:bg-white/10"
          placeholder="••••••••"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || passkeyLoading || googleLoading}
        className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Signing in...' : 'Sign In'}
      </button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-white/10" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-zinc-950 px-2 text-zinc-500">or</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void handlePasskeySignIn()}
        disabled={loading || passkeyLoading || googleLoading}
        className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {passkeyLoading ? 'Waiting for passkey...' : 'Sign in with Passkey'}
      </button>

      <button
        type="button"
        onClick={() => void handleGoogleSignIn()}
        disabled={loading || passkeyLoading || googleLoading}
        className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {googleLoading ? 'Redirecting to Google...' : 'Continue with Google'}
      </button>

      <p className="text-center text-sm text-zinc-400">
        Don't have an account?{' '}
        <a href="/signup" className="text-indigo-400 hover:text-indigo-300">
          Create one
        </a>
      </p>
    </form>
  );
}
