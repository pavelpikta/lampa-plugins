#!/usr/bin/env node

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';

const PLUGINS_DIR = resolve(process.cwd(), 'plugins');
const MANIFEST_FILENAME = 'plugin-manifest.json';

async function main() {
  const entries = await readdir(PLUGINS_DIR, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith('.js'))
    .filter((name) => !IGNORED_PLUGIN_FILES.has(name));

  const catalogPath = join(PLUGINS_DIR, 'catalog.json');
  let catalog = [];

  try {
    const raw = await readFile(catalogPath, 'utf-8');
    catalog = JSON.parse(raw);
  } catch (error) {
    console.warn('Unable to load catalog.json for metadata', error);
  }

  const catalogMap = new Map();
  for (const entry of Array.isArray(catalog) ? catalog : []) {
    if (entry && typeof entry.name === 'string') {
      catalogMap.set(entry.name, entry);
    }
  }

  const plugins = files.map((filename) => {
    const name = filename;
    const metadata = catalogMap.get(name) || {};

    return {
      name,
      label: metadata.label ?? formatLabelFromFilename(name),
      description: metadata.description ?? null,
      href: metadata.href ?? `/${name}`,
      version: metadata.version ?? null,
    };
  });

  const manifest = {
    generatedAt: new Date().toISOString(),
    plugins,
  };

  const manifestPath = join(PLUGINS_DIR, MANIFEST_FILENAME);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
  console.log(`Generated ${MANIFEST_FILENAME} with ${plugins.length} entries.`);
}

const IGNORED_PLUGIN_FILES = new Set(['catalog.json', 'index.html', 'favicon.ico']);

function formatLabelFromFilename(filename) {
  const withoutExt = basename(filename, extname(filename));
  return withoutExt
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

main().catch((error) => {
  console.error('Failed to generate plugin manifest', error);
  process.exitCode = 1;
});
