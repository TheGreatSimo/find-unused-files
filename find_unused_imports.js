const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const allFiles = new Map();
const fileExports = new Map();
const fileImports = new Map();

function getAllTsFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir);
  items.forEach(item => {
    const filePath = path.join(dir, item);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
      files.push(...getAllTsFiles(filePath));
    } else if (item.endsWith('.ts') && !item.endsWith('.d.ts')) {
      files.push(filePath);
    }
  });
  return files;
}

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

function extractExports(content) {
  const exports = new Set();
  
  const namedExportRegex = /export\s+(?:const|function|class|interface|type|enum)\s+(\w+)/g;
  const exportStatementRegex = /export\s*\{\s*([^}]+)\s*\}/g;
  const defaultExportRegex = /export\s+default\s+/g;
  
  let match;
  while ((match = namedExportRegex.exec(content)) !== null) {
    exports.add(match[1]);
  }
  
  while ((match = exportStatementRegex.exec(content)) !== null) {
    const exportList = match[1];
    const items = exportList.split(',').map(item => {
      const parts = item.trim().split(/\s+as\s+/);
      return parts[parts.length - 1].trim();
    });
    items.forEach(item => {
      if (item) exports.add(item);
    });
  }
  
  if (defaultExportRegex.test(content)) {
    exports.add('default');
  }
  
  return Array.from(exports);
}

function extractImports(content, filePath) {
  const imports = [];
  
  const importRegex = /import\s+(?:(?:\*\s+as\s+(\w+))|(?:\{([^}]+)\})|(\w+)|(?:\s*,\s*\{([^}]+)\}))?)\s+from\s+['"](.+?)['"]/g;
  const requireRegex = /require\s*\(\s*['"](.+?)['"]\s*\)/g;
  const dynamicImportRegex = /import\s*\(\s*['"](.+?)['"]\s*\)/g;
  
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const namespace = match[1];
    const namedImports = match[2] || match[4];
    const defaultImport = match[3];
    const modulePath = match[5] || match[6];
    
    const resolved = resolveImport(filePath, modulePath);
    if (resolved && resolved.startsWith(srcDir)) {
      const importedItems = [];
      if (namespace) importedItems.push({ type: 'namespace', name: namespace });
      if (defaultImport) importedItems.push({ type: 'default', name: defaultImport });
      if (namedImports) {
        namedImports.split(',').forEach(item => {
          const parts = item.trim().split(/\s+as\s+/);
          const originalName = parts[0].trim();
          const alias = parts[1] ? parts[1].trim() : originalName;
          importedItems.push({ type: 'named', name: alias, originalName });
        });
      }
      imports.push({ file: resolved, items: importedItems });
    }
  }
  
  while ((match = requireRegex.exec(content)) !== null) {
    const resolved = resolveImport(filePath, match[1]);
    if (resolved && resolved.startsWith(srcDir)) {
      imports.push({ file: resolved, items: [{ type: 'require', name: 'default' }] });
    }
  }
  
  while ((match = dynamicImportRegex.exec(content)) !== null) {
    const resolved = resolveImport(filePath, match[1]);
    if (resolved && resolved.startsWith(srcDir)) {
      imports.push({ file: resolved, items: [{ type: 'dynamic', name: 'default' }] });
    }
  }
  
  return imports;
}

function checkUsage(content, importName, isNamespace) {
  if (isNamespace) {
    const regex = new RegExp(`\\b${importName}\\.`, 'g');
    return regex.test(content);
  } else {
    const regex = new RegExp(`\\b${importName}\\b`, 'g');
    const matches = content.match(regex);
    if (!matches) return false;
    
    const importRegex = new RegExp(`import\\s+.*?\\b${importName}\\b.*?from`, 'g');
    const exportRegex = new RegExp(`export\\s+.*?\\b${importName}\\b`, 'g');
    
    let importCount = 0;
    let exportCount = 0;
    let match;
    while ((match = importRegex.exec(content)) !== null) importCount++;
    while ((match = exportRegex.exec(content)) !== null) exportCount++;
    
    return matches.length > (importCount + exportCount);
  }
}

const files = getAllTsFiles(srcDir);

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const exports = extractExports(content);
  const imports = extractImports(content, file);
  
  fileExports.set(file, exports);
  fileImports.set(file, imports);
  allFiles.set(file, content);
});

const unusedImports = [];

fileImports.forEach((imports, file) => {
  const content = allFiles.get(file);
  
  imports.forEach(({ file: importedFile, items }) => {
    const exportedItems = fileExports.get(importedFile) || [];
    
    items.forEach(({ type, name, originalName }) => {
      const checkName = originalName || name;
      
      if (type === 'namespace') {
        if (!checkUsage(content, name, true)) {
          unusedImports.push({
            file,
            importedFile,
            type: 'namespace',
            name,
            line: findLineNumber(content, `import * as ${name}`)
          });
        }
      } else if (type === 'default') {
        if (!checkUsage(content, name, false)) {
          unusedImports.push({
            file,
            importedFile,
            type: 'default',
            name,
            line: findLineNumber(content, `import ${name}`)
          });
        }
      } else if (type === 'named') {
        if (!checkUsage(content, name, false)) {
          unusedImports.push({
            file,
            importedFile,
            type: 'named',
            name: checkName,
            line: findLineNumber(content, checkName)
          });
        }
      } else if (type === 'require' || type === 'dynamic') {
        if (!checkUsage(content, 'require', false) && !checkUsage(content, 'import', false)) {
          unusedImports.push({
            file,
            importedFile,
            type: type,
            name: 'default',
            line: findLineNumber(content, importedFile)
          });
        }
      }
    });
  });
});

function findLineNumber(content, searchText) {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(searchText)) {
      return i + 1;
    }
  }
  return 0;
}

