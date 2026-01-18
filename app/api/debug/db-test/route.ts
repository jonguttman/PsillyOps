// Temporary debug endpoint to test database connection and enums
// DELETE THIS FILE after debugging

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    tests: {},
  };

  // Test 1: Basic connection
  try {
    const count = await prisma.user.count();
    results.tests = { ...results.tests as object, userCount: { success: true, count } };
  } catch (error) {
    results.tests = { ...results.tests as object, userCount: { success: false, error: String(error) } };
  }

  // Test 2: CatalogLink query (the failing page)
  try {
    const links = await prisma.catalogLink.findMany({ take: 1 });
    results.tests = { ...results.tests as object, catalogLink: { success: true, count: links.length } };
  } catch (error) {
    results.tests = { ...results.tests as object, catalogLink: { success: false, error: String(error) } };
  }

  // Test 3: ActivityEntity enum - try to query with CATALOG_LINK
  try {
    const logs = await prisma.activityLog.findMany({
      where: { entityType: 'CATALOG_LINK' },
      take: 1,
    });
    results.tests = { ...results.tests as object, activityLogCatalogLink: { success: true, count: logs.length } };
  } catch (error) {
    results.tests = { ...results.tests as object, activityLogCatalogLink: { success: false, error: String(error) } };
  }

  // Test 4: ProductCategory (new table)
  try {
    const categories = await prisma.productCategory.findMany({ take: 1 });
    results.tests = { ...results.tests as object, productCategory: { success: true, count: categories.length } };
  } catch (error) {
    results.tests = { ...results.tests as object, productCategory: { success: false, error: String(error) } };
  }

  // Test 5: Check if PRODUCT_CATEGORY enum works
  try {
    const logs = await prisma.activityLog.findMany({
      where: { entityType: 'PRODUCT_CATEGORY' },
      take: 1,
    });
    results.tests = { ...results.tests as object, activityLogProductCategory: { success: true, count: logs.length } };
  } catch (error) {
    results.tests = { ...results.tests as object, activityLogProductCategory: { success: false, error: String(error) } };
  }

  // Test 6: CatalogInquiry count (used in the failing page)
  try {
    const count = await prisma.catalogInquiry.count();
    results.tests = { ...results.tests as object, catalogInquiryCount: { success: true, count } };
  } catch (error) {
    results.tests = { ...results.tests as object, catalogInquiryCount: { success: false, error: String(error) } };
  }

  return NextResponse.json(results);
}
