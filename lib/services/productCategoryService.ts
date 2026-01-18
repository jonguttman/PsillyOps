// Product-Category Assignment Service
// Handles many-to-many relationships between products and categories

import { prisma } from '@/lib/db/prisma';
import { ActivityEntity } from '@prisma/client';
import { logAction } from './loggingService';

export interface ProductWithCategories {
  id: string;
  name: string;
  sku: string;
  categories: Array<{
    id: string;
    name: string;
    description: string | null;
  }>;
}

export interface CatalogCategory {
  id: string;
  name: string;
  description: string | null;
  products: Array<{
    id: string;
    name: string;
    sku: string;
    wholesalePrice: number | null;
    publicImageUrl: string | null;
    strain: {
      id: string;
      name: string;
      shortCode: string;
    } | null;
  }>;
}

/**
 * Get categories assigned to a product
 */
export async function getProductCategories(productId: string) {
  const assignments = await prisma.productCategoryAssignment.findMany({
    where: { productId },
    include: {
      category: {
        select: {
          id: true,
          name: true,
          description: true,
          displayOrder: true,
          active: true,
        }
      }
    },
    orderBy: {
      category: { displayOrder: 'asc' }
    }
  });

  return assignments
    .filter(a => a.category.active)
    .map(a => a.category);
}

/**
 * Replace all category assignments for a product
 */
export async function assignProductToCategories(
  productId: string,
  categoryIds: string[],
  userId: string
): Promise<void> {
  // Get the product and current categories for logging
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { name: true, sku: true }
  });

  if (!product) {
    throw new Error('Product not found');
  }

  const currentAssignments = await prisma.productCategoryAssignment.findMany({
    where: { productId },
    include: { category: { select: { name: true } } }
  });

  const currentCategoryIds = currentAssignments.map(a => a.categoryId);

  // Use a transaction to delete old and create new assignments
  await prisma.$transaction([
    // Delete all existing assignments
    prisma.productCategoryAssignment.deleteMany({
      where: { productId }
    }),
    // Create new assignments
    ...categoryIds.map(categoryId =>
      prisma.productCategoryAssignment.create({
        data: { productId, categoryId }
      })
    )
  ]);

  // Get category names for logging
  const newCategories = await prisma.productCategory.findMany({
    where: { id: { in: categoryIds } },
    select: { name: true }
  });

  await logAction({
    entityType: ActivityEntity.PRODUCT,
    entityId: productId,
    action: 'categories_assigned',
    userId,
    summary: `Updated categories for "${product.name}" (${product.sku})`,
    before: {
      categoryIds: currentCategoryIds,
      categoryNames: currentAssignments.map(a => a.category.name)
    },
    after: {
      categoryIds,
      categoryNames: newCategories.map(c => c.name)
    },
    tags: ['product', 'category', 'assignment']
  });
}

/**
 * Bulk assign multiple products to a category
 */
export async function bulkAssignProductsToCategory(
  categoryId: string,
  productIds: string[],
  userId: string
): Promise<{ added: number; existing: number }> {
  const category = await prisma.productCategory.findUnique({
    where: { id: categoryId },
    select: { name: true }
  });

  if (!category) {
    throw new Error('Category not found');
  }

  // Check which products are already assigned
  const existingAssignments = await prisma.productCategoryAssignment.findMany({
    where: {
      categoryId,
      productId: { in: productIds }
    },
    select: { productId: true }
  });

  const existingProductIds = new Set(existingAssignments.map(a => a.productId));
  const newProductIds = productIds.filter(id => !existingProductIds.has(id));

  if (newProductIds.length > 0) {
    await prisma.productCategoryAssignment.createMany({
      data: newProductIds.map(productId => ({
        productId,
        categoryId
      }))
    });
  }

  await logAction({
    entityType: ActivityEntity.PRODUCT_CATEGORY,
    entityId: categoryId,
    action: 'products_bulk_assigned',
    userId,
    summary: `Added ${newProductIds.length} products to category "${category.name}"`,
    metadata: {
      categoryName: category.name,
      addedCount: newProductIds.length,
      alreadyExistedCount: existingProductIds.size,
      productIds: newProductIds
    },
    tags: ['category', 'bulk', 'assignment']
  });

  return {
    added: newProductIds.length,
    existing: existingProductIds.size
  };
}

