import { Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http';

type Tx = Prisma.TransactionClient;
export const LIVE = ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'] as const;
const MIN = 60_000;

export type BookingInput = {
  clientId: string; treatmentId: string; therapistId?: string; machineId?: string; roomId?: string;
  startAt: Date; clientPackageItemId?: string; notes?: string; status?: 'SCHEDULED' | 'CONFIRMED';
};

type Slot = { startAt: Date; endAt: Date; therapistId?: string | null; machineId?: string | null; roomId?: string | null; clientId?: string; excludeId?: string };

// Minutes from local midnight. Server runs in the centre's timezone (set TZ=Asia/Dubai in production).
const minuteOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

/** Which of therapist / machine / room / client are already taken (appointments or downtime blocks) in [startAt, endAt). */
export async function busyResources(tx: Tx, tenantId: string, s: Slot) {
  const or: Prisma.AppointmentWhereInput[] = [];
  if (s.therapistId) or.push({ therapistId: s.therapistId });
  if (s.machineId) or.push({ machineId: s.machineId });
  if (s.roomId) or.push({ roomId: s.roomId });
  if (s.clientId) or.push({ clientId: s.clientId });
  const ids = [s.therapistId, s.machineId, s.roomId].filter(Boolean) as string[];
  const [appts, blocks] = await Promise.all([
    or.length ? tx.appointment.findMany({
      where: { tenantId, status: { in: [...LIVE] }, startAt: { lt: s.endAt }, endAt: { gt: s.startAt }, OR: or, ...(s.excludeId && { id: { not: s.excludeId } }) },
      select: { therapistId: true, machineId: true, roomId: true, clientId: true },
    }) : [],
    ids.length ? tx.resourceBlock.findMany({ where: { tenantId, resourceId: { in: ids }, startAt: { lt: s.endAt }, endAt: { gt: s.startAt } } }) : [],
  ]);
  const busy = new Set<string>();
  for (const c of appts) {
    if (s.therapistId && c.therapistId === s.therapistId) busy.add('therapist');
    if (s.machineId && c.machineId === s.machineId) busy.add('machine');
    if (s.roomId && c.roomId === s.roomId) busy.add('room');
    if (s.clientId && c.clientId === s.clientId) busy.add('client');
  }
  for (const b of blocks) {
    if (b.resourceId === s.therapistId) busy.add('therapist (on leave/blocked)');
    if (b.resourceId === s.machineId) busy.add(`machine (${b.reason})`);
    if (b.resourceId === s.roomId) busy.add(`room (${b.reason})`);
  }
  return busy;
}

/**
 * Finds every therapist / machine / room that could take this treatment at `startAt`.
 * Used for the booking form ("who is free?") and to auto-allocate when the receptionist leaves a field on "Auto".
 */
export async function suggestResources(tx: Tx, tenantId: string, treatmentId: string, startAt: Date, excludeId?: string) {
  const [tenant, treatment] = await Promise.all([
    tx.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    tx.treatment.findFirst({ where: { id: treatmentId, tenantId } }),
  ]);
  if (!treatment) throw new HttpError(404, 'Treatment not found');
  const endAt = new Date(startAt.getTime() + (treatment.durationMin + treatment.bufferMin) * MIN);
  const inHours = minuteOfDay(startAt) >= tenant.openMin && minuteOfDay(startAt) + treatment.durationMin <= tenant.closeMin;

  const [therapists, machines, rooms, appts, blocks] = await Promise.all([
    tx.user.findMany({ where: { tenantId, active: true, skills: { some: { treatmentId } } }, select: { id: true, name: true, gender: true } }),
    treatment.machineTypeId
      ? tx.machine.findMany({ where: { tenantId, machineTypeId: treatment.machineTypeId, status: 'OPERATIONAL' }, select: { id: true, code: true, roomId: true }, orderBy: { code: 'asc' } })
      : Promise.resolve([]),
    tx.room.findMany({ where: { tenantId, active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    tx.appointment.findMany({
      where: { tenantId, status: { in: [...LIVE] }, startAt: { lt: endAt }, endAt: { gt: startAt }, ...(excludeId && { id: { not: excludeId } }) },
      select: { therapistId: true, machineId: true, roomId: true },
    }),
    tx.resourceBlock.findMany({ where: { tenantId, startAt: { lt: endAt }, endAt: { gt: startAt } }, select: { resourceId: true } }),
  ]);
  const taken = new Set([...appts.flatMap((a) => [a.therapistId, a.machineId, a.roomId]), ...blocks.map((b) => b.resourceId)].filter(Boolean) as string[]);
  const freeTherapists = therapists.filter((t) => !taken.has(t.id));
  const freeMachines = machines.filter((m) => !taken.has(m.id));
  const freeRooms = rooms.filter((r) => !taken.has(r.id));
  // Prefer a machine whose home room is free, so heavy equipment does not have to move.
  const machine = treatment.machineTypeId ? freeMachines.find((m) => m.roomId && freeRooms.some((r) => r.id === m.roomId)) ?? freeMachines[0] : undefined;
  const room = freeRooms.find((r) => r.id === machine?.roomId) ?? freeRooms[0];
  const ok = inHours && freeTherapists.length > 0 && !!room && (!treatment.machineTypeId || !!machine);
  return {
    treatment, startAt, endAt, inHours, ok,
    therapists: freeTherapists, machines: freeMachines, rooms: freeRooms,
    best: ok ? { therapistId: freeTherapists[0].id, machineId: machine?.id, roomId: room!.id } : null,
  };
}

/** Next N start times (same day onwards, up to 7 days) where a full therapist + machine + room combination is free. */
export async function nextAvailableSlots(tenantId: string, treatmentId: string, from: Date, count = 6, therapistId?: string) {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const out: { startAt: Date; therapists: { id: string; name: string }[] }[] = [];
  const cursor = new Date(from);
  cursor.setSeconds(0, 0);
  cursor.setMinutes(Math.ceil(cursor.getMinutes() / tenant.slotMin) * tenant.slotMin);
  const limit = from.getTime() + 7 * 86_400_000;
  while (out.length < count && cursor.getTime() < limit) {
    const m = minuteOfDay(cursor);
    if (m < tenant.openMin) cursor.setHours(0, tenant.openMin, 0, 0);
    else if (m >= tenant.closeMin) { cursor.setDate(cursor.getDate() + 1); cursor.setHours(0, tenant.openMin, 0, 0); }
    else {
      const s = await suggestResources(prisma, tenantId, treatmentId, new Date(cursor));
      const t = therapistId ? s.therapists.filter((x) => x.id === therapistId) : s.therapists;
      if (s.ok && t.length) out.push({ startAt: new Date(cursor), therapists: t });
      cursor.setMinutes(cursor.getMinutes() + tenant.slotMin);
    }
  }
  return out;
}

async function validateAndResolve(tx: Tx, tenantId: string, input: BookingInput, excludeId?: string) {
  const s = await suggestResources(tx, tenantId, input.treatmentId, input.startAt, excludeId);
  const { treatment, endAt } = s;
  if (!s.inHours) throw new HttpError(409, 'Outside centre working hours for this treatment duration');
  // An explicitly chosen therapist must be qualified — say so before any "nothing free" message.
  if (input.therapistId && !(await tx.therapistSkill.findFirst({ where: { userId: input.therapistId, treatmentId: treatment.id, user: { tenantId } } }))) {
    const u = await tx.user.findFirst({ where: { id: input.therapistId, tenantId }, select: { name: true } });
    throw new HttpError(409, `${u?.name ?? 'This therapist'} is not qualified for ${treatment.name}`);
  }

  // "Auto" fields are filled from the first free compatible resource.
  const therapistId = input.therapistId ?? s.best?.therapistId;
  const machineId = treatment.machineTypeId ? input.machineId ?? s.best?.machineId : undefined;
  const roomId = input.roomId ?? s.best?.roomId;
  if (!therapistId) throw new HttpError(409, 'No qualified therapist is free in this slot');
  if (treatment.machineTypeId && !machineId) throw new HttpError(409, `No ${treatment.name} machine is free in this slot`);
  if (!roomId) throw new HttpError(409, 'No treatment room is free in this slot');

  const [therapist, machine, room, client] = await Promise.all([
    tx.user.findFirst({ where: { id: therapistId, tenantId, active: true }, include: { skills: { where: { treatmentId: treatment.id } } } }),
    machineId ? tx.machine.findFirst({ where: { id: machineId, tenantId } }) : Promise.resolve(null),
    tx.room.findFirst({ where: { id: roomId, tenantId } }),
    tx.client.findFirst({ where: { id: input.clientId, tenantId } }),
  ]);
  if (!therapist || !room || !client || (machineId && !machine)) throw new HttpError(404, 'Client, therapist, machine or room not found');
  if (!therapist.skills.length) throw new HttpError(409, `${therapist.name} is not qualified for ${treatment.name}`);
  if (machine && machine.status !== 'OPERATIONAL') throw new HttpError(409, `Machine ${machine.code} is ${machine.status.replace(/_/g, ' ').toLowerCase()}`);
  if (machine && treatment.machineTypeId && machine.machineTypeId !== treatment.machineTypeId)
    throw new HttpError(409, `Machine ${machine.code} cannot perform ${treatment.name}`);
  if (!room.active) throw new HttpError(409, `${room.name} is not in use`);

  const busy = await busyResources(tx, tenantId, { startAt: input.startAt, endAt, therapistId, machineId, roomId, clientId: client.id, excludeId });
  if (busy.size) throw new HttpError(409, `Scheduling clash: ${[...busy].join(', ')} already booked in this slot`, { busy: [...busy] });

  if (input.clientPackageItemId) {
    const item = await tx.clientPackageItem.findFirst({
      where: {
        id: input.clientPackageItemId, treatmentId: treatment.id,
        clientPackage: { tenantId, clientId: client.id, status: 'ACTIVE', expiresAt: { gt: input.startAt } },
      },
    });
    if (!item) throw new HttpError(409, 'No active package item for this treatment (expired or wrong client/treatment)');
    // Count sessions already reserved by other live bookings too, so a 10-session package can't be booked 11 times.
    const reserved = await tx.appointment.count({ where: { clientPackageItemId: item.id, status: { in: [...LIVE] }, ...(excludeId && { id: { not: excludeId } }) } });
    if (item.usedSessions + reserved >= item.totalSessions) throw new HttpError(409, 'All sessions of this treatment are already used or booked');
  }
  return { treatment, endAt, therapistId, machineId: machineId ?? null, roomId, branchId: room.branchId, clientId: client.id };
}

/**
 * Books an appointment only if therapist + machine + room (and the client) are all free and not blocked,
 * the therapist is qualified, the machine is operational/compatible, the slot is within hours and package balance exists.
 * A per-tenant advisory lock serialises bookings so two receptionists can't double-book.
 */
export async function createAppointment(tenantId: string, input: BookingInput) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`;
    const v = await validateAndResolve(tx, tenantId, input);
    return tx.appointment.create({
      data: {
        tenantId, branchId: v.branchId, clientId: v.clientId, treatmentId: v.treatment.id,
        therapistId: v.therapistId, machineId: v.machineId, roomId: v.roomId,
        clientPackageItemId: input.clientPackageItemId, startAt: input.startAt, endAt: v.endAt, notes: input.notes,
        status: input.status ?? 'SCHEDULED',
      },
    });
  });
}

/** Move an appointment to a new time and/or resources, re-running every check except against itself. */
export async function rescheduleAppointment(tenantId: string, id: string, patch: { startAt?: Date; therapistId?: string; machineId?: string; roomId?: string }) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`;
    const a = await tx.appointment.findFirst({ where: { id, tenantId } });
    if (!a) throw new HttpError(404, 'Appointment not found');
    if (!LIVE.includes(a.status as (typeof LIVE)[number])) throw new HttpError(409, `Cannot reschedule a ${a.status.toLowerCase()} appointment`);
    const startAt = patch.startAt ?? a.startAt;
    // Explicit choices win; otherwise keep each current resource if it is free at the new time, else re-allocate it.
    const s = await suggestResources(tx, tenantId, a.treatmentId, startAt, a.id);
    const keep = (current: string | null, free: { id: string }[]) => (current && free.some((f) => f.id === current) ? current : undefined);
    const v = await validateAndResolve(tx, tenantId, {
      clientId: a.clientId, treatmentId: a.treatmentId, clientPackageItemId: a.clientPackageItemId ?? undefined, startAt,
      therapistId: patch.therapistId ?? keep(a.therapistId, s.therapists),
      machineId: patch.machineId ?? keep(a.machineId, s.machines), roomId: patch.roomId ?? keep(a.roomId, s.rooms),
    }, a.id);
    return tx.appointment.update({
      where: { id: a.id },
      data: { startAt: patch.startAt ?? a.startAt, endAt: v.endAt, therapistId: v.therapistId, machineId: v.machineId, roomId: v.roomId },
    });
  });
}

/** Value of one delivered session = its share of the package price, weighted by each treatment's list price. */
async function sessionValue(tx: Tx, clientPackageItemId: string | null, treatmentPrice: number) {
  if (!clientPackageItemId) return treatmentPrice;
  const item = await tx.clientPackageItem.findUniqueOrThrow({
    where: { id: clientPackageItemId }, include: { clientPackage: { include: { items: { include: { treatment: true } } } } },
  });
  const weights = item.clientPackage.items.reduce((s, i) => s + i.totalSessions * (Number(i.treatment.price) || 1), 0);
  const mine = Number(item.clientPackage.items.find((i) => i.id === item.id)!.treatment.price) || 1;
  return Math.round((Number(item.clientPackage.price) * mine / weights) * 100) / 100;
}

/** Confirms delivery: deducts exactly one session from the treatment's own balance (atomic) and records who/what/when. */
export async function completeAppointment(
  auth: { userId: string; tenantId: string; role: Role }, id: string,
  body: { actualStart?: Date; actualEnd?: Date; machineId?: string; therapistId?: string; notes?: string },
) {
  return prisma.$transaction(async (tx) => {
    const a = await tx.appointment.findFirst({ where: { id, tenantId: auth.tenantId }, include: { treatment: true } });
    if (!a) throw new HttpError(404, 'Appointment not found');
    if (auth.role === 'THERAPIST' && a.therapistId !== auth.userId) throw new HttpError(403, 'Not your appointment');
    if (a.status === 'COMPLETED') throw new HttpError(409, 'Already completed');
    if (a.status === 'CANCELLED' || a.status === 'NO_SHOW') throw new HttpError(409, `Cannot complete a ${a.status} appointment`);

    if (a.clientPackageItemId) {
      const updated = await tx.$executeRaw`UPDATE "ClientPackageItem" SET "usedSessions" = "usedSessions" + 1 WHERE id = ${a.clientPackageItemId} AND "usedSessions" < "totalSessions"`;
      if (updated === 0) throw new HttpError(409, 'No sessions left for this treatment in the package');
    }

    const actualStart = body.actualStart ?? a.startAt;
    const actualEnd = body.actualEnd ?? new Date(actualStart.getTime() + a.treatment.durationMin * MIN);
    if (actualEnd <= actualStart) throw new HttpError(400, 'Actual end must be after actual start');
    const session = await tx.sessionRecord.create({
      data: {
        tenantId: auth.tenantId, appointmentId: a.id, clientPackageItemId: a.clientPackageItemId,
        therapistId: body.therapistId ?? a.therapistId, machineId: body.machineId ?? a.machineId, actualStart, actualEnd,
        value: await sessionValue(tx, a.clientPackageItemId, Number(a.treatment.price)), notes: body.notes,
      },
    });
    await tx.appointment.update({ where: { id: a.id }, data: { status: 'COMPLETED' } });

    if (!a.clientPackageItemId) return { session, remaining: null };
    const item = await tx.clientPackageItem.findUniqueOrThrow({
      where: { id: a.clientPackageItemId }, include: { clientPackage: { include: { items: true } } },
    });
    if (item.clientPackage.items.every((i) => i.usedSessions >= i.totalSessions))
      await tx.clientPackage.update({ where: { id: item.clientPackageId }, data: { status: 'COMPLETED' } });
    return { session, remaining: item.totalSessions - item.usedSessions };
  });
}
