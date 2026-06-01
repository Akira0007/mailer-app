import {
  ENRICHMENT_STATUS,
  type Contact,
  type EnrichmentEmailDraft,
  type EnrichmentProductMatch,
  type ContactEnrichment,
  type EnrichContactResult,
} from '../../shared/types.js';
import type { ContactsRepository } from '../contacts-repository.js';
import type { ProductsRepository } from '../products-repository.js';
import type { CustomerProfile, LlmClient } from './llm-client.js';
import type { WebsiteFetcher } from './website-fetcher.js';
import { inferWebsiteUrl } from './website-fetcher.js';

export class EnrichmentService {
  private readonly contactsRepo: ContactsRepository;
  private readonly productsRepo: ProductsRepository;
  private readonly websiteFetcher: WebsiteFetcher;
  private readonly llmClient: LlmClient;

  constructor(
    contactsRepo: ContactsRepository,
    productsRepo: ProductsRepository,
    websiteFetcher: WebsiteFetcher,
    llmClient: LlmClient,
  ) {
    this.contactsRepo = contactsRepo;
    this.productsRepo = productsRepo;
    this.websiteFetcher = websiteFetcher;
    this.llmClient = llmClient;
  }

  private async matchProductsAndGenerateDraft(
    profile: CustomerProfile,
  ): Promise<{ matchedProducts: EnrichmentProductMatch[]; emailDraft: EnrichmentEmailDraft | null }> {
    const activeProducts = this.productsRepo.list().filter((product) => product.isActive);
    if (activeProducts.length === 0) {
      return {
        matchedProducts: [],
        emailDraft: null,
      };
    }

    const rawMatches = await this.llmClient.matchProducts(profile, activeProducts);
    if (rawMatches.length === 0) {
      return {
        matchedProducts: [],
        emailDraft: null,
      };
    }

    const activeProductMap = new Map(activeProducts.map((product) => [product.id, product]));
    const matchedProducts = rawMatches
      .map((match) => {
        const product = activeProductMap.get(match.productId);
        if (!product) {
          return null;
        }

        return {
          productId: product.id,
          productName: product.name,
          matchReason: match.matchReason.trim(),
          confidence: Math.min(Math.max(match.confidence, 0), 1),
        } satisfies EnrichmentProductMatch;
      })
      .filter((item): item is EnrichmentProductMatch => item != null)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);

    if (matchedProducts.length === 0) {
      return {
        matchedProducts: [],
        emailDraft: null,
      };
    }

    const draft = await this.llmClient.generateDraft(profile, matchedProducts);
    const emailDraft: EnrichmentEmailDraft = {
      subject: draft.subject.trim(),
      body: draft.body.trim(),
      generatedAt: Date.now(),
    };

    return {
      matchedProducts,
      emailDraft,
    };
  }

  async enrichContact(contact: Contact): Promise<EnrichContactResult> {
    const pending: ContactEnrichment = {
      websiteUrl: null,
      companyName: null,
      industry: null,
      mainProducts: [],
      businessType: null,
      targetMarkets: [],
      possibleNeeds: [],
      disqualifiedReasons: [],
      matchedProducts: [],
      emailDraft: null,
      confidence: 0,
      status: ENRICHMENT_STATUS.IN_PROGRESS,
      errorMessage: null,
      enrichedAt: null,
    };

    this.contactsRepo.updateEnrichment(contact.id, pending);

    let websiteUrl: string | null = null;

    try {
      websiteUrl = inferWebsiteUrl(contact.email);

      if (!websiteUrl) {
        const skipped: ContactEnrichment = {
          websiteUrl: null,
          companyName: null,
          industry: null,
          mainProducts: [],
          businessType: null,
          targetMarkets: [],
          possibleNeeds: [],
          disqualifiedReasons: ['Public email provider — cannot infer website'],
          matchedProducts: [],
          emailDraft: null,
          confidence: 0,
          status: ENRICHMENT_STATUS.FAILED,
          errorMessage: 'Public email domain, cannot infer website URL',
          enrichedAt: Date.now(),
        };
        this.contactsRepo.updateEnrichment(contact.id, skipped);
        return { contactId: contact.id, enrichment: skipped };
      }

      const pages = await this.websiteFetcher.fetchPages(websiteUrl);

      if (pages.length === 0) {
        const noPages: ContactEnrichment = {
          websiteUrl,
          companyName: null,
          industry: null,
          mainProducts: [],
          businessType: null,
          targetMarkets: [],
          possibleNeeds: [],
          disqualifiedReasons: ['Website unreachable or no usable content found'],
          matchedProducts: [],
          emailDraft: null,
          confidence: 0,
          status: ENRICHMENT_STATUS.FAILED,
          errorMessage: 'Could not fetch any pages from website',
          enrichedAt: Date.now(),
        };
        this.contactsRepo.updateEnrichment(contact.id, noPages);
        return { contactId: contact.id, enrichment: noPages };
      }

      const profile = await this.llmClient.analyzeWebsite(pages);
      let matchedProducts: EnrichmentProductMatch[] = [];
      let emailDraft: EnrichmentEmailDraft | null = null;

      if (profile.confidence >= 0.3) {
        try {
          const generated = await this.matchProductsAndGenerateDraft(profile);
          matchedProducts = generated.matchedProducts;
          emailDraft = generated.emailDraft;
        } catch (error) {
          console.error('[enrichment] product matching or draft generation failed:', error);
        }
      }

      const result: ContactEnrichment = {
        websiteUrl,
        companyName: profile.companyName,
        industry: profile.industry,
        mainProducts: profile.mainProducts,
        businessType: profile.businessType,
        targetMarkets: profile.targetMarkets,
        possibleNeeds: profile.possibleNeeds,
        disqualifiedReasons: profile.disqualifiedReasons,
        matchedProducts,
        emailDraft,
        confidence: profile.confidence,
        status: profile.confidence >= 0.3 ? ENRICHMENT_STATUS.DONE : ENRICHMENT_STATUS.FAILED,
        errorMessage: profile.confidence < 0.3
          ? 'Low confidence analysis — likely not a relevant business'
          : null,
        enrichedAt: Date.now(),
      };

      this.contactsRepo.updateEnrichment(contact.id, result);
      return { contactId: contact.id, enrichment: result };
    } catch (error) {
      const failed: ContactEnrichment = {
        websiteUrl,
        companyName: null,
        industry: null,
        mainProducts: [],
        businessType: null,
        targetMarkets: [],
        possibleNeeds: [],
        disqualifiedReasons: [],
        matchedProducts: [],
        emailDraft: null,
        confidence: 0,
        status: ENRICHMENT_STATUS.FAILED,
        errorMessage: error instanceof Error ? error.message : 'Unknown enrichment error',
        enrichedAt: Date.now(),
      };
      this.contactsRepo.updateEnrichment(contact.id, failed);
      return { contactId: contact.id, enrichment: failed };
    }
  }
}
