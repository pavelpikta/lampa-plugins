const GITHUB_CONTENT_API = 'https://api.github.com/repos/pavelpikta/lampa-plugins/contents/plugins';
const INTERNAL_ORIGIN = 'https://lampa-plugins.internal';
const CATALOG_ASSET = '/catalog.json';

const pluginDescriptions = {
  'cubrip.js': 'Cubrip integration helpers',
  'devsecops.js': 'DevSecOps tooling presets',
  'interface_mod.js': 'Interface tweaks and customization pack',
  'notrailers.js': 'Content filtering utilities',
  'parsers.js': 'Parser extensions for feeds',
  'themes.js': 'Visual themes collection',
  'tmdb.js': 'The Movie Database (TMDB) proxy support',
};

const pluginLabels = {
  cubrip: 'Cubrip',
  devsecops: 'DevSecOps',
  interface_mod: 'Interface Mod',
  notrailers: 'No Trailers',
  parsers: 'Parsers Suite',
  themes: 'Themes Pack',
  tmdb: 'TMDB Proxy',
};

const defaultDescription = 'Cloudflare Pages hosted plugin bundle';
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

  let plugins = buildFallbackList();
  let dataSource = 'fallback';

  const assetCatalog = await loadCatalogFromAssets(env);
  if (assetCatalog && assetCatalog.length) {
    plugins = assetCatalog;
    dataSource = 'asset';
  } else {
    const token = env && env.GITHUB_TOKEN;

    if (token) {
      try {
        const headers = {
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'lampa-plugins-worker',
          Authorization: `Bearer ${token}`
        };

        const response = await fetch(GITHUB_CONTENT_API, { headers });

        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) {
            throw new Error('GitHub API returned non-JSON payload');
          }

          const payload = await response.json();
          plugins = payload
            .filter((item) => item.type === 'file' && item.name.endsWith('.js'))
            .map((item) => ({
              name: item.name,
              label: formatLabel(item.name),
              href: `/${item.name}`,
              description: pluginDescriptions[item.name] || defaultDescription,
              size: item.size || null
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
          dataSource = 'github';
        }
      } catch (error) {
        console.warn('Failed to load plugin catalog from GitHub', error);
      }
    }
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
  return Object.keys(pluginDescriptions)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name,
      label: formatLabel(name),
      href: `/${name}`,
      description: pluginDescriptions[name],
    }));
}

function formatLabel(name) {
  const base = name.replace(/\.js$/i, '');
  const baseKey = base.toLowerCase();
  const compactKey = base.replace(/[\s_]/g, '').toLowerCase();

  if (pluginLabels[baseKey]) {
    return pluginLabels[baseKey];
  }

  if (pluginLabels[compactKey]) {
    return pluginLabels[compactKey];
  }

  return base
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
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
      .map((item) => ({
        name: item.name,
        label: item.label || formatLabel(item.name),
        href: item.href || `/${item.name}`,
        description: item.description || pluginDescriptions[item.name] || defaultDescription,
        size: typeof item.size === 'number' ? item.size : null
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.warn('Failed to load plugin catalog asset', error);
    return null;
  }
}
