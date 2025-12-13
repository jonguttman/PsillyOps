// AI CLIENT ABSTRACTION
// Pluggable interface for AI providers (OpenAI, Anthropic, etc.)
// Currently stubbed with flexible pattern matching - wire in real provider later

// ========================================
// TYPES
// ========================================

export type RawAICommandResult = {
  command: string;
  args: Record<string, any>;
  confidence?: number;
};

export type RawAIDocumentResult = {
  type: string;
  commands: RawAICommandResult[];
  confidence?: number;
  notes?: string;
};

// ========================================
// AI CLIENT ERROR
// ========================================

export class AIClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIClientError';
  }
}

// ========================================
// NATURAL LANGUAGE COMMAND INTERPRETATION
// ========================================

/**
 * Interpret a natural language command into a structured command.
 * 
 * TODO: Replace stub with real AI call (OpenAI/Anthropic).
 * 
 * Supported patterns:
 * - "Purchased PE for 500" / "Bought 500g PE" / "Got 2kg lions mane"
 * - "Received 2kg lions mane powder, lot LM-44 exp 12/26"
 * - "Leaf ordered 10 Herc and 5 MC caps" / "Order for Leaf: 10 Herc"
 * - "Batch HERC-44 yield 842 units" / "Complete batch HERC-44 with 842"
 * - "Move 40 Herc to FG" / "Transfer 100 PE to Raw Materials"
 * - "Adjust LM down by 30g spilled" / "Add 50 PE" / "Remove 20 LM damaged"
 * - "New material cacao powder SKU CACAO-01"
 * - "Generate invoice for order 123" / "Invoice Leaf order"
 * - "Create packing slip for The Other Path order"
 * 
 * @param text - The natural language command text
 * @returns Structured command result
 */
export async function interpretNaturalLanguageCommand(
  text: string
): Promise<RawAICommandResult> {
  const lowerText = text.toLowerCase().trim();
  
  // Try each parser in order of specificity
  
  // 0. Invoice and manifest commands (very specific keywords)
  if (lowerText.includes('invoice') || lowerText.includes('packing slip') || lowerText.includes('manifest')) {
    const result = parseInvoiceCommand(text);
    if (result) return result;
  }
  
  // 1. Batch completion (most specific)
  if (lowerText.includes('batch') || lowerText.includes('yield') || lowerText.includes('complete')) {
    const result = parseBatchYieldCommand(text);
    if (result) return result;
  }
  
  // 2. Move/Transfer inventory
  if (lowerText.includes('move') || lowerText.includes('transfer')) {
    const result = parseMoveCommand(text);
    if (result) return result;
  }
  
  // 3. Adjust inventory (add/remove/adjust)
  if (lowerText.includes('adjust') || lowerText.match(/\b(add|remove|subtract|lost|damaged|spilled)\b/)) {
    const result = parseAdjustCommand(text);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/37303a4b-08de-4008-8b84-6062b400169a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiClient.ts:86',message:'parseAdjustCommand result',data:{resultExists:!!result,command:result?.command},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,C'})}).catch(()=>{});
    // #endregion
    if (result) return result;
  }
  
  // 4. New material
  if (lowerText.includes('new material') || lowerText.includes('create material') || lowerText.includes('add material')) {
    const result = parseNewMaterialCommand(text);
    if (result) return result;
  }
  
  // 5. Retailer order
  if (lowerText.includes('order')) {
    const result = parseRetailerOrderCommand(text);
    if (result) return result;
  }
  
  // 6. Receive material (most flexible - try last)
  if (lowerText.match(/\b(purchased|received|bought|got|acquired|restocked)\b/) || 
      lowerText.match(/^\d/) ||  // Starts with number like "500 PE"
      lowerText.match(/\bfor\s+\$?\d/)) {  // Contains "for $500"
    const result = parseReceiveMaterialCommand(text);
    if (result) return result;
  }
  
  // 7. Final fallback - try to interpret any quantity + item as receive
  const genericResult = parseGenericQuantityCommand(text);
  if (genericResult) return genericResult;
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/37303a4b-08de-4008-8b84-6062b400169a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiClient.ts:115',message:'No pattern matched - throwing AIClientError',data:{text},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,C'})}).catch(()=>{});
  // #endregion
  // If no pattern matched, throw error
  throw new AIClientError(
    'Could not understand command. Try formats like:\n' +
    '• "Purchased PE for 500"\n' +
    '• "Received 2kg lions mane"\n' +
    '• "Leaf ordered 10 Herc"\n' +
    '• "Batch HERC-44 yield 842"\n' +
    '• "Generate invoice for order ORD-123"\n' +
    '• "Create packing slip for Leaf order"'
  );
}

