import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "cloud-admin", "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(join(root, "admin", "public"), dist, { recursive: true });
await cp(join(root, "cloud-admin", "worker.js"), join(dist, "_worker.js"));

console.log(`Built cloud admin into ${dist}`);
