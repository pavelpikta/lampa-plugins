const STREAM_EXTENSION_REGEX = /\.(m3u8?|ts|m4s|mp4|mkv)(\?|$)/i;
const BYTE_RANGE_EXTENSION_REGEX = /\.(mp4|mkv|ts|m4s)(\?|$)/i;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_ALLOWED_HEADERS = "Accept, Authorization, Cache-Control, Content-Type, DNT, If-Modified-Since, Keep-Alive, Origin, User-Agent, X-Requested-With, Token, x-access-token";
const FORWARDED_REQUEST_HEADERS = new Set(['range', 'accept', 'accept-language', 'accept-encoding', 'origin', 'referer', 'authorization', 'cookie', 'if-modified-since', 'if-none-match']);
const WHITELISTED_RESPONSE_HEADERS = new Set(['content-type', 'content-range', 'content-length', 'accept-ranges', 'etag', 'last-modified', 'cache-control', 'expires']);
const PROXY_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36';

export async function onRequest({ request }) {
  return handleRequest(request);
}

export default {
  async fetch(request) {
    return handleRequest(request);
  }
};

async function handleRequest(request) {
  const corsHeaders = buildCorsHeaders(request.headers);
  try {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (!['GET', 'HEAD'].includes(request.method)) {
      return methodNotAllowedResponse(corsHeaders);
    }

    const rawTarget = extractTargetUrl(request);
    if (!rawTarget) {
      return usageResponse(corsHeaders);
    }

    const targetUrl = normalizeTarget(rawTarget);
    if (!targetUrl) {
      return usageResponse(corsHeaders);
    }

    const proxyOrigin = new URL(request.url).origin;

    if (!STREAM_EXTENSION_REGEX.test(targetUrl)) {
      return redirectResponse(targetUrl, corsHeaders);
    }

    const upstreamResponse = await fetchUpstream(targetUrl, request);

    if (REDIRECT_STATUSES.has(upstreamResponse.status)) {
      const location = upstreamResponse.headers.get('location');
      if (location) {
        const redirectLocation = proxifyUrl(resolveRedirectLocation(location, targetUrl), proxyOrigin);
        return redirectResponse(redirectLocation, corsHeaders, upstreamResponse.status);
      }
    }

    const responseHeaders = mergeResponseHeaders(corsHeaders, upstreamResponse.headers, targetUrl);
    const contentType = (upstreamResponse.headers.get('content-type') || '').toLowerCase();
    const isPlaylist = contentType.includes('application/x-mpegurl') || contentType.includes('application/vnd.apple.mpegurl');
    const shouldRewritePlaylist = isPlaylist && request.method !== 'HEAD';

    const responseBody = shouldRewritePlaylist
      ? rewritePlaylist(await upstreamResponse.text(), proxyOrigin, targetUrl)
      : upstreamResponse.body;

    return new Response(responseBody, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders
    });
  } catch (err) {
    console.error('apn proxy error', err);
    return errorResponse(corsHeaders, err);
  }
}

function buildCorsHeaders(incoming) {
  const allowHeaders = incoming.get('Access-Control-Allow-Headers') || DEFAULT_ALLOWED_HEADERS;
  const origin = incoming.get('Origin') || incoming.get('Referer') || '*';
  const headers = new Headers({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': allowHeaders,
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified',
    'Vary': 'Origin'
  });
  return headers;
}

function extractTargetUrl(request) {
  const requestUrl = new URL(request.url);
  const offset = requestUrl.origin.length + 1; // include trailing slash
  if (requestUrl.href.length < offset) {
    return '';
  }
  const raw = requestUrl.href.slice(offset);
  if (!raw) {
    return '';
  }
  try {
    return decodeURIComponent(raw);
  } catch (err) {
    return raw;
  }
}

