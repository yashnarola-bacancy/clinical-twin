import { db, withDbRetry } from '@/lib/db'
import { fmtCheckIn } from '@/lib/fmt'
import RecordPanel, { type EncounterOption } from '@/components/encounters/record-panel'

export const metadata = { title: 'Record visit — Clinical Twin' }

export default async function RecordPage() {
  const rows = await withDbRetry(() => db.encounter.findMany({
    where: {
      status: { in: ['CHECKED_IN', 'IN_EXAM', 'AWAITING_REVIEW'] },
    },
    select: {
      id:             true,
      status:         true,
      department:     true,
      chiefComplaint: true,
      checkInAt:      true,
      patient: {
        select: { firstName: true, lastName: true, mrn: true },
      },
    },
    orderBy: { checkInAt: 'desc' },
    take: 50,
  }))

  const encounters: EncounterOption[] = rows.map(enc => ({
    id:             enc.id,
    patientName:    `${enc.patient.firstName} ${enc.patient.lastName}`,
    mrn:            enc.patient.mrn,
    chiefComplaint: enc.chiefComplaint,
    status:         enc.status,
    department:     enc.department,
    checkInLabel:   fmtCheckIn(enc.checkInAt),
  }))

  return <RecordPanel encounters={encounters} />
}
