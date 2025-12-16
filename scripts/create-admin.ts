// scripts/create-admin.ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // 🔴 TEMPORARY — you set this once
  const password = "Leadwell123";

  const hash = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: {
      email: "psillyco@proton.me",
      name: "Admin",
      role: "ADMIN",
      password: hash, // ✅ MUST be the hash
    },
  });

  console.log("Admin user created");
}

main().finally(() => prisma.$disconnect());