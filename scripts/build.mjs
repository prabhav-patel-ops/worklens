import { cp, mkdir } from "node:fs/promises";
await mkdir("dist", { recursive: true });
await cp("public", "dist", { recursive: true });
await cp("shared", "dist/shared", { recursive: true });
await mkdir("docs", { recursive: true });
await cp("dist", "docs", { recursive: true });
await (await import("node:fs/promises")).writeFile("docs/.nojekyll", "");
console.log("GitHub Pages build ready in dist/");