// ========================================
// DOCUMENT PARSING
// ========================================

export async function parseDocumentContent(
  text: string,
  context: string
): Promise<RawAIDocumentResult> {
  // TODO: Replace with real AI provider call
  throw new AIClientError(
    'AI document parsing not configured yet. Context: ' + context
  );
}

// ========================================
// FLEXIBLE PATTERN MATCHING HELPERS
// ========================================

function parseReceiveMaterialCommand(text: string): RawAICommandResult | null {
  // Normalize text
  const normalized = text.trim();
  
  // Pattern 1: "Purchased/Received X for Y" - e.g., "Purchased PE for 500"
  let match = normalized.match(/(?:purchased|received|bought|got|acquired)\s+(.+?)\s+for\s+\$?(\d+(?:\.\d+)?)/i);
  if (match) {
    return createReceiveResult(match[1].trim(), parseFloat(match[2]), normalized);
  }
  
  // Pattern 2: "Purchased/Received QTY UNIT MATERIAL" - e.g., "Received 2kg lions mane"
  match = normalized.match(/(?:purchased|received|bought|got|acquired|restocked)\s+(\d+(?:\.\d+)?)\s*(kg|g|lb|oz|lbs|grams?|units?|pcs|each)?\s*(.+?)(?:\s*,|\s+lot|\s+exp|$)/i);
  if (match) {
    return createReceiveResult(match[3].trim(), parseFloat(match[1]), normalized, match[2]);
  }
  
  // Pattern 3: "QTY UNIT MATERIAL" without verb - e.g., "500g PE" or "2 kg lions mane"
  match = normalized.match(/^(\d+(?:\.\d+)?)\s*(kg|g|lb|oz|lbs|grams?|units?|pcs|each)?\s*(.+?)(?:\s*,|\s+lot|\s+exp|$)/i);
  if (match && match[3].trim().length > 0) {
    return createReceiveResult(match[3].trim(), parseFloat(match[1]), normalized, match[2]);
  }
  
  // Pattern 4: "MATERIAL QTY" - e.g., "PE 500" or "lions mane 2kg"
  match = normalized.match(/^([A-Za-z][A-Za-z\s]*?)\s+(\d+(?:\.\d+)?)\s*(kg|g|lb|oz|lbs|grams?|units?|pcs|each)?$/i);
  if (match) {
    return createReceiveResult(match[1].trim(), parseFloat(match[2]), normalized, match[3]);
  }
  
  return null;
}

