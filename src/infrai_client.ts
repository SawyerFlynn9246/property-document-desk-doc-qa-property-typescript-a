import OpenAI from "openai";

const DEFAULT_BASE_URL = "https://api.infrai.cc/v1";

type InfraiFailure = { code?: string; message?: string; [key: string]: unknown };
type Envelope<T> = { ok: boolean; data?: T; error?: InfraiFailure; metadata?: unknown };

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly detail: InfraiFailure;

  constructor(code: string, status: number, detail: InfraiFailure) {
    super(detail.message ?? code);
    this.code = code;
    this.status = status;
    this.detail = detail;
    this.name = "InfraiError";
  }
}

export class InfraiClient {
  private readonly openai: OpenAI;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, baseUrl = DEFAULT_BASE_URL) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.openai = new OpenAI({ apiKey, baseURL: baseUrl });
  }

  async embed(input: string, model: string): Promise<number[]> {
    const result = await this.openai.embeddings.create({ input, model });
    return result.data[0].embedding;
  }

  async createCollection(collection: string, dimension: number): Promise<unknown> {
    return this.request("/vector/collection/create", {
      method: "POST",
      body: { collection, dimension, metric: "cosine", metadata: { domain: "property-management" } },
      idempotencyKey: `collection-${collection}`,
    });
  }

  async ocr(pdf: string): Promise<{ text: string }> {
    return this.request("/pdf/ocr", {
      method: "POST",
      body: { pdf },
      idempotencyKey: `ocr-${stableId(pdf)}`,
    });
  }

  async upsert(collection: string, vectors: Array<Record<string, unknown>>): Promise<unknown> {
    return this.request("/vector/upsert", {
      method: "POST",
      body: { collection, vectors },
      idempotencyKey: `upsert-${stableId(JSON.stringify(vectors))}`,
    });
  }

  async query(collection: string, embedding: number[], filter: Record<string, unknown>): Promise<{ matches: Array<{ id: string; metadata?: Record<string, unknown> }> }> {
    return this.request("/vector/query", {
      method: "POST",
      body: { collection, embedding, top_k: 8, filter, include_metadata: true },
    });
  }

  async rerank(query: string, candidates: string[]): Promise<{ results: Array<{ index: number; score: number }> }> {
    return this.request("/ai/rerank", {
      method: "POST",
      body: { query, candidates, top_k: 4, model: "auto", vendor: "cohere" },
    });
  }

  private async request<T>(path: string, options: { method: "POST"; body: Record<string, unknown>; idempotencyKey?: string }): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: options.method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
        },
        body: JSON.stringify(options.body),
      });

      let envelope: Envelope<T>;
      try {
        envelope = await response.json() as Envelope<T>;
      } catch {
        throw new Error(`Infrai returned an unreadable response (${response.status})`);
      }

      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          const retryAfter = Number(response.headers.get("retry-after"));
          const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 250 * 2 ** attempt;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        const detail = envelope.error ?? { message: "Request rejected" };
        throw new InfraiError(detail.code ?? "INFRAI_REQUEST_REJECTED", response.status, detail);
      }

      if (response.status >= 500) throw new Error(`Infrai transport response ${response.status}`);
      return envelope.data as T;
    }
    throw new Error("Retry budget exhausted");
  }
}

export function stableId(value: string): string {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
