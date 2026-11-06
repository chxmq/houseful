import { ethers } from "hardhat";
import { readDeployments } from "./lib/exportAbi";
import type { Houseful } from "../typechain-types";

interface SeedEvent {
  slug: string;
  faceValueEth: string;
  capacity: number;
  startsInHours: number;
}

const SEED_EVENTS: SeedEvent[] = [
  { slug: "prateek-kuhad-nesco", faceValueEth: "0.002", capacity: 120, startsInHours: 72 },
  { slug: "comedy-night-canvas-laugh-club", faceValueEth: "0.001", capacity: 2, startsInHours: 48 },
  { slug: "mumbai-indians-wankhede-screening", faceValueEth: "0.0015", capacity: 300, startsInHours: 96 },
  { slug: "ethglobal-mumbai-afterparty", faceValueEth: "0.0005", capacity: 3, startsInHours: 24 },
  { slug: "kala-ghoda-jazz-evening", faceValueEth: "0.0012", capacity: 60, startsInHours: 120 },
  { slug: "bandra-fort-sunset-sessions", faceValueEth: "0.0008", capacity: 40, startsInHours: 168 },
];

const HOUR = 3600;

async function main() {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (chainId !== 31337) throw new Error(`seed-local only runs against a local node, got chain ${chainId}`);
  const deployment = (await readDeployments())[chainId];
  if (!deployment) throw new Error("No local deployment found. Run pnpm deploy:local first.");

  const [host] = await ethers.getSigners();
  const houseful = (await ethers.getContractAt("Houseful", deployment.address, host)) as unknown as Houseful;
  const existing = Number(await houseful.eventCount());
  const now = (await ethers.provider.getBlock("latest"))!.timestamp;

  for (const [i, e] of SEED_EVENTS.entries()) {
    const eventId = i + 1;
    if (eventId <= existing) {
      console.log(`event ${eventId} already exists, skipping ${e.slug}`);
      continue;
    }
    const doors = now + e.startsInHours * HOUR;
    const tx = await houseful.createEvent({
      faceValue: ethers.parseEther(e.faceValueEth),
      capacity: e.capacity,
      saleStart: now - 60,
      surrenderCutoff: doors,
      endsAt: doors + 4 * HOUR,
      metadataURI: `houseful://events/${e.slug}`,
      metadataHash: ethers.id(e.slug),
    });
    await tx.wait();
    console.log(`event ${eventId}: ${e.slug} (${e.faceValueEth} ETH, ${e.capacity} seats)`);
  }
  console.log(`Seeded ${SEED_EVENTS.length} events on ${deployment.address}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
