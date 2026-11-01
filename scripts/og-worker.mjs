// Draws share-card PNGs off the server's main thread (lib/cards/render-server.ts
// starts it). Rendering takes seconds on a small server; done on the main
// thread it would hold up every other request meanwhile.
//
// Messages in: { id, tree, width, height } where tree is plain satori markup
// ({ type, props }). Out: { id, png } (transferred) or { id, error }.
import { readFileSync } from "node:fs";
import path from "node:path";
import { parentPort, workerData } from "node:worker_threads";
import { ImageResponse } from "next/dist/compiled/@vercel/og/index.node.js";

const fonts = [
  ["Geist-Regular.ttf", 400],
  ["Geist-SemiBold.ttf", 600],
  ["Geist-Bold.ttf", 700],
].map(([file, weight]) => ({
  name: "Geist",
  data: readFileSync(path.join(workerData.fontDir, file)),
  weight,
  style: "normal",
}));

parentPort.on("message", async ({ id, tree, width, height }) => {
  try {
    const png = await new ImageResponse(tree, { width, height, fonts }).arrayBuffer();
    parentPort.postMessage({ id, png }, [png]);
  } catch (e) {
    parentPort.postMessage({ id, error: e instanceof Error ? e.stack || e.message : String(e) });
  }
});
