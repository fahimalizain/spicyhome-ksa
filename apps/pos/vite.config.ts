import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';

  return {
    plugins: [react()],
    build: {
      target: 'chrome109',
      outDir: 'dist',
      sourcemap: true,
    },
    esbuild: {
      target: 'chrome109',
    },
    server: isDev
      ? {
          port: 5173,
          proxy: {
            '/auth': 'http://localhost:3000',
            '/menu': 'http://localhost:3000',
            '/orders': 'http://localhost:3000',
            '/tables': 'http://localhost:3000',
            '/printers': 'http://localhost:3000',
          },
        }
      : undefined,
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/setupTests.ts',
      css: true,
    },
  };
});
