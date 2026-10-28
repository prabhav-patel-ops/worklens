import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
await mkdir("dist", { recursive: true });
await cp("public", "dist", { recursive: true });
await cp("shared", "dist/shared", { recursive: true });
// Give every module in a release the same content-derived version. Pages can
// otherwise reuse an old imported module even after index.html is refreshed.
const files = (await readdir("dist", { recursive: true }))
  .filter((f) => /\.(js|css|html)$/.test(f))
  .sort();
const source = await Promise.all(
  files.map((f) => readFile("dist/" + f, "utf8")),
);
const version = createHash("sha256")
  .update(source.join("\n"))
  .digest("hex")
  .slice(0, 12);
for (let i = 0; i < files.length; i++) {
  const result = source[i].replace(
    /(["'])(\.\.?\/[^"'\s]+\.(?:js|css))\1/g,
    (_, quote, path) => `${quote}${path}?v=${version}${quote}`,
  );
  await writeFile("dist/" + files[i], result);
}
await mkdir("docs", { recursive: true });
await cp("dist", "docs", { recursive: true });
await writeFile("docs/.nojekyll", "");
console.log("GitHub Pages build ready in dist/ (" + version + ")");
