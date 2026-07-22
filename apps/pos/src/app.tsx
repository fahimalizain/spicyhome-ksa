import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { OrderPage } from './pages/OrderPage';
import { OrdersPage } from './pages/OrdersPage';
import { TablesViewPage } from './pages/TablesViewPage';
import { DayPage } from './pages/DayPage';
import { AdminPage } from './pages/AdminPage';
import { ItemsPage } from './pages/admin/ItemsPage';
import { CategoriesPage } from './pages/admin/CategoriesPage';
import { PrintersPage } from './pages/admin/PrintersPage';
import { TablesPage } from './pages/admin/TablesPage';
import { UsersPage } from './pages/admin/UsersPage';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<OrderPage />} />
            <Route path="/day" element={<DayPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/tables" element={<TablesViewPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/items" element={<ItemsPage />} />
            <Route path="/admin/categories" element={<CategoriesPage />} />
            <Route path="/admin/printers" element={<PrintersPage />} />
            <Route path="/admin/tables" element={<TablesPage />} />
            <Route path="/admin/users" element={<UsersPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
