import { useEffect, useRef, useState } from 'react';
import { signOut } from '../lib/auth-client';

interface Props {
  userName: string;
  userImage: string;
  fallbackAvatarUrl: string;
  isAdmin: boolean;
}

export function UserMenu({ userName, userImage, fallbackAvatarUrl, isAdmin }: Props) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const avatarUrl = userImage || fallbackAvatarUrl;

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    window.location.href = '/';
  }

  const linkClass =
    'block w-full px-4 py-2 text-left text-sm text-zinc-300 transition-colors hover:bg-white/5 hover:text-white';

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/5"
      >
        <img
          src={avatarUrl}
          alt=""
          className="h-8 w-8 rounded-full object-cover ring-1 ring-white/10"
        />
        <span className="max-w-[140px] truncate text-sm font-medium text-white">{userName}</span>
        <svg
          className={`h-4 w-4 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-lg border border-white/10 bg-zinc-900 py-1 shadow-xl"
        >
          <a href="/dashboard" role="menuitem" className={linkClass} onClick={() => setOpen(false)}>
            Account
          </a>
          {isAdmin && (
            <a href="/admin" role="menuitem" className={linkClass} onClick={() => setOpen(false)}>
              Admin
            </a>
          )}
          <div className="my-1 border-t border-white/10" />
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            disabled={signingOut}
            className={`${linkClass} text-red-400 hover:text-red-300 disabled:opacity-50`}
          >
            {signingOut ? 'Signing out...' : 'Logout'}
          </button>
        </div>
      )}
    </div>
  );
}
