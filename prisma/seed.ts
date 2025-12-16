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