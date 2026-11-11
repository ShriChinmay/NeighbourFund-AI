export const ROLES = ["organiser", "reviewer", "sponsor", "resident", "admin"] as const;
export type Role = (typeof ROLES)[number];

export interface AuthUser {
  id: string;
  displayName: string;
  email: string;
  role: Role;
}
