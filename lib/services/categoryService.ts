// Product Category Service
// Handles CRUD operations for product categories

import { prisma } from '@/lib/db/prisma';
import { ActivityEntity } from '@prisma/client';
import { logAction } from './loggingService';

export interface CreateCategoryInput {
  name: string;
  description?: string;
  displayOrder?: number;
}

export interface UpdateCategoryInput {
  name?: string;
  description?: string;
  displayOrder?: number;
  active?: boolean;
}

export interface CategoryWithProductCount {
  id: string;
  name: string;
  description: string | null;
  displayOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  productCount: number;
}

/**
 * Create a new product category
 */
export async function createCategory(
  input: CreateCategoryInput,
  userId: string
): Promise<CategoryWithProductCount> {
  // Get the max displayOrder to auto-increment if not provided
  let displayOrder = input.displayOrder;
  if (displayOrder === undefined) {
    const maxOrder = await prisma.productCategory.aggregate({
      _max: { displayOrder: true }
    });
    displayOrder = (maxOrder._max.displayOrder ?? -1) + 1;
  }

  const category = await prisma.productCategory.create({
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      displayOrder,
    },
  });

  await logAction({
    entityType: ActivityEntity.PRODUCT_CATEGORY,
    entityId: category.id,
    action: 'category_created',
    userId,
    summary: `Created product category "${category.name}"`,
    after: {
      name: category.name,
      description: category.description,
      displayOrder: category.displayOrder,
    },
    tags: ['category', 'created']
  });

  return { ...category, productCount: 0 };
}

/**
 * Update an existing product category
 */
export async function updateCategory(
  id: string,
  input: UpdateCategoryInput,
  userId: string
): Promise<CategoryWithProductCount> {
  const existing = await prisma.productCategory.findUnique({
    where: { id },
    include: {
      _count: { select: { products: true } }
    }
  });

  if (!existing) {
    throw new Error('Category not found');
  }

  const updateData: Record<string, any> = {};
  if (input.name !== undefined) updateData.name = input.name.trim();
  if (input.description !== undefined) updateData.description = input.description?.trim() || null;
  if (input.displayOrder !== undefined) updateData.displayOrder = input.displayOrder;
  if (input.active !== undefined) updateData.active = input.active;

  const updated = await prisma.productCategory.update({
    where: { id },
    data: updateData,
    include: {
      _count: { select: { products: true } }
    }
  });

  await logAction({
    entityType: ActivityEntity.PRODUCT_CATEGORY,
    entityId: id,
    action: 'category_updated',
    userId,
    summary: `Updated product category "${updated.name}"`,
    before: {
      name: existing.name,
      description: existing.description,
      displayOrder: existing.displayOrder,
      active: existing.active,
    },
    after: {
      name: updated.name,
      description: updated.description,
      displayOrder: updated.displayOrder,
      active: updated.active,
    },
    tags: ['category', 'updated']
  });

  return {
    id: updated.id,
    name: updated.name,
    description: updated.description,
    displayOrder: updated.displayOrder,
    active: updated.active,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    productCount: updated._count.products,
  };
}

/**
 * Soft delete (deactivate) a category
 */
export async function deactivateCategory(
  id: string,
  userId: string
): Promise<{ success: boolean; message: string }> {
  const existing = await prisma.productCategory.findUnique({
    where: { id },
    include: {
      _count: { select: { products: true } }
    }
  });

  if (!existing) {
    throw new Error('Category not found');
  }

  await prisma.productCategory.update({
    where: { id },
    data: { active: false }
  });

  await logAction({
    entityType: ActivityEntity.PRODUCT_CATEGORY,
    entityId: id,
    action: 'category_deactivated',
    userId,
    summary: `Deactivated product category "${existing.name}" (${existing._count.products} products affected)`,
    before: { active: true },
    after: { active: false },
    tags: ['category', 'deactivated']
  });

  return {
    success: true,
    message: `Category "${existing.name}" has been deactivated. ${existing._count.products} products were in this category.`
  };
}

/**
 * Reactivate a previously deactivated category
 */
export async function reactivateCategory(
  id: string,
  userId: string
): Promise<CategoryWithProductCount> {
  const existing = await prisma.productCategory.findUnique({
    where: { id },
    include: {
      _count: { select: { products: true } }
    }
  });

  if (!existing) {
    throw new Error('Category not found');
  }

  const updated = await prisma.productCategory.update({
    where: { id },
    data: { active: true },
    include: {
      _count: { select: { products: true } }
    }
  });

  await logAction({
    entityType: ActivityEntity.PRODUCT_CATEGORY,
    entityId: id,
    action: 'category_reactivated',
    userId,
    summary: `Reactivated product category "${existing.name}"`,
    before: { active: false },
    after: { active: true },
    tags: ['category', 'reactivated']
  });

  return {
    id: updated.id,
    name: updated.name,
    description: updated.description,
    displayOrder: updated.displayOrder,
    active: updated.active,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    productCount: updated._count.products,
  };
}

/**
 * Reorder multiple categories at once (for drag-and-drop)
 */
export async function reorderCategories(
  orderedIds: string[],
  userId: string
): Promise<void> {
  // Update each category's displayOrder based on position in array
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.productCategory.update({
        where: { id },
        data: { displayOrder: index }
      })
    )
  );

  await logAction({
    entityType: ActivityEntity.PRODUCT_CATEGORY,
    entityId: 'bulk',
    action: 'categories_reordered',
    userId,
    summary: `Reordered ${orderedIds.length} product categories`,
    metadata: { orderedIds },
    tags: ['category', 'reordered', 'bulk']
  });
}

/**
 * Get all categories with product counts
 */
export async function getCategoriesWithProductCounts(
  activeOnly: boolean = true
): Promise<CategoryWithProductCount[]> {
  const categories = await prisma.productCategory.findMany({
    where: activeOnly ? { active: true } : undefined,
    include: {
      _count: { select: { products: true } }
    },
    orderBy: { displayOrder: 'asc' }
  });

  return categories.map(cat => ({
    id: cat.id,
    name: cat.name,
    description: cat.description,
    displayOrder: cat.displayOrder,
    active: cat.active,
    createdAt: cat.createdAt,
    updatedAt: cat.updatedAt,
    productCount: cat._count.products,
  }));
}

/**
 * Get a single category with its products
 */
export async function getCategoryWithProducts(categoryId: string) {
  const category = await prisma.productCategory.findUnique({
    where: { id: categoryId },
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
                select: { id: true, name: true, shortCode: true }
              }
            }
          }
        }
      }
    }
  });

  if (!category) {
    throw new Error('Category not found');
  }

  return {
    id: category.id,
    name: category.name,
    description: category.description,
    displayOrder: category.displayOrder,
    active: category.active,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
    products: category.products.map(p => p.product),
  };
}

/**
 * Check if a category name is already taken
 */
export async function isCategoryNameTaken(
  name: string,
  excludeId?: string
): Promise<boolean> {
  const existing = await prisma.productCategory.findFirst({
    where: {
      name: { equals: name.trim(), mode: 'insensitive' },
      id: excludeId ? { not: excludeId } : undefined
    }
  });
  return !!existing;
}
