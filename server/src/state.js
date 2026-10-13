// Shared runtime status, reported by /api/health and used to answer 503 while the
// database is unreachable.
export const state = {
  dbReady: false,
  dbError: null, // { message, hint }
  seededOnBoot: false,
  startedAt: new Date().toISOString(),
};
