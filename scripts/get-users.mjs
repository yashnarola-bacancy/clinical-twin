import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const users = await db.user.findMany({ select: { id: true, name: true, role: true } });
console.table(users);
await db.$disconnect();
