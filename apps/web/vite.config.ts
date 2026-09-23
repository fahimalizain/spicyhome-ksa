import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  // Pin the project root to this package. Under Bazel the config is executed
  // from the real execroot while the process cwd is the sandbox path, so the
  // absolute HTML entry below would otherwise fall outside the default root.
  root: __dirname,
  // GitHub project Pages site is served from a subpath.
  base: '/spicyhome-ksa/',
  build: {
    target: 'chrome109',
    outDir: 'dist',
    rollupOptions: {
      // Slice 2 adds the privacy page entry here.
      input: {
        index: path.resolve(__dirname, 'index.html'),
      },
    },
  },
  esbuild: {
    target: 'chrome109',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    // Tests live under src; scoping avoids rescanning the Bazel runfiles copy
    // of this package (which sits inside the root when running under Bazel).
    dir: 'src',
    setupFiles: './src/setupTests.ts',
    css: true,
  },
});
