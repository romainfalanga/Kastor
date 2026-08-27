// Client OpenRouter minimal pour modèles multimodaux (chat completions + images).

export interface Env {
  OPENROUTER_API_KEY: string;
  OPENROUTER_MODEL?: string;
  ASSETS: Fetcher;
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_MODEL = "google/gemini-2.5-pro";

interface ContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

export class OpenRouterError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/**
 * Appelle un modèle multimodal via OpenRouter et retourne le texte de la réponse.
 * `imageDataUrls` : data URLs (PNG/JPEG) des pages de plan à joindre.
 */
export async function callVisionModel(
  env: Env,
  model: string | undefined,
  systemPrompt: string,
  userText: string,
  imageDataUrls: string[],
): Promise<string> {
  if (!env.OPENROUTER_API_KEY) {
    throw new OpenRouterError(
      "Clé OpenRouter absente : définir le secret OPENROUTER_API_KEY (wrangler secret put OPENROUTER_API_KEY).",
      500,
    );
  }

  const content: ContentPart[] = [{ type: "text", text: userText }];
  for (const url of imageDataUrls) {
    content.push({ type: "image_url", image_url: { url } });
  }

  const body = {
    model: model || env.OPENROUTER_MODEL || DEFAULT_MODEL,
    temperature: 0.1,
    max_tokens: 24000,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content },
    ],
  };

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://kastor.app",
      "X-Title": "Kastor",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new OpenRouterError(
      `OpenRouter a répondu ${res.status} : ${text.slice(0, 500)}`,
      res.status === 401 || res.status === 402 ? res.status : 502,
    );
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (data.error?.message) {
    throw new OpenRouterError(`OpenRouter : ${data.error.message}`, 502);
  }
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new OpenRouterError("Réponse OpenRouter vide (pas de contenu).", 502);
  }
  return text;
}

/**
 * Extrait le premier objet JSON d'une réponse de modèle (gère les fences ```json,
 * le texte parasite avant/après, etc.).
 */
export function extractJson<T>(raw: string): T {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();

  const start = text.indexOf("{");
  if (start === -1) {
    throw new Error(`Aucun JSON trouvé dans la réponse du modèle : ${raw.slice(0, 200)}`);
  }
  // Balaye jusqu'à l'accolade fermante équilibrée (en ignorant les chaînes).
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return JSON.parse(text.slice(start, i + 1)) as T;
      }
    }
  }
  throw new Error("JSON tronqué dans la réponse du modèle (accolades non équilibrées).");
}
