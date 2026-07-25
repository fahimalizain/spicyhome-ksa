import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

/** Load repo-root .env.worktree into process.env (does not override existing). */
function loadWorktreeEnv(): void {
  const envPath = path.join(repoRoot, '.env.worktree');
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadWorktreeEnv();

const serverPort = parseInt(process.env.PORT || '3742', 10);
const vitePort = parseInt(process.env.VITE_PORT || '6124', 10);

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';

  return {
    plugins: [react()],
    // Prefer TS sources over tsc-emitted CJS .js (server preLaunchTask writes
    // *.js next to *.ts). Default Vite order is .js before .ts, so bare imports
    // like `from './money'` would load CJS and break named ESM exports.
    resolve: {
      extensions: ['.mts', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
      alias: {
        '@spicyhome/shared': path.resolve(repoRoot, 'packages/shared/src/index.ts'),
        '@spicyhome/client-ts': path.resolve(repoRoot, 'packages/client-ts/src/index.ts'),
      },
    },
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
          port: vitePort,
          strictPort: true,
          proxy: {
            '/api': {
              target: `http://localhost:${serverPort}`,
              ws: true,
              rewrite: (p) => p.replace(/^\/api/, ''),
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
