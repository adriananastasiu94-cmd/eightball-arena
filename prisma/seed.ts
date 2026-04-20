import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("demo1234", 10);
  await prisma.user.upsert({
    where: { email: "demo@arena.gg" },
    update: {},
    create: {
      email: "demo@arena.gg",
      username: "DemoBreaker",
      passwordHash,
      playerStats: { create: {} }
    }
  });
}

main().finally(async () => prisma.$disconnect());