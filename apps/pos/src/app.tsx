import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { LoginPage } from './pages/LoginPage';
import { OrderPage } from './pages/OrderPage';
import { OrdersPage } from './pages/OrdersPage';
import { TablesViewPage } from './pages/TablesViewPage';
import { DayPage } from './pages/DayPage';
import { AdminPage } from './pages/AdminPage';
import { ItemsPage } from './pages/admin/ItemsPage';
import { CategoriesPage } from './pages/admin/CategoriesPage';
import { SubcategoriesPage } from './pages/admin/SubcategoriesPage';
import { PrintersPage } from './pages/admin/PrintersPage';
import { TablesPage } from './pages/admin/TablesPage';
import { UsersPage } from './pages/admin/UsersPage';
import { ZatcaPage } from './pages/admin/ZatcaPage';
import { PaymentMethodsPage } from './pages/admin/PaymentMethodsPage';
import { DeliveryPartnersPage } from './pages/admin/DeliveryPartnersPage';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { SentryErrorFallback } from './components/SentryErrorFallback';

// Create a Sentry-wrapped BrowserRouter with React Router v6 browser tracing
const SentryRoutes = Sentry.withSentryReactRouterV6Routing(Routes);

export function App() {
  return (
    <Sentry.ErrorBoundary fallback={SentryErrorFallback}>
      <BrowserRouter>
        <SentryRoutes>
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
              <Route path="/admin/subcategories" element={<SubcategoriesPage />} />
              <Route path="/admin/printers" element={<PrintersPage />} />
              <Route path="/admin/tables" element={<TablesPage />} />
              <Route path="/admin/users" element={<UsersPage />} />
              <Route path="/admin/zatca" element={<ZatcaPage />} />
              <Route path="/admin/payment-methods" element={<PaymentMethodsPage />} />
              <Route path="/admin/delivery-partners" element={<DeliveryPartnersPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </SentryRoutes>
      </BrowserRouter>
    </Sentry.ErrorBoundary>
  );
}
