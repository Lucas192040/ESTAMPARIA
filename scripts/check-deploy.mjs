/** Lightweight, dependency-free checks for regressions that previously broke Vercel. */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const issues = [];
let scanned = 0;
function visit(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.next'].includes(entry.name)) continue;
    const file = join(dir, entry.name);
    if (entry.isDirectory()) { visit(file); continue; }
    if (!/\.tsx?$/.test(entry.name)) continue;
    scanned++;
    const source = readFileSync(file, 'utf8');
    const imports = /(?:\bfrom\s*|\bimport\s*\(|\bimport\s*)(["'])([^"']+)\1/g;
    for (const match of source.matchAll(imports)) {
      const specifier = match[2];
      if (specifier.endsWith('.ts') || specifier.endsWith('.tsx')) {
        issues.push(`${file}: Importação '${specifier}' incompatível com tsconfig (TS5097).`);
      }
      if (specifier.startsWith('.') || specifier.startsWith('@/')) {
        const base = specifier.startsWith('@/')
          ? join(root, 'src', specifier.slice(2))
          : resolve(dirname(file), specifier);
        if (!['', '.ts', '.tsx', '.js', '.jsx', '.json', '/index.ts', '/index.tsx'].some(ext => existsSync(base + ext))) {
          issues.push(`${file}: Módulo local não encontrado: '${specifier}'.`);
        }
      }
    }
  }
}
visit(join(root, 'src'));
visit(join(root, 'tests'));
const dashboard = readFileSync(join(root, 'src/components/Dashboard.tsx'), 'utf8');
if (/<Factory\b/.test(dashboard)) {
  const imports = [...dashboard.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/g)];
  if (!imports.some((match) => match[1].split(',').some((part) => part.trim() === 'Factory'))) {
    issues.push('Dashboard.tsx: Ícone Factory em JSX sem importação de lucide-react (TS2304).');
  }
}
if (issues.length) {
  console.error(`Falha na pré-verificação (${issues.length} ocorrência(s)):`);
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log(`Pré-verificação de deploy aprovada: ${scanned} arquivos TypeScript/TSX, referências locais e regressões TS2304/TS5097.`);
}
