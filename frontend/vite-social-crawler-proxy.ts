import http from 'node:http';
import type { Plugin } from 'vite';

const SOCIAL_CRAWLER_RE =
  /facebookexternalhit|WhatsApp|Twitterbot|LinkedInBot|Slackbot|TelegramBot|Discordbot|Pinterest|Embedly|preview/i;

const PUBLIC_JOB_PATH_RE = /^\/jobs\/[^/]+\/public\/(?:board|[^/?]+)/;

/** Dev-only: proxy social crawler requests on public job URLs to the API OG handler. */
export function socialCrawlerPreviewProxy(apiPort = 4000): Plugin {
  return {
    name: 'social-crawler-preview-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathOnly = (req.url || '').split('?')[0] || '';
        if (!PUBLIC_JOB_PATH_RE.test(pathOnly)) return next();
        const ua = String(req.headers['user-agent'] || '');
        if (!SOCIAL_CRAWLER_RE.test(ua)) return next();

        const proxyReq = http.request(
          {
            hostname: '127.0.0.1',
            port: apiPort,
            path: req.url,
            method: req.method,
            headers: req.headers,
          },
          (proxyRes) => {
            res.statusCode = proxyRes.statusCode || 502;
            for (const [key, value] of Object.entries(proxyRes.headers)) {
              if (value != null) res.setHeader(key, value);
            }
            proxyRes.pipe(res);
          },
        );
        proxyReq.on('error', next);
        req.pipe(proxyReq);
      });
    },
  };
}
