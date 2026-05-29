import type { ModelMeta } from "../types.js";

export type ModelSource = "ollama" | "local" | "huggingface";

export interface CatalogEntry {
  id: string;
  source: ModelSource;
  /** Ready for plan() / recommend(). */
  model: ModelMeta;
  /** On-disk size of the resident build (Ollama/local). */
  installedBytes?: number;
  note?: string;
}
