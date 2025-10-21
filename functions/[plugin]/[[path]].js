const INTERNAL_ORIGIN = 'https://lampa-plugins.internal';
const DEFAULT_CACHE_HEADER = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';
const ALLOWED_METHODS = new Set(['GET', 'HEAD']);
const RESERVED_SEGMENTS = new Set(['api', 'cdn-cgi', '_headers', '_redirects', '_routes.json']);

export async function onRequest(context) {
  const { request, params, env } = context || {};

  if (!request || !ALLOWED_METHODS.has(request.method)) {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  const pluginSegment = typeof params?.plugin === 'string' ? params.plugin.trim() : '';
  if (!pluginSegment || isReservedSegment(pluginSegment)) {
    return fetchFromAssets(env, request);
  }

  const assetPath = normalizeAssetPath(params);
  if (!assetPath) {
    return fetchFromAssets(env, request);
  }

  if (!env || !env.ASSETS || typeof env.ASSETS.fetch !== 'function') {
    return new Response('Asset binding unavailable', { status: 500 });
  }

  try {
    const assetRequest = buildAssetRequest(request, assetPath);
    const assetResponse = await env.ASSETS.fetch(assetRequest);

    if (!assetResponse || assetResponse.status === 404) {
      return new Response('Not found', { status: 404 });
    }

    const headers = new Headers(assetResponse.headers);
    ensureContentType(headers, assetPath);
    ensureCacheControl(headers);

    return new Response(assetResponse.body, {
      status: assetResponse.status,
      headers,
    });
  } catch (error) {
    console.warn('Failed to serve plugin asset', assetPath, error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

async function fetchFromAssets(env, request) {
  if (!env || !env.ASSETS || typeof env.ASSETS.fetch !== 'function') {
    return new Response('Asset binding unavailable', { status: 500 });
  }

  return env.ASSETS.fetch(request);
}

function normalizeAssetPath(params) {
  const segments = [];
  const pluginSegment = safeDecode(typeof params?.plugin === 'string' ? params.plugin : '');
  if (!isValidSegment(pluginSegment)) {
    return null;
  }
  segments.push(pluginSegment);

  const remainder = params?.path;
  if (typeof remainder === 'string') {
    const decoded = safeDecode(remainder);
    if (decoded) {
      if (!isValidSegment(decoded)) {
        return null;
      }
      segments.push(decoded);
    }
  } else if (Array.isArray(remainder)) {
    for (const part of remainder) {
      const decoded = safeDecode(typeof part === 'string' ? part : '');
      if (!decoded) {
        continue;
      }
      if (!isValidSegment(decoded)) {
        return null;
      }
      segments.push(decoded);
    }
  }

  if (!segments.length) {
    return null;
  }

  return segments.join('/');
}

function safeDecode(value) {
  if (!value) return '';

  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    return decodeURIComponent(trimmed);
  } catch (error) {
    console.warn('Failed to decode segment', value, error);
    return '';
  }
}

function isValidSegment(segment) {
  if (!segment) {
    return false;
  }

  if (segment.includes('..') || segment.includes('/') || segment.includes('\\')) {
    return false;
  }

  return true;
}

function buildAssetRequest(request, assetPath) {
  const encodedPath = assetPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const assetUrl = new URL(`/${encodedPath}`, INTERNAL_ORIGIN);
  const forwardHeaders = new Headers();

  for (const [key, value] of request.headers) {
    if (HOP_HEADERS.has(key.toLowerCase())) {
      continue;
    }
    forwardHeaders.append(key, value);
  }

  if (!forwardHeaders.has('accept')) {
    forwardHeaders.set('Accept', 'application/javascript, text/javascript;q=0.9, */*;q=0.1');
  }

  return new Request(assetUrl.toString(), {
    method: request.method,
    headers: forwardHeaders,
  });
}

function ensureContentType(headers, assetPath) {
  const existing = (headers.get('content-type') || '').toLowerCase();
  const inferred = inferMimeType(assetPath);

  if (inferred) {
    headers.set('Content-Type', inferred);
    return;
  }

  if (!existing || existing.includes('octet-stream')) {
    headers.set('Content-Type', 'application/javascript; charset=utf-8');
  }
}

function inferMimeType(assetPath) {
  if (!assetPath) {
    return null;
  }

  const lowered = assetPath.toLowerCase();
  if (lowered.endsWith('.js') || lowered.endsWith('.mjs')) {
    return 'application/javascript; charset=utf-8';
  }
  if (lowered.endsWith('.json')) {
    return 'application/json; charset=utf-8';
  }
  if (lowered.endsWith('.css')) {
    return 'text/css; charset=utf-8';
  }
  if (lowered.endsWith('.html') || lowered.endsWith('.htm')) {
    return 'text/html; charset=utf-8';
  }
  if (lowered.endsWith('.svg')) {
    return 'image/svg+xml';
  }
  if (lowered.endsWith('.png')) {
    return 'image/png';
  }
  if (lowered.endsWith('.jpg') || lowered.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (lowered.endsWith('.webp')) {
    return 'image/webp';
  }
  if (lowered.endsWith('.woff2')) {
    return 'font/woff2';
  }
  if (lowered.endsWith('.woff')) {
    return 'font/woff';
  }
  if (!lowered.includes('.')) {
    return 'application/javascript; charset=utf-8';
  }

  return null;
}

function ensureCacheControl(headers) {
  if (!headers.has('cache-control')) {
    headers.set('Cache-Control', DEFAULT_CACHE_HEADER);
  }
}

function isReservedSegment(segment) {
  const normalized = segment.toLowerCase();
  return RESERVED_SEGMENTS.has(normalized);
}

const HOP_HEADERS = new Set([
  'host',
  'cf-connecting-ip',
  'cf-ipcountry',
  'cf-ray',
  'cf-visitor',
  'x-forwarded-for',
  'x-forwarded-proto',
]);
