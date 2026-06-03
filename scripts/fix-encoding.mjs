import fs from 'fs';
import path from 'path';

const dirs = ['src', 'scripts'];

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath);
    } else if (/\.(ts|tsx|html|json|js|mjs)$/.test(file)) {
      const content = fs.readFileSync(fullPath);
      // Remove BOM if exists and write as UTF-8
      let str = content.toString('utf8');
      if (str.charCodeAt(0) === 0xFEFF) {
        str = str.slice(1);
      }
      fs.writeFileSync(fullPath, str, 'utf8');
    }
  }
}

dirs.forEach(d => {
  if (fs.existsSync(d)) walk(d);
});
console.log("All source files converted to UTF-8!");
