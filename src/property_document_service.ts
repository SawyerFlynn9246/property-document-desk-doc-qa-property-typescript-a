import { createServer } from "node:http";
import { z } from "zod";
import { InfraiClient, InfraiError } from "./infrai_client.js";
import { PropertyKnowledge } from "./property_knowledge.js";

const ingestBody = z.object({
  propertyId: z.string().min(1),
  documentId: z.string().min(1),
  kind: z.enum(["maintenance_request", "tenant_document", "inspection_reminder"]),
  title: z.string().min(1),
  pdf: z.string().min(1),
}).strict();

const questionBody = z.object({
  propertyId: z.string().min(1),
  question: z.string().min(3).max(500),
}).strict();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const infrai = new InfraiClient(required("INFRAI_API_KEY"), process.env.INFRAI_BASE_URL);
const knowledge = new PropertyKnowledge(
  infrai,
  process.env.PROPERTY_COLLECTION ?? "property-team-documents",
  process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
);

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/documents") {
      const document = ingestBody.parse(await readJson(request));
      const result = await knowledge.indexScannedDocument(document);
      return send(response, 201, result);
    }
    if (request.method === "POST" && request.url === "/questions") {
      const input = questionBody.parse(await readJson(request));
      return send(response, 200, await knowledge.answer(input.propertyId, input.question));
    }
    return send(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof z.ZodError) return send(response, 400, { error: "Invalid request", issues: error.issues });
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return send(response, status, { error: error.code, message: error.message });
    }
    return send(response, 500, { error: "Service error" });
  }
});

function send(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

server.listen(Number(process.env.PORT ?? 3000), () => {
  console.log("Property document desk listening on http://localhost:3000");
});
