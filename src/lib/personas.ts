// Persona definitions shared between the sidebar, header and role switcher.
// Each role has a landing page (where the role switcher drops you) and a set
// of accent classes used to emphasize that persona in the chrome.

export type PersonaRole = 'CLINICIAN' | 'OPS_DIRECTOR' | 'CMIO'

type Persona = {
  /** Section header + chip label */
  label: string
  /** One-line description of what this persona does */
  blurb: string
  /** Where the role switcher lands when this persona is selected */
  landing: string
  /** Solid accent dot (e.g. bg-blue-500) */
  dot: string
  /** Tinted ring-chip classes (bg + text + ring color) */
  chip: string
}

export const PERSONAS: Record<PersonaRole, Persona> = {
  CLINICIAN: {
    label:   'Clinician',
    blurb:   'Record & document visits',
    landing: '/record',
    dot:     'bg-blue-500',
    chip:    'bg-blue-50 text-blue-700 ring-blue-200',
  },
  OPS_DIRECTOR: {
    label:   'Operations',
    blurb:   'Patient-flow digital twin',
    landing: '/twin',
    dot:     'bg-violet-500',
    chip:    'bg-violet-50 text-violet-700 ring-violet-200',
  },
  CMIO: {
    label:   'Quality & compliance',
    blurb:   'Documentation KPIs',
    landing: '/',
    dot:     'bg-emerald-500',
    chip:    'bg-emerald-50 text-emerald-700 ring-emerald-200',
  },
}

/** Landing route for a role, falling back to the KPI dashboard. */
export function landingForRole(role: string | undefined): string {
  return PERSONAS[role as PersonaRole]?.landing ?? '/'
}
