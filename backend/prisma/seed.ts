import { AppointmentStatus, PrismaClient, Role, TaxCategory } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import 'dotenv/config';

const prisma = new PrismaClient();

/*
 * Walnut demo dataset.
 * Real master data from the requirements doc (5 staff, 4 treatment rooms, 7 machine types, 11 machines) plus
 * ~22 months of realistic, clash-free activity so every screen and report has something meaningful to show.
 * PLACEHOLDERS to confirm with the client: treatment durations/buffers, prices, room-machine placement, qualifications.
 * Deterministic (seeded PRNG) — re-running produces the same data relative to "today".
 */

let s = 20261022;
const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const chance = (p: number) => rnd() < p;
const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;
const DAY = 86_400_000, MIN = 60_000;
const NOW = new Date();
const TODAY = new Date(NOW); TODAY.setHours(0, 0, 0, 0);
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
// 'Fatima Al Mansoori' -> first 'Fatima', last 'Al Mansoori' (Arabic family-name prefixes stay with the surname).
const splitName = (full: string) => {
  const w = full.split(' ');
  const cut = w.length > 2 && ['Al', 'El', 'Bin', 'Bint', 'Abu'].includes(w[w.length - 2]) ? w.length - 2 : w.length - 1;
  return { firstName: w[0], middleName: w.slice(1, cut).join(' ') || null, lastName: w.slice(cut).join(' ') };
};
const at = (d: Date, minute: number) => { const x = new Date(d); x.setHours(0, minute, 0, 0); return x; };
const OPEN = 10 * 60, CLOSE = 21 * 60, OPEN_DB = 9 * 60;

const FEMALE = ['Fatima Al Mansoori', 'Aisha Rahman', 'Mariam Khalid', 'Noura Al Hashimi', 'Sara Ahmed', 'Hessa Al Falasi', 'Layla Haddad', 'Reem Saleh', 'Priya Nair', 'Anjali Menon', 'Divya Krishnan', 'Sneha Pillai', 'Maria Santos', 'Joy Reyes', 'Angelica Cruz', 'Olga Petrova', 'Elena Ivanova', 'Natalia Smirnova', 'Sophie Laurent', 'Emma Clarke', 'Charlotte Evans', 'Hannah Schmidt', 'Yasmin Farouk', 'Dana Al Suwaidi', 'Amna Al Ketbi', 'Shamma Al Mazrouei', 'Lina Nasser', 'Rania Youssef', 'Nadia Karim', 'Huda Al Zaabi', 'Meera Iyer', 'Kavya Reddy', 'Fathima Shirin', 'Ayesha Siddiqui', 'Zainab Hussain', 'Grace Lim', 'Mei Chen', 'Ji-woo Park', 'Isabella Rossi', 'Chiara Bianchi', 'Leila Moradi', 'Shirin Tehrani', 'Salma Benali', 'Khadija El Amrani', 'Rasha Hamdan', 'Jessica Thomas', 'Neha Kapoor', 'Riya Varghese', 'Anna Kowalska', 'Lucy Wright', 'Ghada Mansour', 'Mona Abdallah', 'Alia Al Nuaimi', 'Maitha Al Shamsi', 'Latifa Al Dhaheri', 'Noor Jaber', 'Tala Khoury', 'Farah Aziz', 'Sabrina Lopez', 'Camila Duarte'] as const;
const MALE = ['Ahmed Al Marzooqi', 'Omar Haddad', 'Khalid Al Rumaithi', 'Yousef Saleh', 'Rashid Al Nuaimi', 'Arjun Menon', 'Rahul Nair', 'Vikram Shetty', 'James Carter', 'Daniel Becker', 'Mohammed Iqbal', 'Faisal Qureshi', 'Saeed Al Ameri', 'Tariq Aziz', 'Ivan Volkov', 'Marco Silva', 'Hamdan Al Kaabi', 'Sultan Al Owais', 'Nikhil Joseph', 'Anas Kareem'] as const;
const NATIONALITY: Record<string, string> = { Al: 'UAE', Priya: 'India', Anjali: 'India', Divya: 'India', Sneha: 'India', Meera: 'India', Kavya: 'India', Fathima: 'India', Neha: 'India', Riya: 'India', Arjun: 'India', Rahul: 'India', Vikram: 'India', Nikhil: 'India', Anas: 'India', Maria: 'Philippines', Joy: 'Philippines', Angelica: 'Philippines', Olga: 'Russia', Elena: 'Russia', Natalia: 'Russia', Ivan: 'Russia' };
const SOURCES = ['Instagram', 'Instagram', 'Google', 'Referral', 'Referral', 'Walk-in', 'TikTok', 'Website', 'Facebook'] as const;
const GOALS = ['Reduce abdominal fat', 'Tone thighs and arms', 'Post-pregnancy body contouring', 'Lose 8 kg before wedding', 'Reduce love handles', 'Improve skin tightness after weight loss', 'Build core muscle and reduce belly', 'Reduce cellulite on thighs', 'General slimming and wellness'];
const COMPLAINTS = ['Stubborn belly fat not responding to diet', 'Loose skin after weight loss', 'Cellulite on thighs and buttocks', 'Post-partum abdominal laxity', 'Localised fat on flanks', 'Water retention and puffiness', 'Wants to improve muscle tone'];
const CONDITIONS = [null, null, null, null, 'Hypothyroidism (controlled)', 'PCOS', 'Mild hypertension', 'Type 2 diabetes (diet controlled)', 'Previous C-section (2022)'];
const ALLERGIES = [null, null, null, null, 'Latex', 'Penicillin', 'Nuts'];
const MEDS = [null, null, null, 'Levothyroxine 50mcg', 'Metformin 500mg', 'Oral contraceptive', 'Vitamin D'];
const REVIEW_NOTES = ['Good progress, client motivated. Continue current plan.', 'Waist reduced, weight stable — muscle gain noted on analyzer. Continue.', 'Slower progress this cycle; reviewed diet and water intake.', 'Client reports better skin firmness. Add HIFU session if budget allows.', 'Visible contour improvement on flanks. Photos taken with consent.', 'Plateau — recommended increasing Endospheres frequency.', 'Excellent results. Discussed maintenance package.'];
const SESSION_NOTES = [null, null, null, 'Client tolerated well', 'Slight redness, resolved', 'Increased intensity to level 7', 'Client requested lower intensity', 'Focused on abdomen and flanks', 'Applicator: medium, abdomen'];