const unusedFiles = [];
fileImports.forEach((imports, file) => {
  imports.forEach(({ file: importedFile, items }) => {
    const exportedItems = fileExports.get(importedFile) || [];
    if (exportedItems.length === 0) return;
    
    const content = allFiles.get(file);
    let hasUsage = false;
    
    items.forEach(({ type, name }) => {
      if (type === 'namespace') {
        if (checkUsage(content, name, true)) hasUsage = true;
      } else if (type === 'default') {
        if (checkUsage(content, name, false)) hasUsage = true;
      } else if (type === 'named') {
        if (checkUsage(content, name, false)) hasUsage = true;
      }
    });
    
    if (!hasUsage && items.length > 0) {
      const relativePath = path.relative(srcDir, importedFile);
      if (!unusedFiles.some(uf => uf.file === file && uf.importedFile === importedFile)) {
        unusedFiles.push({
          file: path.relative(srcDir, file),
          importedFile: relativePath,
          line: findLineNumber(content, relativePath.split('/').pop().replace('.ts', ''))
        });
      }
    }
  });
});

console.log('\n=== UNUSED IMPORTS ===\n');
if (unusedImports.length === 0) {
  console.log('No unused imports found!');
} else {
  unusedImports.forEach(({ file, importedFile, type, name, line }) => {
    const relFile = path.relative(srcDir, file);
    const relImported = path.relative(srcDir, importedFile);
    console.log(`${relFile}:${line} - Unused ${type} import '${name}' from '${relImported}'`);
  });
}

console.log('\n=== FILES IMPORTED BUT NOT USED ===\n');
if (unusedFiles.length === 0) {
  console.log('No unused file imports found!');
} else {
  const grouped = {};
  unusedFiles.forEach(({ file, importedFile, line }) => {
    if (!grouped[importedFile]) {
      grouped[importedFile] = [];
    }
    grouped[importedFile].push({ file, line });
  });
  
  Object.entries(grouped).forEach(([importedFile, usages]) => {
    console.log(`\n${importedFile}:`);
    usages.forEach(({ file, line }) => {
      console.log(`  - Imported in ${file}:${line} but not used`);
    });
  });
}
