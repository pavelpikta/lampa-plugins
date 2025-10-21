import fallbackCatalogSource from '../../plugins/catalog.json' with { type: 'json' };

const DEFAULT_INTERNAL_ORIGIN = 'https://lampa-plugins.internal';
const PLUGIN_MANIFEST_PATHS = ['/plugin-manifest.json', '/plugins/plugin-manifest.json'];
const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
};
const defaultDescription = 'Not provided';
const defaultVersion = '0.0.0';

const fallbackCatalog = normalizeCatalog(fallbackCatalogSource);
export async function generateCatalogResponse(context) {
  const { env } = context || {};
  const buildId = (env && env.CF_PAGES_COMMIT_SHA) || 'local-dev';
  const origin = resolveRequestOrigin(context);
  const cacheKey = new Request(`${origin}/api/plugins/dynamic?build=${buildId}`);
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

  const discovery = await discoverPlugins(context);
  const discovered = Array.isArray(discovery.plugins) ? discovery.plugins : [];
  const merged = mergeCatalogSources({ fallbackList, assetCatalog: discovered });

  if (merged.length) {
    plugins = merged;
  }

  if (discovered.length && discovery.source) {
    dataSource = discovery.source;
  }

  const responseHeaders = {
    ...jsonHeaders,
    'X-Data-Source': dataSource,
    'X-Build-Id': buildId,
  };

  const response = new Response(JSON.stringify(plugins), {
    headers: responseHeaders,
  });

  if (cache && typeof context.waitUntil === 'function') {
    context.waitUntil(cache.put(cacheKey, response.clone()));
  }

  return response;
}

async function discoverPlugins(context) {
  const generated = await loadGeneratedManifest(context);
  if (Array.isArray(generated) && generated.length) {
    return { plugins: generated, source: 'generated-manifest' };
  }

  return { plugins: [], source: null };
}

async function loadGeneratedManifest(context) {
  const { env } = context || {};
  if (!env || !env.ASSETS || typeof env.ASSETS.fetch !== 'function') {
    return null;
  }

  const origin = resolveRequestOrigin(context);

  for (const path of PLUGIN_MANIFEST_PATHS) {
    try {
      const request = new Request(buildAssetUrl(origin, path), {
        headers: { Accept: 'application/json, text/plain;q=0.9' },
      });
      const response = await env.ASSETS.fetch(request);

      if (!response || !response.ok) {
        continue;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        continue;
      }

      const payload = await response.json();
      const plugins = normalizeGeneratedManifest(payload);

      if (plugins.length) {
        return plugins;
      }
    } catch (error) {
      console.warn('Failed to fetch generated plugin manifest', path, error);
    }
  }

  return null;
}

function buildFallbackList() {
  return fallbackCatalog
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => ({ ...item }));
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
      typeof item.label === 'string' && item.label.trim() ? item.label : formatLabelFromName(name),
    href: typeof item.href === 'string' && item.href.trim() ? item.href : `/${name}`,
    description:
      typeof item.description === 'string' && item.description.trim()
        ? item.description
        : defaultDescription,
    version:
      typeof item.version === 'string' && item.version.trim() ? item.version : defaultVersion,
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

function normalizeGeneratedManifest(payload) {
  const items = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray(payload.plugins)
      ? payload.plugins
      : [];

  const results = [];
  const seen = new Set();

  for (const item of items) {
    const candidate = typeof item === 'string' ? { name: item } : item;
    const normalized = normalizeEntry(candidate);
    if (!normalized || seen.has(normalized.name)) {
      continue;
    }

    seen.add(normalized.name);
    results.push(normalized);
  }

  return results;
}

function buildAssetUrl(origin, assetPath) {
  if (!assetPath) {
    return origin;
  }

  try {
    return new URL(assetPath, origin).toString();
  } catch {
    const base = origin.endsWith('/') ? origin.slice(0, -1) : origin;
    const path = assetPath.startsWith('/') ? assetPath : `/${assetPath}`;
    return `${base}${path}`;
  }
}

function resolveRequestOrigin(context) {
  const request = context && context.request;
  if (request && typeof request.url === 'string') {
    try {
      const url = new URL(request.url);
      if (url && url.origin) {
        return url.origin;
      }
    } catch {
      // Ignore malformed URLs and fallback to the default origin
    }
  }

  return DEFAULT_INTERNAL_ORIGIN;
}
