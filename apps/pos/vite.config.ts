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
            '/api': {
              target: 'http://localhost:3742',
              ws: true,
              rewrite: (path) => path.replace(/^\/api/, ''),
            },
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
