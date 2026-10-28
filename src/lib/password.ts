// Password policy shared by the browser (live checklist) and server actions
// (enforcement). Keep this file free of Node-only APIs.

export const MIN_PASSWORD_LENGTH = 10;
// bcrypt only uses the first 72 bytes of a password.
export const MAX_PASSWORD_BYTES = 72;

// Safari/iCloud Keychain reads this to generate passwords that pass.
export const PASSWORD_RULES_ATTR =
  "minlength: 10; maxlength: 72; required: lower, upper; required: digit; required: special;";

export const PASSWORD_RULES: { label: string; test: (pw: string) => boolean }[] = [
  {
    label: `At least ${MIN_PASSWORD_LENGTH} characters`,
    test: (pw) => [...pw].length >= MIN_PASSWORD_LENGTH,
  },
  { label: "A letter", test: (pw) => /\p{L}/u.test(pw) },
  { label: "A number", test: (pw) => /\p{N}/u.test(pw) },
  { label: "A symbol (e.g. ! ? # _)", test: (pw) => /[^\p{L}\p{N}\s]/u.test(pw) },
];

// Error message for the first unmet rule, or null when the password is valid.
export function passwordError(pw: string): string | null {
  if (new TextEncoder().encode(pw).length > MAX_PASSWORD_BYTES) {
    return "Password must be 72 characters or fewer";
  }
  const failed = PASSWORD_RULES.filter((r) => !r.test(pw));
  if (failed.length === 0) return null;
  return `Password needs: ${failed.map((r) => r.label.toLowerCase()).join(", ")}`;
}
