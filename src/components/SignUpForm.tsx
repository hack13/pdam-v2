import { useState, type FormEvent } from 'react';
import { authClient, signUp } from '../lib/auth-client';

export function SignUpForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);

    const result = await signUp.email({ name, email, password });

    if (result.error) {
      setError(result.error.message || 'Could not create account. Please try again.');
      setLoading(false);
      return;
    }

    window.location.href = '/dashboard';
  }

  async function handleGoogleSignUp() {
    setError(null);
    setGoogleLoading(true);
    const result = await authClient.signIn.social({ provider: 'google', callbackURL: '/dashboard' });
    if (result.error) {
      setError(result.error.message ?? 'Google sign-up failed. Please try again.');
      setGoogleLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-zinc-300">
          Name
        </label>
        <input
          id="name"
          type="text"
          required
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-zinc-500 outline-none transition-colors focus:border-indigo-500 focus:bg-white/10"
          placeholder="Jane Creator"
        />
      </div>

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-zinc-300">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
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
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-zinc-500 outline-none transition-colors focus:border-indigo-500 focus:bg-white/10"
          placeholder="••••••••"
        />
      </div>

      <div>
        <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium text-zinc-300">
          Confirm Password
        </label>
        <input
          id="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
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
        disabled={loading || googleLoading}
        className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Creating account...' : 'Create Account'}
      </button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10" /></div>
        <div className="relative flex justify-center text-xs uppercase"><span className="bg-zinc-950 px-2 text-zinc-500">or</span></div>
      </div>

      <button
        type="button"
        onClick={() => void handleGoogleSignUp()}
        disabled={loading || googleLoading}
        className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {googleLoading ? 'Redirecting to Google...' : 'Continue with Google'}
      </button>

      <p className="text-center text-sm text-zinc-400">
        Already have an account?{' '}
        <a href="/login" className="text-indigo-400 hover:text-indigo-300">
          Sign in
        </a>
      </p>
    </form>
  );
}
