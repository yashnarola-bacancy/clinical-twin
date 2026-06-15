-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CLINICIAN', 'OPS_DIRECTOR', 'CMIO');

-- CreateEnum
CREATE TYPE "EncounterStatus" AS ENUM ('CHECKED_IN', 'IN_EXAM', 'AWAITING_REVIEW', 'SIGNED', 'SYNCED');

-- CreateEnum
CREATE TYPE "Disposition" AS ENUM ('DISCHARGE', 'ADMIT_WARD', 'ADMIT_ICU', 'REFERRAL', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "CodeSystem" AS ENUM ('ICD10CM', 'CPT', 'SNOMEDCT');

-- CreateEnum
CREATE TYPE "NoteStatus" AS ENUM ('DRAFT', 'EDITED', 'SIGNED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CLINICIAN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "mrn" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dob" TIMESTAMP(3) NOT NULL,
    "sex" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Encounter" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clinicianId" TEXT NOT NULL,
    "status" "EncounterStatus" NOT NULL DEFAULT 'CHECKED_IN',
    "department" TEXT NOT NULL DEFAULT 'OUTPATIENT',
    "chiefComplaint" TEXT,
    "checkInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "examStartAt" TIMESTAMP(3),
    "examEndAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "predictedDisposition" "Disposition",
    "dispositionConfidence" DOUBLE PRECISION,
    "orderedLabs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "orderedImaging" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Encounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transcript" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "speakers" JSONB,
    "durationSec" INTEGER,
    "audioDeleted" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transcript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalNote" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "status" "NoteStatus" NOT NULL DEFAULT 'DRAFT',
    "subjective" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "assessment" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "aiModel" TEXT,
    "generationMs" INTEGER,
    "editedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "signedById" TEXT,
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeSuggestion" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "system" "CodeSystem" NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CodeSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EhrSyncLog" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "fhirBundle" JSONB NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EhrSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulationRun" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "results" JSONB NOT NULL,
    "baselineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimulationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_mrn_key" ON "Patient"("mrn");

-- CreateIndex
CREATE INDEX "Encounter_status_department_idx" ON "Encounter"("status", "department");

-- CreateIndex
CREATE INDEX "Encounter_checkInAt_idx" ON "Encounter"("checkInAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transcript_encounterId_key" ON "Transcript"("encounterId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalNote_encounterId_key" ON "ClinicalNote"("encounterId");

-- CreateIndex
CREATE INDEX "CodeSuggestion_noteId_idx" ON "CodeSuggestion"("noteId");

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_clinicianId_fkey" FOREIGN KEY ("clinicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeSuggestion" ADD CONSTRAINT "CodeSuggestion_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "ClinicalNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EhrSyncLog" ADD CONSTRAINT "EhrSyncLog_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