function createReceiveResult(materialRef: string, quantity: number, originalText: string, unitHint?: string): RawAICommandResult | null {
  // Clean material reference
  materialRef = materialRef.replace(/[,.]$/, '').trim();
  
  if (!materialRef || quantity <= 0 || isNaN(quantity)) {
    return null;
  }
  
  // Extract lot number if present
  const lotMatch = originalText.match(/lot\s*[:#]?\s*([A-Z0-9-]+)/i);
  
  // Extract expiry if present
  const expMatch = originalText.match(/exp(?:iry|ires?)?\.?\s*[:#]?\s*(\d{1,2}[\/-]\d{2,4})/i);
  
  // Extract vendor if present (from X, via X, vendor X)
  const vendorMatch = originalText.match(/(?:from|via|vendor)\s+([A-Za-z][A-Za-z0-9\s]+?)(?:\s*,|$)/i);
  
  return {
    command: 'RECEIVE_MATERIAL',
    args: {
      materialRef,
      quantity,
      unit: detectUnit(originalText, unitHint),
      lotNumber: lotMatch ? lotMatch[1] : undefined,
      expiryDate: expMatch ? expMatch[1] : undefined,
      vendorRef: vendorMatch ? vendorMatch[1].trim() : undefined,
    },
    confidence: 0.75
  };
}

function parseRetailerOrderCommand(text: string): RawAICommandResult | null {
  const normalized = text.trim();
  
  // Pattern 1: "RETAILER ordered ITEMS" - e.g., "Leaf ordered 10 Herc and 5 MC"
  let match = normalized.match(/^(.+?)\s+ordered\s+(.+)$/i);
  if (match) {
    const retailerRef = match[1].trim();
    const items = parseOrderItems(match[2]);
    if (retailerRef && items.length > 0) {
      return {
        command: 'CREATE_RETAILER_ORDER',
        args: { retailerRef, items },
        confidence: 0.7
      };
    }
  }
  
  // Pattern 2: "Order for RETAILER: ITEMS" - e.g., "Order for Leaf: 10 Herc"
  match = normalized.match(/order\s+(?:for\s+)?([A-Za-z][A-Za-z0-9\s]*?)[:\-]\s*(.+)$/i);
  if (match) {
    const retailerRef = match[1].trim();
    const items = parseOrderItems(match[2]);
    if (retailerRef && items.length > 0) {
      return {
        command: 'CREATE_RETAILER_ORDER',
        args: { retailerRef, items },
        confidence: 0.65
      };
    }
  }
  
  // Pattern 3: "New order RETAILER ITEMS" - e.g., "New order Leaf 10 Herc"
  match = normalized.match(/(?:new\s+)?order\s+([A-Za-z][A-Za-z0-9]*)\s+(.+)$/i);
  if (match) {
    const retailerRef = match[1].trim();
    const items = parseOrderItems(match[2]);
    if (retailerRef && items.length > 0) {
      return {
        command: 'CREATE_RETAILER_ORDER',
        args: { retailerRef, items },
        confidence: 0.6
      };
    }
  }
  
  return null;
}

function parseOrderItems(text: string): { productRef: string; quantity: number }[] {
  const items: { productRef: string; quantity: number }[] = [];
  
  // Pattern: "10 Herc and 5 MC caps" or "10 Herc, 5 MC"
  const itemPattern = /(\d+)\s+([A-Za-z][A-Za-z0-9\s]*?)(?:\s+(?:and|,|\+)|$)/gi;
  let match;
  
  while ((match = itemPattern.exec(text + ' ')) !== null) {
    const quantity = parseInt(match[1], 10);
    let productRef = match[2].trim();
    // Remove common suffixes
    productRef = productRef.replace(/\s*(caps?|jars?|bottles?|units?|pcs|each)$/i, '').trim();
    
    if (quantity > 0 && productRef) {
      items.push({ productRef, quantity });
    }
  }
  
  // Fallback: try simple "QTY PRODUCT"
  if (items.length === 0) {
    const simple = text.match(/(\d+)\s+(.+)/);
    if (simple) {
      let productRef = simple[2].trim();
      productRef = productRef.replace(/\s*(caps?|jars?|bottles?|units?|pcs|each)$/i, '').trim();
      items.push({
        quantity: parseInt(simple[1], 10),
        productRef
      });
    }
  }
  
  return items;
}

function parseBatchYieldCommand(text: string): RawAICommandResult | null {
  const normalized = text.trim();
  
  // Pattern 1: "Batch CODE yield/produced QTY" - e.g., "Batch HERC-44 yield 842"
  let match = normalized.match(/batch\s+([A-Z0-9][-A-Z0-9]*)\s+(?:yield|produced|complete[d]?|made)\s+(\d+)/i);
  if (match) {
    return createBatchResult(match[1], parseInt(match[2], 10), normalized);
  }
  
  // Pattern 2: "Complete batch CODE with QTY" - e.g., "Complete batch HERC-44 with 842"
  match = normalized.match(/complete\s+batch\s+([A-Z0-9][-A-Z0-9]*)\s+(?:with\s+)?(\d+)/i);
  if (match) {
    return createBatchResult(match[1], parseInt(match[2], 10), normalized);
  }
  
  // Pattern 3: "CODE yielded QTY" - e.g., "HERC-44 yielded 842 units"
  match = normalized.match(/([A-Z0-9][-A-Z0-9]+)\s+(?:yield(?:ed)?|produced|made)\s+(\d+)/i);
  if (match) {
    return createBatchResult(match[1], parseInt(match[2], 10), normalized);
  }
  
  return null;
}

function createBatchResult(batchRef: string, yieldQuantity: number, originalText: string): RawAICommandResult {
  // Extract loss quantity if present
  const lossMatch = originalText.match(/loss\s+(\d+)/i);
  const lossQuantity = lossMatch ? parseInt(lossMatch[1], 10) : undefined;
  
  // Extract loss reason if present
  let lossReason: string | undefined;
  if (lossQuantity) {
    const reasonMatch = originalText.match(/loss\s+\d+\s+(.+?)(?:\s*$|,)/i);
    lossReason = reasonMatch ? reasonMatch[1].trim() : undefined;
  }
  
  return {
    command: 'COMPLETE_BATCH',
    args: {
      batchRef: batchRef.toUpperCase(),
      yieldQuantity,
      lossQuantity,
      lossReason
    },
    confidence: 0.8
  };
}

function parseMoveCommand(text: string): RawAICommandResult | null {
  const normalized = text.trim();
  
  // Pattern 1: "Move QTY ITEM to LOCATION"
  let match = normalized.match(/(?:move|transfer)\s+(\d+)\s+(.+?)\s+to\s+(.+)$/i);
  if (match) {
    return {
      command: 'MOVE_INVENTORY',
      args: {
        quantity: parseInt(match[1], 10),
        itemRef: match[2].trim(),
        toLocationRef: match[3].trim()
      },
      confidence: 0.75
    };
  }
  
  // Pattern 2: "Move ITEM QTY to LOCATION" - e.g., "Move PE 500 to FG"
  match = normalized.match(/(?:move|transfer)\s+([A-Za-z][A-Za-z\s]*?)\s+(\d+)\s+to\s+(.+)$/i);
  if (match) {
    return {
      command: 'MOVE_INVENTORY',
      args: {
        quantity: parseInt(match[2], 10),
        itemRef: match[1].trim(),
        toLocationRef: match[3].trim()
      },
      confidence: 0.7
    };
  }
  
  return null;
}

function parseAdjustCommand(text: string): RawAICommandResult | null {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/37303a4b-08de-4008-8b84-6062b400169a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiClient.ts:367',message:'parseAdjustCommand entered',data:{text},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  const normalized = text.trim();
  const lowerText = normalized.toLowerCase();
  
  // Determine direction
  let direction = 0;
  if (lowerText.match(/\b(down|remove|subtract|lost|damaged|spilled|waste|scrapped)\b/)) {
    direction = -1;
  } else if (lowerText.match(/\b(up|add|found|returned)\b/)) {
    direction = 1;
  }
  
  // Pattern 1: "Adjust ITEM down/up by QTY REASON"
  let match = normalized.match(/adjust\s+(.+?)\s+(?:down|up)\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*(.*)/i);
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/37303a4b-08de-4008-8b84-6062b400169a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiClient.ts:383',message:'Pattern 1 result',data:{matched:!!match,pattern:'down/up'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  if (match) {
    const delta = parseFloat(match[2]) * (direction || -1);
    return {
      command: 'ADJUST_INVENTORY',
      args: {
        itemRef: match[1].trim(),
        delta,
        reason: match[3]?.trim() || 'Manual adjustment'
      },
      confidence: 0.75
    };
  }
  
  // Pattern 2a: "Adjust ITEM to QTY" - set to specific quantity (needs current qty lookup)
  match = normalized.match(/adjust\s+(.+?)\s+to\s+(\d+(?:\.\d+)?)\s*(.*)/i);
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/37303a4b-08de-4008-8b84-6062b400169a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiClient.ts:405',message:'Pattern 2a (to qty) result',data:{matched:!!match,groups:match?[match[1],match[2],match[3]]:null},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  if (match) {
    // For "adjust X to Y" we need to set a target quantity
    // We'll use a special marker to indicate this is a "set to" operation
    return {
      command: 'ADJUST_INVENTORY',
      args: {
        itemRef: match[1].trim(),
        targetQuantity: parseFloat(match[2]), // Special field for "set to" operations
        delta: 0, // Will be calculated during execution
        reason: match[3]?.trim() || 'Set quantity to target'
      },
      confidence: 0.75
    };
  }

  // Pattern 2b: "Adjust ITEM by QTY" or "Adjust ITEM QTY"
  match = normalized.match(/adjust\s+(.+?)\s+(?:by\s+)?(-?\d+(?:\.\d+)?)\s*(.*)/i);
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/37303a4b-08de-4008-8b84-6062b400169a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiClient.ts:425',message:'Pattern 2b (by qty) result',data:{matched:!!match,groups:match?[match[1],match[2],match[3]]:null},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  if (match) {
    let delta = parseFloat(match[2]);
    if (direction) delta = Math.abs(delta) * direction;
    return {
      command: 'ADJUST_INVENTORY',
      args: {
        itemRef: match[1].trim(),
        delta,
        reason: match[3]?.trim() || 'Manual adjustment'
      },
      confidence: 0.7
    };
  }
  
  // Pattern 3: "Add/Remove QTY ITEM" - e.g., "Add 50 PE" or "Remove 20 LM"
  match = normalized.match(/(?:add|remove|subtract)\s+(\d+(?:\.\d+)?)\s*(?:g|kg|units?)?\s+(.+?)(?:\s*,|\s+(?:to|from|because|due)|$)/i);
  if (match) {
    const delta = parseFloat(match[1]) * direction;
    let reason = 'Manual adjustment';
    const reasonMatch = normalized.match(/(?:because|due\s+to|reason[:\s]+)\s*(.+)$/i);
    if (reasonMatch) reason = reasonMatch[1].trim();
    
    return {
      command: 'ADJUST_INVENTORY',
      args: {
        itemRef: match[2].trim(),
        delta,
        reason
      },
      confidence: 0.7
    };
  }
  
  // Pattern 4: "Lost/Damaged/Spilled QTY ITEM"
  match = normalized.match(/(?:lost|damaged|spilled|wasted|scrapped)\s+(\d+(?:\.\d+)?)\s*(?:g|kg|units?)?\s+(.+?)$/i);
  if (match) {
    return {
      command: 'ADJUST_INVENTORY',
      args: {
        itemRef: match[2].trim(),
        delta: -Math.abs(parseFloat(match[1])),
        reason: normalized.match(/^(\w+)/)?.[1] || 'Loss'
      },
      confidence: 0.7
    };
  }
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/37303a4b-08de-4008-8b84-6062b400169a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiClient.ts:460',message:'parseAdjustCommand returning null - no pattern matched',data:{text},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,C'})}).catch(()=>{});
  // #endregion
  return null;
}

