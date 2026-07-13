import { useEffect, useId, useRef, useState } from 'react';

const MAX_SCREENSHOTS = 3;
const MAX_SCREENSHOT_SIZE = 10 * 1024 * 1024;

type Category = 'bug' | 'idea' | 'general';

function categoryCopy(category: Category) {
  if (category === 'bug') return 'Something is not working';
  if (category === 'idea') return 'An improvement or new idea';
  return 'A question or general observation';
}

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>('bug');
  const [message, setMessage] = useState('');
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const headingId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  function resetForm() {
    setCategory('bug');
    setMessage('');
    setScreenshots([]);
    setError('');
    setSubmitted(false);
    if (fileInput.current) fileInput.current.value = '';
  }

  function close() {
    setOpen(false);
    window.setTimeout(resetForm, 180);
  }

  function addScreenshots(files: FileList | null) {
    if (!files) return;
    setError('');
    const additions = Array.from(files);
    if (screenshots.length + additions.length > MAX_SCREENSHOTS) {
      setError(`Attach up to ${MAX_SCREENSHOTS} screenshots.`);
      return;
    }
    const invalid = additions.find(
      (file) => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > MAX_SCREENSHOT_SIZE,
    );
    if (invalid) {
      setError('Use PNG, JPG, or WebP screenshots up to 10MB each.');
      return;
    }
    setScreenshots((current) => [...current, ...additions]);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) {
      setError('Describe what you noticed so we can investigate.');
      return;
    }

    setSubmitting(true);
    setError('');
    const form = new FormData();
    form.set('category', category);
    form.set('message', message.trim());
    form.set('pageUrl', `${window.location.pathname}${window.location.search}`);
    screenshots.forEach((file) => form.append('screenshots', file));

    try {
      const response = await fetch('/api/feedback', { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Feedback could not be sent.');
      setSubmitted(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Feedback could not be sent.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-[60] sm:bottom-6 sm:right-6">
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
          className="absolute bottom-0 right-0 w-[calc(100vw-2.5rem)] max-w-[27rem] overflow-hidden rounded-2xl border border-violet-300/20 bg-[#121722] shadow-2xl shadow-black/60"
        >
          <div className="relative border-b border-white/10 bg-gradient-to-r from-violet-500/15 via-indigo-500/10 to-cyan-400/10 px-5 pb-4 pt-5">
            <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-violet-400 via-indigo-400 to-cyan-300" aria-hidden="true" />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[0.62rem] font-medium uppercase tracking-[0.18em] text-cyan-300">Beta feedback</p>
                <h2 id={headingId} className="mt-1 text-lg font-semibold text-white">Help shape TailCache</h2>
                <p className="mt-1 text-sm leading-5 text-zinc-400">Tell us what you hit, what you expected, or what would make the workflow better.</p>
              </div>
              <button type="button" onClick={close} className="-mr-1 -mt-1 rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white" aria-label="Close feedback form">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" /></svg>
              </button>
            </div>
          </div>

          {submitted ? (
            <div className="px-5 py-8 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-400/10 text-emerald-300">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" /></svg>
              </div>
              <h3 className="mt-4 text-base font-semibold text-white">Feedback received</h3>
              <p className="mt-1 text-sm leading-5 text-zinc-400">It is now in the team’s beta review queue.</p>
              <div className="mt-5 flex justify-center gap-2">
                <button type="button" onClick={resetForm} className="rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-white/5 hover:text-white">Send another</button>
                <button type="button" onClick={close} className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400">Done</button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4 p-5">
              <fieldset>
                <legend className="text-sm font-medium text-zinc-200">What kind of feedback is this?</legend>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(['bug', 'idea', 'general'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setCategory(value)}
                      aria-pressed={category === value}
                      className={`rounded-lg border px-2 py-2 text-xs font-medium capitalize transition-colors ${category === value ? 'border-violet-400/60 bg-violet-400/15 text-violet-100' : 'border-white/10 bg-white/[0.025] text-zinc-400 hover:border-white/20 hover:text-zinc-200'}`}
                    >
                      {value === 'general' ? 'General' : value}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-zinc-500">{categoryCopy(category)}</p>
              </fieldset>

              <label className="block">
                <span className="text-sm font-medium text-zinc-200">What happened?</span>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={5}
                  maxLength={5000}
                  autoFocus
                  placeholder={category === 'bug' ? 'Include what you were trying to do and what you expected to happen.' : 'Share the context that will help us understand your idea.'}
                  className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm leading-5 text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-400/60 focus:bg-black/30"
                />
              </label>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-zinc-200">Screenshots <span className="font-normal text-zinc-500">(optional)</span></span>
                  <span className="font-mono text-[0.6rem] uppercase tracking-[0.12em] text-zinc-600">{screenshots.length}/{MAX_SCREENSHOTS}</span>
                </div>
                <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" onChange={(event) => addScreenshots(event.target.files)} />
                <div className="mt-2 flex flex-wrap gap-2">
                  {screenshots.map((file, index) => (
                    <div key={`${file.name}-${file.lastModified}-${index}`} className="flex max-w-full items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.035] py-1 pl-2 pr-1 text-xs text-zinc-400">
                      <svg className="h-3.5 w-3.5 shrink-0 text-cyan-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path strokeLinecap="round" d="m6 16 4-4 3 3 2-2 3 3M8 8.5h.01" /></svg>
                      <span className="max-w-44 truncate">{file.name}</span>
                      <button type="button" onClick={() => setScreenshots((current) => current.filter((_, currentIndex) => currentIndex !== index))} className="rounded p-1 text-zinc-500 hover:bg-white/10 hover:text-white" aria-label={`Remove ${file.name}`}>
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" /></svg>
                      </button>
                    </div>
                  ))}
                  {screenshots.length < MAX_SCREENSHOTS && (
                    <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-white/20 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:border-cyan-300/50 hover:bg-cyan-300/[0.06] hover:text-cyan-200">
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path strokeLinecap="round" d="M12 5v14M5 12h14" /></svg>
                      Attach image
                    </button>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-zinc-600">PNG, JPG, or WebP · 10MB each</p>
              </div>

              {error && <p role="alert" className="rounded-lg border border-red-400/20 bg-red-400/[0.07] px-3 py-2 text-sm text-red-300">{error}</p>}

              <div className="flex items-center justify-between gap-3 border-t border-white/[0.07] pt-4">
                <p className="text-xs leading-4 text-zinc-600">Your account and the page you are on are included for follow-up.</p>
                <button type="submit" disabled={submitting} className="shrink-0 rounded-lg bg-gradient-to-r from-violet-500 to-indigo-500 px-3.5 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-950/30 transition hover:from-violet-400 hover:to-indigo-400 disabled:cursor-not-allowed disabled:opacity-60">
                  {submitting ? 'Sending…' : 'Send feedback'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group inline-flex items-center gap-2 rounded-full border border-violet-300/30 bg-[#151827]/95 px-4 py-3 text-sm font-semibold text-white shadow-xl shadow-black/35 backdrop-blur transition-all hover:-translate-y-0.5 hover:border-cyan-300/45 hover:bg-[#1b2032] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080c14]"
          aria-label="Send beta feedback"
        >
          <span className="relative flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-violet-400 to-cyan-300 text-[#101421]">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.42-4.03 8-9 8a10.7 10.7 0 0 1-4.66-1.06L3 20l1.3-3.89A7.54 7.54 0 0 1 3 12c0-4.42 4.03-8 9-8s9 3.58 9 8Z" /></svg>
          </span>
          <span>Feedback</span>
          <span className="hidden font-mono text-[0.58rem] font-medium uppercase tracking-[0.13em] text-cyan-200/75 sm:inline">Beta</span>
        </button>
      )}
    </div>
  );
}
