export interface FetchedPage {
  url: string;
  title: string;
  content: string;
}

export interface WebsiteFetcher {
  fetchPages(url: string): Promise<FetchedPage[]>;
}

const PUBLIC_EMAIL_PROVIDERS = new Set([
  'gmail.com', 'googlemail.com',
  'outlook.com', 'hotmail.com', 'live.com',
  'yahoo.com', 'yahoo.co.jp',
  'qq.com', '163.com', '126.com', '188.com',
  'icloud.com', 'me.com',
  'protonmail.com', 'proton.me',
  'zoho.com', 'yandex.com',
]);

const TARGET_PATHS = ['', 'about', 'about-us', 'company', 'products', 'product', 'services', 'service'];

export function inferWebsiteUrl(email: string): string | null {
  const domain = email.split('@')[1];

  if (!domain || PUBLIC_EMAIL_PROVIDERS.has(domain.toLowerCase())) {
    return null;
  }

  return `https://${domain}`;
}

export class JinaReaderFetcher implements WebsiteFetcher {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async fetchPages(url: string): Promise<FetchedPage[]> {
    const results: FetchedPage[] = [];

    for (const path of TARGET_PATHS) {
      const targetUrl = path.length === 0 ? url : `${url.replace(/\/$/, '')}/${path}`;

      try {
        const response = await fetch(`https://r.jina.ai/${targetUrl}`, {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'X-Return-Format': 'markdown',
          },
          signal: AbortSignal.timeout(15_000),
        });

        if (!response.ok) {
          continue;
        }

        const text = await response.text();

        if (text.length < 100) {
          continue;
        }

        results.push({
          url: targetUrl,
          title: path || 'home',
          content: text,
        });

        if (results.length >= 3) {
          break;
        }
      } catch {
        continue;
      }
    }

    return results;
  }
}
