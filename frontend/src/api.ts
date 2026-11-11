export type Role = "organiser" | "reviewer" | "sponsor" | "resident" | "admin";
export type User = { id: string; displayName: string; email: string; role: Role };
export type Budget = { id: string; category: string; description: string; approvedMinor: string; version: number };
export type Milestone = { id: string; title: string; status: string; dueDate: string | null };
export type Project = { id: string; communityName: string; title: string; description: string; goalMinor: string; status: string; budgets: Budget[]; milestones: Milestone[] };
export type Feasibility = { planId: string; verdict: string; households: number; perHouseholdMinor: string; residentRequiredMinor: string; residentCapacityMinor: string; gapMinor: string; accepted: boolean };
export type Slot = { id: string; label: string; amountMinor: string; status: string };
export type Household = { id: string; participating: boolean; coveredByPool: boolean };
export const demoProjectId = "c2d2a512-62a1-4fc1-945c-e2d6ecd386ce";
export function usd(minor: string | number): string { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(minor) / 100); }
export async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method, credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const parsed = data as { error?: { message?: string } };
    throw new Error(parsed.error?.message || `Request failed (${response.status})`);
  }
  return data as T;
}
