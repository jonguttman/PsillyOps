// PSILLYOPS SEED DATA - Comprehensive test data for all entities

import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Clear existing data (in reverse order of dependencies)
  await prisma.activityLog.deleteMany();
  await prisma.productionRunStep.deleteMany();
  await prisma.productionRun.deleteMany();
  await prisma.productionStepTemplate.deleteMany();
  await prisma.qRToken.deleteMany();
  await prisma.qRRedirectRule.deleteMany();
  await prisma.inventoryAdjustment.deleteMany();
  await prisma.materialCostHistory.deleteMany();
  await prisma.materialAttachment.deleteMany();
  await prisma.batchMaker.deleteMany();
  await prisma.orderLineItem.deleteMany();
  await prisma.purchaseOrderLineItem.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.retailerOrder.deleteMany();
  await prisma.productionOrder.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.bOMItem.deleteMany();
  await prisma.materialVendor.deleteMany();
  await prisma.retailer.deleteMany();
  await prisma.product.deleteMany();
  await prisma.strain.deleteMany();
  await prisma.rawMaterial.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.location.deleteMany();
  await prisma.user.deleteMany();

  console.log('✅ Cleared existing data');

  // 1. CREATE USERS
  const passwordHash = await hash('password123', 10);

  const admin = await prisma.user.create({
    data: {
      name: 'Admin User',
      email: 'admin@psillyops.com',
      password: passwordHash,
      role: 'ADMIN',
      active: true
    }
  });

  const productionUser1 = await prisma.user.create({
    data: {
      name: 'John Production',
      email: 'john@psillyops.com',
      password: passwordHash,
      role: 'PRODUCTION',
      active: true
    }
  });

  const productionUser2 = await prisma.user.create({
    data: {
      name: 'Jane Maker',
      email: 'jane@psillyops.com',
      password: passwordHash,
      role: 'PRODUCTION',
      active: true
    }
  });

  const warehouseUser = await prisma.user.create({
    data: {
      name: 'Mike Warehouse',
      email: 'mike@psillyops.com',
      password: passwordHash,
      role: 'WAREHOUSE',
      active: true
    }
  });

  const rep1 = await prisma.user.create({
    data: {
      name: 'Sarah Sales',
      email: 'sarah@psillyops.com',
      password: passwordHash,
      role: 'REP',
      active: true
    }
  });

  const rep2 = await prisma.user.create({
    data: {
      name: 'Tom Rep',
      email: 'tom@psillyops.com',
      password: passwordHash,
      role: 'REP',
      active: true
    }
  });

  console.log('✅ Created users');

  // 2. CREATE VENDORS
  const vendor1 = await prisma.vendor.create({
    data: {
      name: 'Mushroom Supply Co',
      contactName: 'Alice Chen',
      contactEmail: 'orders@mushroomsupply.com',
      contactPhone: '555-0101',
      address: '123 Fungi Lane, Portland, OR 97201',
      paymentTerms: 'Net 30',
      defaultLeadTimeDays: 14,
      notes: 'Organic certified supplier. Preferred for botanical ingredients.',
      active: true
    }
  });

  const vendor2 = await prisma.vendor.create({
    data: {
      name: 'Capsule Depot',
      contactName: 'Bob Martinez',
      contactEmail: 'sales@capsuledepot.com',
      contactPhone: '555-0102',
      address: '456 Gelatin St, Chicago, IL 60601',
      paymentTerms: 'Net 15',
      defaultLeadTimeDays: 7,
      notes: 'Reliable capsule supplier with quick turnaround.',
      active: true
    }
  });

  const vendor3 = await prisma.vendor.create({
    data: {
      name: 'Label Masters',
      contactName: 'Carol Thompson',
      contactEmail: 'info@labelmasters.com',
      contactPhone: '555-0103',
      address: '789 Print Ave, Austin, TX 78701',
      paymentTerms: 'Net 30',
      defaultLeadTimeDays: 10,
      notes: 'Custom label printing. FDA-compliant materials.',
      active: true
    }
  });

  console.log('✅ Created vendors');

  // 3. CREATE RAW MATERIALS
  const lionsMane = await prisma.rawMaterial.create({
    data: {
      name: "Lion's Mane Mushroom Powder",
      sku: 'MAT-LIONS-001',
      unitOfMeasure: 'kg',
      category: 'RAW_BOTANICAL',
      description: 'Organic Lion\'s Mane (Hericium erinaceus) fruiting body powder. Standardized to 30% beta-glucans.',
      currentStockQty: 50,
      reorderPoint: 20,
      reorderQuantity: 100,
      moq: 10,
      leadTimeDays: 14,
      preferredVendorId: vendor1.id,
      active: true
    }
  });

  const reishi = await prisma.rawMaterial.create({
    data: {
      name: 'Reishi Mushroom Extract',
      sku: 'MAT-REISHI-001',
      unitOfMeasure: 'kg',
      category: 'ACTIVE_INGREDIENT',
      description: 'Dual-extracted Reishi (Ganoderma lucidum) 10:1 extract. High potency triterpenes.',
      currentStockQty: 30,
      reorderPoint: 15,
      reorderQuantity: 50,
      moq: 5,
      leadTimeDays: 14,
      preferredVendorId: vendor1.id,
      active: true
    }
  });

  const cordyceps = await prisma.rawMaterial.create({
    data: {
      name: 'Cordyceps Powder',
      sku: 'MAT-CORD-001',
      unitOfMeasure: 'kg',
      category: 'ACTIVE_INGREDIENT',
      description: 'Cordyceps militaris fruiting body powder. Lab-grown for consistency.',
      currentStockQty: 25,
      reorderPoint: 10,
      reorderQuantity: 50,
      moq: 5,
      leadTimeDays: 14,
      preferredVendorId: vendor1.id,
      active: true
    }
  });

  const capsules = await prisma.rawMaterial.create({
    data: {
      name: '000 Gelatin Capsules',
      sku: 'MAT-CAP-000',
      unitOfMeasure: 'pcs',
      category: 'PACKAGING',
      description: 'Size 000 clear gelatin capsules. Kosher certified.',
      currentStockQty: 50000,
      reorderPoint: 10000,
      reorderQuantity: 100000,
      moq: 10000,
      leadTimeDays: 7,
      preferredVendorId: vendor2.id,
      active: true
    }
  });

  const labels = await prisma.rawMaterial.create({
    data: {
      name: 'Product Labels (Hercules)',
      sku: 'MAT-LBL-HERC',
      unitOfMeasure: 'pcs',
      category: 'LABEL',
      description: 'Custom printed labels for Hercules product line. FDA-compliant.',
      currentStockQty: 5000,
      reorderPoint: 1000,
      reorderQuantity: 10000,
      moq: 1000,
      leadTimeDays: 10,
      preferredVendorId: vendor3.id,
      active: true
    }
  });

  const jars = await prisma.rawMaterial.create({
    data: {
      name: '60-count Plastic Jars',
      sku: 'MAT-JAR-60',
      unitOfMeasure: 'pcs',
      category: 'PACKAGING',
      description: '60cc HDPE plastic jars with child-resistant caps.',
      currentStockQty: 2000,
      reorderPoint: 500,
      reorderQuantity: 5000,
      moq: 500,
      leadTimeDays: 10,
      preferredVendorId: vendor3.id,
      active: true
    }
  });

  console.log('✅ Created raw materials');

  // 3.5. CREATE MATERIAL-VENDOR RELATIONSHIPS WITH PRICING
  await prisma.materialVendor.createMany({
    data: [
      // Lion's Mane vendors
      { materialId: lionsMane.id, vendorId: vendor1.id, lastPrice: 45.00, moq: 10, leadTimeDays: 14, preferred: true },
      // Reishi vendors
      { materialId: reishi.id, vendorId: vendor1.id, lastPrice: 65.00, moq: 5, leadTimeDays: 14, preferred: true },
      // Cordyceps vendors
      { materialId: cordyceps.id, vendorId: vendor1.id, lastPrice: 55.00, moq: 5, leadTimeDays: 14, preferred: true },
      // Capsules vendors
      { materialId: capsules.id, vendorId: vendor2.id, lastPrice: 0.02, moq: 10000, leadTimeDays: 7, preferred: true },
      // Labels vendors
      { materialId: labels.id, vendorId: vendor3.id, lastPrice: 0.08, moq: 1000, leadTimeDays: 10, preferred: true },
      // Jars vendors
      { materialId: jars.id, vendorId: vendor3.id, lastPrice: 0.35, moq: 500, leadTimeDays: 10, preferred: true }
    ]
  });

  console.log('✅ Created material-vendor relationships');

  // 3.6. CREATE MATERIAL COST HISTORY
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  await prisma.materialCostHistory.createMany({
    data: [
      // Lion's Mane price history
      { materialId: lionsMane.id, vendorId: vendor1.id, price: 42.00, source: 'PO', createdAt: ninetyDaysAgo },
      { materialId: lionsMane.id, vendorId: vendor1.id, price: 44.00, source: 'PO', createdAt: sixtyDaysAgo },
      { materialId: lionsMane.id, vendorId: vendor1.id, price: 45.00, source: 'PO', createdAt: thirtyDaysAgo },
      // Reishi price history
      { materialId: reishi.id, vendorId: vendor1.id, price: 60.00, source: 'PO', createdAt: sixtyDaysAgo },
      { materialId: reishi.id, vendorId: vendor1.id, price: 65.00, source: 'PO', createdAt: thirtyDaysAgo },
      // Capsules price history
      { materialId: capsules.id, vendorId: vendor2.id, price: 0.018, source: 'PO', createdAt: sixtyDaysAgo },
      { materialId: capsules.id, vendorId: vendor2.id, price: 0.02, source: 'PO', createdAt: thirtyDaysAgo }
    ]
  });

  console.log('✅ Created material cost history');

  // 3.7. CREATE MATERIAL ATTACHMENTS
  await prisma.materialAttachment.createMany({
    data: [
      {
        materialId: lionsMane.id,
        fileName: 'Lions_Mane_COA_2024.pdf',
        fileUrl: 'https://example.com/docs/lions-mane-coa-2024.pdf',
        fileType: 'COA'
      },
      {
        materialId: lionsMane.id,
        fileName: 'Lions_Mane_MSDS.pdf',
        fileUrl: 'https://example.com/docs/lions-mane-msds.pdf',
        fileType: 'MSDS'
      },
      {
        materialId: reishi.id,
        fileName: 'Reishi_Extract_COA_2024.pdf',
        fileUrl: 'https://example.com/docs/reishi-coa-2024.pdf',
        fileType: 'COA'
      },
      {
        materialId: cordyceps.id,
        fileName: 'Cordyceps_Spec_Sheet.pdf',
        fileUrl: 'https://example.com/docs/cordyceps-spec.pdf',
        fileType: 'SPEC'
      },
      {
        materialId: capsules.id,
        fileName: 'Gelatin_Capsules_MSDS.pdf',
        fileUrl: 'https://example.com/docs/capsules-msds.pdf',
        fileType: 'MSDS'
      }
    ]
  });

  console.log('✅ Created material attachments');

  // 4. CREATE LOCATIONS
  const receiving = await prisma.location.create({
    data: {
      name: 'Receiving Dock',
      type: 'internal',
      isDefaultReceiving: true,
      active: true
    }
  });

  const grinding = await prisma.location.create({
    data: {
      name: 'Grinding Station',
      type: 'internal',
      active: true
    }
  });

  const mixing = await prisma.location.create({
    data: {
      name: 'Mixing Station',
      type: 'internal',
      active: true
    }
  });

  const filling = await prisma.location.create({
    data: {
      name: 'Capsule Filling',
      type: 'internal',
      active: true
    }
  });

  const packaging = await prisma.location.create({
    data: {
      name: 'Packaging Area',
      type: 'internal',
      active: true
    }
  });

  const finishedGoods = await prisma.location.create({
    data: {
      name: 'Finished Goods Shelf A',
      type: 'internal',
      active: true
    }
  });

  const shipping = await prisma.location.create({
    data: {
      name: 'Shipping Staging',
      type: 'internal',
      isDefaultShipping: true,
      active: true
    }
  });

  console.log('✅ Created locations');

  // 4.5 CREATE STRAINS
  const strainPE = await prisma.strain.create({
    data: {
      name: 'Penis Envy',
      shortCode: 'PE',
      aliases: JSON.stringify(['P. Envy', 'PenisEnvy']),
      active: true
    }
  });

  const strainGT = await prisma.strain.create({
    data: {
      name: 'Golden Teacher',
      shortCode: 'GT',
      aliases: JSON.stringify(['GoldenTeacher']),
      active: true
    }
  });

  const strainAPE = await prisma.strain.create({
    data: {
      name: 'Albino Penis Envy',
      shortCode: 'APE',
      aliases: JSON.stringify(['Albino PE', 'AlbinoPenisEnvy']),
      active: true
    }
  });

  const strainFMP = await prisma.strain.create({
    data: {
      name: 'Full Moon Party',
      shortCode: 'FMP',
      aliases: JSON.stringify(['FullMoonParty']),
      active: true
    }
  });

  const strainLM = await prisma.strain.create({
    data: {
      name: 'Lions Mane',
      shortCode: 'LM',
      aliases: JSON.stringify(["Lion's Mane", 'LionsMane']),
      active: true
    }
  });

  const strainRE = await prisma.strain.create({
    data: {
      name: 'Reishi',
      shortCode: 'RE',
      aliases: JSON.stringify(['Ganoderma']),
      active: true
    }
  });

  const strainCORD = await prisma.strain.create({
    data: {
      name: 'Cordyceps',
      shortCode: 'CORD',
      aliases: JSON.stringify(['Cordyceps Militaris']),
      active: true
    }
  });

  const strainCHAG = await prisma.strain.create({
    data: {
      name: 'Chaga',
      shortCode: 'CHAG',
      aliases: JSON.stringify(['Inonotus obliquus']),
      active: true
    }
  });

  console.log('✅ Created strains');

  // 5. CREATE PRODUCTS
  const hercules = await prisma.product.create({
    data: {
      name: 'Hercules - Enigma Blend Capsules',
      sku: 'HERC-ENIG-001',
      unitOfMeasure: 'jar',
      defaultBatchSize: 100,
      leadTimeDays: 3,
      reorderPoint: 50,
      active: true
    }
  });

  const lionsManeProduct = await prisma.product.create({
    data: {
      name: "Lion's Mane Focus Capsules",
      sku: 'LIONS-FOCUS-001',
      unitOfMeasure: 'jar',
      defaultBatchSize: 100,
      leadTimeDays: 3,
      reorderPoint: 40,
      strainId: strainLM.id,
      active: true
    }
  });

  const reishiCalm = await prisma.product.create({
    data: {
      name: 'Reishi Calm Capsules',
      sku: 'REISHI-CALM-001',
      unitOfMeasure: 'jar',
      defaultBatchSize: 80,
      leadTimeDays: 3,
      reorderPoint: 30,
      strainId: strainRE.id,
      active: true
    }
  });

  const cordycepsEnergy = await prisma.product.create({
    data: {
      name: 'Cordyceps Energy Capsules',
      sku: 'CORD-ENERGY-001',
      unitOfMeasure: 'jar',
      defaultBatchSize: 80,
      leadTimeDays: 3,
      reorderPoint: 30,
      strainId: strainCORD.id,
      active: true
    }
  });

  const masterBlend = await prisma.product.create({
    data: {
      name: 'Master Blend Ultimate Capsules',
      sku: 'MASTER-ULT-001',
      unitOfMeasure: 'jar',
      defaultBatchSize: 50,
      leadTimeDays: 3,
      reorderPoint: 20,
      active: true
    }
  });

  // Mighty Caps product line with strain variants
  const mightyCapsPE = await prisma.product.create({
    data: {
      name: 'Mighty Caps - Penis Envy',
      sku: 'MC-PE',
      unitOfMeasure: 'jar',
      defaultBatchSize: 100,
      leadTimeDays: 3,
      reorderPoint: 25,
      wholesalePrice: 24.99,
      strainId: strainPE.id,
      active: true
    }
  });

  const mightyCapsGT = await prisma.product.create({
    data: {
      name: 'Mighty Caps - Golden Teacher',
      sku: 'MC-GT',
      unitOfMeasure: 'jar',
      defaultBatchSize: 100,
      leadTimeDays: 3,
      reorderPoint: 25,
      wholesalePrice: 24.99,
      strainId: strainGT.id,
      active: true
    }
  });

  const mightyCapsFMP = await prisma.product.create({
    data: {
      name: 'Mighty Caps - Full Moon Party',
      sku: 'MC-FMP',
      unitOfMeasure: 'jar',
      defaultBatchSize: 100,
      leadTimeDays: 3,
      reorderPoint: 25,
      wholesalePrice: 24.99,
      strainId: strainFMP.id,
      active: true
    }
  });

  console.log('✅ Created products');

  // 5.5 CREATE PRODUCTION STEP TEMPLATES (Phase 5.1)
  // Templates are editable and apply only to future runs.
  const defaultCapsuleSteps = (productId: string) => ([
    { productId, key: 'prep', label: 'Prep & Sanitize', order: 1, required: true },
    { productId, key: 'weigh', label: 'Weigh Materials', order: 2, required: true },
    { productId, key: 'mix', label: 'Mix / Blend', order: 3, required: true },
    { productId, key: 'encapsulate', label: 'Encapsulate', order: 4, required: true },
    { productId, key: 'pack', label: 'Package', order: 5, required: true },
    { productId, key: 'label', label: 'Label & Record', order: 6, required: true },
  ]);

  await prisma.productionStepTemplate.createMany({
    data: [
      ...defaultCapsuleSteps(hercules.id),
      ...defaultCapsuleSteps(lionsManeProduct.id),
      ...defaultCapsuleSteps(reishiCalm.id),
      ...defaultCapsuleSteps(cordycepsEnergy.id),
      ...defaultCapsuleSteps(masterBlend.id),
      ...defaultCapsuleSteps(mightyCapsPE.id),
      ...defaultCapsuleSteps(mightyCapsGT.id),
      ...defaultCapsuleSteps(mightyCapsFMP.id),
    ]
  });

  console.log('✅ Created production step templates');

  // 6. CREATE BILLS OF MATERIALS (BOMs)
  // Hercules BOM
  await prisma.bOMItem.createMany({
    data: [
      { productId: hercules.id, materialId: lionsMane.id, quantityPerUnit: 0.5, active: true },
      { productId: hercules.id, materialId: reishi.id, quantityPerUnit: 0.3, active: true },
      { productId: hercules.id, materialId: capsules.id, quantityPerUnit: 60, active: true },
      { productId: hercules.id, materialId: jars.id, quantityPerUnit: 1, active: true },
      { productId: hercules.id, materialId: labels.id, quantityPerUnit: 1, active: true }
    ]
  });

  // Lion's Mane Product BOM
  await prisma.bOMItem.createMany({
    data: [
      { productId: lionsManeProduct.id, materialId: lionsMane.id, quantityPerUnit: 0.8, active: true },
      { productId: lionsManeProduct.id, materialId: capsules.id, quantityPerUnit: 60, active: true },
      { productId: lionsManeProduct.id, materialId: jars.id, quantityPerUnit: 1, active: true }
    ]
  });

  // Reishi Calm BOM
  await prisma.bOMItem.createMany({
    data: [
      { productId: reishiCalm.id, materialId: reishi.id, quantityPerUnit: 0.7, active: true },
      { productId: reishiCalm.id, materialId: capsules.id, quantityPerUnit: 60, active: true },
      { productId: reishiCalm.id, materialId: jars.id, quantityPerUnit: 1, active: true }
    ]
  });

  // Cordyceps Energy BOM
  await prisma.bOMItem.createMany({
    data: [
      { productId: cordycepsEnergy.id, materialId: cordyceps.id, quantityPerUnit: 0.6, active: true },
      { productId: cordycepsEnergy.id, materialId: capsules.id, quantityPerUnit: 60, active: true },
      { productId: cordycepsEnergy.id, materialId: jars.id, quantityPerUnit: 1, active: true }
    ]
  });

  // Master Blend BOM
  await prisma.bOMItem.createMany({
    data: [
      { productId: masterBlend.id, materialId: lionsMane.id, quantityPerUnit: 0.4, active: true },
      { productId: masterBlend.id, materialId: reishi.id, quantityPerUnit: 0.3, active: true },
      { productId: masterBlend.id, materialId: cordyceps.id, quantityPerUnit: 0.3, active: true },
      { productId: masterBlend.id, materialId: capsules.id, quantityPerUnit: 60, active: true },
      { productId: masterBlend.id, materialId: jars.id, quantityPerUnit: 1, active: true }
    ]
  });

  console.log('✅ Created BOMs');

  // 7. CREATE MATERIAL INVENTORY
  await prisma.inventoryItem.createMany({
    data: [
      {
        type: 'MATERIAL',
        materialId: lionsMane.id,
        locationId: receiving.id,
        quantityOnHand: 50,
        unitOfMeasure: 'kg',
        status: 'AVAILABLE'
      },
      {
        type: 'MATERIAL',
        materialId: reishi.id,
        locationId: receiving.id,
        quantityOnHand: 30,
        unitOfMeasure: 'kg',
        status: 'AVAILABLE'
      },
      {
        type: 'MATERIAL',
        materialId: cordyceps.id,
        locationId: receiving.id,
        quantityOnHand: 25,
        unitOfMeasure: 'kg',
        status: 'AVAILABLE'
      },
      {
        type: 'MATERIAL',
        materialId: capsules.id,
        locationId: receiving.id,
        quantityOnHand: 50000,
        unitOfMeasure: 'pcs',
        status: 'AVAILABLE'
      },
      {
        type: 'MATERIAL',
        materialId: labels.id,
        locationId: packaging.id,
        quantityOnHand: 5000,
        unitOfMeasure: 'pcs',
        status: 'AVAILABLE'
      },
      {
        type: 'MATERIAL',
        materialId: jars.id,
        locationId: packaging.id,
        quantityOnHand: 2000,
        unitOfMeasure: 'pcs',
        status: 'AVAILABLE'
      }
    ]
  });

  console.log('✅ Created material inventory');

  // 8. CREATE BATCHES
  const batch1 = await prisma.batch.create({
    data: {
      productId: hercules.id,
      batchCode: 'HERC-ENIG-001-2024-12-01-A1',
      plannedQuantity: 100,
      actualQuantity: 98,
      status: 'RELEASED',
      productionDate: new Date('2024-12-01')
    }
  });

  await prisma.batchMaker.createMany({
    data: [
      { batchId: batch1.id, userId: productionUser1.id },
      { batchId: batch1.id, userId: productionUser2.id }
    ]
  });

  const batch2 = await prisma.batch.create({
    data: {
      productId: lionsManeProduct.id,
      batchCode: 'LIONS-FOCUS-001-2024-12-05-B2',
      plannedQuantity: 80,
      actualQuantity: 80,
      status: 'RELEASED',
      productionDate: new Date('2024-12-05')
    }
  });

  const batch3 = await prisma.batch.create({
    data: {
      productId: hercules.id,
      batchCode: 'HERC-ENIG-001-2024-12-10-C3',
      plannedQuantity: 100,
      status: 'IN_PROGRESS'
    }
  });

  console.log('✅ Created batches');

  // 9. CREATE FINISHED GOODS INVENTORY
  await prisma.inventoryItem.createMany({
    data: [
      {
        type: 'PRODUCT',
        productId: hercules.id,
        batchId: batch1.id,
        locationId: finishedGoods.id,
        quantityOnHand: 98,
        unitOfMeasure: 'jar',
        status: 'AVAILABLE'
      },
      {
        type: 'PRODUCT',
        productId: lionsManeProduct.id,
        batchId: batch2.id,
        locationId: finishedGoods.id,
        quantityOnHand: 80,
        unitOfMeasure: 'jar',
        status: 'AVAILABLE'
      }
    ]
  });

  console.log('✅ Created finished goods inventory');

  // 9.5 CREATE A RECENT MANUAL INVENTORY ADJUSTMENT (for Supply Watch + Activity correlation)
  // Pick the first material inventory item (lion's mane) and apply a small correction.
  const lionsManeInventory = await prisma.inventoryItem.findFirst({
    where: { materialId: lionsMane.id, type: 'MATERIAL' }
  });

  if (lionsManeInventory) {
    const deltaQty = -5;
    const beforeQty = lionsManeInventory.quantityOnHand;
    const afterQty = beforeQty + deltaQty;

    await prisma.$transaction([
      prisma.inventoryAdjustment.create({
        data: {
          inventoryId: lionsManeInventory.id,
          deltaQty,
          reason: 'Cycle count correction (seed)',
          adjustmentType: 'MANUAL_CORRECTION',
          relatedEntityType: 'INVENTORY',
          relatedEntityId: lionsManeInventory.id,
          createdById: warehouseUser.id,
          createdAt: new Date(),
        }
      }),
      prisma.inventoryItem.update({
        where: { id: lionsManeInventory.id },
        data: { quantityOnHand: afterQty }
      }),
      prisma.rawMaterial.update({
        where: { id: lionsMane.id },
        data: { currentStockQty: { increment: deltaQty } }
      }),
      prisma.activityLog.create({
        data: {
          entityType: 'INVENTORY',
          entityId: lionsManeInventory.id,
          action: 'inventory_adjusted',
          userId: warehouseUser.id,
          summary: `Inventory adjusted -5 units (manual correction)`,
          diff: {
            quantityOnHand: [beforeQty, afterQty],
            deltaQty: [0, deltaQty],
          },
          details: {
            inventoryId: lionsManeInventory.id,
            itemName: "Lion's Mane Mushroom Powder",
            deltaQty,
            beforeQty,
            afterQty,
            reason: 'Cycle count correction (seed)',
            adjustmentType: 'MANUAL_CORRECTION',
          },
          tags: ['inventory', 'adjustment', 'quantity_change', 'manual_correction'],
          createdAt: new Date(),
        }
      }),
    ]);
  }

  // 10. CREATE RETAILERS
  const retailer1 = await prisma.retailer.create({
    data: {
      name: 'Wellness Hub Portland',
      contactEmail: 'orders@wellnesshub.com',
      contactPhone: '555-1001',
      shippingAddress: '100 Pearl District, Portland, OR 97209',
      billingAddress: '100 Pearl District, Portland, OR 97209',
      salesRepId: rep1.id,
      active: true
    }
  });

  const retailer2 = await prisma.retailer.create({
    data: {
      name: 'Natural Foods Co-op',
      contactEmail: 'purchasing@naturalfoods.com',
      contactPhone: '555-1002',
      shippingAddress: '200 Organic Way, Seattle, WA 98101',
      billingAddress: '200 Organic Way, Seattle, WA 98101',
      salesRepId: rep1.id,
      active: true
    }
  });

  const retailer3 = await prisma.retailer.create({
    data: {
      name: 'Holistic Health Store',
      contactEmail: 'orders@holistichealth.com',
      contactPhone: '555-1003',
      shippingAddress: '300 Wellness Blvd, San Francisco, CA 94102',
      billingAddress: '300 Wellness Blvd, San Francisco, CA 94102',
      salesRepId: rep2.id,
      active: true
    }
  });

  console.log('✅ Created retailers');

  // 11. CREATE SAMPLE ORDERS
  const order1 = await prisma.retailerOrder.create({
    data: {
      orderNumber: 'ORD-2024-12-001',
      retailerId: retailer1.id,
      createdByUserId: rep1.id,
      status: 'DRAFT',
      requestedShipDate: new Date('2024-12-20'),
      lineItems: {
        create: [
          {
            productId: hercules.id,
            quantityOrdered: 50
          },
          {
            productId: lionsManeProduct.id,
            quantityOrdered: 30
          }
        ]
      }
    }
  });

  const order2 = await prisma.retailerOrder.create({
    data: {
      orderNumber: 'ORD-2024-12-002',
      retailerId: retailer2.id,
      createdByUserId: rep1.id,
      status: 'SUBMITTED',
      requestedShipDate: new Date('2024-12-18'),
      lineItems: {
        create: [
          {
            productId: hercules.id,
            quantityOrdered: 40,
            quantityAllocated: 40,
            allocationDetails: [
              {
                inventoryId: 'placeholder',
                batchId: batch1.id,
                quantity: 40
              }
            ]
          }
        ]
      }
    }
  });

  console.log('✅ Created sample orders');

  // 12. CREATE SAMPLE PRODUCTION ORDER
  await prisma.productionOrder.create({
    data: {
      orderNumber: 'PROD-2024-12-001',
      productId: hercules.id,
      quantityToMake: 100,
      status: 'IN_PROGRESS',
      dueDate: new Date('2024-12-15'),
      createdByUserId: admin.id
    }
  });

  console.log('✅ Created production order');

  // 13. CREATE SAMPLE PURCHASE ORDER
  await prisma.purchaseOrder.create({
    data: {
      poNumber: 'PO-2024-12-001',
      vendorId: vendor1.id,
      status: 'SENT',
      createdByUserId: admin.id,
      sentAt: new Date('2024-12-01'),
      expectedDeliveryDate: new Date('2024-12-15'),
      lineItems: {
        create: [
          {
            materialId: lionsMane.id,
            quantityOrdered: 100,
            quantityReceived: 50,
            unitCost: 45.00
          },
          {
            materialId: reishi.id,
            quantityOrdered: 50,
            quantityReceived: 0,
            unitCost: 65.00
          }
        ]
      }
    }
  });

  console.log('✅ Created purchase order');

  console.log('');
  console.log('🎉 Seed completed successfully!');
  console.log('');
  console.log('📧 Test login credentials:');
  console.log('   Admin:      admin@psillyops.com / password123');
  console.log('   Production: john@psillyops.com / password123');
  console.log('   Warehouse:  mike@psillyops.com / password123');
  console.log('   Rep:        sarah@psillyops.com / password123');
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

