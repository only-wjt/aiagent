import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import type { Plugin } from "vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

/**
 * Vite 插件：通用 API 代理中间件
 * 浏览器模式下通过 /api-proxy?target=<url> 转发外部请求，绕过 CORS
 */
function apiProxyPlugin(): Plugin {
  return {
    name: 'api-proxy',
    configureServer(server) {
      server.middlewares.use('/api-proxy', async (req, res) => {
        const url = new URL(req.url || '/', 'http://localhost');
        const target = url.searchParams.get('target');

        if (!target) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: '缺少 target 参数' }));
          return;
        }

        try {
          // 从原始请求中提取 headers，过滤掉 hop-by-hop 头
          const forwardHeaders: Record<string, string> = {};
          const skipHeaders = new Set(['host', 'connection', 'origin', 'referer']);
          for (const [key, val] of Object.entries(req.headers)) {
            if (!skipHeaders.has(key.toLowerCase()) && val) {
              forwardHeaders[key] = Array.isArray(val) ? val.join(', ') : val;
            }
          }

          // 读取请求体
          const bodyChunks: Buffer[] = [];
          for await (const chunk of req) {
            bodyChunks.push(chunk as Buffer);
          }
          const body = bodyChunks.length > 0 ? Buffer.concat(bodyChunks) : undefined;

          // 用 Node.js 原生 fetch 转发
          const proxyResp = await fetch(target, {
            method: req.method || 'GET',
            headers: forwardHeaders,
            body: body && req.method !== 'GET' && req.method !== 'HEAD' ? body : undefined,
          });

          // 写回响应
          const respHeaders: Record<string, string> = {};
          proxyResp.headers.forEach((val, key) => {
            respHeaders[key] = val;
          });
          // 确保浏览器能读取
          respHeaders['access-control-allow-origin'] = '*';
          res.writeHead(proxyResp.status, respHeaders);

          if (proxyResp.body) {
            const reader = proxyResp.body.getReader();
            const pump = async () => {
              while (true) {
                const { done, value } = await reader.read();
                if (done) { res.end(); break; }
                res.write(value);
              }
            };
            await pump();
          } else {
            res.end();
          }
        } catch (e: any) {
          console.error('[api-proxy] 代理请求失败:', e.message);
          res.writeHead(502, {
            'Content-Type': 'application/json',
            'access-control-allow-origin': '*',
          });
          res.end(JSON.stringify({ error: e.message }));
        }
      });

      // 处理 CORS 预检请求
      server.middlewares.use('/api-proxy', (req, res, next) => {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'access-control-allow-headers': '*',
            'access-control-max-age': '86400',
          });
          res.end();
          return;
        }
        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [vue(), apiProxyPlugin()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 5174,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
        port: 1422,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));