function parseNewMaterialCommand(text: string): RawAICommandResult | null {
  const normalized = text.trim();
  
  // Pattern: "New material NAME [SKU X] [from VENDOR]"
  const match = normalized.match(/(?:new|create|add)\s+material\s+(.+?)(?:\s+sku\s+([A-Z0-9-]+))?(?:\s+from\s+(.+))?$/i);
  
  if (match) {
    return {
      command: 'CREATE_MATERIAL',
      args: {
        name: match[1].trim(),
        sku: match[2] || undefined,
        vendorRef: match[3]?.trim()
      },
      confidence: 0.7
    };
  }
  
  return null;
}

function parseGenericQuantityCommand(text: string): RawAICommandResult | null {
  // Last resort: try to find any quantity + text pattern and assume it's a receive
  const normalized = text.trim();
  
  // Look for NUMBER followed by text
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*(kg|g|lb|oz|lbs|grams?|units?|pcs|each)?\s+([A-Za-z].+?)$/i);
  if (match) {
    const quantity = parseFloat(match[1]);
    const materialRef = match[3].trim();
    
    if (quantity > 0 && materialRef.length > 1) {
      return {
        command: 'RECEIVE_MATERIAL',
        args: {
          materialRef,
          quantity,
          unit: detectUnit(normalized, match[2])
        },
        confidence: 0.5
      };
    }
  }
  
  return null;
}

