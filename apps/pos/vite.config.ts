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
          port: 6124,
          proxy: {
            '/auth': 'http://localhost:3742',
            '/menu': 'http://localhost:3742',
            '/orders': 'http://localhost:3742',
            '/tables': 'http://localhost:3742',
            '/printers': 'http://localhost:3742',
            '/day': 'http://localhost:3742',
            '/reports': 'http://localhost:3742',
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
