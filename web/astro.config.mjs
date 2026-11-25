import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "astro/config";

function binRange() {
  return {
    name: "bin-range",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        const range = req.headers.range;
        if (!url.endsWith(".bin") || !range) {
          next();
          return;
        }
        const file = path.join(server.config.publicDir, url.replace(/^\//, ""));
        let st;
        try {
          st = fs.statSync(file);
        } catch {
          next();
          return;
        }
        const m = /^bytes=(\d+)-(\d+)$/.exec(range);
        if (!m) {
          next();
          return;
        }
        const start = Number(m[1]);
        const end = Math.min(Number(m[2]), st.size - 1);
        if (start > end || start >= st.size) {
          res.statusCode = 416;
          res.end();
          return;
        }
        res.statusCode = 206;
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Vary", "Range");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Range", `bytes ${start}-${end}/${st.size}`);
        res.setHeader("Content-Length", String(end - start + 1));
        fs.createReadStream(file, { start, end }).pipe(res);
      });
    },
  };
}

export default defineConfig({
  srcDir: "./src",
  publicDir: "./public",
  vite: {
    plugins: [binRange()],
  },
});
