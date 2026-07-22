import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';

let isAuthed = false;

vi.mock('../api', () => ({
  client: { auth: { login: vi.fn(), me: vi.fn(), listUsers: vi.fn() } },
  setToken: vi.fn(),
  setMe: vi.fn(),
  clearToken: vi.fn(),
  getToken: vi.fn(),
  getMe: vi.fn(),
  isAuthenticated: () => isAuthed,
}));

function renderProtected(authenticated: boolean, initialRoute = '/') {
  isAuthed = authenticated;
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<div>Protected Content</div>} />
        </Route>
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    isAuthed = false;
  });

  it('redirects to login when not authenticated', () => {
    renderProtected(false);
    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('renders children when authenticated', () => {
    renderProtected(true);
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
});
