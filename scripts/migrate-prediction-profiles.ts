/**
 * Migrate PredictionProfile to VibesProfile
 * 
 * Converts existing PredictionProfile records to the unified VibesProfile model.
 * All existing profiles become PSILLYOPS-owned profiles.
 * 
 * NOTE: PredictionProfile table is kept for backward compatibility.
 * This script creates VibesProfile records but does NOT delete PredictionProfile records.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting PredictionProfile to VibesProfile migration...");

  // Find all PredictionProfile records
  const predictionProfiles = await prisma.predictionProfile.findMany({
    where: {
      archivedAt: null, // Only migrate active profiles
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  console.log(`Found ${predictionProfiles.length} active PredictionProfile records`);

  let profilesMigrated = 0;
  let profilesSkipped = 0;

  for (const profile of predictionProfiles) {
    // Check if a VibesProfile already exists for this product and mode
    // Using productId as a unique identifier for PSILLYOPS profiles
    // (Note: In the new model, name is required, so we'll derive a name from the product)
    
    // Get product name for the profile name
    const product = await prisma.product.findUnique({
      where: { id: profile.productId },
      select: { name: true },
    });

    const profileName = product
      ? `${product.name} (${profile.experienceMode})`
      : `Product ${profile.productId} (${profile.experienceMode})`;

    // Check if VibesProfile already exists with this ownerType/ownerId/name combo
    const existing = await prisma.vibesProfile.findFirst({
      where: {
        ownerType: "PSILLYOPS",
        ownerId: null,
        name: profileName,
        mode: profile.experienceMode,
      },
    });

    if (existing) {
      console.log(`VibesProfile already exists for ${profileName}, skipping`);
      profilesSkipped++;
      continue;
    }

    // Convert PredictionProfile to VibesProfile format
    const predictions = {
      transcend: profile.transcend,
      energize: profile.energize,
      create: profile.create,
      transform: profile.transform,
      connect: profile.connect,
      vocabVersion: profile.vocabVersion,
    };

    // Create VibesProfile
    const vibesProfile = await prisma.vibesProfile.create({
      data: {
        ownerType: "PSILLYOPS",
        ownerId: null,
        name: profileName,
        mode: profile.experienceMode,
        predictions,
        active: true,
        createdAt: profile.createdAt,
      },
    });

    profilesMigrated++;
    console.log(
      `Migrated PredictionProfile ${profile.id} -> VibesProfile ${vibesProfile.id} (${profileName})`
    );

    // Note: We don't update ExperienceReview.predictionProfileId references
    // because PredictionProfile table is kept for backward compatibility.
    // The application code should be updated to use VibesProfile going forward.
  }

  console.log("\nMigration complete:");
  console.log(`  Profiles migrated: ${profilesMigrated}`);
  console.log(`  Profiles skipped (already exist): ${profilesSkipped}`);
  console.log("\nNOTE: PredictionProfile records were NOT deleted.");
  console.log("Update application code to use VibesProfile instead of PredictionProfile.");
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });

