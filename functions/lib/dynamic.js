import fallbackCatalogSource from '../../plugins/catalog.json' assert { type: 'json' };

const INTERNAL_ORIGIN = 'https://lampa-plugins.internal';
const MANIFEST_ASSET_PATHS = ['/__STATIC_CONTENT_MANIFEST', '/_manifest.json', '/asset-manifest.json'];
const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 's-maxage=300, stale-while-revalidate=600'
};
const defaultDescription = 'Not provided';
const defaultVersion = '1.0.0';

const fallbackCatalog = normalizeCatalog(fallbackCatalogSource);
const fallbackMap = new Map(fallbackCatalog.map((item) => [item.name, item]));
const fallbackLowercaseMap = new Map(fallbackCatalog.map((item) => [item.name.toLowerCase(), item.name]));

export async function generateCatalogResponse(context) {
  const { env } = context || {};
  const buildId = (env && env.CF_PAGES_COMMIT_SHA) || 'local-dev';
  const cacheKey = new Request(`${INTERNAL_ORIGIN}/api/plugins/dynamic?build=${buildId}`);
  const cache = typeof caches !== 'undefined' ? caches.default : null;

  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const fallbackList = buildFallbackList();
  let plugins = fallbackList;
  let dataSource = 'fallback';

  const discovered = await discoverPlugins(context);
  const merged = mergeCatalogSources({ fallbackList, assetCatalog: discovered });

  if (merged.length) {
    plugins = merged;
  }

  if (discovered.length) {
    dataSource = 'asset-scan';
  }

  const response = new Response(JSON.stringify(plugins), {
    headers: { ...jsonHeaders, 'X-Data-Source': dataSource, 'X-Build-Id': buildId }
  });

  if (cache && typeof context.waitUntil === 'function') {
    context.waitUntil(cache.put(cacheKey, response.clone()));
  }

  return response;
}

async function discoverPlugins(context) {
  const manifestPaths = await loadManifestPaths(context);
  if (!manifestPaths.length) {
    return [];
  }

  const names = Array.from(
    new Set(
      manifestPaths
        .map(normalizeAssetPath)
        .map(sanitizePluginName)
        .map(resolvePreferredName)
        .filter((name) => name && !shouldIgnoreAsset(name))
    )
  );

  return names.map((name) => {
    const fallback = getFallbackEntry(name);
    return fallback ? { ...fallback } : { name };
  });
}

async function loadManifestPaths(context) {
  const candidates = collectManifestCandidates(context);

  for (const candidate of candidates) {
    const parsed = parseManifestCandidate(candidate);
    if (parsed.length) {
      return parsed;
    }
  }

  const fetched = await fetchManifestFromAssets(context);
  if (fetched.length) {
    return fetched;
  }

  return [];
}

function collectManifestCandidates(context) {
  const { env } = context || {};
  const candidates = [];

  if (env) {
    if (typeof env.ASSET_MANIFEST !== 'undefined') {
      candidates.push(env.ASSET_MANIFEST);
    }

    if (typeof env.__STATIC_CONTENT_MANIFEST !== 'undefined') {
      candidates.push(env.__STATIC_CONTENT_MANIFEST);
    }
  }

  if (typeof __STATIC_CONTENT_MANIFEST !== 'undefined') {
    candidates.push(__STATIC_CONTENT_MANIFEST);
  }

  return candidates;
}

async function fetchManifestFromAssets(context) {
  const { env } = context || {};
  if (!env || !env.ASSETS || typeof env.ASSETS.fetch !== 'function') {
    return [];
  }

  for (const path of MANIFEST_ASSET_PATHS) {
    try {
      const request = new Request(`${INTERNAL_ORIGIN}${path}`, {
        headers: { Accept: 'application/json, text/plain;q=0.9' }
      });
      const response = await env.ASSETS.fetch(request);

      if (!response || !response.ok) {
        continue;
      }

      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json')
        ? await response.json()
        : await response.text();
      const parsed = parseManifestCandidate(payload);

      if (parsed.length) {
        return parsed;
      }
    } catch (error) {
      console.warn('Failed to fetch asset manifest candidate', path, error);
    }
  }

  return [];
}

function parseManifestCandidate(candidate) {
  if (!candidate) {
    return [];
  }

  if (typeof Response !== 'undefined' && candidate instanceof Response) {
    return [];
  }

  if (candidate instanceof ArrayBuffer) {
    const decoded = new TextDecoder().decode(candidate);
    return parseManifestCandidate(decoded);
  }

  if (ArrayBuffer.isView(candidate)) {
    const decoded = new TextDecoder().decode(candidate);
    return parseManifestCandidate(decoded);
  }

  let manifest = candidate;

  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (!trimmed) {
      return [];
    }

    try {
      manifest = JSON.parse(trimmed);
    } catch (error) {
      return [];
    }
  }

  if (!manifest || typeof manifest !== 'object') {
    return [];
  }

  const results = new Set();
  const visited = new WeakSet();

  function visit(value, depth = 0) {
    if (!value || depth > 6) {
      return;
    }

    if (typeof value === 'string') {
      const normalized = value.trim();
      if (normalized) {
        results.add(normalized);
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, depth + 1);
      }
      return;
    }

    if (typeof value === 'object') {
      if (visited.has(value)) {
        return;
      }

      visited.add(value);

      for (const [key, entry] of Object.entries(value)) {
        if (typeof key === 'string' && key.trim()) {
          results.add(key.trim());
        }

        visit(entry, depth + 1);
      }
    }
  }

  if (manifest instanceof Map) {
    for (const [key, value] of manifest.entries()) {
      if (typeof key === 'string' && key.trim()) {
        results.add(key.trim());
      }
      visit(value, 1);
    }

    return Array.from(results);
  }

  if (manifest instanceof Set) {
    for (const value of manifest.values()) {
      visit(value, 1);
    }

    return Array.from(results);
  }

  visit(manifest);

  return Array.from(results);
}

function normalizeAssetPath(value) {
  if (typeof value !== 'string') {
    return null;
  }

  let normalized = value.trim();
  if (!normalized) {
    return null;
  }

  normalized = normalized.split(/[?#]/)[0];
  normalized = normalized.replace(/^\.\//, '');
  normalized = normalized.replace(/^\/+/g, '');
  normalized = normalized.replace(/\\+/g, '/');

  if (normalized.startsWith('plugins/')) {
    normalized = normalized.slice('plugins/'.length);
  }

  return normalized;
}

function sanitizePluginName(value) {
  if (!value) {
    return value;
  }

  const hashedPattern = /(\.[0-9a-f]{6,})+\.js$/i;

  if (hashedPattern.test(value)) {
    return value.replace(hashedPattern, '.js');
  }

  return value;
}

function resolvePreferredName(value) {
  if (!value) {
    return value;
  }

  if (fallbackMap.has(value)) {
    return value;
  }

  const lower = value.toLowerCase();
  const lowerMatch = fallbackLowercaseMap.get(lower);
  if (lowerMatch) {
    return lowerMatch;
  }

  const lastSlash = value.lastIndexOf('/');
  if (lastSlash !== -1) {
    const base = value.slice(lastSlash + 1);
    if (fallbackMap.has(base)) {
      return base;
    }

    const baseLower = base.toLowerCase();
    const baseMatch = fallbackLowercaseMap.get(baseLower);
    if (baseMatch) {
      return baseMatch;
    }
  }

  return value;
}

function shouldIgnoreAsset(name) {
  if (!name || !name.endsWith('.js')) {
    return true;
  }

  const lower = name.toLowerCase();
  if (lower === '_worker.js' || lower.endsWith('.map.js') || lower.startsWith('api/')) {
    return true;
  }

  const segments = name.split('/');
  return segments.some((segment) => segment.startsWith('_') || segment === '' || segment === '.');
}

function buildFallbackList() {
  return fallbackCatalog
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => ({ ...item }));
}

function getFallbackEntry(name) {
  return fallbackMap.get(name) || null;
}

function normalizeCatalog(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map(normalizeEntry)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function mergeCatalogSources({ fallbackList = [], assetCatalog = [] }) {
  const catalogMap = new Map();

  const upsert = (entry) => {
    const normalized = normalizeEntry(entry);
    if (!normalized) {
      return;
    }

    const existing = catalogMap.get(normalized.name);
    if (existing) {
      catalogMap.set(normalized.name, { ...existing, ...normalized });
    } else {
      catalogMap.set(normalized.name, normalized);
    }
  };

  fallbackList.forEach(upsert);
  if (Array.isArray(assetCatalog)) {
    assetCatalog.forEach(upsert);
  }

  return Array.from(catalogMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeEntry(item) {
  if (!item || typeof item.name !== 'string') {
    return null;
  }

  const name = item.name.trim();
  if (!name || !name.endsWith('.js')) {
    return null;
  }

  return {
    name,
    label:
      typeof item.label === 'string' && item.label.trim()
        ? item.label
        : formatLabelFromName(name),
    href:
      typeof item.href === 'string' && item.href.trim()
        ? item.href
        : `/${name}`,
    description:
      typeof item.description === 'string' && item.description.trim()
        ? item.description
        : defaultDescription,
    version:
      typeof item.version === 'string' && item.version.trim()
        ? item.version
        : defaultVersion
  };
}

function formatLabelFromName(name) {
  const base = name.replace(/\.js$/i, '');
  return base
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}
