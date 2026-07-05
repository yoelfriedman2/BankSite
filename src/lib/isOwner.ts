/** Case-insensitive check against ADMIN_EMAIL — the single owner account. */
export function isOwnerEmail(email: string | null | undefined): boolean {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || !email) return false;
  return email.toLowerCase() === adminEmail.toLowerCase();
}
