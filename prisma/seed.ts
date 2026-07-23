import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CHANNELS = [
  { slug: "general", name: "general", description: "Cohort-wide chatter and announcements" },
  { slug: "week-2", name: "week-2", description: "This week's builds, blockers, and demos" },
  { slug: "help", name: "help", description: "Stuck on something? Ask the room." },
  { slug: "showcase", name: "showcase", description: "Ship it and show it off." },
];

async function main() {
  for (const channel of CHANNELS) {
    await prisma.channel.upsert({
      where: { slug: channel.slug },
      update: {},
      create: channel,
    });
  }
  console.log(`Seeded ${CHANNELS.length} channels (#${CHANNELS.map((c) => c.slug).join(", #")}).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
