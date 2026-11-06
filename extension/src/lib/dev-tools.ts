// ============================================================
// NEXORA Developer Tools — all operations are purely local
// ============================================================

// ---- JSON ----

export interface JsonResult {
  ok: boolean;
  formatted?: string;
  error?: string;
  type?: string;
  size?: number;
}

export function formatJson(input: string): JsonResult {
  try {
    const parsed = JSON.parse(input);
    const formatted = JSON.stringify(parsed, null, 2);
    return {
      ok: true,
      formatted,
      type: Array.isArray(parsed) ? 'array' : typeof parsed,
      size: input.length,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ---- Base64 ----

export function encodeBase64(input: string): string {
  return btoa(unescape(encodeURIComponent(input)));
}

export function decodeBase64(input: string): { ok: boolean; value?: string; error?: string } {
  try {
    return { ok: true, value: decodeURIComponent(escape(atob(input.trim()))) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ---- URL Parser ----

export interface ParsedUrl {
  ok: boolean;
  href?: string;
  protocol?: string;
  host?: string;
  hostname?: string;
  port?: string;
  pathname?: string;
  search?: string;
  hash?: string;
  params?: Record<string, string>;
  error?: string;
}

export function parseUrl(input: string): ParsedUrl {
  try {
    const url = new URL(input.trim());
    const params: Record<string, string> = {};
    url.searchParams.forEach((v, k) => { params[k] = v; });
    return {
      ok: true,
      href: url.href,
      protocol: url.protocol,
      host: url.host,
      hostname: url.hostname,
      port: url.port,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
      params,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ---- Timestamp Converter ----

export interface TimestampResult {
  unix: number;
  unixMs: number;
  iso: string;
  utc: string;
  local: string;
}

export function convertTimestamp(input: string): { ok: boolean; result?: TimestampResult; error?: string } {
  try {
    let ts: number;
    const trimmed = input.trim();

    if (/^\d+$/.test(trimmed)) {
      const n = parseInt(trimmed, 10);
      ts = n > 1_000_000_000_000 ? n : n * 1000;
    } else {
      ts = new Date(trimmed).getTime();
    }

    if (isNaN(ts)) throw new Error('Invalid date or timestamp');

    const d = new Date(ts);
    return {
      ok: true,
      result: {
        unix: Math.floor(ts / 1000),
        unixMs: ts,
        iso: d.toISOString(),
        utc: d.toUTCString(),
        local: d.toLocaleString(),
      },
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ---- JWT Inspector ----
// IMPORTANT: JWT tokens are NEVER transmitted. All inspection is purely local.

export interface JwtPayload {
  ok: boolean;
  header?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  signaturePresent?: boolean;
  expiresAt?: string | null;
  issuedAt?: string | null;
  expired?: boolean;
  error?: string;
}

export function inspectJwt(token: string): JwtPayload {
  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    return { ok: false, error: 'Invalid JWT: must have 3 parts' };
  }

  try {
    const decodeBase64Url = (s: string): Record<string, unknown> => {
      const padded = s.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='));
      return JSON.parse(decoded) as Record<string, unknown>;
    };

    const header = decodeBase64Url(parts[0]!);
    const payload = decodeBase64Url(parts[1]!);

    const exp = typeof payload['exp'] === 'number' ? payload['exp'] * 1000 : null;
    const iat = typeof payload['iat'] === 'number' ? payload['iat'] * 1000 : null;
    const now = Date.now();

    return {
      ok: true,
      header,
      payload,
      signaturePresent: (parts[2]?.length ?? 0) > 0,
      expiresAt: exp ? new Date(exp).toISOString() : null,
      issuedAt: iat ? new Date(iat).toISOString() : null,
      expired: exp !== null ? now > exp : false,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
