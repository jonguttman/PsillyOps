import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "psillyco@proton.me";
  const newPassword = "Leadwell123"; // change this
  const hash = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { email },
    data: { password: hash },
  });

  console.log("Admin password reset for", email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });