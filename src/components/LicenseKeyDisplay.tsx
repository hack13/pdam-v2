import { useState } from 'react';

interface Props {
  licenseKey: string;
  showShortKey?: boolean;
}

function deriveShortLicenseKey(licenseKey: string): string | null {
  const uuidMatch = licenseKey.match(/([0-9a-fA-F]{12})$/);
  if (uuidMatch) {
    return `XXXX-${uuidMatch[1]}`;
  }
  return null;
}

export function LicenseKeyDisplay({ licenseKey, showShortKey = false }: Props) {
  const [hidden, setHidden] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copiedShort, setCopiedShort] = useState(false);

  const masked = '•'.repeat(Math.max(licenseKey.length - 4, 0)) + licenseKey.slice(-4);
  const display = hidden ? masked : licenseKey;
  const shortKey = showShortKey ? deriveShortLicenseKey(licenseKey) : null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(licenseKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = licenseKey;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleCopyShort() {
    if (!shortKey) return;
    try {
      await navigator.clipboard.writeText(shortKey);
      setCopiedShort(true);
      setTimeout(() => setCopiedShort(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = shortKey;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedShort(true);
      setTimeout(() => setCopiedShort(false), 2000);
    }
  }

  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
      <div className="flex items-center gap-2">
        <svg className="h-4 w-4 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
        <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">License Key</span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <code
          className="flex-1 rounded-md bg-black/30 px-3 py-1.5 font-mono text-sm text-white"
          style={{ letterSpacing: hidden ? '0.15em' : 'normal' }}
        >
          {display}
        </code>
        <button
          type="button"
          onClick={() => setHidden(!hidden)}
          className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
          aria-label={hidden ? 'Show license key' : 'Hide license key'}
          title={hidden ? 'Show' : 'Hide'}
        >
          {hidden ? (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          )}
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
          aria-label="Copy license key"
          title={copied ? 'Copied!' : 'Copy'}
        >
          {copied ? (
            <svg className="h-4 w-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4l3-3m-3 3l3 3" />
            </svg>
          )}
        </button>
      </div>

      {shortKey && (
        <div className="mt-3 border-t border-amber-500/10 pt-3">
          <span className="text-xs font-medium text-amber-400/70">Short License Key</span>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 rounded-md bg-black/30 px-3 py-1.5 font-mono text-sm text-white">
              {shortKey}
            </code>
            <button
              type="button"
              onClick={handleCopyShort}
              className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
              aria-label="Copy short license key"
              title={copiedShort ? 'Copied!' : 'Copy'}
            >
              {copiedShort ? (
                <svg className="h-4 w-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4l3-3m-3 3l3 3" />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