async function main() {
  if (await prisma.tenant.findUnique({ where: { slug: 'walnut' } })) return console.log('Already seeded — run `npm run db:reset` to rebuild the demo data');
  const passwordHash = await bcrypt.hash(process.env.SEED_PASSWORD ?? 'ChangeMe-12345', 12);
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Walnut Slimming & Body Shaping Center', slug: 'walnut', trn: '100345678900003', address: 'Villa 21, Al Wasl Road, Jumeirah 1, Dubai, UAE',
      phone: '+971 4 345 6789', email: 'hello@walnutslimming.ae', openMin: OPEN_DB, closeMin: CLOSE, slotMin: 15,
    },
  });
  const t = tenant.id;
  const branch = await prisma.branch.create({ data: { tenantId: t, name: 'Jumeirah (Main)' } });
  const rooms: Record<string, string> = {};
  for (const name of ['Room 1', 'Room 2', 'Room 3', 'Room 4', 'Consultation Room']) rooms[name] = (await prisma.room.create({ data: { tenantId: t, branchId: branch.id, name } })).id;

  // ---- Machines (from the doc) with their home rooms ----
  const catalog = [
    ['Fat Freezing / Cryo', 'CRYO', 2, ['Room 1', 'Room 3'], 'Cristal Pro'], ['9-in-1 Machine', '9IN1', 2, ['Room 4', 'Room 2'], 'Sculptor 9'], ['Emsculpt', 'EMS', 2, ['Room 2', 'Room 4'], 'BTL Emsculpt NEO'],
    ['Endospheres', 'ENDO', 1, ['Room 4'], 'Fenix Endospheres'], ['HIFU', 'HIFU', 2, ['Room 3', 'Room 1'], 'Ultraformer MPT'], ['Onda Pro', 'ONDA', 1, ['Room 3'], 'DEKA Onda Pro'], ['Vita S', 'VITA', 1, ['Room 2'], 'Vita S Lymph'],
  ] as const;
  const mtype: Record<string, string> = {};
  const machines: { id: string; code: string; prefix: string; roomId: string }[] = [];
  for (const [name, prefix, qty, room, brand] of catalog) {
    mtype[prefix] = (await prisma.machineType.create({ data: { tenantId: t, name } })).id;
    for (let n = 1; n <= qty; n++) {
      const code = `${prefix}-${String(n).padStart(2, '0')}`;
      const m = await prisma.machine.create({
        data: {
          tenantId: t, branchId: branch.id, machineTypeId: mtype[prefix], roomId: rooms[room[n - 1]], code, brand, serialNo: `${prefix}${2023 + (n % 2)}-${int(10000, 99999)}`,
          installedAt: new Date(2024, int(0, 11), int(1, 28)), lastServiceAt: addDays(TODAY, -int(20, 80)), nextServiceAt: addDays(TODAY, int(5, 90)),
        },
      });
      machines.push({ id: m.id, code, prefix, roomId: rooms[room[n - 1]] });
    }
  }

  // ---- Treatments / services (prices in AED excl. VAT — placeholders) ----
  const T = [
    { key: 'CRYO', name: 'Fat Freezing (Cryo) – per area', code: 'CRY', category: 'Fat Reduction', machine: 'CRYO', durationMin: 60, bufferMin: 15, price: 1200, color: '#2a78d6' },
    { key: 'EMS', name: 'Emsculpt NEO', code: 'EMS', category: 'Muscle Toning', machine: 'EMS', durationMin: 30, bufferMin: 10, price: 950, color: '#6250d6' },
    { key: '9IN1', name: '9-in-1 Body Sculpting', code: 'S9', category: 'Body Contouring', machine: '9IN1', durationMin: 45, bufferMin: 10, price: 450, color: '#1baf7a' },
    { key: 'ENDO', name: 'Endospheres Therapy', code: 'END', category: 'Cellulite & Lymphatic', machine: 'ENDO', durationMin: 45, bufferMin: 10, price: 420, color: '#eb6834' },
    { key: 'HIFU', name: 'HIFU Body Tightening', code: 'HIF', category: 'Skin Tightening', machine: 'HIFU', durationMin: 60, bufferMin: 15, price: 1500, color: '#e87ba4' },
    { key: 'ONDA', name: 'Onda Pro Coolwaves', code: 'OND', category: 'Fat Reduction', machine: 'ONDA', durationMin: 45, bufferMin: 10, price: 1100, color: '#008300' },
    { key: 'VITA', name: 'Vita S Lymphatic Drainage', code: 'VIT', category: 'Cellulite & Lymphatic', machine: 'VITA', durationMin: 40, bufferMin: 10, price: 380, color: '#eda100' },
    { key: 'MASSAGE', name: 'Manual Lymphatic Massage', code: 'MLD', category: 'Wellness', machine: null, durationMin: 60, bufferMin: 10, price: 450, color: '#B8860B' },
    { key: 'CONSULT', name: 'Doctor Consultation', code: 'CON', category: 'Consultation', machine: null, durationMin: 30, bufferMin: 0, price: 250, color: '#52514e' },
    { key: 'BCA', name: 'Body Composition Analysis', code: 'BCA', category: 'Consultation', machine: null, durationMin: 15, bufferMin: 0, price: 100, color: '#898781' },
  ] as const;
  const tr: Record<string, { id: string; durationMin: number; bufferMin: number; price: number; machine: string | null; name: string }> = {};
  for (const x of T) {
    const row = await prisma.treatment.create({
      data: { tenantId: t, name: x.name, code: x.code, category: x.category, color: x.color, machineTypeId: x.machine ? mtype[x.machine] : null, durationMin: x.durationMin, bufferMin: x.bufferMin, price: x.price, taxCategory: TaxCategory.STANDARD },
    });
    tr[x.key] = { id: row.id, durationMin: x.durationMin, bufferMin: x.bufferMin, price: x.price, machine: x.machine, name: x.name };
  }

  // ---- Staff (real names from the doc) + system users ----
  const MACHINE_TX = ['CRYO', 'EMS', '9IN1', 'ENDO', 'HIFU', 'ONDA', 'VITA'];
  const staff: [string, string, string, Role, string | null, string | null, string[], number | null][] = [
    ['admin@walnut.local', 'System Admin', 'Super Administrator', 'SUPER_ADMIN', null, null, [], null],
    ['salha@walnut.local', 'Dr. Salha', 'Centre Manager / Consultant', 'MANAGER', 'Female', '#B8860B', ['CONSULT', 'BCA'], null],
    ['reception@walnut.local', 'Noura (Front Desk)', 'Reception / Front Desk', 'RECEPTION', 'Female', null, [], null],
    ['accounts@walnut.local', 'Rahul (Accounts)', 'Accountant', 'ACCOUNTANT', 'Male', null, [], null],
    ['marcial@walnut.local', 'Marcial', 'Male Slimming Technician', 'THERAPIST', 'Male', '#2a78d6', [...MACHINE_TX, 'BCA'], 5],
    ['mariegold@walnut.local', 'Mariegold', 'Female Slimming Technician', 'THERAPIST', 'Female', '#1baf7a', [...MACHINE_TX, 'BCA'], 5],
    ['carol@walnut.local', 'Carol', 'Female Slimming Technician', 'THERAPIST', 'Female', '#6250d6', [...MACHINE_TX, 'BCA'], 5],
    ['aya@walnut.local', 'Aya', 'Beauty Therapist', 'THERAPIST', 'Female', '#e87ba4', ['HIFU', 'ENDO', 'VITA', '9IN1', 'MASSAGE', 'BCA'], 7],
  ];
  const user: Record<string, string> = {};
  const skilled: Record<string, string[]> = {}; // treatmentKey -> userIds
  for (const [email, name, designation, role, gender, color, skills, commissionPct] of staff) {
    const u = await prisma.user.create({ data: { tenantId: t, email, name, designation, role, gender, color, commissionPct, passwordHash, phone: `+97150${int(1000000, 9999999)}`, lastLoginAt: addDays(NOW, -int(0, 3)) } });
    user[email.split('@')[0]] = u.id;
    if (skills.length) await prisma.therapistSkill.createMany({ data: skills.map((k) => ({ userId: u.id, treatmentId: tr[k].id })) });
    for (const k of skills) (skilled[k] ??= []).push(u.id);
  }
  const userGender = Object.fromEntries(staff.map(([email, , , , g]) => [user[email.split('@')[0]], g]));

  // ---- Package catalogue ----
  const P: { name: string; price: number; validityDays: number; description: string; items: Record<string, number> }[] = [
    { name: 'Emsculpt NEO x10', price: 7500, validityDays: 120, description: 'Core strengthening and abdominal toning course', items: { EMS: 10 } },
    { name: 'Cryo Sculpt – 4 areas', price: 4200, validityDays: 120, description: 'Fat freezing on four treatment areas', items: { CRYO: 4 } },
    { name: 'Mixed: 4 Cryo + 4 Endospheres + 2 Onda Pro', price: 8900, validityDays: 150, description: 'Signature fat-reduction programme', items: { CRYO: 4, ENDO: 4, ONDA: 2 } },
    { name: 'Body Contour Starter', price: 4200, validityDays: 90, description: '6 x 9-in-1 sculpting + 6 x Endospheres', items: { '9IN1': 6, ENDO: 6 } },
    { name: 'HIFU Skin Tightening x3', price: 3900, validityDays: 120, description: 'Tightening after weight loss', items: { HIFU: 3 } },
    { name: 'Onda Pro x6', price: 5900, validityDays: 120, description: 'Coolwaves fat & cellulite course', items: { ONDA: 6 } },
    { name: 'Lymphatic Detox', price: 3600, validityDays: 90, description: '8 x Vita S + 4 x manual lymphatic massage', items: { VITA: 8, MASSAGE: 4 } },
    { name: 'Bridal Sculpt', price: 7800, validityDays: 90, description: '4 Emsculpt + 4 Onda Pro + 4 Vita S', items: { EMS: 4, ONDA: 4, VITA: 4 } },
    { name: 'Endospheres x12', price: 4300, validityDays: 120, description: 'Cellulite & circulation course', items: { ENDO: 12 } },
  ];
  const templates: { id: string; name: string; price: number; validityDays: number; items: Record<string, number> }[] = [];
  for (const p of P) {
    const row = await prisma.packageTemplate.create({
      data: { tenantId: t, name: p.name, price: p.price, validityDays: p.validityDays, description: p.description, items: { create: Object.entries(p.items).map(([k, n]) => ({ treatmentId: tr[k].id, sessions: n })) } },
    });
    templates.push({ id: row.id, ...p });
  }

  await prisma.messageTemplate.createMany({
    data: [
      { tenantId: t, name: 'Appointment reminder', purpose: 'REMINDER', body: 'Hi {name}, this is a reminder of your {treatment} appointment at Walnut on {date} at {time}. Reply 1 to confirm or call +971 4 345 6789 to reschedule.' },
      { tenantId: t, name: '15-day progress review', purpose: 'FOLLOW_UP', body: 'Hi {name}, it is time for your 15-day progress review with Dr. Salha, including a body composition scan. Shall we book you in this week?' },
      { tenantId: t, name: 'Package expiry', purpose: 'EXPIRY', body: 'Hi {name}, your package "{package}" expires on {expiry} and you still have {sessions} session(s) left. Book now so you don\'t lose them!' },
      { tenantId: t, name: 'Balance reminder', purpose: 'GENERAL', body: 'Hi {name}, a friendly reminder that AED {amount} is outstanding on invoice {invoice}. You can settle by card or Tabby at your next visit.' },
      { tenantId: t, name: 'Thank you after session', purpose: 'GENERAL', body: 'Thank you for visiting Walnut today, {name}! Remember to drink plenty of water over the next 24 hours.' },
      { tenantId: t, name: 'Summer offer', purpose: 'MARKETING', channel: 'WHATSAPP', body: 'Summer sculpt offer at Walnut: 15% off Emsculpt NEO and Onda Pro packages this month. Reply YES to book a free consultation.' },
    ],
  });

  // ---- Clash-free allocator (mirrors the booking engine) ----
  const busy = new Map<string, [number, number][]>();
  const free = (id: string, a: number, b: number) => !(busy.get(id) ?? []).some(([x, y]) => a < y && b > x);
  const take = (id: string, a: number, b: number) => { const l = busy.get(id) ?? []; l.push([a, b]); busy.set(id, l); };
  const maintenanceMachine = machines.find((m) => m.code === '9IN1-02')!;

  // Planned downtime (also stored as blocks so the scheduler shows them).
  const blocks = [
    { kind: 'MACHINE' as const, resourceId: machines.find((m) => m.code === 'HIFU-02')!.id, startAt: at(addDays(TODAY, 1), 10 * 60), endAt: at(addDays(TODAY, 1), 13 * 60), reason: 'Quarterly service – Ultraformer engineer' },
    { kind: 'MACHINE' as const, resourceId: machines.find((m) => m.code === 'EMS-02')!.id, startAt: at(addDays(TODAY, -6), 9 * 60), endAt: at(addDays(TODAY, -6), 12 * 60), reason: 'Applicator calibration' },
    { kind: 'MACHINE' as const, resourceId: machines.find((m) => m.code === 'CRYO-02')!.id, startAt: at(TODAY, 13 * 60), endAt: at(TODAY, 14 * 60), reason: 'Deep cleaning' },
    { kind: 'THERAPIST' as const, resourceId: user.aya, startAt: at(addDays(TODAY, 2), 9 * 60), endAt: at(addDays(TODAY, 2), 21 * 60), reason: 'Annual leave' },
    { kind: 'ROOM' as const, resourceId: rooms['Room 4'], startAt: at(addDays(TODAY, 3), 9 * 60), endAt: at(addDays(TODAY, 3), 11 * 60), reason: 'AC maintenance' },
  ];
  for (const b of blocks) take(b.resourceId, b.startAt.getTime(), b.endAt.getTime());
  await prisma.resourceBlock.createMany({ data: blocks.map((b) => ({ ...b, tenantId: t })) });
  // Daily lunch block for Dr. Salha keeps consultations realistic.
  for (let d = -700; d <= 20; d++) take(user.salha, at(addDays(TODAY, d), 13 * 60).getTime(), at(addDays(TODAY, d), 14 * 60).getTime());

  function allocate(day: Date, key: string, clientId: string, prefTherapist?: string, prefGender?: string | null) {
    const x = tr[key];
    const durMs = (x.durationMin + x.bufferMin) * MIN;
    const future = day >= TODAY;
    for (let attempt = 0; attempt < 60; attempt++) {
      const startMin = OPEN + 15 * int(0, Math.floor((CLOSE - OPEN - x.durationMin) / 15));
      const a = at(day, startMin).getTime(), b = a + durMs;
      if (!free(clientId, a, b)) continue;
      let pool = skilled[key].filter((u) => free(u, a, b));
      if (prefGender === 'Male') pool = pool.filter((u) => userGender[u] !== 'Female' || key === 'CONSULT' || key === 'BCA');
      if (prefGender === 'Female') pool = pool.filter((u) => userGender[u] !== 'Male');
      if (!pool.length) continue;
      const therapist = prefTherapist && pool.includes(prefTherapist) && chance(0.75) ? prefTherapist : pick(pool);
      let machineId: string | null = null, roomId: string | undefined;
      if (x.machine) {
        const ms = machines.filter((m) => m.prefix === x.machine && free(m.id, a, b) && !(future && m.id === maintenanceMachine.id));
        const m = pick([...ms.filter((mm) => free(mm.roomId, a, b)), null]) ?? ms.find((mm) => free(mm.roomId, a, b)) ?? null;
        if (!m) continue;
        machineId = m.id; roomId = m.roomId;
      } else {
        roomId = key === 'MASSAGE' ? [rooms['Room 2'], rooms['Room 3']].find((r) => free(r, a, b)) : free(rooms['Consultation Room'], a, b) ? rooms['Consultation Room'] : undefined;
        if (!roomId) continue;
      }
      take(clientId, a, b); take(therapist, a, b); take(roomId, a, b); if (machineId) take(machineId, a, b);
      return { startAt: new Date(a), endAt: new Date(b), therapistId: therapist, machineId, roomId };
    }
    return null;
  }

  // ---- Clients & their journeys ----
  const FIRST = addDays(TODAY, -660);
  const clientPlans: { name: string; gender: string; joined: Date }[] = [];
  const firsts = (l: readonly string[]) => l.map((n) => n.split(' ')[0]);
  const lasts = [...new Set([...FEMALE, ...MALE].map((n) => n.split(' ').slice(1).join(' ')))];
  const used = new Set<string>();
  const newName = (gender: string) => {
    for (;;) {
      const n = `${pick(firsts(gender === 'Male' ? MALE : FEMALE))} ${pick(lasts)}`;
      if (!used.has(n)) { used.add(n); return n; }
    }
  };
  // Growth curve: ~10 new clients/month two years ago rising to ~40/month now.
  for (let d = 0; d <= 660; d++) {
    const rate = 0.35 + 1.3 * (d / 660);
    let k = Math.floor(rate) + (chance(rate % 1) ? 1 : 0);
    while (k-- > 0) {
      const gender = chance(0.8) ? 'Female' : 'Male';
      clientPlans.push({ name: newName(gender), gender, joined: addDays(FIRST, d) });
    }
  }

  type Sale = { date: Date; clientId: string; lines: { kind: 'PACKAGE' | 'SERVICE'; tpl?: (typeof templates)[number]; key?: string; discount: number }[]; payPlan: 'full' | 'split' | 'open' | 'partial'; method: string };
  const sales: Sale[] = [];
  const pkgPlans: { clientId: string; tpl: (typeof templates)[number]; date: Date; discount: number; sale: Sale; dropAfter: number; prefTherapist: string; gender: string; cadence: number }[] = [];
  const clientRows: { id: string; gender: string; joined: Date; weight: number; height: number; fat: number; waist: number; hip: number; muscle: number; prefTherapist: string; active: boolean; interval: number; whatsapp: boolean }[] = [];
  const methods = ['CARD', 'CARD', 'CARD', 'CARD', 'CASH', 'CASH', 'BANK_TRANSFER', 'TABBY', 'TABBY'];

  let seq = 0;
  for (const p of clientPlans) {
    seq++;
    const first = p.name.split(' ')[0];
    const male = p.gender === 'Male';
    const height = male ? int(168, 186) : int(152, 172);
    const weight = r2(male ? int(82, 112) + rnd() : int(62, 96) + rnd());
    const c = await prisma.client.create({
      data: {
        tenantId: t, clientNo: `WLN-${String(seq).padStart(5, '0')}`, title: male ? 'Mr.' : pick(['Ms.', 'Mrs.']), name: p.name, ...splitName(p.name), gender: p.gender,
        mobile: `05${pick(['0', '2', '4', '5', '6', '8'])}${int(1000000, 9999999)}`, email: `${first.toLowerCase()}.${int(10, 99)}@${pick(['gmail.com', 'outlook.com', 'yahoo.com', 'icloud.com'])}`,
        dob: new Date(int(1972, 2001), int(0, 11), int(1, 28)), nationality: p.name.includes(' Al ') ? 'UAE' : NATIONALITY[first] ?? pick(['UAE', 'Lebanon', 'Egypt', 'UK', 'Jordan', 'Germany', 'Italy', 'India']),
        emiratesId: `784-${int(1972, 2001)}-${int(1000000, 9999999)}-${int(1, 9)}`, address: `${pick(['Jumeirah', 'Al Barsha', 'Dubai Marina', 'JLT', 'Downtown', 'Mirdif', 'Al Safa', 'Umm Suqeim', 'Business Bay', 'Arabian Ranches'])}, Dubai`,
        occupation: pick(['Teacher', 'Banker', 'Homemaker', 'Engineer', 'Entrepreneur', 'Doctor', 'Marketing Manager', 'Flight Attendant', 'HR Manager', 'Architect']),
        source: pick(SOURCES), referredBy: chance(0.2) ? pick(FEMALE) : null,
        emergencyName: pick([...FEMALE, ...MALE]), emergencyRelation: pick(['Spouse', 'Sister', 'Mother', 'Brother', 'Friend']), emergencyPhone: `05${int(0, 9)}${int(1000000, 9999999)}`,
        conditions: pick(CONDITIONS), allergies: pick(ALLERGIES), medications: pick(MEDS), contraindications: chance(0.1) ? 'Metal implant in left knee – avoid EMS on legs' : null,
        goal: pick(GOALS), targetWeightKg: r2(weight - int(5, 12)), medicalNotes: 'Screening questionnaire completed. No pacemaker, not pregnant.',
        consentSigned: true, consentSignedAt: p.joined, photoConsent: chance(0.7), whatsappOptIn: chance(0.9), marketingOptIn: chance(0.55), vip: chance(0.08),
        reviewIntervalDays: chance(0.85) ? 15 : pick([10, 21, 30]), createdAt: new Date(Math.min(at(p.joined, int(OPEN, CLOSE - 60)).getTime(), NOW.getTime() - int(5, 120) * MIN)),
      },
    });
    const prefTherapist = pick(male ? [user.marcial] : [user.mariegold, user.carol, user.aya, user.mariegold, user.carol]);
    clientRows.push({ id: c.id, gender: p.gender, joined: p.joined, weight, height, fat: r2(male ? 26 + rnd() * 8 : 32 + rnd() * 9), waist: male ? int(96, 112) : int(80, 102), hip: male ? int(100, 112) : int(100, 120), muscle: r2(male ? 34 + rnd() * 6 : 23 + rnd() * 5), prefTherapist, active: true, interval: c.reviewIntervalDays, whatsapp: c.whatsappOptIn });

    // First visit: consultation + body composition (consult fee waived for ~40% who buy the same day).
    const buysNow = chance(0.8);
    const consultSale: Sale = { date: p.joined, clientId: c.id, lines: [{ kind: 'SERVICE', key: 'CONSULT', discount: buysNow && chance(0.5) ? 250 : 0 }, { kind: 'SERVICE', key: 'BCA', discount: 0 }], payPlan: 'full', method: pick(methods) };
    sales.push(consultSale);

    // Package purchases: first at/after join, then renewals for engaged clients.
    let when = buysNow ? p.joined : addDays(p.joined, int(3, 20));
    let n = 0;
    while (when <= TODAY && n < 4) {
      const tpl = n === 0 ? pick(male ? templates.filter((x) => !x.name.startsWith('Bridal') && !x.name.startsWith('Lymphatic')) : templates) : pick(templates);
      const discount = chance(0.35) ? r2(tpl.price * pick([0.05, 0.1, 0.15])) : 0;
      const payPlan = when > addDays(TODAY, -45) && chance(0.18) ? (chance(0.5) ? 'open' : 'partial') : chance(0.2) ? 'split' : 'full';
      const sale: Sale = { date: when, clientId: c.id, lines: [{ kind: 'PACKAGE', tpl, discount }], payPlan, method: pick(methods) };
      sales.push(sale);
      const cadence = int(5, 9);
      pkgPlans.push({ clientId: c.id, tpl, date: when, discount, sale, dropAfter: chance(0.12) ? int(2, 5) : 999, prefTherapist, gender: p.gender, cadence });
      const totalSessions = Object.values(tpl.items).reduce((a, b) => a + b, 0);
      // Next purchase after roughly finishing this course, if the client renews.
      if (!chance(0.45)) break;
      when = addDays(when, totalSessions * cadence + int(5, 30));
      n++;
    }
    if (!pkgPlans.some((x) => x.clientId === c.id) && p.joined < addDays(TODAY, -30)) clientRows[clientRows.length - 1].active = false;
  }

  // ---- Invoices in chronological order (gap-free numbering) ----
  sales.sort((a, b) => a.date.getTime() - b.date.getTime());
  let invSeq = 0, rcptSeq = 0;
  const pkgByPlan = new Map<object, { id: string; items: { id: string; key: string; total: number }[]; price: number; expiresAt: Date }>();
  const keyOfTreatment = Object.fromEntries(Object.entries(tr).map(([k, v]) => [v.id, k]));
  for (const sale of sales) {
    invSeq++;
    const issuedAt = new Date(Math.min(at(sale.date, int(OPEN + 30, CLOSE - 30)).getTime(), NOW.getTime() - int(5, 90) * MIN));
    const lines = sale.lines.map((l) => {
      const unit = l.kind === 'PACKAGE' ? l.tpl!.price : tr[l.key!].price;
      const taxable = unit - l.discount;
      const vat = r2(taxable * 0.05);
      return { kind: l.kind, description: l.kind === 'PACKAGE' ? l.tpl!.name : tr[l.key!].name, treatmentId: l.key ? tr[l.key].id : null, packageTemplateId: l.tpl?.id ?? null, qty: 1, unitPrice: unit, discount: l.discount, vatRate: 5, vatAmount: vat, lineTotal: r2(taxable + vat) };
    });
    const subtotal = r2(lines.reduce((s2, l) => s2 + l.unitPrice, 0));
    const discount = r2(lines.reduce((s2, l) => s2 + l.discount, 0));
    const vatAmount = r2(lines.reduce((s2, l) => s2 + l.vatAmount, 0));
    const total = r2(subtotal - discount + vatAmount);
    const pays: { amount: number; paidAt: Date; method: string }[] = [];
    if (total > 0) {
      if (sale.payPlan === 'full') pays.push({ amount: total, paidAt: issuedAt, method: sale.method });
      else if (sale.payPlan === 'split') {
        const half = r2(total / 2);
        pays.push({ amount: half, paidAt: issuedAt, method: sale.method });
        const second = new Date(issuedAt.getTime() + int(20, 35) * DAY);
        if (second < NOW) pays.push({ amount: r2(total - half), paidAt: second, method: pick(methods) });
      } else if (sale.payPlan === 'partial') pays.push({ amount: r2(total * pick([0.3, 0.4, 0.5])), paidAt: issuedAt, method: sale.method });
    }
    const paid = r2(pays.reduce((s2, p) => s2 + p.amount, 0));
    const inv = await prisma.invoice.create({
      data: {
        tenantId: t, number: `INV-${issuedAt.getFullYear()}-${String(invSeq).padStart(5, '0')}`, clientId: sale.clientId, subtotal, discount, taxable: r2(subtotal - discount), vatAmount, total, paid,
        status: total === 0 || paid >= total ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'ISSUED', issuedAt, createdById: user.reception, dueDate: paid < total ? new Date(issuedAt.getTime() + 30 * DAY) : null,
        items: { create: lines },
      },
    });
    for (const p of pays) {
      rcptSeq++;
      await prisma.payment.create({ data: { tenantId: t, invoiceId: inv.id, amount: p.amount, method: p.method, paidAt: p.paidAt, receivedBy: user.reception, receiptNo: `RCT-${String(rcptSeq).padStart(5, '0')}`, reference: p.method === 'CARD' ? `**** ${int(1000, 9999)}` : p.method === 'TABBY' ? `TBY-${int(100000, 999999)}` : null } });
    }
    for (const l of sale.lines) {
      if (l.kind !== 'PACKAGE') continue;
      const plan = pkgPlans.find((x) => x.sale === sale)!;
      const expiresAt = new Date(issuedAt.getTime() + l.tpl!.validityDays * DAY);
      const cp = await prisma.clientPackage.create({
        data: {
          tenantId: t, clientId: sale.clientId, templateId: l.tpl!.id, invoiceId: inv.id, name: l.tpl!.name, price: r2(l.tpl!.price - l.discount), purchasedAt: issuedAt, expiresAt,
          items: { create: Object.entries(l.tpl!.items).map(([k, n]) => ({ treatmentId: tr[k].id, totalSessions: n })) },
        },
        include: { items: true },
      });
      pkgByPlan.set(plan, { id: cp.id, price: Number(cp.price), expiresAt, items: cp.items.map((i) => ({ id: i.id, key: keyOfTreatment[i.treatmentId], total: i.totalSessions })) });
    }
  }
  await prisma.tenant.update({ where: { id: t }, data: { invoiceSeq: invSeq, receiptSeq: rcptSeq, clientSeq: seq } });

  // ---- Treatment sessions per package ----
  const horizon = addDays(TODAY, 14);
  const usage = new Map<string, number>();
  type ApptRow = { tenantId: string; branchId: string; clientId: string; treatmentId: string; therapistId: string; machineId: string | null; roomId: string; clientPackageItemId: string | null; startAt: Date; endAt: Date; status: AppointmentStatus; notes: string | null; createdAt: Date };
  const appts: (ApptRow & { _value?: number })[] = [];
  for (const plan of pkgPlans) {
    const pkg = pkgByPlan.get(plan)!;
    const weightSum = pkg.items.reduce((a, i) => a + i.total * tr[i.key].price, 0);
    const queue: string[] = [];
    // Interleave treatments of a mixed package (e.g. Cryo, Endo, Onda, Cryo, Endo...).
    const left = Object.fromEntries(pkg.items.map((i) => [i.id, i.total]));
    while (Object.values(left).some((v) => v > 0)) for (const i of pkg.items) if (left[i.id]-- > 0) queue.push(i.id);
    let day = addDays(plan.date, int(1, 4));
    let visits = 0;
    for (const itemId of queue) {
      if (day > horizon || day > pkg.expiresAt || visits >= plan.dropAfter) break;
      const item = pkg.items.find((i) => i.id === itemId)!;
      const slot = allocate(day, item.key, plan.clientId, plan.prefTherapist, plan.gender);
      if (!slot) { day = addDays(day, 1); continue; }
      const past = slot.endAt < NOW;
      const isToday = slot.startAt >= TODAY && slot.startAt < addDays(TODAY, 1);
      let status: AppointmentStatus;
      if (past) status = chance(0.05) ? 'NO_SHOW' : chance(0.04) ? 'CANCELLED' : 'COMPLETED';
      else if (slot.startAt <= NOW) status = 'IN_PROGRESS';
      else if (isToday && slot.startAt.getTime() - NOW.getTime() < 20 * MIN) status = 'CHECKED_IN';
      else if (isToday || (slot.startAt < addDays(TODAY, 2) && chance(0.6))) status = chance(0.8) ? 'CONFIRMED' : 'SCHEDULED';
      else status = 'SCHEDULED';
      if (status === 'CANCELLED' || status === 'NO_SHOW') {
        // Freed slot: the client rebooks a few days later for the same session.
        queue.push(itemId);
      } else visits++;
      if (status === 'COMPLETED') usage.set(itemId, (usage.get(itemId) ?? 0) + 1);
      appts.push({
        tenantId: t, branchId: branch.id, clientId: plan.clientId, treatmentId: tr[item.key].id, therapistId: slot.therapistId, machineId: slot.machineId, roomId: slot.roomId,
        clientPackageItemId: itemId, startAt: slot.startAt, endAt: slot.endAt, status, notes: status === 'CANCELLED' ? pick(['Client travelling', 'Client unwell', 'Rescheduled by client']) : null,
        createdAt: new Date(Math.min(slot.startAt.getTime() - int(1, 6) * DAY, NOW.getTime())),
        _value: r2(pkg.price * tr[item.key].price / weightSum),
      });
      day = addDays(day, plan.cadence + int(-1, 2));
    }
  }

  // ---- Consultations, reviews, measurements & initial consult appointments ----
  const consultations: { tenantId: string; clientId: string; doctorId: string; date: Date; kind: string; complaint: string | null; notes: string; suitability: string | null; plan: string | null; nextReviewDate: Date }[] = [];
  const measurements: Record<string, unknown>[] = [];
  const followUps: { tenantId: string; clientId: string; type: 'REVIEW'; dueDate: Date; status: 'OPEN' | 'DONE' | 'SKIPPED'; title: string; assignedToId: string; completedAt: Date | null; outcome: string | null; createdAt: Date }[] = [];
  const reviewDates = new Map<string, Date>();
  for (const c of clientRows) {
    const lastActivity = appts.filter((a) => a.clientId === c.id && a.status === 'COMPLETED').reduce((m, a) => (a.startAt > m ? a.startAt : m), c.joined);
    const plans = pkgPlans.filter((p) => p.clientId === c.id);
    const end = plans.length ? (lastActivity > addDays(TODAY, -20) ? TODAY : addDays(lastActivity, 10)) : c.joined;
    let w = c.weight, fat = c.fat, waist = c.waist, hip = c.hip, muscle = c.muscle;
    let d = new Date(c.joined), k = 0, lastReview = c.joined;
    while (d <= end) {
      const isInitial = k === 0;
      const isFuture = d > TODAY;
      if (!isFuture && (isInitial || chance(0.88))) {
        const slot = allocate(d, 'CONSULT', c.id, user.salha);
        const when = slot?.startAt ?? at(d, 11 * 60);
        if (slot) appts.push({ tenantId: t, branchId: branch.id, clientId: c.id, treatmentId: tr.CONSULT.id, therapistId: user.salha, machineId: null, roomId: slot.roomId, clientPackageItemId: null, startAt: slot.startAt, endAt: slot.endAt, status: slot.endAt < NOW ? 'COMPLETED' : 'CONFIRMED', notes: isInitial ? 'Initial consultation' : 'Progress review', createdAt: addDays(when, -1), _value: isInitial ? 250 : 0 });
        if (!slot || slot.endAt < NOW) {
          const next = addDays(when, c.interval);
          consultations.push({
            tenantId: t, clientId: c.id, doctorId: user.salha, date: when, kind: isInitial ? 'INITIAL' : 'REVIEW',
            complaint: isInitial ? pick(COMPLAINTS) : null, notes: isInitial ? 'Full screening done. BMI and analyzer results reviewed with client. No contraindications to proposed devices.' : pick(REVIEW_NOTES),
            suitability: isInitial ? 'Suitable for non-surgical body contouring' : null, plan: isInitial ? `Recommended: ${plans[0]?.tpl.name ?? 'consultation only — client to decide'}` : null, nextReviewDate: next,
          });
          measurements.push({
            tenantId: t, clientId: c.id, recordedAt: new Date(when.getTime() + 20 * MIN), source: 'ANALYZER', weightKg: r1(w), heightCm: c.height, bodyFatPct: r1(fat), muscleMassKg: r1(muscle),
            visceralFat: Math.max(3, Math.round((fat - 18) / 2)), bodyWaterPct: r2(60 - fat * 0.45), bmrKcal: Math.round(370 + 21.6 * (w * (1 - fat / 100))), metabolicAge: Math.round(25 + fat - 20),
            waistCm: r1(waist), hipCm: r1(hip), abdomenCm: r1(waist + 4), armCm: r2(c.gender === 'Male' ? 34 - k * 0.1 : 31 - k * 0.15), thighCm: r2(c.gender === 'Male' ? 60 - k * 0.2 : 62 - k * 0.3), chestCm: r2(c.gender === 'Male' ? 108 - k * 0.2 : 96 - k * 0.2),
          });
          followUps.push({ tenantId: t, clientId: c.id, type: 'REVIEW', dueDate: next, status: 'OPEN', title: `${c.interval}-day progress review`, assignedToId: user.salha, completedAt: null, outcome: null, createdAt: when });
          lastReview = when;
        }
      }
      // Progress between reviews (treatments working, with some noise/plateaus).
      w -= rnd() * 1.1 + 0.3; fat -= rnd() * 0.9 + 0.2; waist -= rnd() * 1.6 + 0.4; hip -= rnd() * 1.0 + 0.2; muscle += rnd() * 0.3 - 0.05;
      d = addDays(d, c.interval + int(-1, 3));
      k++;
    }
    reviewDates.set(c.id, addDays(lastReview, c.interval));
  }
  // Only the latest review task per client stays open; earlier ones are closed.
  const latest = new Map<string, (typeof followUps)[number]>();
  for (const f of followUps) { const l = latest.get(f.clientId); if (!l || f.dueDate > l.dueDate) latest.set(f.clientId, f); }
  for (const f of followUps) if (latest.get(f.clientId) !== f) Object.assign(f, { status: chance(0.92) ? 'DONE' : 'SKIPPED', completedAt: f.dueDate, outcome: 'Review consultation completed' });
  // Clients who stopped coming long ago shouldn't clutter today's task list.
  for (const f of latest.values()) if (f.dueDate < addDays(TODAY, -8)) Object.assign(f, { status: 'SKIPPED', completedAt: addDays(f.dueDate, 14), outcome: 'Client not reachable after 3 attempts' });

  // ---- Persist appointments + session records ----
  appts.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const apptRows = [], sessionRows = [];
  for (const a of appts) {
    const { _value, ...data } = a;
    const id = randomUUID();
    apptRows.push({ ...data, id });
    if (a.status === 'COMPLETED') {
      const actualStart = new Date(a.startAt.getTime() + int(-5, 10) * MIN);
      const dur = (a.endAt.getTime() - a.startAt.getTime()) / MIN - tr[keyOfTreatment[a.treatmentId]].bufferMin;
      sessionRows.push({
        tenantId: t, appointmentId: id, clientPackageItemId: a.clientPackageItemId, therapistId: a.therapistId, machineId: a.machineId,
        actualStart, actualEnd: new Date(actualStart.getTime() + (dur + int(-5, 5)) * MIN), value: _value ?? 0, notes: pick(SESSION_NOTES),
      });
    }
  }
  for (let i = 0; i < apptRows.length; i += 2000) await prisma.appointment.createMany({ data: apptRows.slice(i, i + 2000) });
  for (let i = 0; i < sessionRows.length; i += 2000) await prisma.sessionRecord.createMany({ data: sessionRows.slice(i, i + 2000) });
  for (const [itemId, used] of usage) await prisma.clientPackageItem.update({ where: { id: itemId }, data: { usedSessions: used } });

  // Package statuses: completed when fully used, expired when past validity.
  const pkgs = await prisma.clientPackage.findMany({ where: { tenantId: t }, include: { items: true } });
  for (const p of pkgs) {
    if (p.items.every((i) => i.usedSessions >= i.totalSessions)) await prisma.clientPackage.update({ where: { id: p.id }, data: { status: 'COMPLETED' } });
    else if (p.expiresAt < NOW) await prisma.clientPackage.update({ where: { id: p.id }, data: { status: 'EXPIRED' } });
  }

  await prisma.consultation.createMany({ data: consultations });
  await prisma.measurement.createMany({ data: measurements as never });
  await prisma.followUp.createMany({ data: followUps });
  for (const c of clientRows) {
    const open = latest.get(c.id);
    await prisma.client.update({ where: { id: c.id }, data: { nextReviewDate: open?.status === 'OPEN' ? open.dueDate : reviewDates.get(c.id), active: c.active || !!open } });
  }

  // A couple of callback tasks created by reception.
  const someClients = clientRows.slice(-30);
  await prisma.followUp.createMany({
    data: [
      { tenantId: t, clientId: someClients[2].id, type: 'CALLBACK', dueDate: TODAY, title: 'Call back about Bridal Sculpt pricing', assignedToId: user.reception },
      { tenantId: t, clientId: someClients[7].id, type: 'CALLBACK', dueDate: addDays(TODAY, -1), title: 'Confirm Tabby installment plan', assignedToId: user.reception },
      { tenantId: t, clientId: someClients[11].id, type: 'CALLBACK', dueDate: addDays(TODAY, 1), title: 'Send before/after photos comparison', assignedToId: user.salha },
    ],
  });

  // ---- One refund (credit note) for realism ----
  const refundInv = await prisma.invoice.findFirst({ where: { tenantId: t, status: 'PAID', items: { some: { kind: 'PACKAGE' } }, issuedAt: { lt: addDays(TODAY, -60), gt: addDays(TODAY, -120) } }, orderBy: { issuedAt: 'asc' } });
  if (refundInv) {
    const amt = r2(Number(refundInv.total) * 0.4);
    const vat = r2(Number(refundInv.vatAmount) * 0.4);
    const cn = await prisma.invoice.create({
      data: {
        tenantId: t, kind: 'CREDIT_NOTE', refInvoiceId: refundInv.id, number: `CN-${TODAY.getFullYear()}-00001`, clientId: refundInv.clientId, subtotal: -(amt - vat), taxable: -(amt - vat), vatAmount: -vat, total: -amt,
        status: 'ISSUED', notes: 'Client relocated abroad — unused sessions refunded', issuedAt: addDays(refundInv.issuedAt, 30), createdById: user.salha,
        items: { create: [{ kind: 'OTHER', description: `Credit against ${refundInv.number}: unused sessions`, qty: 1, unitPrice: -(amt - vat), vatRate: 5, vatAmount: -vat, lineTotal: -amt }] },
      },
    });
    await prisma.payment.create({ data: { tenantId: t, invoiceId: cn.id, kind: 'REFUND', amount: amt, method: 'CARD', paidAt: addDays(refundInv.issuedAt, 31), receivedBy: user.accounts, receiptNo: 'RFD-00001' } });
    await prisma.tenant.update({ where: { id: t }, data: { creditSeq: 1 } });
  }

  // ---- Leads pipeline ----
  const LEADS = [
    ['Amira Saeed', 'Instagram', 'Emsculpt NEO', 'NEW'], ['Rebecca Hall', 'Google', 'Fat freezing – abdomen', 'NEW'], ['Shaikha Al Mheiri', 'Referral', 'Bridal package', 'CONTACTED'],
    ['Pooja Sharma', 'Instagram', 'Cellulite treatment', 'CONTACTED'], ['Victoria Lane', 'Website', 'HIFU tightening', 'CONSULT_BOOKED'], ['Hala Darwish', 'TikTok', 'Onda Pro', 'NEW'],
    ['Diana Popescu', 'Facebook', 'Post-pregnancy contouring', 'CONSULT_BOOKED'], ['Mahra Al Kaabi', 'Walk-in', 'Lymphatic detox', 'CONTACTED'], ['Ritu Agarwal', 'Google', 'General slimming', 'LOST'],
    ['Sofia Mendes', 'Instagram', 'Emsculpt NEO', 'NEW'], ['Karim Fawzi', 'Referral', 'Male chest contouring', 'CONTACTED'], ['Jenny Tan', 'Website', 'Cryo – flanks', 'LOST'],
    ['Wafa Al Hammadi', 'Instagram', 'Body Contour Starter', 'NEW'], ['Lauren Price', 'Google', 'Skin tightening arms', 'CONSULT_BOOKED'],
  ] as const;
  for (const [i, [name, source, interest, status]] of LEADS.entries()) {
    await prisma.lead.create({
      data: {
        tenantId: t, name, mobile: `05${int(0, 9)}${int(1000000, 9999999)}`, gender: name.startsWith('Karim') ? 'Male' : 'Female', source, interest, status, ownerId: user.reception,
        notes: status === 'LOST' ? pick(['Chose a cheaper clinic', 'Budget not available this month']) : status === 'CONSULT_BOOKED' ? 'Free consultation booked' : 'Asked for price list on WhatsApp',
        nextActionAt: status === 'LOST' ? null : addDays(TODAY, int(-1, 4)), createdAt: addDays(TODAY, -int(0, 25) - i),
      },
    });
  }

  // Converted enquiries link to the clients they became.
  for (const [i, c] of clientRows.slice(-30).filter((_, k) => k % 4 === 0).entries()) {
    const plan = clientPlans[clientRows.indexOf(c)]; // clientRows were created in clientPlans order
    await prisma.lead.create({
      data: {
        tenantId: t, name: plan.name, mobile: `05${int(0, 9)}${int(1000000, 9999999)}`, gender: c.gender, source: pick(SOURCES), interest: pick(GOALS), status: 'CONVERTED',
        ownerId: user.reception, clientId: c.id, notes: 'Booked consultation and bought a package', createdAt: addDays(c.joined, -int(2, 10)) , nextActionAt: null,
      },
    });
    if (i > 6) break;
  }

  // ---- Message history ----
  const recent = await prisma.appointment.findMany({ where: { tenantId: t, startAt: { gte: addDays(TODAY, -3), lt: addDays(TODAY, 2) } }, include: { client: true, treatment: true }, take: 25 });
  for (const a of recent) {
    if (!a.client.whatsappOptIn) continue;
    await prisma.messageLog.create({
      data: {
        tenantId: t, clientId: a.clientId, channel: 'WHATSAPP', to: a.client.mobile, sentById: user.reception, sentAt: new Date(a.startAt.getTime() - DAY),
        body: `Hi ${a.client.name.split(' ')[0]}, this is a reminder of your ${a.treatment.name} appointment at Walnut on ${a.startAt.toDateString()} at ${a.startAt.toTimeString().slice(0, 5)}.`,
      },
    });
  }

  // Machine in maintenance right now (no future bookings were placed on it).
  await prisma.machine.update({ where: { id: maintenanceMachine.id }, data: { status: 'MAINTENANCE', notes: 'RF handpiece sent for repair — expected back next week' } });

  await prisma.auditLog.createMany({
    data: [
      { tenantId: t, userId: user.admin, action: 'tenant.setup', entity: 'Tenant', entityId: t, createdAt: FIRST },
      { tenantId: t, userId: user.salha, action: 'machine.status', entity: 'Machine', entityId: maintenanceMachine.id, details: { status: 'MAINTENANCE' }, createdAt: addDays(NOW, -2) },
    ],
  });

  const counts = { clients: clientRows.length, appointments: appts.length, invoices: invSeq, consultations: consultations.length, measurements: measurements.length };
  console.log('Seeded Walnut demo:', counts);
  console.log('Login: centre "walnut", e.g. salha@walnut.local / SEED_PASSWORD');
}

main().finally(() => prisma.$disconnect());
