import { readFile, writeFile } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";
const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error("Usage: node scripts/render-svg.mjs source.svg destination.png");
const renderer = new Resvg(await readFile(source, "utf8"));
await writeFile(destination, renderer.render().asPng());
