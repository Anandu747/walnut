import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http';

const sign = (userId: string, tenantId: string, role: Role) =>
  jwt.sign({ userId, tenantId, role }, process.env.JWT_SECRET!, { expiresIn: '8h' });
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const r = Router();

// SaaS self-signup: creates a new centre (tenant) + first branch + its super admin.
r.post('/register-tenant', async (req, res) => {
  const b = z.object({
    tenantName: z.string().min(2), name: z.string().min(1), email: z.string().email(), password: z.string().min(12),
  }).parse(req.body);
  const slug = slugify(b.tenantName);
  if (await prisma.tenant.findUnique({ where: { slug } })) throw new HttpError(409, 'Centre name already taken');
  const passwordHash = await bcrypt.hash(b.password, 12);
  const { tenant, user } = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({ data: { name: b.tenantName, slug } });
    await tx.branch.create({ data: { tenantId: tenant.id, name: 'Main Branch' } });
    const user = await tx.user.create({ data: { tenantId: tenant.id, email: b.email, name: b.name, passwordHash, role: 'SUPER_ADMIN' } });
    return { tenant, user };
  });
  res.status(201).json({ token: sign(user.id, tenant.id, user.role), tenantSlug: tenant.slug });
});

r.post('/login', async (req, res) => {
  const b = z.object({ tenantSlug: z.string(), email: z.string().email(), password: z.string() }).parse(req.body);
  const tenant = await prisma.tenant.findUnique({ where: { slug: b.tenantSlug } });
  const user = tenant && (await prisma.user.findUnique({ where: { tenantId_email: { tenantId: tenant.id, email: b.email } } }));
  if (!tenant || !user || !user.active || !(await bcrypt.compare(b.password, user.passwordHash)))
    throw new HttpError(401, 'Invalid credentials');
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  res.json({ token: sign(user.id, tenant.id, user.role), user: { id: user.id, name: user.name, role: user.role, designation: user.designation }, tenant: { name: tenant.name, slug: tenant.slug } });
});

export default r;