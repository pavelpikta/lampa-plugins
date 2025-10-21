#!/usr/bin/env node

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';

const PLUGINS_DIR = resolve(process.cwd(), 'plugins');
const MANIFEST_FILENAME = 'plugin-manifest.json';

async function main() {
  const files = await collectPluginFiles(PLUGINS_DIR);

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

  const plugins = files.map((relativePath) => {
    const name = relativePath;
    const metadata = catalogMap.get(name) || catalogMap.get(basename(name)) || {};

    return {
      name,
      label: metadata.label ?? formatLabelFromPath(name),
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

const IGNORED_PLUGIN_FILES = new Set([
  'catalog.json',
  'index.html',
  'plugin-manifest.json',
  'favicon.ico',
  'favicon.svg',
]);
const IGNORED_DIRECTORIES = new Set(['.git', '.github', 'node_modules']);
const ALLOWED_EXTENSIONS = new Set(['.js']);

async function collectPluginFiles(rootDir) {
  const results = [];

  async function walk(currentDir, relativeDir = '') {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const { name } = entry;
      if (name.startsWith('.')) {
        continue;
      }

      const relativePath = relativeDir ? `${relativeDir}/${name}` : name;

      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(name)) {
          continue;
        }
        await walk(join(currentDir, name), relativePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (IGNORED_PLUGIN_FILES.has(name)) {
        continue;
      }

      if (!shouldIncludeFile(name)) {
        continue;
      }

      results.push(relativePath);
    }
  }

  await walk(rootDir);
  results.sort((a, b) => a.localeCompare(b));
  return results;
}

function shouldIncludeFile(name) {
  const extension = extname(name).toLowerCase();

  if (!extension) {
    return true;
  }

  return ALLOWED_EXTENSIONS.has(extension);
}

function formatLabelFromPath(relativePath) {
  const segments = relativePath.split('/');
  const lastIndex = segments.length - 1;

  const formatted = segments.map((segment, index) => {
    const value = index === lastIndex ? basename(segment, extname(segment)) : segment;
    return value
      .replace(/[-_]+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  });

  return formatted.join(' / ');
}

main().catch((error) => {
  console.error('Failed to generate plugin manifest', error);
  process.exitCode = 1;
});
