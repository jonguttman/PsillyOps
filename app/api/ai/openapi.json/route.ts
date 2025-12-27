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
    openapi: '3.0.0',
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
            {
              name: 'X-AI-Session-ID',
              in: 'header',
              required: true,
              description: 'Session token obtained from /api/ai/context',
              schema: { type: 'string' },
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
      '/api/ai/propose': {
        post: {
          operationId: 'createProposal',
          summary: 'Create a proposal for an action',
          description: 'Creates a proposal that previews an action without executing it. Phase 1 allows execution of: INVENTORY_ADJUSTMENT, PURCHASE_ORDER_SUBMIT, VENDOR_EMAIL. Other actions are preview-only.',
          parameters: [
            {
              name: 'X-AI-Session-ID',
              in: 'header',
              required: true,
              description: 'Session token obtained from /api/ai/context',
              schema: { type: 'string' },
            },
          ],
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
                        'PRODUCTION_ORDER',
                        'RECEIVE_MATERIAL',
                        'BATCH_COMPLETION',
                        'ORDER_CREATION',
                      ],
                      description: 'The action to propose',
                    },
                    params: {
                      type: 'object',
                      description: 'Action-specific parameters',
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
                  purchaseOrderSubmit: {
                    summary: 'Submit Purchase Order',
                    value: {
                      action: 'PURCHASE_ORDER_SUBMIT',
                      params: {
                        purchaseOrderId: 'clx456...',
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
          description: 'Executes a previously created proposal. Phase 1 restrictions apply - only INVENTORY_ADJUSTMENT, PURCHASE_ORDER_SUBMIT, and VENDOR_EMAIL can be executed.',
          parameters: [
            {
              name: 'X-AI-Session-ID',
              in: 'header',
              required: true,
              description: 'Session token obtained from /api/ai/context',
              schema: { type: 'string' },
            },
          ],
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
            {
              name: 'X-AI-Session-ID',
              in: 'header',
              required: true,
              description: 'Session token obtained from /api/ai/context',
              schema: { type: 'string' },
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
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'next-auth.session-token',
          description: 'NextAuth session cookie',
        },
      },
    },
    security: [
      {
        cookieAuth: [],
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