function parseInvoiceCommand(text: string): RawAICommandResult | null {
  const normalized = text.trim();
  const lowerText = normalized.toLowerCase();
  
  // Determine if this is an invoice or manifest/packing slip request
  const isManifest = lowerText.includes('packing slip') || lowerText.includes('manifest') || lowerText.includes('packing list');
  
  // Pattern 1: "Generate/Create invoice for order ORDER_NUMBER"
  let match = normalized.match(/(?:generate|create|make|get)\s+(?:an?\s+)?(?:invoice|packing\s+slip|manifest)\s+(?:for\s+)?(?:order\s+)?([A-Z0-9-]+)/i);
  if (match) {
    return {
      command: isManifest ? 'GENERATE_MANIFEST' : 'GENERATE_INVOICE',
      args: {
        orderRef: match[1].trim()
      },
      confidence: 0.85
    };
  }
  
  // Pattern 2: "Invoice order ORDER_NUMBER" / "Invoice for ORDER_NUMBER"
  match = normalized.match(/invoice\s+(?:for\s+)?(?:order\s+)?([A-Z0-9-]+)/i);
  if (match && !isManifest) {
    return {
      command: 'GENERATE_INVOICE',
      args: {
        orderRef: match[1].trim()
      },
      confidence: 0.8
    };
  }
  
  // Pattern 3: "Invoice RETAILER order" - e.g., "Invoice Leaf order" or "Invoice The Other Path"
  match = normalized.match(/invoice\s+(.+?)\s+order/i);
  if (match && !isManifest) {
    return {
      command: 'GENERATE_INVOICE',
      args: {
        retailerRef: match[1].trim()
      },
      confidence: 0.7
    };
  }
  
  // Pattern 4: "Packing slip for RETAILER order"
  match = normalized.match(/(?:packing\s+slip|manifest)\s+(?:for\s+)?(.+?)\s+order/i);
  if (match) {
    return {
      command: 'GENERATE_MANIFEST',
      args: {
        retailerRef: match[1].trim()
      },
      confidence: 0.7
    };
  }
  
  // Pattern 5: Simple "Invoice RETAILER" or "Manifest RETAILER"
  match = normalized.match(/(?:invoice|packing\s+slip|manifest)\s+(.+?)$/i);
  if (match) {
    const ref = match[1].trim();
    // Check if it looks like an order number (has numbers/dashes)
    const isOrderNumber = /[0-9-]/.test(ref);
    return {
      command: isManifest ? 'GENERATE_MANIFEST' : 'GENERATE_INVOICE',
      args: isOrderNumber ? { orderRef: ref } : { retailerRef: ref },
      confidence: 0.6
    };
  }
  
  return null;
}

