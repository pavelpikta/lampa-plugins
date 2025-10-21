import fallbackCatalogSource from '../../plugins/catalog.json' assert { type: 'json' };

const INTERNAL_ORIGIN = 'https://lampa-plugins.internal';
const CATALOG_ASSET = '/catalog.json';
const defaultDescription = 'Not provided';
const defaultVersion = '1.0.0';

const fallbackCatalog = normalizeCatalog(fallbackCatalogSource);
const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 's-maxage=600, stale-while-revalidate=86400'
};

export async function generateCatalogResponse(context) {
  const { env } = context;
  const buildId = (env && env.CF_PAGES_COMMIT_SHA) || 'local-dev';
  const cacheKey = new Request(`https://lampa-plugins.internal/api/plugins?build=${buildId}`);
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  const fallbackList = buildFallbackList();
  let plugins = fallbackList;
  let dataSource = 'fallback';

  const assetCatalog = await loadCatalogFromAssets(env);
  const merged = mergeCatalogSources({ fallbackList, assetCatalog });

  if (merged.length) {
    plugins = merged;
  }

  if (assetCatalog && assetCatalog.length) {
    dataSource = 'asset-catalog';
  }

  const response = new Response(JSON.stringify(plugins), {
    headers: { ...jsonHeaders, 'X-Data-Source': dataSource, 'X-Build-Id': buildId }
  });

  if (typeof context.waitUntil === 'function') {
    context.waitUntil(cache.put(cacheKey, response.clone()));
  }

  return response;
}

function buildFallbackList() {
  return fallbackCatalog
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => ({ ...item }));
}

function formatLabel(name) {
  const fallback = getFallbackEntry(name);
  if (fallback && fallback.label) {
    return fallback.label;
  }

  return formatLabelFromName(name);
}

function getFallbackEntry(name) {
  return fallbackCatalog.find((item) => item.name === name);
}

async function loadCatalogFromAssets(env) {
  if (!env || !env.ASSETS) {
    return null;
  }

  try {
    const request = new Request(`${INTERNAL_ORIGIN}${CATALOG_ASSET}`, {
      headers: { Accept: 'application/json' }
    });
    const response = await env.ASSETS.fetch(request);

    if (!response || !response.ok) {
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      console.warn('Catalog asset returned unexpected content type', contentType);
      return null;
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      return null;
    }

    return payload
      .filter((item) => item && typeof item.name === 'string' && item.name.endsWith('.js'))
      .map((item) => {
        const fallback = getFallbackEntry(item.name);

        return {
          name: item.name,
          label: item.label || (fallback && fallback.label) || formatLabel(item.name),
          href: item.href || (fallback && fallback.href) || `/${item.name}`,
          description: item.description || (fallback && fallback.description) || defaultDescription,
          version: typeof item.version === 'string' ? item.version : (fallback && fallback.version) || defaultVersion
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.warn('Failed to load plugin catalog asset', error);
    return null;
  }
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
    label: typeof item.label === 'string' && item.label.trim() ? item.label : formatLabelFromName(name),
    href: typeof item.href === 'string' && item.href.trim() ? item.href : `/${name}`,
    description:
      typeof item.description === 'string' && item.description.trim()
        ? item.description
        : defaultDescription,
    version:
      typeof item.version === 'string' && item.version.trim() ? item.version : defaultVersion
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
