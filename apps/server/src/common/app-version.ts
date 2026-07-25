import * as fs from 'fs';
import * as path from 'path';

/**
 * Read the application version using multiple fallback sources so it works
 * in development, CI, and packaged Windows 7 deployments.
 *
 * Priority order:
 *  1. APP_VERSION env var (set in packaged start-server.ps1)
 *  2. SENTRY_RELEASE env var (set in CI / deployment)
 *  3. server/package.json `version` field (compiled JS dir is server/)
 *  4. Root VERSION file (../../VERSION from cwd, or cwd/VERSION)
 *  5. '0.0.0' fallback
 */
export function readAppVersion(): string {
  // 1. Explicit env override (packaged deployment sets this)
  if (process.env.APP_VERSION) {
    return process.env.APP_VERSION;
  }

  // 2. Sentry release env (may contain prefix like spicyhome-server@)
  if (process.env.SENTRY_RELEASE) {
    return process.env.SENTRY_RELEASE;
  }

  // 3. Read version from the server package.json (works in packaged deploy)
  try {
    const pkgPath = path.resolve(__dirname, '..', 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.version) return pkg.version;
    }
  } catch {
    // fall through
  }

  // 4. Try repo-root VERSION file (../../VERSION from compiled JS in bazel)
  const candidates = [
    path.resolve(process.cwd(), '..', '..', 'VERSION'),
    path.resolve(process.cwd(), 'VERSION'),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return fs.readFileSync(candidate, 'utf8').trim();
      }
    } catch {
      // try next
    }
  }

  return '0.0.0';
}
