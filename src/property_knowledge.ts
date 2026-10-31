import { InfraiClient, stableId } from "./infrai_client.js";

export type DocumentKind = "maintenance_request" | "tenant_document" | "inspection_reminder";

export type PropertyDocument = {
  propertyId: string;
  documentId: string;
  kind: DocumentKind;
  title: string;
  pdf: string;
};

export type SearchMatch = {
  id: string;
  text: string;
  title: string;
  kind: DocumentKind;
  score: number;
};

export function kindsForQuestion(question: string): DocumentKind[] {
  const normalized = question.toLowerCase();
  if (/leak|broken|repair|urgent|maintenance/.test(normalized)) return ["maintenance_request"];
  if (/inspect|inspection|due|reminder/.test(normalized)) return ["inspection_reminder"];
  if (/lease|tenant|resident|deposit/.test(normalized)) return ["tenant_document"];
  return ["maintenance_request", "inspection_reminder", "tenant_document"];
}

export class PropertyKnowledge {
  private readonly infrai: InfraiClient;
  private readonly collection: string;
  private readonly embeddingModel: string;

  constructor(infrai: InfraiClient, collection: string, embeddingModel: string) {
    this.infrai = infrai;
    this.collection = collection;
    this.embeddingModel = embeddingModel;
  }

  async prepare(dimension: number): Promise<void> {
    await this.infrai.createCollection(this.collection, dimension);
  }

  async indexScannedDocument(document: PropertyDocument): Promise<{ documentId: string; characters: number }> {
    const parsed = await this.infrai.ocr(document.pdf);
    const embedding = await this.infrai.embed(parsed.text, this.embeddingModel);
    await this.infrai.upsert(this.collection, [{
      id: stableId(`${document.propertyId}:${document.documentId}`),
      values: embedding,
      metadata: {
        property_id: document.propertyId,
        document_id: document.documentId,
        kind: document.kind,
        title: document.title,
        text: parsed.text,
      },
    }]);
    return { documentId: document.documentId, characters: parsed.text.length };
  }

  async answer(propertyId: string, question: string): Promise<{ answer: string; sources: SearchMatch[] }> {
    const kinds = kindsForQuestion(question);
    const embedding = await this.infrai.embed(question, this.embeddingModel);
    const found = await this.infrai.query(this.collection, embedding, {
      property_id: propertyId,
      kind: { $in: kinds },
    });
    const candidates = found.matches
      .map((match) => ({
        id: match.id,
        text: String(match.metadata?.text ?? ""),
        title: String(match.metadata?.title ?? "Untitled document"),
        kind: String(match.metadata?.kind ?? "tenant_document") as DocumentKind,
      }))
      .filter((match) => match.text.length > 0);

    if (candidates.length === 0) {
      return { answer: "No matching property documents were found.", sources: [] };
    }

    const ranked = await this.infrai.rerank(question, candidates.map((candidate) => candidate.text));
    const sources = ranked.results.map(({ index, score }) => ({ ...candidates[index], score }));
    const evidence = sources.map((source) => `${source.title}: ${source.text}`).join("\n\n");
    return {
      answer: `The property record says:\n${evidence}`,
      sources,
    };
  }
}
