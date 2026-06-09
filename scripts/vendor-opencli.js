/**
 * Copy opencli and all its runtime dependencies into vendor/opencli/.
 * Resolves pnpm symlinks correctly by starting from the real path in .pnpm/.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'node_modules', '@jackwener', 'opencli');
const SRC_REAL = fs.realpathSync(SRC); // resolve pnpm symlink to .pnpm/...
const DEST = path.join(ROOT, 'vendor', 'opencli');

// Resolve a dependency starting from the real package directory in .pnpm/
function resolveDepFrom(realPkgDir, name) {
  let dir = realPkgDir;
  while (true) {
    const candidate = path.join(dir, 'node_modules', name);
    if (fs.existsSync(candidate)) {
      const real = fs.realpathSync(candidate);
      if (fs.existsSync(path.join(real, 'package.json'))) return real;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function collectDeps(realPkgDir, depMap = new Map()) {
  const pkgPath = path.join(realPkgDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return depMap;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  for (const dep of Object.keys(pkg.dependencies || {})) {
    if (depMap.has(dep)) continue;
    const resolved = resolveDepFrom(realPkgDir, dep);
    if (!resolved) {
      console.warn(`  WARNING: could not resolve ${dep} from ${realPkgDir}`);
      continue;
    }
    depMap.set(dep, resolved);
    collectDeps(resolved, depMap);
  }
  return depMap;
}

function copyDirSync(src, dest) {
  fs.cpSync(src, dest, { recursive: true, dereference: true });
}

// Clean vendor dir
if (fs.existsSync(DEST)) fs.rmSync(DEST, { recursive: true });

// Copy opencli (from resolved real path)
console.log('Copying opencli...');
copyDirSync(SRC_REAL, DEST);

// Collect deps starting from the REAL path (inside .pnpm/)
const depMap = collectDeps(SRC_REAL);
const vendorNm = path.join(DEST, 'node_modules');
fs.mkdirSync(vendorNm, { recursive: true });

for (const [dep, srcDir] of depMap) {
  const destDir = path.join(vendorNm, dep);
  fs.mkdirSync(path.dirname(destDir), { recursive: true });
  copyDirSync(srcDir, destDir);
  const ver = JSON.parse(fs.readFileSync(path.join(srcDir, 'package.json'), 'utf-8')).version;
  console.log(`  ${dep}@${ver}`);
}

console.log(`Done. ${depMap.size} dependencies vendored.`);
