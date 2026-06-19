// Auth.js (NextAuth v5) catch-all route handler. The config lives in the
// project-root `auth.ts`; imported relatively since the `@/*` alias maps to src/.
import { handlers } from '../../../../../auth'

export const { GET, POST } = handlers
