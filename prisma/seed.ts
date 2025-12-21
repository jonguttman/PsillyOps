// PSILLYOPS SEED DATA - Comprehensive test data for all entities

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding users only...");

  const passwordHash = await bcrypt.hash("password123", 12);

  await prisma.user.createMany({
    data: [
      {
        name: "Admin User",
        email: "admin@psillyops.com",
        password: passwordHash,
        role: "ADMIN",
        active: true,
      },
      {
        name: "Production User",
        email: "production@psillyops.com",
        password: passwordHash,
        role: "PRODUCTION",
        active: true,
      },
      {
        name: "Warehouse User",
        email: "warehouse@psillyops.com",
        password: passwordHash,
        role: "WAREHOUSE",
        active: true,
      },
      {
        name: "Sales Rep",
        email: "rep@psillyops.com",
        password: passwordHash,
        role: "REP",
        active: true,
      },
    ],
    skipDuplicates: true,
  });

  console.log("✅ Users seeded");

  // Seed default lab
  console.log("🧪 Seeding default lab...");
  await prisma.lab.upsert({
    where: { id: 'default-lab' },
    update: {},
    create: {
      id: 'default-lab',
      name: 'Micro Quality Labs',
      location: 'Burbank, CA',
      description: 'Third-party purity testing laboratory',
      active: true,
    },
  });
  console.log("✅ Default lab seeded");

  // Seed default transparency copy
  console.log("📝 Seeding transparency copy...");
  const defaultCopy = [
    { key: 'TRANSPARENCY_PASS_COPY', value: 'This product has passed third-party purity testing.' },
    { key: 'TRANSPARENCY_PENDING_COPY', value: 'Testing results are pending for this product.' },
    { key: 'TRANSPARENCY_FAIL_COPY', value: 'This product did not pass testing and has been removed from distribution.' },
    { key: 'TRANSPARENCY_RAW_MATERIAL_COPY', value: 'Raw materials used in this product are sourced from verified suppliers.' },
    { key: 'TRANSPARENCY_FOOTER_COPY', value: 'We are committed to transparency and quality in every product we make.' },
  ];

  for (const config of defaultCopy) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: {},
      create: config,
    });
  }
  console.log("✅ Transparency copy seeded");

  console.log("Login:");
  console.log("admin@psillyops.com / password123");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });