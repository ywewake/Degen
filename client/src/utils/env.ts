// CryptoAlpha — Environment Variable Validation
// Section 2, Problem 5: No environment variable validation at startup.
// Note: Supabase vars are optional in V1 (app works without auth/DB).
// Only VITE_APP_TITLE is truly required (provided by the platform).

const OPTIONAL_ENV_VARS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
] as const;

/**
 * Validates that optional env vars, if present, are non-empty strings.
 * Logs warnings for missing optional vars in dev.
 * Does NOT throw — the app degrades gracefully without Supabase.
 */
export function validateEnv(): void {
  const isDev = import.meta.env.DEV;

  for (const key of OPTIONAL_ENV_VARS) {
    const value = import.meta.env[key];
    if (!value && isDev) {
      console.warn(
        `[CryptoAlpha] Optional env var ${key} is not set. ` +
        `Auth and Pro features will be unavailable. ` +
        `See .env.example for setup instructions.`
      );
    }
  }
}

/**
 * Returns true if Supabase is configured and available.
 */
export function isSupabaseConfigured(): boolean {
  return !!(
    import.meta.env.VITE_SUPABASE_URL &&
    import.meta.env.VITE_SUPABASE_ANON_KEY
  );
}

/**
 * Returns the app title from env or a sensible default.
 */
export function getAppTitle(): string {
  return import.meta.env.VITE_APP_TITLE || 'CryptoAlpha';
}
