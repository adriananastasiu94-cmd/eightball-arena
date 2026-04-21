import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TARGET_COINS = 100_000;
const TARGET_CASH = 100_000;

async function main() {
  const usersWithoutStats = await prisma.user.findMany({
    where: {
      playerStats: null
    },
    select: {
      id: true
    }
  });

  if (usersWithoutStats.length > 0) {
    await prisma.playerStats.createMany({
      data: usersWithoutStats.map((user) => ({
        userId: user.id,
        coins: TARGET_COINS,
        cash: TARGET_CASH
      }))
    });
  }

  const updateResult = await prisma.playerStats.updateMany({
    data: {
      coins: TARGET_COINS,
      cash: TARGET_CASH
    }
  });

  console.log(
    `Economy grant complete. Updated ${updateResult.count} players to ${TARGET_COINS} coins and ${TARGET_CASH} cash.`
  );
}

main()
  .catch((error) => {
    console.error("Economy grant failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
