import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Mapping of strain short codes to full names
const STRAIN_NAME_MAP: Record<string, string> = {
  'PE': 'Penis Envy',
  'GT': 'Golden Teacher',
  'FMP': 'Full Moon Party',
  'APE': 'Albino Penis Envy',
  'AMZ': 'Amazonian',
  'ENIG': 'Enigma'
};

// CSV data to import
const CSV_DATA = `name,sku,strain,category,unit,reorder_point,wholesale_price,active
Mighty Caps - Penis Envy,MC-PE,PE,1g capsules,unit,20,5.00,true
Mighty Caps - Golden Teacher,MC-GT,GT,1g capsules,unit,20,5.00,true
Mighty Caps - Full Moon Party,MC-FMP,FMP,1g capsules,unit,20,5.00,true
Mighty Caps - Albino Penis Envy,MC-APE,APE,1g capsules,unit,20,5.00,true
Mighty Caps - Amazonian,MC-AMZ,AMZ,1g capsules,unit,20,5.00,true
Mighty Caps - Enigma,MC-ENIG,ENIG,1g capsules,unit,20,6.00,true`;

interface ProductRow {
  name: string;
  sku: string;
  strain: string;
  category: string;
  unit: string;
  reorder_point: string;
  wholesale_price: string;
  active: string;
}

function parseCSV(csv: string): ProductRow[] {
  const lines = csv.trim().split('\n');
  const headers = lines[0].split(',');
  
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const row: any = {};
    headers.forEach((header, index) => {
      row[header] = values[index];
    });
    return row as ProductRow;
  });
}

async function ensureStrainExists(shortCode: string): Promise<string> {
  // Check if strain exists
  let strain = await prisma.strain.findUnique({
    where: { shortCode }
  });

  // If not, create it
  if (!strain) {
    const name = STRAIN_NAME_MAP[shortCode] || shortCode;
    console.log(`  ➕ Creating new strain: ${name} (${shortCode})`);
    
    strain = await prisma.strain.create({
      data: {
        name,
        shortCode,
        aliases: JSON.stringify([]),
        active: true
      }
    });
  }

  return strain.id;
}

async function importProduct(row: ProductRow): Promise<void> {
  const {
    name,
    sku,
    strain: strainCode,
    unit,
    reorder_point,
    wholesale_price,
    active
  } = row;

  console.log(`\n📦 Processing: ${name} (${sku})`);

  // Ensure strain exists
  const strainId = await ensureStrainExists(strainCode);

  // Check if product already exists
  const existing = await prisma.product.findUnique({
    where: { sku }
  });

  const productData = {
    name,
    sku,
    unitOfMeasure: unit,
    reorderPoint: parseInt(reorder_point, 10),
    wholesalePrice: parseFloat(wholesale_price),
    strainId,
    active: active === 'true'
  };

  if (existing) {
    console.log(`  ♻️  Updating existing product...`);
    await prisma.product.update({
      where: { sku },
      data: productData
    });
    console.log(`  ✅ Updated: ${name}`);
  } else {
    console.log(`  ➕ Creating new product...`);
    await prisma.product.create({
      data: productData
    });
    console.log(`  ✅ Created: ${name}`);
  }
}

async function main() {
  console.log('🚀 Starting product import...\n');

  const rows = parseCSV(CSV_DATA);
  console.log(`Found ${rows.length} products to import\n`);

  for (const row of rows) {
    try {
      await importProduct(row);
    } catch (error) {
      console.error(`❌ Error importing ${row.name}:`, error);
      throw error;
    }
  }

  console.log('\n✨ Import completed successfully!');
}

main()
  .catch((error) => {
    console.error('❌ Import failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

