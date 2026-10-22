-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('INVOICE', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('PAYMENT', 'REFUND');

-- CreateEnum
CREATE TYPE "TaxCategory" AS ENUM ('STANDARD', 'ZERO', 'EXEMPT');

-- CreateEnum
CREATE TYPE "ResourceKind" AS ENUM ('MACHINE', 'THERAPIST', 'ROOM');

-- CreateEnum
CREATE TYPE "FollowUpType" AS ENUM ('REVIEW', 'PACKAGE_EXPIRY', 'CALLBACK', 'PAYMENT_DUE');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'CONSULT_BOOKED', 'CONVERTED', 'LOST');

-- CreateEnum
CREATE TYPE "DocKind" AS ENUM ('CONSENT', 'PHOTO_BEFORE', 'PHOTO_AFTER', 'REPORT', 'OTHER');

-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_machineId_fkey";

-- DropForeignKey
ALTER TABLE "SessionRecord" DROP CONSTRAINT "SessionRecord_clientPackageItemId_fkey";

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "machineId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "address" TEXT,
ADD COLUMN     "allergies" TEXT,
ADD COLUMN     "altPhone" TEXT,
ADD COLUMN     "conditions" TEXT,
ADD COLUMN     "consentSignedAt" TIMESTAMP(3),
ADD COLUMN     "contraindications" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "emergencyName" TEXT,
ADD COLUMN     "emergencyPhone" TEXT,
ADD COLUMN     "emergencyRelation" TEXT,
ADD COLUMN     "emiratesId" TEXT,
ADD COLUMN     "goal" TEXT,
ADD COLUMN     "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "medications" TEXT,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "occupation" TEXT,
ADD COLUMN     "photoConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "referredBy" TEXT,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "targetWeightKg" DOUBLE PRECISION,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "vip" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "whatsappOptIn" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ClientPackage" ADD COLUMN     "invoiceId" TEXT;

-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN     "complaint" TEXT,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'INITIAL',
ADD COLUMN     "nextReviewDate" TIMESTAMP(3),
ADD COLUMN     "suitability" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "kind" "InvoiceKind" NOT NULL DEFAULT 'INVOICE',
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "paid" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "refInvoiceId" TEXT,
ADD COLUMN     "taxable" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Machine" ADD COLUMN     "brand" TEXT,
ADD COLUMN     "installedAt" TIMESTAMP(3),
ADD COLUMN     "lastServiceAt" TIMESTAMP(3),
ADD COLUMN     "nextServiceAt" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "Measurement" ADD COLUMN     "abdomenCm" DOUBLE PRECISION,
ADD COLUMN     "armCm" DOUBLE PRECISION,
ADD COLUMN     "bmrKcal" DOUBLE PRECISION,
ADD COLUMN     "chestCm" DOUBLE PRECISION,
ADD COLUMN     "metabolicAge" DOUBLE PRECISION,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "thighCm" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "PackageTemplate" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "kind" "PaymentKind" NOT NULL DEFAULT 'PAYMENT',
ADD COLUMN     "receiptNo" TEXT,
ADD COLUMN     "receivedBy" TEXT,
ADD COLUMN     "reference" TEXT;

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "SessionRecord" ADD COLUMN     "value" DECIMAL(10,2) NOT NULL DEFAULT 0,
ALTER COLUMN "clientPackageItemId" DROP NOT NULL,
ALTER COLUMN "machineId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "address" TEXT,
ADD COLUMN     "clientSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "closeMin" INTEGER NOT NULL DEFAULT 1260,
ADD COLUMN     "creditSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "invoicePrefix" TEXT NOT NULL DEFAULT 'INV',
ADD COLUMN     "invoiceSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "openMin" INTEGER NOT NULL DEFAULT 540,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "receiptSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "slotMin" INTEGER NOT NULL DEFAULT 15;

-- AlterTable
ALTER TABLE "Treatment" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'Body Contouring',
ADD COLUMN     "code" TEXT,
ADD COLUMN     "color" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "taxCategory" "TaxCategory" NOT NULL DEFAULT 'STANDARD';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "color" TEXT,
ADD COLUMN     "commissionPct" DECIMAL(5,2),
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "ResourceBlock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "ResourceKind" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'SERVICE',
    "description" TEXT NOT NULL,
    "treatmentId" TEXT,
    "packageTemplateId" TEXT,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "taxCategory" "TaxCategory" NOT NULL DEFAULT 'STANDARD',
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "vatAmount" DECIMAL(10,2) NOT NULL,
    "lineTotal" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUp" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "FollowUpType" NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "outcome" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "email" TEXT,
    "gender" TEXT,
    "source" TEXT NOT NULL DEFAULT 'Walk-in',
    "interest" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "nextActionAt" TIMESTAMP(3),
    "ownerId" TEXT,
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "purpose" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT,
    "channel" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "templateId" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "sentById" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" "DocKind" NOT NULL,
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResourceBlock_tenantId_startAt_idx" ON "ResourceBlock"("tenantId", "startAt");

-- CreateIndex
CREATE INDEX "ResourceBlock_resourceId_startAt_idx" ON "ResourceBlock"("resourceId", "startAt");

-- CreateIndex
CREATE INDEX "FollowUp_tenantId_status_dueDate_idx" ON "FollowUp"("tenantId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Lead_tenantId_status_idx" ON "Lead"("tenantId", "status");

-- CreateIndex
CREATE INDEX "MessageLog_tenantId_sentAt_idx" ON "MessageLog"("tenantId", "sentAt");

-- CreateIndex
CREATE INDEX "Document_clientId_idx" ON "Document"("clientId");

-- CreateIndex
CREATE INDEX "Client_tenantId_createdAt_idx" ON "Client"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Consultation_tenantId_date_idx" ON "Consultation"("tenantId", "date");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_issuedAt_idx" ON "Invoice"("tenantId", "issuedAt");

-- CreateIndex
CREATE INDEX "Payment_tenantId_paidAt_idx" ON "Payment"("tenantId", "paidAt");

-- CreateIndex
CREATE INDEX "SessionRecord_tenantId_actualStart_idx" ON "SessionRecord"("tenantId", "actualStart");

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionRecord" ADD CONSTRAINT "SessionRecord_clientPackageItemId_fkey" FOREIGN KEY ("clientPackageItemId") REFERENCES "ClientPackageItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
