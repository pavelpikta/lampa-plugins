export async function onRequest(context) {
  const { request, params } = context;

  try {
    const url = new URL(request.url);
    const remainder = typeof params.path === "string"
      ? params.path
      : Array.isArray(params.path)
        ? params.path.join("/")
        : "";
    const normalizedPath = remainder ? `/${remainder}` : "";

    if (request.method === "OPTIONS") {
      return handleOptions(request);
    }

    if (normalizedPath.startsWith("/api/3")) {
      const suffix = normalizedPath.slice("/api/3".length) || "/";
      const targetUrl = buildTargetUrl(
        "https://api.themoviedb.org",
        `/3${suffix}`,
        url.searchParams,
      );
      return await proxyRequest(targetUrl, request);
    }

    if (normalizedPath.startsWith("/img")) {
      const suffix = normalizedPath.slice("/img".length) || "/";
      const targetUrl = buildTargetUrl(
        "https://image.tmdb.org",
        suffix,
        url.searchParams,
      );
      return await proxyRequest(targetUrl, request, true);
    }

    if (!normalizedPath) {
      return new Response("TMDB Proxy Pages Function active", { status: 200 });
    }

    return new Response("Not found", { status: 404 });
  } catch (error) {
    return new Response(`Error: ${error instanceof Error ? error.message : "Unknown"}`, {
      status: 500,
    });
  }
}

function handleOptions(request) {
  const headers = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Max-Age": "86400",
  });

  const requested = request.headers.get("Access-Control-Request-Headers");
  headers.set("Access-Control-Allow-Headers", requested || "*");

  return new Response(null, { status: 204, headers });
}

function buildTargetUrl(origin, path, searchParams) {
  const targetUrl = new URL(path, origin);

  for (const [key, value] of searchParams) {
    if (key.toLowerCase() === "account_email") continue;
    targetUrl.searchParams.append(key, value);
  }

  return targetUrl.toString();
}

async function proxyRequest(target, originalRequest, isImage = false) {
  const forwardedHeaders = new Headers(originalRequest.headers);
  forwardedHeaders.delete("host");
  forwardedHeaders.delete("cf-connecting-ip");
  forwardedHeaders.delete("cf-ipcountry");
  forwardedHeaders.delete("cf-ray");
  forwardedHeaders.delete("cf-visitor");
  forwardedHeaders.delete("x-forwarded-proto");

  const init = {
    method: originalRequest.method,
    headers: forwardedHeaders,
    body: originalRequest.method !== "GET" && originalRequest.method !== "HEAD"
      ? await originalRequest.clone().arrayBuffer()
      : undefined,
  };

  const response = await fetch(target, init);
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS");

  const corsRequestedHeaders = originalRequest.headers.get("Access-Control-Request-Headers");
  if (corsRequestedHeaders) {
    headers.set("Access-Control-Allow-Headers", corsRequestedHeaders);
  }

  if (isImage) {
    headers.set("Cache-Control", "public, max-age=86400");
  }

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}
