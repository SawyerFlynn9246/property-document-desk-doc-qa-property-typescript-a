import { InfraiClient } from "../src/infrai_client.js";
import { PropertyKnowledge } from "../src/property_knowledge.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before running the demo");

const knowledge = new PropertyKnowledge(
  new InfraiClient(apiKey, process.env.INFRAI_BASE_URL),
  process.env.PROPERTY_COLLECTION ?? "property-team-documents",
  process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
);

const result = await knowledge.answer("cedar-court", "Which urgent maintenance request is still open?");
console.log(JSON.stringify(result, null, 2));
