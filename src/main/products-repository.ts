import { randomUUID } from 'node:crypto';

import { PRODUCT_LIMITS } from '../shared/constants.js';
import type { Product, ProductImportRow } from '../shared/types.js';

export interface ProductsRepository {
  list(): Product[];
  importCsv(rows: ProductImportRow[]): number;
}

export class InMemoryProductsRepository implements ProductsRepository {
  private readonly store: Map<string, Product> = new Map();

  list(): Product[] {
    return [...this.store.values()];
  }

  importCsv(rows: ProductImportRow[]): number {
    const now = Date.now();
    let inserted = 0;

    for (const row of rows) {
      if (this.store.size >= PRODUCT_LIMITS.maxPerFreePlan) {
        break;
      }

      const product: Product = {
        id: randomUUID(),
        name: row.name.trim(),
        category: row.category.trim(),
        description: row.description.trim(),
        tags: row.tags.split(',').map((item) => item.trim()).filter(Boolean),
        sellingPoints: row.sellingPoints.split('|').map((item) => item.trim()).filter(Boolean),
        targetUseCases: row.targetUseCases.split('|').map((item) => item.trim()).filter(Boolean),
        url: row.url.trim() || null,
        isActive: Boolean(row.isActive),
        createdAt: now,
        updatedAt: now,
      };

      this.store.set(product.id, product);
      inserted++;
    }

    return inserted;
  }
}
