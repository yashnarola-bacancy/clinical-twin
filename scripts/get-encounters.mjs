import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const encs = await db.encounter.findMany({
  where: { status: { in: ['CHECKED_IN', 'IN_EXAM', 'AWAITING_REVIEW'] } },
  select: { id: true, status: true, chiefComplaint: true, patient: { select: { firstName: true, lastName: true } } },
  orderBy: { checkInAt: 'desc' },
  take: 5,
});
console.log(JSON.stringify(encs, null, 2));
await db.$disconnect();