function detectUnit(text: string, hint?: string): string {
  const lowerText = text.toLowerCase();
  const lowerHint = hint?.toLowerCase() || '';
  
  // Check hint first
  if (lowerHint.includes('kg') || lowerHint.includes('kilogram')) return 'KILOGRAM';
  if (lowerHint === 'g' || lowerHint.includes('gram')) return 'GRAM';
  if (lowerHint.includes('lb') || lowerHint.includes('pound')) return 'UNIT'; // Using UNIT as fallback
  if (lowerHint.includes('oz') || lowerHint.includes('ounce')) return 'UNIT';
  if (lowerHint.includes('ml')) return 'MILLILITER';
  if (lowerHint === 'l' || lowerHint.includes('liter')) return 'LITER';
  
  // Check text
  if (lowerText.includes('kg') || lowerText.includes('kilogram')) return 'KILOGRAM';
  if (lowerText.match(/\d+\s*g\b/) || lowerText.includes('gram')) return 'GRAM';
  if (lowerText.includes('ml') || lowerText.includes('milliliter')) return 'MILLILITER';
  if (lowerText.match(/\d+\s*l\b/) || lowerText.includes('liter')) return 'LITER';
  if (lowerText.includes('oz') || lowerText.includes('ounce')) return 'UNIT';
  if (lowerText.includes('lb') || lowerText.includes('pound')) return 'UNIT';
  
  return 'UNIT'; // Default
}
