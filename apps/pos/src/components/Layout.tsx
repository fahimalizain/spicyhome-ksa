import { Outlet, Link, useNavigate } from 'react-router-dom';
import { clearToken, getMe } from '../api';
import type { MeResponse } from '@spicyhome/client-ts';

export function Layout() {
  const navigate = useNavigate();
  const me = getMe();

  function handleLogout() {
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
        <Link to="/" className="text-lg font-bold text-brand-500 touch-target">SpicyHome</Link>
        <Link to="/" className="text-sm text-gray-300 hover:text-white touch-target">Order</Link>
        <Link to="/day" className="text-sm text-gray-300 hover:text-white touch-target">Day</Link>
        <Link to="/orders" className="text-sm text-gray-300 hover:text-white touch-target">Orders</Link>
        {me?.manageMenu && (
          <Link to="/admin" className="text-sm text-gray-300 hover:text-white touch-target">Admin</Link>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-400">{me?.name || ''}</span>
        <button
          onClick={onLogout}
          className="text-sm text-gray-400 hover:text-red-400 touch-target px-3"
        >
          Logout
        </button>
      </div>
    </nav>
  );
}
