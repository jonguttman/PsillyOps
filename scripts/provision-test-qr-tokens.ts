/**
 * Script to provision test QR tokens for internal API testing
 * 
 * Usage: tsx scripts/provision-test-qr-tokens.ts
 * 
 * Safety: Only creates tokens, does NOT touch products or create redirects
 */

import { PrismaClient } from '@prisma/client';
import { createToken } from '../lib/services/qrTokenService';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Finding staging products...\n');

  // Get 3 active products from staging
  const products = await prisma.product.findMany({
    where: { active: true },
    select: { id: true, name: true, sku: true },
    take: 3,
    orderBy: { createdAt: 'desc' }
  });

  if (products.length === 0) {
    console.error('❌ No active products found in staging database');
    process.exit(1);
  }

  console.log('✅ Found products:');
  products.forEach((p, i) => {
    console.log(`   ${i + 1}. ${p.name} (${p.sku}) - ${p.id}`);
  });
  console.log();

  // Create test tokens
  const tokens: Array<{
    token: string;
    entityType: string;
    entityId: string;
    status: string;
    description: string;
  }> = [];

  // 1. Create 3 ACTIVE tokens for products
  console.log('🎫 Creating ACTIVE test tokens...\n');
  
  for (let i = 0; i < Math.min(3, products.length); i++) {
    const product = products[i];
    const qrToken = await createToken({
      entityType: 'PRODUCT',
      entityId: product.id
    });

    tokens.push({
      token: qrToken.token,
      entityType: 'PRODUCT',
      entityId: product.id,
      status: 'ACTIVE',
      description: `${product.name} (${product.sku})`
    });

    console.log(`   ✓ Created: ${qrToken.token} → ${product.name}`);
  }

  // 2. Create 1 REVOKED token
  console.log('\n🚫 Creating REVOKED test token...\n');
  
  const revokeProduct = products[0]; // Reuse first product
  const revokedToken = await createToken({
    entityType: 'PRODUCT',
    entityId: revokeProduct.id
  });

  // Update to REVOKED status
  await prisma.qRToken.update({
    where: { id: revokedToken.id },
    data: {
      status: 'REVOKED',
      revokedAt: new Date(),
      revokedReason: 'Test token for API validation'
    }
  });

  tokens.push({
    token: revokedToken.token,
    entityType: 'PRODUCT',
    entityId: revokeProduct.id,
    status: 'REVOKED',
    description: `${revokeProduct.name} (REVOKED for testing)`
  });

  console.log(`   ✓ Created and revoked: ${revokedToken.token}`);

  // 3. Document a non-existent token format
  const nonExistentToken = 'qr_NONEXISTENT_TEST_TOKEN_INVALID';

  console.log('\n📋 Test Token Summary');
  console.log('='.repeat(80));
  console.log();
  console.log('ACTIVE TOKENS (200 response expected):');
  tokens
    .filter(t => t.status === 'ACTIVE')
    .forEach((t, i) => {
      console.log(`\n${i + 1}. Token: ${t.token}`);
      console.log(`   Entity: ${t.entityType}`);
      console.log(`   ID: ${t.entityId}`);
      console.log(`   Description: ${t.description}`);
    });

  console.log('\n\nREVOKED TOKEN (410 response expected):');
  const revoked = tokens.find(t => t.status === 'REVOKED');
  if (revoked) {
    console.log(`\nToken: ${revoked.token}`);
    console.log(`Entity: ${revoked.entityType}`);
    console.log(`ID: ${revoked.entityId}`);
    console.log(`Description: ${revoked.description}`);
  }

  console.log('\n\nNON-EXISTENT TOKEN (404 response expected):');
  console.log(`\nToken: ${nonExistentToken}`);
  console.log('Entity: N/A (does not exist)');
  console.log('ID: N/A');
  console.log('Description: Invalid token format for 404 testing');

  console.log('\n' + '='.repeat(80));
  console.log('✅ Test tokens provisioned successfully');
  console.log('\nSafety: These tokens were created for testing only.');
  console.log('No products were modified, no redirects were created.\n');
}

main()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

