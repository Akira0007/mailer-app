import {
  ENRICHMENT_STATUS,
  type Contact,
  type ContactEnrichment,
  type EnrichContactResult,
} from '../../shared/types.js';
import type { ContactsRepository } from '../contacts-repository.js';
import type { LlmClient } from './llm-client.js';
import type { WebsiteFetcher } from './website-fetcher.js';
import { inferWebsiteUrl } from './website-fetcher.js';

export class EnrichmentService {
  private readonly contactsRepo: ContactsRepository;
  private readonly websiteFetcher: WebsiteFetcher;
  private readonly llmClient: LlmClient;

  constructor(
    contactsRepo: ContactsRepository,
    websiteFetcher: WebsiteFetcher,
    llmClient: LlmClient,
  ) {
    this.contactsRepo = contactsRepo;
    this.websiteFetcher = websiteFetcher;
    this.llmClient = llmClient;
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
          confidence: 0,
          status: ENRICHMENT_STATUS.FAILED,
          errorMessage: 'Could not fetch any pages from website',
          enrichedAt: Date.now(),
        };
        this.contactsRepo.updateEnrichment(contact.id, noPages);
        return { contactId: contact.id, enrichment: noPages };
      }

      const profile = await this.llmClient.analyzeWebsite(pages);

      const result: ContactEnrichment = {
        websiteUrl,
        companyName: profile.companyName,
        industry: profile.industry,
        mainProducts: profile.mainProducts,
        businessType: profile.businessType,
        targetMarkets: profile.targetMarkets,
        possibleNeeds: profile.possibleNeeds,
        disqualifiedReasons: profile.disqualifiedReasons,
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
