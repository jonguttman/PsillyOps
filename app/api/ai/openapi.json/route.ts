/**
 * API Route: GET /api/ai/openapi.json
 * 
 * Returns OpenAPI 3.0 schema for ChatGPT Custom GPT integration.
 * This allows ChatGPT to auto-import all AI endpoints.
 */

import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
  
  const schema = {
    openapi: '3.1.0',
    info: {
      title: 'PsillyOps AI API',
      description: 'Phase 1 AI-assisted operations API for mushroom production facility management',
      version: '1.0.0',
    },
    servers: [
      {
        url: baseUrl,
        description: 'PsillyOps Production',
      },
    ],
    paths: {
      '/api/ai/context': {
        get: {
          operationId: 'getContext',
          summary: 'Get system state and AI session',
          description: 'Returns current system state summary and creates/validates AI session. Call this first to get a session token.',
          responses: {
            '200': {
              description: 'System context with session token',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      timestamp: { type: 'string', format: 'date-time' },
                      staleAfter: { type: 'string', format: 'date-time' },
                      aiSessionId: { type: 'string' },
                      session: {
                        type: 'object',
                        properties: {
                          token: { type: 'string' },
                          expiresAt: { type: 'string', format: 'date-time' },
                          isNew: { type: 'boolean' },
                        },
                      },
                      summary: {
                        type: 'object',
                        properties: {
                          pendingOrders: { type: 'integer' },
                          lowStockMaterials: { type: 'integer' },
                          activeProductionRuns: { type: 'integer' },
                          stalledProductionRuns: { type: 'integer' },
                          openPurchaseOrders: { type: 'integer' },
                          draftPurchaseOrders: { type: 'integer' },
                          attentionItems: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                type: { type: 'string' },
                                entity: { type: 'string' },
                                entityId: { type: 'string' },
                                severity: { type: 'string', enum: ['info', 'warning', 'error'] },
                                message: { type: 'string' },
                              },
                            },
                          },
                        },
                      },
                      recentActivity: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            action: { type: 'string' },
                            summary: { type: 'string' },
                            createdAt: { type: 'string', format: 'date-time' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/lookup/resolve': {
        get: {
          operationId: 'resolveEntity',
          summary: 'Resolve natural language reference to entity',
          description: 'Resolves references like "PE powder" or "Caps" to database entities. Returns alternatives when ambiguous.',
          parameters: [
            {
              name: 'ref',
              in: 'query',
              required: true,
              description: 'The reference string to resolve (e.g., "PE", "Penis Envy", "RAW")',
              schema: { type: 'string' },
            },
            {
              name: 'type',
              in: 'query',
              required: false,
              description: 'Optional entity type hint to narrow search',
              schema: {
                type: 'string',
                enum: ['product', 'material', 'retailer', 'location', 'batch', 'vendor'],
              },
            },
          ],
          responses: {
            '200': {
              description: 'Resolved entity or alternatives',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      resolved: { type: 'boolean' },
                      entityType: { type: 'string' },
                      entity: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                          sku: { type: 'string' },
                          type: { type: 'string' },
                        },
                      },
                      confidence: {
                        type: 'string',
                        enum: ['exact', 'fuzzy', 'abbreviation', 'ambiguous'],
                      },
                      alternatives: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            sku: { type: 'string' },
                            type: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/ai/validate-order': {
        post: {
          operationId: 'validateOrder',
          summary: 'Validate and resolve AI-parsed order',
          description: 'Validates order payloads, resolves entity refs to IDs. If canCreateProposal is false, ask user to clarify ambiguous matches before calling /api/ai/propose.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  description: 'AI-parsed order payload. Use orderType to discriminate between SALES and PURCHASE orders.',
                  required: ['orderType'],
                  properties: {
                    orderType: {
                      type: 'string',
                      enum: ['SALES', 'PURCHASE'],
                      description: 'Discriminator: SALES for retailer orders, PURCHASE for vendor orders',
                    },
                    retailerRef: {
                      type: 'string',
                      description: 'For SALES orders: Retailer name or ID to resolve',
                    },
                    vendorRef: {
                      type: 'string',
                      description: 'For PURCHASE orders: Vendor name or ID to resolve',
                    },
                    requestedShipDate: {
                      type: 'string',
                      format: 'date-time',
                      description: 'For SALES orders: Requested ship date',
                    },
                    expectedDeliveryDate: {
                      type: 'string',
                      format: 'date-time',
                      description: 'For PURCHASE orders: Expected delivery date',
                    },
                    notes: {
                      type: 'string',
                    },
                    lineItems: {
                      type: 'array',
                      minItems: 1,
                      description: 'Order line items. Use productRef for SALES, materialRef for PURCHASE.',
                      items: {
                        type: 'object',
                        properties: {
                          productRef: {
                            type: 'string',
                            description: 'For SALES: Product SKU, name, or ID',
                          },
                          materialRef: {
                            type: 'string',
                            description: 'For PURCHASE: Material SKU, name, or ID',
                          },
                          quantity: {
                            type: 'number',
                            minimum: 1,
                          },
                          unitCost: {
                            type: 'number',
                            description: 'For PURCHASE: Optional unit cost',
                          },
                        },
                        required: ['quantity'],
                      },
                    },
                    sourceMeta: {
                      type: 'object',
                      description: 'Optional metadata about the source of the parsed order',
                      properties: {
                        sourceType: {
                          type: 'string',
                          enum: ['EMAIL', 'PASTE', 'PDF', 'API'],
                        },
                        sourceId: {
                          type: 'string',
                        },
                        receivedAt: {
                          type: 'string',
                          format: 'date-time',
                        },
                      },
                    },
                  },
                },
                examples: {
                  salesOrder: {
                    summary: 'Sales Order',
                    value: {
                      orderType: 'SALES',
                      retailerRef: 'Green Leaf Dispensary',
                      requestedShipDate: '2024-02-15T00:00:00.000Z',
                      lineItems: [
                        { productRef: 'Mighty Caps PE', quantity: 100 },
                        { productRef: 'Lions Mane Tincture', quantity: 50 },
                      ],
                      sourceMeta: {
                        sourceType: 'EMAIL',
                        receivedAt: '2024-02-10T14:30:00.000Z',
                      },
                    },
                  },
                  purchaseOrder: {
                    summary: 'Purchase Order',
                    value: {
                      orderType: 'PURCHASE',
                      vendorRef: 'Mushroom Farms Inc',
                      lineItems: [
                        { materialRef: 'Penis Envy Powder', quantity: 5000, unitCost: 0.15 },
                        { materialRef: 'Size 00 Capsules', quantity: 10000 },
                      ],
                      sourceMeta: {
                        sourceType: 'PASTE',
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Validation result with resolved entities',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      valid: { type: 'boolean', description: 'True if all required fields resolved' },
                      canCreateProposal: { type: 'boolean', description: 'False if any ambiguous matches - must clarify first' },
                      resolvedPayload: { type: 'object', description: 'Payload with IDs filled in' },
                      unresolvedFields: { type: 'array', items: { type: 'string' } },
                      warnings: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            type: { type: 'string', enum: ['FUZZY_MATCH', 'AMBIGUOUS_MATCH', 'MISSING_PRICING', 'UNRESOLVED_FIELD'] },
                            field: { type: 'string' },
                            message: { type: 'string' },
                            severity: { type: 'string', enum: ['info', 'warning', 'error'] },
                            alternatives: { type: 'array', items: { type: 'object' } },
                          },
                        },
                      },
                      confidence: { type: 'number', description: 'Score from 0.0 to 1.0' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/ai/propose': {
        post: {
          operationId: 'createProposal',
          summary: 'Create a proposal for an action',
          description: 'Creates a proposal that previews an action without executing it. Phase 1 allows execution of: INVENTORY_ADJUSTMENT, PURCHASE_ORDER_SUBMIT, VENDOR_EMAIL, ORDER_CREATION, PURCHASE_ORDER_CREATION. Other actions are preview-only.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['action', 'params'],
                  properties: {
                    action: {
                      type: 'string',
                      enum: [
                        'INVENTORY_ADJUSTMENT',
                        'PURCHASE_ORDER_SUBMIT',
                        'VENDOR_EMAIL',
                        'ORDER_CREATION',
                        'PURCHASE_ORDER_CREATION',
                        'PRODUCTION_ORDER',
                        'RECEIVE_MATERIAL',
                        'BATCH_COMPLETION',
                      ],
                      description: 'The action to propose',
                    },
                    params: {
                      type: 'object',
                      description: 'Action-specific parameters. For ORDER_CREATION and PURCHASE_ORDER_CREATION, use IDs from validate-order response.',
                    },
                  },
                },
                examples: {
                  inventoryAdjustment: {
                    summary: 'Inventory Adjustment',
                    value: {
                      action: 'INVENTORY_ADJUSTMENT',
                      params: {
                        inventoryId: 'clx123...',
                        delta: -50,
                        reason: 'Cycle count correction',
                      },
                    },
                  },
                  salesOrder: {
                    summary: 'Sales Order Creation',
                    value: {
                      action: 'ORDER_CREATION',
                      params: {
                        retailerId: 'clx789...',
                        items: [
                          { productId: 'clxabc...', quantity: 100 },
                          { productId: 'clxdef...', quantity: 50 },
                        ],
                        requestedShipDate: '2024-02-15T00:00:00.000Z',
                        sourceMeta: { sourceType: 'EMAIL' },
                      },
                    },
                  },
                  purchaseOrder: {
                    summary: 'Purchase Order Creation',
                    value: {
                      action: 'PURCHASE_ORDER_CREATION',
                      params: {
                        vendorId: 'clx456...',
                        items: [
                          { materialId: 'clxghi...', quantity: 5000, unitCost: 0.15 },
                        ],
                        sourceMeta: { sourceType: 'PASTE' },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Proposal created successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      proposalId: { type: 'string' },
                      action: { type: 'string' },
                      executionMode: {
                        type: 'string',
                        enum: ['EXECUTABLE', 'PREVIEW_ONLY'],
                      },
                      phase: { type: 'integer' },
                      phase1Allowed: { type: 'boolean' },
                      preview: { type: 'object' },
                      warnings: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            type: { type: 'string' },
                            message: { type: 'string' },
                            severity: { type: 'string', enum: ['info', 'warning', 'error'] },
                          },
                        },
                      },
                      confirmationRequired: { type: 'boolean' },
                      expiresAt: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/ai/execute': {
        post: {
          operationId: 'executeProposal',
          summary: 'Execute a confirmed proposal',
          description: 'Executes a previously created proposal. Phase 1 allows: INVENTORY_ADJUSTMENT, PURCHASE_ORDER_SUBMIT, VENDOR_EMAIL, ORDER_CREATION, PURCHASE_ORDER_CREATION. Other actions are preview-only.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['proposalId'],
                  properties: {
                    proposalId: {
                      type: 'string',
                      description: 'ID of the proposal to execute',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Proposal executed successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      entityId: { type: 'string' },
                      entityType: { type: 'string' },
                      message: { type: 'string' },
                    },
                  },
                },
              },
            },
            '403': {
              description: 'Phase 2 action blocked',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', enum: [false] },
                      error: {
                        type: 'object',
                        properties: {
                          code: { type: 'string' },
                          message: { type: 'string' },
                          suggestion: { type: 'string' },
                          speakable: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/ai/command-log': {
        get: {
          operationId: 'getCommandLog',
          summary: 'Get recent AI command history',
          description: 'Returns recent AI command history for debugging and audit purposes.',
          parameters: [
            {
              name: 'limit',
              in: 'query',
              required: false,
              description: 'Maximum number of entries to return (default: 50)',
              schema: { type: 'integer', default: 50 },
            },
            {
              name: 'status',
              in: 'query',
              required: false,
              description: 'Filter by status',
              schema: {
                type: 'string',
                enum: ['PENDING', 'APPLIED', 'FAILED', 'BLOCKED'],
              },
            },
          ],
          responses: {
            '200': {
              description: 'Command log entries',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      logs: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            inputText: { type: 'string' },
                            normalized: { type: 'string' },
                            status: { type: 'string' },
                            createdAt: { type: 'string', format: 'date-time' },
                            appliedAt: { type: 'string', format: 'date-time' },
                            user: {
                              type: 'object',
                              properties: {
                                id: { type: 'string' },
                                name: { type: 'string' },
                              },
                            },
                          },
                        },
                      },
                      total: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        AISourceMeta: {
          type: 'object',
          description: 'Metadata about the source of the parsed order',
          properties: {
            sourceType: {
              type: 'string',
              enum: ['EMAIL', 'PASTE', 'PDF', 'API'],
              description: 'Where the order text came from',
            },
            sourceId: {
              type: 'string',
              description: 'Optional ID of source (emailId, uploadId, etc.)',
            },
            receivedAt: {
              type: 'string',
              format: 'date-time',
              description: 'When the source was received',
            },
          },
        },
        AISalesOrder: {
          type: 'object',
          description: 'AI-parsed sales order (PsillyCo selling to retailer). Pricing comes from database.',
          required: ['orderType', 'retailerRef', 'lineItems'],
          properties: {
            orderType: {
              type: 'string',
              enum: ['SALES'],
            },
            retailerRef: {
              type: 'string',
              description: 'Retailer name or ID - will be resolved server-side',
            },
            requestedShipDate: {
              type: 'string',
              format: 'date-time',
            },
            notes: { type: 'string' },
            lineItems: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['productRef', 'quantity'],
                properties: {
                  productRef: {
                    type: 'string',
                    description: 'Product SKU, name, or ID - will be resolved server-side',
                  },
                  quantity: {
                    type: 'number',
                    minimum: 1,
                  },
                },
              },
            },
            sourceMeta: { $ref: '#/components/schemas/AISourceMeta' },
          },
        },
        AIPurchaseOrder: {
          type: 'object',
          description: 'AI-parsed purchase order (PsillyCo buying from vendor)',
          required: ['orderType', 'vendorRef', 'lineItems'],
          properties: {
            orderType: {
              type: 'string',
              enum: ['PURCHASE'],
            },
            vendorRef: {
              type: 'string',
              description: 'Vendor name or ID - will be resolved server-side',
            },
            expectedDeliveryDate: {
              type: 'string',
              format: 'date-time',
            },
            notes: { type: 'string' },
            lineItems: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['materialRef', 'quantity'],
                properties: {
                  materialRef: {
                    type: 'string',
                    description: 'Material SKU, name, or ID - will be resolved server-side',
                  },
                  quantity: {
                    type: 'number',
                    minimum: 1,
                  },
                  unitCost: {
                    type: 'number',
                    description: 'Optional - falls back to vendor pricing if not provided',
                  },
                },
              },
            },
            sourceMeta: { $ref: '#/components/schemas/AISourceMeta' },
          },
        },
      },
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'API Key',
          description: 'AI API Key from PsillyOps environment configuration',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  };

  return Response.json(schema, {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
    },
  });
}

