// CryptoAlpha — Structured Logger
// Section 6: Developer Experience
// Uses console in dev, suppresses info/warn in production.

const isDev = import.meta.env.DEV;

export const logger = {
  info: (msg: string, data?: object) => {
    if (isDev) console.info(`[INFO] ${msg}`, ...(data ? [data] : []));
  },
  warn: (msg: string, data?: object) => {
    if (isDev) console.warn(`[WARN] ${msg}`, ...(data ? [data] : []));
  },
  error: (msg: string, err?: unknown) => {
    // Always log errors, even in production
    console.error(`[ERROR] ${msg}`, ...(err !== undefined ? [err] : []));
  },
  debug: (msg: string, data?: object) => {
    if (isDev) console.debug(`[DEBUG] ${msg}`, ...(data ? [data] : []));
  },
};
