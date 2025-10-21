# lampa-plugins

Static hosting for Lampa plugin bundles served from Cloudflare Pages.

## Serve locally

```bash
wrangler pages dev
```

## Deploy

```bash
wrangler pages deploy
```

## Update the plugin manifest

Before running a local dev session or deploying, generate the `plugin-manifest.json` file so the dynamic catalog can enumerate the latest assets:

```bash
npm run build
```

The generated file lives at `plugins/plugin-manifest.json` and is excluded from version control. Cloudflare Pages automatically runs the same build step when `npm run build` is configured as the project build command.
