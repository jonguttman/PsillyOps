// PRODUCT CSV IMPORT API
// POST /api/products/import - Bulk import products from CSV
// Supports strain resolution by name or shortCode

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/db/prisma';
import { resolveStrainRef } from '@/lib/services/strainService';
import { logAction } from '@/lib/services/loggingService';
import { ActivityEntity } from '@prisma/client';

// Expected CSV columns
// name,sku,strain,unit,reorder_point,wholesale_price,default_batch_size

interface ParsedRow {
  rowNumber: number;
  name: string;
  sku: string;
  strain: string | null;
  unit: string;
  reorderPoint: number;
  wholesalePrice: number | null;
  defaultBatchSize: number | null;
}

interface RowError {
  row: number;
  sku?: string;
  errors: string[];
}

interface ImportResult {
  success: boolean;
  totalRows: number;
  successCount: number;
  errorCount: number;
  errors: RowError[];
  createdProducts: { sku: string; name: string; strainName?: string }[];
}

export async function POST(request: NextRequest): Promise<NextResponse<ImportResult | { error: string }>> {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only ADMIN can bulk import
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only administrators can import products' }, { status: 403 });
    }

    const body = await request.json();
    const { csvData } = body;

    if (!csvData || typeof csvData !== 'string') {
      return NextResponse.json({ error: 'CSV data is required' }, { status: 400 });
    }

    // Parse CSV
    const lines = csvData.trim().split('\n');
    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSV must have a header row and at least one data row' }, { status: 400 });
    }

    const header = parseCSVLine(lines[0]);
    const normalizedHeader = header.map(h => h.toLowerCase().trim().replace(/[^a-z_]/g, '_'));

    // Validate required columns
    const requiredColumns = ['name', 'sku', 'unit'];
    const missingColumns = requiredColumns.filter(col => !normalizedHeader.includes(col));
    if (missingColumns.length > 0) {
      return NextResponse.json({ 
        error: `Missing required columns: ${missingColumns.join(', ')}` 
      }, { status: 400 });
    }

    // Get column indices
    const colIdx = {
      name: normalizedHeader.indexOf('name'),
      sku: normalizedHeader.indexOf('sku'),
      strain: normalizedHeader.indexOf('strain'),
      unit: normalizedHeader.indexOf('unit'),
      reorderPoint: normalizedHeader.findIndex(h => h.includes('reorder')),
      wholesalePrice: normalizedHeader.findIndex(h => h.includes('wholesale') || h.includes('price')),
      defaultBatchSize: normalizedHeader.findIndex(h => h.includes('batch'))
    };

    // Parse data rows
    const parsedRows: ParsedRow[] = [];
    const errors: RowError[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; // Skip empty lines

      const values = parseCSVLine(line);
      const rowErrors: string[] = [];

      const name = values[colIdx.name]?.trim();
      const sku = values[colIdx.sku]?.trim();
      const strain = colIdx.strain >= 0 ? values[colIdx.strain]?.trim() || null : null;
      const unit = values[colIdx.unit]?.trim();
      const reorderPointStr = colIdx.reorderPoint >= 0 ? values[colIdx.reorderPoint]?.trim() : '';
      const wholesalePriceStr = colIdx.wholesalePrice >= 0 ? values[colIdx.wholesalePrice]?.trim() : '';
      const defaultBatchSizeStr = colIdx.defaultBatchSize >= 0 ? values[colIdx.defaultBatchSize]?.trim() : '';

      // Validate required fields
      if (!name) rowErrors.push('Name is required');
      if (!sku) rowErrors.push('SKU is required');
      if (!unit) rowErrors.push('Unit is required');

      // Validate numeric fields
      let reorderPoint = 0;
      if (reorderPointStr) {
        reorderPoint = parseInt(reorderPointStr, 10);
        if (isNaN(reorderPoint) || reorderPoint < 0) {
          rowErrors.push('Reorder point must be a non-negative number');
        }
      }

      let wholesalePrice: number | null = null;
      if (wholesalePriceStr) {
        wholesalePrice = parseFloat(wholesalePriceStr);
        if (isNaN(wholesalePrice) || wholesalePrice < 0) {
          rowErrors.push('Wholesale price must be a non-negative number');
        }
      }

      let defaultBatchSize: number | null = null;
      if (defaultBatchSizeStr) {
        defaultBatchSize = parseInt(defaultBatchSizeStr, 10);
        if (isNaN(defaultBatchSize) || defaultBatchSize <= 0) {
          rowErrors.push('Default batch size must be a positive number');
        }
      }

      if (rowErrors.length > 0) {
        errors.push({ row: i + 1, sku: sku || undefined, errors: rowErrors });
      } else {
        parsedRows.push({
          rowNumber: i + 1,
          name: name!,
          sku: sku!,
          strain,
          unit: unit!,
          reorderPoint,
          wholesalePrice,
          defaultBatchSize
        });
      }
    }

    // Validate strains and check for duplicate SKUs BEFORE inserting
    const existingSkus = await prisma.product.findMany({
      where: { sku: { in: parsedRows.map(r => r.sku) } },
      select: { sku: true }
    });
    const existingSkuSet = new Set(existingSkus.map(p => p.sku));

    // Check for duplicate SKUs within the import
    const importSkuCount: Record<string, number> = {};
    for (const row of parsedRows) {
      importSkuCount[row.sku] = (importSkuCount[row.sku] || 0) + 1;
    }
    const duplicateSkusInImport = Object.entries(importSkuCount)
      .filter(([, count]) => count > 1)
      .map(([sku]) => sku);

    // Resolve strains and validate
    const strainCache = new Map<string, string | null>();
    const rowsToInsert: (ParsedRow & { strainId: string | null; strainName?: string })[] = [];

    for (const row of parsedRows) {
      const rowErrors: string[] = [];

      // Check for duplicate SKU in database
      if (existingSkuSet.has(row.sku)) {
        rowErrors.push(`SKU "${row.sku}" already exists`);
      }

      // Check for duplicate SKU within import
      if (duplicateSkusInImport.includes(row.sku)) {
        rowErrors.push(`Duplicate SKU "${row.sku}" found in import file`);
      }

      // Resolve strain if provided
      let strainId: string | null = null;
      let strainName: string | undefined;
      if (row.strain) {
        // Check cache first
        if (strainCache.has(row.strain)) {
          strainId = strainCache.get(row.strain)!;
        } else {
          const strain = await resolveStrainRef(row.strain);
          if (strain) {
            strainId = strain.id;
            strainName = strain.name;
            strainCache.set(row.strain, strain.id);
          } else {
            rowErrors.push(`Unknown strain: "${row.strain}"`);
            strainCache.set(row.strain, null);
          }
        }
      }

      if (rowErrors.length > 0) {
        errors.push({ row: row.rowNumber, sku: row.sku, errors: rowErrors });
      } else {
        rowsToInsert.push({ ...row, strainId, strainName });
      }
    }

    // If there are validation errors, return them without inserting
    if (errors.length > 0) {
      return NextResponse.json({
        success: false,
        totalRows: parsedRows.length,
        successCount: 0,
        errorCount: errors.length,
        errors,
        createdProducts: []
      }, { status: 400 });
    }

    // Insert all valid rows in a transaction
    const createdProducts: { sku: string; name: string; strainName?: string }[] = [];

    await prisma.$transaction(async (tx) => {
      for (const row of rowsToInsert) {
        const product = await tx.product.create({
          data: {
            name: row.name,
            sku: row.sku,
            unitOfMeasure: row.unit,
            reorderPoint: row.reorderPoint,
            leadTimeDays: 0,
            defaultBatchSize: row.defaultBatchSize,
            wholesalePrice: row.wholesalePrice,
            strainId: row.strainId,
            active: true
          }
        });
        createdProducts.push({
          sku: product.sku,
          name: product.name,
          strainName: row.strainName
        });
      }
    });

    // Log the import action
    await logAction({
      entityType: ActivityEntity.SYSTEM,
      entityId: 'product-import',
      action: 'products_imported',
      userId: session.user.id,
      summary: `Imported ${createdProducts.length} products from CSV`,
      metadata: { 
        count: createdProducts.length,
        products: createdProducts.slice(0, 10) // Log first 10 for reference
      },
      tags: ['product', 'import', 'csv']
    });

    return NextResponse.json({
      success: true,
      totalRows: parsedRows.length,
      successCount: createdProducts.length,
      errorCount: 0,
      errors: [],
      createdProducts
    });

  } catch (error) {
    console.error('Error importing products:', error);
    return NextResponse.json(
      { error: 'Failed to import products' },
      { status: 500 }
    );
  }
}

/**
 * Parse a CSV line, handling quoted values with commas
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }

  result.push(current.trim());
  return result;
}

