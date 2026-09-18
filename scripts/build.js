// Build the client into web/public/assets/bundle-<hash>.js and render index.html to point at it.
// The hash in the filename defeats edge/browser caching of stale bundles across deploys.
import { build } from 'esbuild';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { bundleHref, renderIndex } from './buildHtml.js';

const PUBLIC_DIR = 'web/public';
const ASSETS_DIR = path.join(PUBLIC_DIR, 'assets');
const TEMPLATE = 'web/index.template.html';

const cleanAssets = async () => {
  await mkdir(ASSETS_DIR, { recursive: true });
  const stale = await readdir(ASSETS_DIR);
  await Promise.all(stale.map((name) => rm(path.join(ASSETS_DIR, name))));
};

const bundleClient = async () => {
  const result = await build({
    entryPoints: ['web/src/main.js'],
    bundle: true,
    minify: true,
    format: 'iife',
    outdir: ASSETS_DIR,
    entryNames: 'bundle-[hash]',
    metafile: true,
  });
  const outputs = Object.keys(result.metafile.outputs).filter((f) => f.endsWith('.js'));
  if (outputs.length !== 1) throw new Error(`expected one JS output, got ${outputs.length}`);
  return outputs[0];
};

const main = async () => {
  await cleanAssets();
  const output = await bundleClient();
  const href = bundleHref(output, PUBLIC_DIR);
  const html = renderIndex(await readFile(TEMPLATE, 'utf8'), href);
  await writeFile(path.join(PUBLIC_DIR, 'index.html'), html);
  console.log(`built ${href}`);
};

main().catch((err) => {
  console.error('[build] failed:', err.message);
  process.exit(1);
});
