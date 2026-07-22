import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { client, setToken, setMe } from '../api';

const PIN_LENGTH = 4;

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleDigit = useCallback((digit: string) => {
    setError('');
    setPin((prev) => {
      if (prev.length >= PIN_LENGTH) return prev;
      return prev + digit;
    });
  }, []);

  const handleDelete = useCallback(() => {
    setPin((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setPin('');
    setError('');
  }, []);

  const handleLogin = useCallback(async () => {
    if (!username.trim() || pin.length !== PIN_LENGTH) return;
    setLoading(true);
    setError('');
    try {
      const res = await client.auth.login({ username: username.trim(), pin });
      setToken(res.accessToken);
      const me = await client.auth.me();
      setMe(me);
      navigate('/', { replace: true });
    } catch {
      setError('Invalid credentials');
      setPin('');
    } finally {
      setLoading(false);
    }
  }, [username, pin, navigate]);

  useEffect(() => {
    if (pin.length === PIN_LENGTH) {
      handleLogin();
    }
  }, [pin, handleLogin]);

  return (
    <div className="h-full flex flex-col items-center justify-center bg-gray-900 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center text-brand-500 mb-8">SpicyHome POS</h1>

        <div className="mb-6">
          <label className="block text-sm text-gray-400 mb-1">Username</label>
          <input
            type="text"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-lg focus:outline-none focus:border-brand-500"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter username"
            autoComplete="username"
            disabled={loading}
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-1">PIN</label>
          <div className="flex gap-2 justify-center mb-2">
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <div
                key={i}
                className={`w-12 h-12 rounded-lg border-2 flex items-center justify-center text-xl font-bold ${
                  i < pin.length
                    ? 'border-brand-500 bg-brand-500/20 text-brand-500'
                    : 'border-gray-700 bg-gray-800 text-gray-500'
                }`}
              >
                {i < pin.length ? '•' : ''}
              </div>
            ))}
          </div>
        </div>

        {error && <div className="text-red-400 text-sm text-center mb-4">{error}</div>}

        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button
              key={n}
              onClick={() => handleDigit(String(n))}
              disabled={loading}
              className="touch-target bg-gray-800 hover:bg-gray-700 active:bg-gray-600 rounded-xl text-2xl font-bold text-white py-4 disabled:opacity-50"
            >
              {n}
            </button>
          ))}
          <button
            onClick={handleClear}
            disabled={loading}
            className="touch-target bg-gray-700 hover:bg-gray-600 active:bg-gray-500 rounded-xl text-sm font-bold text-gray-300 py-4 disabled:opacity-50"
          >
            Clear
          </button>
          <button
            onClick={() => handleDigit('0')}
            disabled={loading}
            className="touch-target bg-gray-800 hover:bg-gray-700 active:bg-gray-600 rounded-xl text-2xl font-bold text-white py-4 disabled:opacity-50"
          >
            0
          </button>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="touch-target bg-gray-700 hover:bg-gray-600 active:bg-gray-500 rounded-xl text-sm font-bold text-gray-300 py-4 disabled:opacity-50"
          >
            ⌫
          </button>
        </div>

        {loading && <div className="text-center text-gray-400 text-sm mt-4">Logging in...</div>}
      </div>
    </div>
  );
}
