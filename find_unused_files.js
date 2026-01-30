const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const usedFiles = new Set();
const visited = new Set();

function resolveImport(filePath, importPath) {
  if (importPath.startsWith('.')) {
    const dir = path.dirname(filePath);
    let resolved = path.resolve(dir, importPath);
    
    if (!fs.existsSync(resolved)) {
      const extensions = ['.ts', '.tsx', '.js', '.jsx'];
      for (const ext of extensions) {
        if (fs.existsSync(resolved + ext)) {
          resolved = resolved + ext;
          break;
        }
        if (fs.existsSync(path.join(resolved, 'index' + ext))) {
          resolved = path.join(resolved, 'index' + ext);
          break;
        }
      }
    }
    
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      return resolved;
    }
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      const indexPath = path.join(resolved, 'index.ts');
      if (fs.existsSync(indexPath)) return indexPath;
    }
  }
  return null;
}

function extractImports(content, filePath) {
  const imports = [];
  const importRegex = /import\s+.*?\s+from\s+['"](.+?)['"]/g;
  const requireRegex = /require\s*\(\s*['"](.+?)['"]\s*\)/g;
  const dynamicImportRegex = /import\s*\(\s*['"](.+?)['"]\s*\)/g;
  
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  while ((match = requireRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  while ((match = dynamicImportRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  
  return imports.map(imp => resolveImport(filePath, imp)).filter(Boolean);
}

function traceFile(filePath) {
  if (visited.has(filePath) || !filePath.startsWith(srcDir)) return;
  
  visited.add(filePath);
  usedFiles.add(filePath);
  
  if (!fs.existsSync(filePath)) return;
  
  const content = fs.readFileSync(filePath, 'utf8');
  const imports = extractImports(content, filePath);
  
  imports.forEach(imp => {
    if (imp && imp.startsWith(srcDir)) {
      traceFile(imp);
    }
  });
}

const entryPoints = [
  path.join(srcDir, 'index.ts')
];

entryPoints.forEach(ep => {
  if (fs.existsSync(ep)) {
    traceFile(ep);
  }
});

const allFiles = [];
function getAllFiles(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      getAllFiles(filePath);
    } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
      allFiles.push(filePath);
    }
  });
}

getAllFiles(srcDir);

const unusedFiles = allFiles.filter(f => !usedFiles.has(f));
console.log('UNUSED FILES:');
unusedFiles.forEach(f => console.log(f));
