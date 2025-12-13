import { PrismaClient, MaterialCategory } from '@prisma/client';

const prisma = new PrismaClient();

// Mapping of strain short codes to full names
const STRAIN_NAME_MAP: Record<string, string> = {
  'PE': 'Penis Envy',
  'GT': 'Golden Teacher',
  'FMP': 'Full Moon Party',
  'APE': 'Albino Penis Envy',
  'AMZ': 'Amazonian',
  'ENIG': 'Enigma',
  'CAM': 'Cambodian',
  'CAMB': 'Cambodian'
};

// CSV data to import
const CSV_DATA = `name,sku,strain,unit,category,reorder_point,active
Penis Envy Dried Mushrooms,MAT-PE,PE,gram,raw_mushroom,200,TRUE
Golden Teacher Dried Mushrooms,MAT-GT,GT,gram,raw_mushroom,200,TRUE
Full Moon Party Dried Mushrooms,MAT-FMP,FMP,gram,raw_mushroom,200,TRUE
Albino Penis Envy Dried Mushrooms,MAT-APE,APE,gram,raw_mushroom,200,TRUE
Amazonian Dried Mushrooms,MAT-AMZ,AMZ,gram,raw_mushroom,200,TRUE
Enigma Dried Mushrooms,MAT-ENIG,ENIG,gram,raw_mushroom,200,TRUE
Cambodian Dried Mushrooms,MAT-CAM,CAM,gram,raw_mushroom,200,TRUE`;

interface MaterialRow {
  name: string;
  sku: string;
  strain: string;
  unit: string;
  category: string;
  reorder_point: string;
  active: string;
}

function parseCSV(csv: string): MaterialRow[] {
  const lines = csv.trim().split('\n');
  const headers = lines[0].split(',');
  
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const row: any = {};
    headers.forEach((header, index) => {
      row[header] = values[index];
    });
    return row as MaterialRow;
  });
}

function mapCategory(category: string): MaterialCategory {
  const categoryMap: Record<string, MaterialCategory> = {
    'raw_mushroom': MaterialCategory.RAW_MUSHROOM,
    'raw_botanical': MaterialCategory.RAW_BOTANICAL,
    'active_ingredient': MaterialCategory.ACTIVE_INGREDIENT,
    'excipient': MaterialCategory.EXCIPIENT,
    'flavoring': MaterialCategory.FLAVORING,
    'packaging': MaterialCategory.PACKAGING,
    'label': MaterialCategory.LABEL,
    'shipping': MaterialCategory.SHIPPING,
    'other': MaterialCategory.OTHER
  };
  
  return categoryMap[category.toLowerCase()] || MaterialCategory.OTHER;
}

async function ensureStrainExists(shortCode: string): Promise<string> {
  // Check if strain exists by shortCode
  let strain = await prisma.strain.findUnique({
    where: { shortCode }
  });

  // If not found by shortCode, try to find by name
  if (!strain) {
    const name = STRAIN_NAME_MAP[shortCode];
    if (name) {
      strain = await prisma.strain.findUnique({
        where: { name }
      });
      
      if (strain) {
        console.log(`  ℹ️  Found existing strain by name: ${name} (${strain.shortCode})`);
        return strain.id;
      }
    }
    
    // If still not found, create it
    console.log(`  ➕ Creating new strain: ${name || shortCode} (${shortCode})`);
    
    strain = await prisma.strain.create({
      data: {
        name: name || shortCode,
        shortCode,
        aliases: JSON.stringify([]),
        active: true
      }
    });
  }

  return strain.id;
}

async function importMaterial(row: MaterialRow): Promise<void> {
  const {
    name,
    sku,
    strain: strainCode,
    unit,
    category,
    reorder_point,
    active
  } = row;

  console.log(`\n📦 Processing: ${name} (${sku})`);

  // Ensure strain exists
  const strainId = await ensureStrainExists(strainCode);

  // Check if material already exists
  const existing = await prisma.rawMaterial.findUnique({
    where: { sku }
  });

  const materialData = {
    name,
    sku,
    unitOfMeasure: unit,
    category: mapCategory(category),
    reorderPoint: parseFloat(reorder_point),
    strainId,
    active: active.toUpperCase() === 'TRUE'
  };

  if (existing) {
    console.log(`  ♻️  Updating existing material...`);
    await prisma.rawMaterial.update({
      where: { sku },
      data: materialData
    });
    console.log(`  ✅ Updated: ${name}`);
  } else {
    console.log(`  ➕ Creating new material...`);
    await prisma.rawMaterial.create({
      data: materialData
    });
    console.log(`  ✅ Created: ${name}`);
  }
}

async function main() {
  console.log('🚀 Starting material import...\n');

  const rows = parseCSV(CSV_DATA);
  console.log(`Found ${rows.length} materials to import\n`);

  for (const row of rows) {
    try {
      await importMaterial(row);
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

