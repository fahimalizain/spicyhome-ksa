// Process all package.json files inside the packaged directory:
//   - Strip scripts and devDependencies
//   - Convert workspace:* deps to file: references so npm can resolve them
//   - Fix main field (source uses .ts, compiled output is .js at a flat path)
//
// Usage: node packaging/fixup-packages.js <PACKAGE_DIR>
const fs = require('fs');
const path = require('path');

const packageDir = process.argv[2];
if (!packageDir) {
  console.error('Usage: node fixup-packages.js <PACKAGE_DIR>');
  process.exit(1);
}

// Map @spicyhome/<name> → directory under packages/
const WORKSPACE_PACKAGES = {
  '@spicyhome/shared': 'shared',
  '@spicyhome/db': 'db',
};

// Main field overrides for known packages.
// Compiled JS is placed at the root of each package directory
// (e.g. server/main.js, packages/db/index.js).
const MAIN_OVERRIDES = {
  server: 'main.js',
  'packages/shared': 'index.js',
  'packages/db': 'index.js',
};

function processPackageJson(pkgPath) {
  const dir = path.dirname(pkgPath);
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  delete pkg.scripts;
  delete pkg.devDependencies;

  // Determine relative path from PACKAGE_DIR for main override lookup
  const rel = path.relative(packageDir, dir);
  if (MAIN_OVERRIDES[rel]) {
    pkg.main = MAIN_OVERRIDES[rel];
  } else if (typeof pkg.main === 'string' && pkg.main.endsWith('.ts')) {
    pkg.main = pkg.main.replace(/\.ts$/, '.js');
  }

  // Convert workspace:* to file: references
  for (const [dep, ver] of Object.entries(pkg.dependencies || {})) {
    if (typeof ver === 'string' && ver.startsWith('workspace:')) {
      const wsDir = WORKSPACE_PACKAGES[dep];
      if (wsDir) {
        const target = path.join(packageDir, 'packages', wsDir);
        let relative = path.relative(dir, target);
        if (!relative.startsWith('.')) relative = './' + relative;
        pkg.dependencies[dep] = 'file:' + relative;
      }
    }
  }

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

// Walk the package directory and process every package.json
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.name === 'package.json') {
      processPackageJson(full);
    }
  }
}

walk(packageDir);
