import type { FetchedPage } from './website-fetcher.js';

export interface CustomerProfile {
  companyName: string | null;
  industry: string | null;
  mainProducts: string[];
  businessType: 'manufacturer' | 'distributor' | 'importer' | 'retailer' | 'service' | 'unknown';
  targetMarkets: string[];
  possibleNeeds: string[];
  disqualifiedReasons: string[];
  confidence: number;
}

export interface ProductMatch {
  productId: string;
  productName: string;
  matchReason: string;
  confidence: number;
}

export interface EmailDraft {
  subject: string;
  body: string;
}

export interface LlmClient {
  analyzeWebsite(pages: FetchedPage[]): Promise<CustomerProfile>;
  matchProducts(profile: CustomerProfile, products: Array<{ id: string; name: string; category: string; description: string; tags: string[]; sellingPoints: string[]; targetUseCases: string[]; }>): Promise<ProductMatch[]>;
  generateDraft(profile: CustomerProfile, matches: ProductMatch[]): Promise<EmailDraft>;
}

const ANALYZE_SYSTEM_PROMPT = `You are a business analyst. Analyze the website content and extract structured business information.

Output ONLY valid JSON with these fields:
- companyName: string | null
- industry: string | null
- mainProducts: string[]
- businessType: "manufacturer" | "distributor" | "importer" | "retailer" | "service" | "unknown"
- targetMarkets: string[]
- possibleNeeds: string[]
- disqualifiedReasons: string[]
- confidence: number (0-1)

If the content is insufficient or not a real business website, set confidence < 0.3 and explain in disqualifiedReasons.`;

const MATCH_SYSTEM_PROMPT = `You are a product recommendation specialist. Given a customer profile and a list of products, recommend the top 3 most relevant products.

For each recommendation output:
- productId: string
- productName: string
- matchReason: string
- confidence: number (0-1)

Output valid JSON array. If no products match well, return empty array.`;

const DRAFT_SYSTEM_PROMPT = `You are a professional email copywriter for B2B outreach. Write a concise, personalized sales email.

Rules:
- Be professional and concise
- Reference the customer's business
- Explain why the recommended product is relevant
- Include a clear call to action
- Do not use markdown in the body (plain text only)

Output valid JSON with:
- subject: string
- body: string`;

export class ClaudeLlmClient implements LlmClient {
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly model: string;

  constructor(apiKey: string, apiUrl = 'https://api.anthropic.com/v1', model = 'claude-sonnet-4-20250514') {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl;
    this.model = model;
  }

  async analyzeWebsite(pages: FetchedPage[]): Promise<CustomerProfile> {
    const content = pages.map((page) => `--- ${page.title} ---\n${page.content.slice(0, 8000)}`).join('\n\n');
    return this.callClaude(ANALYZE_SYSTEM_PROMPT, content);
  }

  async matchProducts(
    profile: CustomerProfile,
    products: Array<{ id: string; name: string; category: string; description: string; tags: string[]; sellingPoints: string[]; targetUseCases: string[]; }>,
  ): Promise<ProductMatch[]> {
    const input = JSON.stringify({ profile, products }, null, 2);
    return this.callClaude(MATCH_SYSTEM_PROMPT, input);
  }

  async generateDraft(profile: CustomerProfile, matches: ProductMatch[]): Promise<EmailDraft> {
    const input = JSON.stringify({ profile, matches }, null, 2);
    return this.callClaude(DRAFT_SYSTEM_PROMPT, input);
  }

  private async callClaude<T>(systemPrompt: string, content: string): Promise<T> {
    const response = await fetch(`${this.apiUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error: ${response.status} ${errorText}`);
    }

    const data = await response.json() as { content?: Array<{ text?: string }> };
    const text = data.content?.[0]?.text ?? '';

    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    const arrayStart = text.indexOf('[');
    const arrayEnd = text.lastIndexOf(']');

    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    }

    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      return JSON.parse(text.slice(arrayStart, arrayEnd + 1));
    }

    throw new Error(`Could not parse JSON from Claude response: ${text.slice(0, 200)}`);
  }
}
