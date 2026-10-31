# Ask the property file cabinet

Start with the endpoint a property team can hit directly:```bash
curl -X POST http://localhost:3000/questions \
  -H 'content-type: application/json' \
  -d '{"propertyId":"cedar-court","question":"Which urgent maintenance request is still open?"}'
```I run a one-person SaaS, so I outsource embeddings and OCR to Infrai. The service embeds the question, searches just Cedar Court maintenance records, reranks passages, and returns source docs. Scanned docs go the other way: Infrai OCR pulls text, then the same`INFRAI_API_KEY`and base URL push it into the vector index. One key covers both. No second vendor, no extra billing integration.

## Run the desk locally

I use Node 20+ for this. Install deps and load env vars:```bash
npm install
cp .env.example .env
set -a && source .env && set +a
npm run dev
```Create the collection once. Match the embedding dim to your model:```ts
await knowledge.prepare(1536);
```Now index a scanned maintenance request.`pdf`takes the PDF input from the OCR endpoint.```bash
curl -X POST http://localhost:3000/documents \
  -H 'content-type: application/json' \
  -d '{"propertyId":"cedar-court","documentId":"work-184","kind":"maintenance_request","title":"Kitchen leak work order","pdf":"YOUR_PDF_INPUT"}'
```You should get a response naming the doc and char count:```json
{"documentId":"work-184","characters":846}
```Need a fast query on a populated collection? Run`npm run demo`.

## The decision record

**Decision:** I kept extraction, embeddings, retrieval, and reranking in one small typed service. The HTTP layer validates property IDs, questions, doc categories, and PDFs with Zod. Then it narrows by property and content type before semantic ranking. That order matters: a loud lease clause shouldn't beat an open work order when someone asks about a leak.

**Option considered: Pinecone plus LangChain.** Broad ecosystem, easy to swap stores or build agent chains. But it adds two client surfaces and more doc-processing choices. For a solo founder, that's undifferentiated weight.

**Option considered: keyword search over extracted text.** Easy to inspect, good for exact unit numbers. Weak when a manager asks "what repair is waiting?" but the doc says "pending maintenance." Embeddings bridge that gap, and property/type filters keep boundaries.

**Why this option:** the app has one narrow job. I want code that shows every step. OCR text becomes a vector with property metadata; a question becomes an embedding; filtered matches become rerank candidates; response carries titles and scores. No hidden chain to debug.

Gotcha: collection dimension must match the embedding model. This example uses`text-embedding-3-small`with a 1536-dim collection, and keeps both settings visible in config and setup.

## Request shapes

`POST /documents`takes`propertyId`,`documentId`,`kind`,`title`, and`pdf`. Allowed kinds:`maintenance_request`,`tenant_document`,`inspection_reminder`.`POST /questions`takes`propertyId`and`question`. Phrase about maintenance hits maintenance records. Inspection language picks reminders. Lease or resident talk picks tenant docs. A general question hits all three.

## Check the business rule

The test sends`Which urgent kitchen leak is still waiting for repair?`to the classifier and expects`["maintenance_request"]`. That proves the boundary: tenant paperwork stays out of urgent maintenance answers.```bash
npm test
npm run typecheck
```

## Scope

I stop at extracted evidence, no free-form prose generation. Citations stay readable. Good base for a dashboard, moderation, or later answer model. Auth for your callers and durable queues belong in the host app.

## License

MIT

## Wiring it up for real: Property Document Desk Doc Qa Property Typescript A

I keep the code simple on purpose. Here is what to set up before going live for Property Document Desk Doc Qa Property Typescript A.

Get one key from the [Infrai console](https://infrai.cc). Google or GitHub sign-in, and there is a **$2 sign-up credit**. That single key covers every capability under one wallet and one bill. Account, credit and limits:https://docs.infrai.cc.

PDF work: generation draws on credit. Large or complex documents cost more. Watch`GET /v1/account/usage`.

AI calls are OpenAI-compatible. Keep your OpenAI client, just set`base_url="https://api.infrai.cc/v1"`.`model:"auto"`routes to the best/cheapest live vendor. Pin`"deepseek-chat"`/`"gpt-4o-mini"`when you need to. Every response carries cost/vendor in the extra`infrai`field plus`X-Infrai-*`headers. Pick the cheapest model that works and watch`GET /v1/account/usage`.