import { replaceInFileSync } from 'replace-in-file';

const options = [
  {
    files: '**/*',
    ignore: ['node_modules/**', 'dist/**', '.git/**', 'out/**', 'scripts/rename.mjs'],
    from: /Slipgate/g,
    to: 'Nexus',
  },
  {
    files: '**/*',
    ignore: ['node_modules/**', 'dist/**', '.git/**', 'out/**', 'scripts/rename.mjs'],
    from: /slipgate/g,
    to: 'nexus',
  },
];

try {
  for (const opt of options) {
    const results = replaceInFileSync(opt);
    console.log('Replacement results:', results.filter(r => r.hasChanged).map(r => r.file));
  }
} catch (error) {
  console.error('Error occurred:', error);
}