function normalizeTarget(candidate) {
  const trimmed = candidate.trim();
  if (!trimmed) {
    return '';
  }
  const fixed = fixUrl(trimmed);
  try {
    return new URL(fixed).toString();
  } catch (err) {
    return '';
  }
}

function fixUrl(url) {
  if (url.includes('://')) {
    return url;
  }
  if (url.includes(':/')) {
    return url.replace(':/', '://');
  }
  return `http://${url}`;
}

async function fetchUpstream(url, request) {
  const headers = buildUpstreamHeaders(request.headers);
  const init = {
    method: request.method,
    redirect: 'manual',
    headers,
    signal: request.signal
  };
  return fetch(url, init);
}

function buildUpstreamHeaders(incoming) {
  const headers = new Headers();
  for (const [key, value] of incoming.entries()) {
    if (FORWARDED_REQUEST_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  }
  headers.set('user-agent', PROXY_USER_AGENT);
  if (!headers.has('accept')) {
    headers.set('accept', '*/*');
  }
  return headers;
}

function mergeResponseHeaders(baseHeaders, upstreamHeaders, targetUrl) {
  const headers = new Headers(baseHeaders);
  for (const [key, value] of upstreamHeaders.entries()) {
    if (WHITELISTED_RESPONSE_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  }
  if (BYTE_RANGE_EXTENSION_REGEX.test(targetUrl) && !headers.has('Accept-Ranges')) {
    headers.set('Accept-Ranges', 'bytes');
  }
  return headers;
}

function rewritePlaylist(body, proxyOrigin, upstreamUrl) {
  const upstreamBase = new URL(upstreamUrl);

  const absolutify = (uri) => {
    if (/^[a-z][\w+.-]*:/.test(uri)) {
      return uri;
    }
    if (uri.startsWith('//')) {
      return `https:${uri}`;
    }
    return new URL(uri, upstreamBase).toString();
  };

  const proxify = (uri) => {
    if (uri.startsWith(proxyOrigin)) {
      return uri;
    }
    return `${proxyOrigin}/${encodeURI(uri)}`;
  };

  let rewritten = body.replace(/(URI=")([^"]+)(")/gi, (match, prefix, uri, suffix) => {
    try {
      const absolute = absolutify(uri);
      return `${prefix}${proxify(absolute)}${suffix}`;
    } catch (err) {
      return match;
    }
  });

  // Touch non-comment playlist lines so downstream chunks stay proxied.
  rewritten = rewritten.replace(/^(?!#)([^\r\n]+)/gm, (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return line;
    }
    try {
      const absolute = absolutify(trimmed);
      const proxied = proxify(absolute);
      return line.replace(trimmed, proxied);
    } catch (err) {
      return line;
    }
  });

  return rewritten;
}

function resolveRedirectLocation(location, upstreamUrl) {
  try {
    return new URL(location, upstreamUrl).toString();
  } catch (err) {
    return location;
  }
}

function proxifyUrl(url, proxyOrigin) {
  if (url.startsWith(proxyOrigin)) {
    return url;
  }
  return `${proxyOrigin}/${encodeURI(url)}`;
}

function redirectResponse(location, baseHeaders, status = 302) {
  const headers = new Headers(baseHeaders);
  headers.set('Location', location);
  return new Response(null, { status, headers });
}

function usageResponse(baseHeaders) {
  const headers = new Headers(baseHeaders);
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify({
    code: 403,
    usage: 'Host/{URL}'
  }), {
    status: 403,
    headers
  });
}

function methodNotAllowedResponse(baseHeaders) {
  const headers = new Headers(baseHeaders);
  headers.set('Allow', 'GET, HEAD, OPTIONS');
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify({
    code: 405,
    message: 'Method Not Allowed'
  }), {
    status: 405,
    headers
  });
}

function errorResponse(baseHeaders, err) {
  const headers = new Headers(baseHeaders);
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify({
    code: -1,
    message: err instanceof Error ? err.message : String(err)
  }), {
    status: 500,
    headers
  });
}
