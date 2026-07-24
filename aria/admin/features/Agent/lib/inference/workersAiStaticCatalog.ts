import type { CatalogModel } from "../schemas";

export const WORKERS_AI_STATIC_CATALOG: readonly CatalogModel[] = [
  { id: "@cf/meta/llama-3.2-3b-instruct", name: "Llama 3.2 3B Instruct" },
  { id: "@cf/meta/llama-3.2-1b-instruct", name: "Llama 3.2 1B Instruct" },
  {
    id: "@cf/mistral/mistral-small-3.1-24b-instruct",
    name: "Mistral Small 3.1 24B",
  },
  { id: "@cf/qwen/qwq-32b", name: "QwQ 32B" },
];
