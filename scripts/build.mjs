import { cp, mkdir, rm, access } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist/data', { recursive: true });
await cp('web', 'dist', { recursive: true });
for (const name of ['benchmark.json', 'runs.csv', 'validation.json', 'REPORT.md', 'mean.svg', 'speedup.svg', 'efficiency.svg']) {
  try { await access('results/' + name); await cp('results/' + name, 'dist/data/' + name); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
}
console.log('Static application built in dist/');
