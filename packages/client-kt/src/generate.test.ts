/**
 * Drift test: regenerates Kotlin sources to a temp directory, diffs against
 * checked-in sources. Fails if they differ — meaning the spec changed but
 * the Kotlin sources weren't regenerated.
 *
 * Requires Java on the host PATH. The openapi-generator JAR is resolved
 * through the @openapitools/openapi-generator-cli npm package.
 */
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

function findSpec(): string {
  const candidates = [
    path.join(process.cwd(), 'packages', 'api-spec', 'openapi.json'),
    path.join(
      process.env.RUNFILES_DIR || '',
      '_main', 'packages', 'api-spec', 'openapi.json',
    ),
    path.resolve(__dirname, '..', '..', '..', 'api-spec', 'openapi.json'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('Cannot find openapi.json');
}

function findCli(): string {
  const candidates = [
    path.join(__dirname, '..', 'node_modules', '.bin', 'openapi-generator-cli'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) || fs.existsSync(c + '.cmd')) return c;
  }
  throw new Error(
    'openapi-generator-cli not found. Ensure @openapitools/openapi-generator-cli is installed.',
  );
}

function collectKtFiles(dir: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!fs.existsSync(dir)) return result;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      Object.assign(result, collectKtFiles(full));
    } else if (entry.name.endsWith('.kt')) {
      result[full] = fs.readFileSync(full, 'utf-8');
    }
  }
  return result;
}

describe('Kotlin client drift check', () => {
  let hasJava = false;

  beforeAll(() => {
    try {
      execSync('java -version', { stdio: 'pipe' });
      hasJava = true;
    } catch {
      console.warn('Java not available — skipping full drift test');
    }
  });

  it('regenerated sources match checked-in sources', () => {
    if (!hasJava) {
      console.warn('Skipped: Java not on PATH');
      return;
    }

    let specPath: string;
    try {
      specPath = findSpec();
    } catch {
      console.warn('Skipped: openapi.json not found');
      return;
    }

    let cli: string;
    try {
      cli = findCli();
    } catch {
      console.warn('Skipped: openapi-generator-cli not found');
      return;
    }

    let tempDir = '';
    try {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-drift-'));
      const outDir = path.join(tempDir, 'out');

      const cmd = [
        `"${cli}"`,
        'generate',
        '-i', `"${specPath}"`,
        '-g', 'kotlin',
        '-o', `"${outDir}"`,
        '--additional-properties',
        'packageName=com.spicyhome.client,library=jvm-retrofit2,collectionFormat=csv,dateLibrary=string',
      ].join(' ');

      execSync(cmd, { stdio: 'pipe', cwd: path.join(__dirname, '..'), timeout: 120000 });

      const generatedRoot = path.join(
        outDir, 'src', 'main', 'kotlin', 'com', 'spicyhome', 'client',
      );
      const checkedInRoot = path.join(
        __dirname, 'generated', 'src', 'main', 'kotlin', 'com', 'spicyhome', 'client',
      );

      const generated = collectKtFiles(generatedRoot);
      const checkedIn = collectKtFiles(checkedInRoot);

      // Compare file lists (relative paths)
      const stripRoot = (f: string, r: string) => path.relative(r, f);
      const genRel = Object.keys(generated).map((f) => stripRoot(f, generatedRoot)).sort();
      const chkRel = Object.keys(checkedIn).map((f) => stripRoot(f, checkedInRoot)).sort();

      expect(genRel).toEqual(chkRel);

      // Compare file contents
      for (const rel of genRel) {
        const genContent = generated[path.join(generatedRoot, rel)];
        const chkContent = checkedIn[path.join(checkedInRoot, rel)];
        expect(genContent).toBe(chkContent);
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 180000);
});
