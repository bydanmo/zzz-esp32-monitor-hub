import multipart from "@fastify/multipart";
import { createReadStream } from "node:fs";
import type { FastifyInstance } from "fastify";
import { AnimationLibrary, ANIMATION_LIMITS } from "./animation-library.js";

export async function registerAnimationRoutes(app: FastifyInstance, library: AnimationLibrary) {
  await app.register(multipart, { limits: { fileSize: ANIMATION_LIMITS.uploadBytes, files: 1, fields: 0, parts: 1 } });
  app.get("/api/animations", async () => library.snapshot());
  app.get("/api/animations/device", async (_request, reply) => reply.header("Cache-Control", "no-store").send(library.manifest()));
  app.post<{ Querystring: Record<string, unknown> }>("/api/animations", async (request, reply) => {
    if (request.headers.origin && request.headers.origin !== `${request.protocol}://${request.headers.host}`) return reply.code(403).send({ error: "请从本机 Hub 网页上传" });
    try {
      const file = await request.file();
      if (!file) return reply.code(400).send({ error: "请选择动画文件" });
      const item = await library.upload(file.file, file.filename, request.query);
      return reply.code(202).send({ item });
    } catch (error) {
      const code = (error as { statusCode?: number }).statusCode === 413 ? 413 : 400;
      return reply.code(code).send({ error: error instanceof Error ? error.message : "上传失败" });
    }
  });
  app.delete<{ Params: { id: string } }>("/api/animations/:id", async (request, reply) => {
    if (request.headers.origin && request.headers.origin !== `${request.protocol}://${request.headers.host}`) return reply.code(403).send({ error: "请使用本机 Hub 网页" });
    try { await library.remove(request.params.id); return library.snapshot(); }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "删除失败" }); }
  });
  app.put<{ Body: { ids?: unknown; revision?: unknown } }>("/api/animations/order", async (request, reply) => {
    if (request.headers.origin && request.headers.origin !== `${request.protocol}://${request.headers.host}`) return reply.code(403).send({ error: "请使用本机 Hub 网页" });
    try { await library.reorder(request.body?.ids, request.body?.revision); return library.snapshot(); }
    catch (error) { return reply.code(409).send({ error: error instanceof Error ? error.message : "排序失败" }); }
  });
  app.get<{ Params: { id: string; kind: string } }>("/api/animations/assets/:id/:kind", async (request, reply) => {
    try {
      const file = await library.asset(request.params.id, request.params.kind);
      reply.type(file.type).header("Accept-Ranges", "bytes").header("Cache-Control", "no-cache");
      const range = request.headers.range;
      if (range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(range);
        const start = Number(match?.[1]), end = match?.[2] ? Number(match[2]) : file.bytes - 1;
        if (!match || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || end >= file.bytes) return reply.code(416).header("Content-Range", `bytes */${file.bytes}`).send();
        return reply.code(206).header("Content-Length", end - start + 1).header("Content-Range", `bytes ${start}-${end}/${file.bytes}`).send(createReadStream(file.path, { start, end }));
      }
      return reply.header("Content-Length", file.bytes).send(createReadStream(file.path));
    } catch { return reply.code(404).send({ error: "资源暂不可用" }); }
  });
}
