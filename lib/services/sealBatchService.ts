/**
 * Seal Batch Generation Service
 * 
 * Orchestrates batch generation of seals with sheet layout.
 */

import { createHash } from 'crypto';
import { generateSealSvg } from './sealGeneratorService';
import { composeSealSheet, calculateSealLayout, type SealSheetConfig } from './sealSheetService';
import { SEAL_VERSION, MAX_TOKENS_PER_BATCH, MAX_PAGES_PER_REQUEST, SHEET_LAYOUT_VERSION } from '@/lib/constants/seal';

export interface SealBatchParams {
  tokens: string[];
  sheetConfig: SealSheetConfig;
  userId: string;
}

export interface SealBatchResult {
  sealSvgs: string[];      // Individual seal SVGs (cached/returned)
  sheetSvgs: string[];     // Composed sheet SVGs
  pageCount: number;
  sealsPerSheet: number;
  layout: {
    columns: number;
    rows: number;
  };
  metadata: {
    sealVersion: string;
    sheetLayoutVersion: string;
    tokenCount: number;
    tokensHash: string;  // Deterministic hash of token list for idempotency
  };
}

/**
 * Generate batch of seals
 * 
 * Each token gets a unique seal SVG (deterministic).
 * Seals are composed onto sheets according to layout config.
 * 
 * Enforces batch size limits to prevent memory issues.
 */
export async function generateSealBatch(params: SealBatchParams): Promise<SealBatchResult> {
  const { tokens, sheetConfig, userId } = params;
  
  if (tokens.length === 0) {
    throw new Error('At least one token required for seal generation');
  }
  
  // Enforce batch size limits
  if (tokens.length > MAX_TOKENS_PER_BATCH) {
    throw new Error(
      `Batch size exceeds maximum of ${MAX_TOKENS_PER_BATCH} tokens. ` +
      `Received ${tokens.length} tokens.`
    );
  }
  
  // 1. Calculate layout
  const layout = calculateSealLayout(sheetConfig);
  const sealsPerSheet = layout.perSheet;
  
  // Estimate page count and enforce limit
  const estimatedPages = Math.ceil(tokens.length / sealsPerSheet);
  if (estimatedPages > MAX_PAGES_PER_REQUEST) {
    throw new Error(
      `Estimated page count (${estimatedPages}) exceeds maximum of ${MAX_PAGES_PER_REQUEST} pages. ` +
      `Reduce batch size or seals per sheet.`
    );
  }
  
  // 2. Sort tokens deterministically for idempotent output
  // Same token list should always produce same ordering
  const sortedTokens = [...tokens].sort();
  
  // 3. Generate seal SVGs (one per token, deterministic order)
  const sealSvgs = await Promise.all(
    sortedTokens.map(token => generateSealSvg(token, SEAL_VERSION))
  );
  
  // 4. Compose sheets
  const sheetSvgs = composeSealSheet(sealSvgs, sheetConfig);
  const pageCount = sheetSvgs.length;
  
  // Final page count validation
  if (pageCount > MAX_PAGES_PER_REQUEST) {
    throw new Error(
      `Page count (${pageCount}) exceeds maximum of ${MAX_PAGES_PER_REQUEST} pages.`
    );
  }
  
  // Compute deterministic hash of token list for idempotency tracking
  const tokensHash = createHash('sha256')
    .update(sortedTokens.join('|'))
    .digest('hex');
  
  return {
    sealSvgs,
    sheetSvgs,
    pageCount,
    sealsPerSheet,
    layout: {
      columns: layout.columns,
      rows: layout.rows,
    },
    metadata: {
      sealVersion: SEAL_VERSION,
      sheetLayoutVersion: SHEET_LAYOUT_VERSION,
      tokenCount: sortedTokens.length,
      tokensHash,
    },
  };
}

