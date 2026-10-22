import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

// Every sensitive change (clients, packages, sessions, status changes) is written here.
export async function audit(req: Request, action: string, entity: string, entityId?: string, details?: object) {
  await prisma.auditLog.create({
    data: {
      tenantId: req.auth.tenantId,
      userId: req.auth.userId,
      action,
      entity,
      entityId,
      details: details as Prisma.InputJsonValue | undefined,
    },
  });
}