import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { clearToken, getMe, getToken } from '../api';
import { realtime } from '../realtime';
import type { MeResponse } from '@spicyhome/client-ts';

export function Layout() {
  const navigate = useNavigate();
  const me = getMe();

  useEffect(() => {
    const token = getToken();
    if (token) {
      realtime.setToken(token);
      realtime.connect();
    }
    return () => {
      realtime.disconnect();
    };
  }, []);

  function handleLogout() {
    realtime.disconnect();
    clearToken();
    navigate('/login');
  }

  return (
    <div className="h-full flex flex-col">
      <TopBar me={me} onLogout={handleLogout} />
      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}

function TopBar({ me, onLogout }: { me: MeResponse | null; onLogout: () => void }) {
  return (
    <nav className="flex items-center justify-between bg-gray-800 px-4 py-2 border-b border-gray-700 shrink-0">
      <div className="flex items-center gap-4">
        <Link
          to="/"
          className="flex items-center gap-2 text-lg font-bold text-brand-500 touch-target"
        >
          <img src="/logo.svg" alt="SpicyHome" className="h-12 w-12 object-contain" />
        </Link>
        <Link to="/" className="text-sm text-gray-300 hover:text-white touch-target">
          Active
        </Link>
        <Link to="/orders" className="text-sm text-gray-300 hover:text-white touch-target">
          Orders
        </Link>
        <Link to="/tables" className="text-sm text-gray-300 hover:text-white touch-target">
          Tables
        </Link>
        <Link to="/day" className="text-sm text-gray-300 hover:text-white touch-target">
          Day
        </Link>
      </div>
      <UserMenu me={me} onLogout={onLogout} />
    </nav>
  );
}

function UserMenu({ me, onLogout }: { me: MeResponse | null; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [open]);

  function closeMenu() {
    setOpen(false);
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="text-sm text-gray-300 hover:text-white touch-target gap-1 px-3"
      >
        {me?.name || ''}
        <span aria-hidden="true" className="text-xs">
          ▾
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 min-w-[10rem] rounded-lg border border-gray-700 bg-gray-800 py-1 shadow-lg z-50"
        >
          {me?.manageMenu && (
            <Link
              to="/admin"
              role="menuitem"
              onClick={closeMenu}
              className="touch-target !justify-start w-full px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
            >
              Admin
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeMenu();
              window.location.reload();
            }}
            className="touch-target !justify-start w-full px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
          >
            Refresh
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeMenu();
              onLogout();
            }}
            className="touch-target !justify-start w-full px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-red-400"
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
