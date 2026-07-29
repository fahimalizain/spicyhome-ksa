import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'node:module';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

/** Read VERSION from repo root. */
function readVersion(): string {
  try {
    const candidate = path.resolve(repoRoot, 'VERSION');
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, 'utf8').trim();
    }
  } catch {
    // fall through
  }
  return '0.0.0';
}

const APP_VERSION = process.env.VITE_APP_VERSION || readVersion();

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

  const plugins: any[] = [react()];

  // Sentry Vite plugin for source map upload — only when SENTRY_AUTH_TOKEN is set.
  // createRequire works under package.json "type":"module". try/catch keeps
  // Bazel runfiles working when @sentry/vite-plugin is not linked into the
  // test/build sandbox (pnpm/CI local builds still load it from node_modules).
  // Plugin soft-fails upload errors by default (does not fail the Vite build).
  const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
  if (sentryAuthToken) {
    try {
      const require = createRequire(import.meta.url);
      const { sentryVitePlugin } = require('@sentry/vite-plugin') as {
        sentryVitePlugin: (opts: Record<string, unknown>) => unknown;
      };
      plugins.push(
        sentryVitePlugin({
          authToken: sentryAuthToken,
          org: process.env.SENTRY_ORG || undefined,
          project: process.env.SENTRY_PROJECT || 'spicyhome-pos',
          release: {
            name: `spicyhome-pos@${APP_VERSION}`,
          },
        }),
      );
    } catch (err) {
      console.warn(
        'SENTRY_AUTH_TOKEN set but @sentry/vite-plugin could not be loaded:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  return {
    plugins,
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
    // Bake Sentry and version env vars at build time. Explicit define is
    // required because Bazel action sandboxes do not forward host env to Vite
    // processes. VITE_SENTRY_* values come from --action_env forwarded by the
    // build packaging script (build-package.sh).
    define: {
      'import.meta.env.VITE_SENTRY_DSN': JSON.stringify(process.env.VITE_SENTRY_DSN || ''),
      'import.meta.env.VITE_SENTRY_ENVIRONMENT': JSON.stringify(
        process.env.VITE_SENTRY_ENVIRONMENT ||
          (mode === 'development' ? 'development' : 'production'),
      ),
      'import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE': JSON.stringify(
        process.env.VITE_SENTRY_TRACES_SAMPLE_RATE || '1.0',
      ),
      'import.meta.env.VITE_SENTRY_RELEASE': JSON.stringify(
        process.env.VITE_SENTRY_RELEASE || `spicyhome-pos@${APP_VERSION}`,
      ),
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(APP_VERSION),
    },
  };
});
