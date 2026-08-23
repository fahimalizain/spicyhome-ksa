import { Link } from 'react-router-dom';

/**
 * Reports hub — Admin-style tiles, always visible to every user (no extra
 * permission). Both reports are plain read-only views.
 */
export function ReportsPage() {
  const links = [
    { path: '/reports/sales-register', label: 'Sales Register' },
    { path: '/reports/item-wise', label: 'Item-wise Sales' },
  ];

  return (
    <div className="h-full overflow-y-auto p-4">
      <h1 className="text-xl font-bold text-white mb-6">Reports</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {links.map((link) => (
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
