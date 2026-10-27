import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "prilulu_admin_session";
const MAX_AGE_SECONDS = 60 * 60 * 12;

function signature(expiry: string) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("Configure ADMIN_SESSION_SECRET.");
  return createHmac("sha256", secret).update(expiry).digest("hex");
}

export function adminConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_SESSION_SECRET);
}

export function passwordMatches(candidate: string) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || candidate.length > 256) return false;
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createAdminToken() {
  const expiry = String(Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS);
  return `${expiry}.${signature(expiry)}`;
}

export async function isAdminAuthenticated() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return false;
  const [expiry, provided] = token.split(".");
  if (!expiry || !provided || Number(expiry) <= Math.floor(Date.now() / 1000)) return false;
  try {
    const expected = signature(expiry);
    const left = Buffer.from(provided);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

export const adminCookie = { name: COOKIE_NAME, maxAge: MAX_AGE_SECONDS };