/**
 * Bulk remove multiple products from a category
 */
export async function bulkRemoveProductsFromCategory(
  categoryId: string,
  productIds: string[],
  userId: string
): Promise<{ removed: number }> {
  const category = await prisma.productCategory.findUnique({
    where: { id: categoryId },
    select: { name: true }
  });

  if (!category) {
    throw new Error('Category not found');
  }

  const result = await prisma.productCategoryAssignment.deleteMany({
    where: {
      categoryId,
      productId: { in: productIds }
    }
  });

  await logAction({
    entityType: ActivityEntity.PRODUCT_CATEGORY,
    entityId: categoryId,
    action: 'products_bulk_removed',
    userId,
    summary: `Removed ${result.count} products from category "${category.name}"`,
    metadata: {
      categoryName: category.name,
      removedCount: result.count,
      productIds
    },
    tags: ['category', 'bulk', 'removed']
  });

  return { removed: result.count };
}

/**
 * Bulk assign with operation mode (add or replace)
 */
export async function bulkAssignCategories(
  assignments: Array<{ productId: string; categoryIds: string[] }>,
  mode: 'add' | 'replace',
  userId: string
): Promise<{ updated: number }> {
  let updatedCount = 0;

  for (const assignment of assignments) {
    if (mode === 'replace') {
      // Delete existing and add new
      await prisma.$transaction([
        prisma.productCategoryAssignment.deleteMany({
          where: { productId: assignment.productId }
        }),
        ...assignment.categoryIds.map(categoryId =>
          prisma.productCategoryAssignment.create({
            data: {
              productId: assignment.productId,
              categoryId
            }
          })
        )
      ]);
    } else {
      // Just add new (ignore existing)
      for (const categoryId of assignment.categoryIds) {
        await prisma.productCategoryAssignment.upsert({
          where: {
            productId_categoryId: {
              productId: assignment.productId,
              categoryId
            }
          },
          create: {
            productId: assignment.productId,
            categoryId
          },
          update: {} // No update needed, just ensure it exists
        });
      }
    }
    updatedCount++;
  }

  await logAction({
    entityType: ActivityEntity.PRODUCT_CATEGORY,
    entityId: 'bulk',
    action: 'bulk_assignment',
    userId,
    summary: `Bulk ${mode === 'replace' ? 'replaced' : 'added'} category assignments for ${updatedCount} products`,
    metadata: {
      mode,
      productCount: updatedCount,
      assignments
    },
    tags: ['category', 'bulk', 'assignment']
  });

  return { updated: updatedCount };
}

/**
 * Get catalog data - categories with their products, for retailer display
 * Only returns active categories and active products with at least one category
 */
export async function getCatalogData(): Promise<CatalogCategory[]> {
  const categories = await prisma.productCategory.findMany({
    where: { active: true },
    include: {
      products: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              wholesalePrice: true,
              publicImageUrl: true,
              active: true,
              strain: {
                select: {
                  id: true,
                  name: true,
                  shortCode: true,
                }
              }
            }
          }
        }
      }
    },
    orderBy: { displayOrder: 'asc' }
  });

  return categories.map(cat => ({
    id: cat.id,
    name: cat.name,
    description: cat.description,
    products: cat.products
      .filter(p => p.product.active) // Only active products
      .map(p => ({
        id: p.product.id,
        name: p.product.name,
        sku: p.product.sku,
        wholesalePrice: p.product.wholesalePrice,
        publicImageUrl: p.product.publicImageUrl,
        strain: p.product.strain,
      }))
  }));
}

/**
 * Get all products with their category assignments (for bulk assignment UI)
 */
export async function getProductsWithCategories(): Promise<ProductWithCategories[]> {
  const products = await prisma.product.findMany({
    where: { active: true },
    include: {
      categories: {
        include: {
          category: {
            select: {
              id: true,
              name: true,
              description: true,
              active: true,
            }
          }
        }
      }
    },
    orderBy: { name: 'asc' }
  });

  return products.map(p => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    categories: p.categories
      .filter(c => c.category.active)
      .map(c => ({
        id: c.category.id,
        name: c.category.name,
        description: c.category.description,
      }))
  }));
}
