import { Link } from 'react-router-dom';
import { getMe } from '../api';

export function AdminPage() {
  const me = getMe();

  const links = [
    { path: '/admin/items', label: 'Items', show: true },
    { path: '/admin/categories', label: 'Categories', show: true },
    { path: '/admin/printers', label: 'Printers', show: me?.managePrinters },
    { path: '/admin/tables', label: 'Tables', show: me?.manageTables },
    { path: '/admin/users', label: 'Users', show: me?.manageUsers },
    { path: '/admin/zatca', label: 'ZATCA', show: me?.manageSettings },
  ];

  return (
    <div className="h-full overflow-y-auto p-4">
      <h1 className="text-xl font-bold text-white mb-6">Admin</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {links
          .filter((l) => l.show)
          .map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className="touch-target flex flex-col items-center justify-center bg-gray-800 hover:bg-gray-700 rounded-xl p-6 text-center"
            >
              <span className="text-sm font-medium text-white">{link.label}</span>
            </Link>
          ))}
      </div>
    </div>
  );
}
