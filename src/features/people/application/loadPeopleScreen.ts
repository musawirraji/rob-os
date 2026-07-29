import "server-only";

import type { AdminClient } from "@shared/services/supabase/adminClient";
import type { ObjectListRow } from "@shared/components/objectPage";
import { relativeAge } from "@shared/services/objectFeed";
import { routes } from "@shared/navigation/routes";
import { COOLING_AFTER_DAYS } from "@shared/constants";

export type PeopleState = { rows: ObjectListRow[] };

export async function loadPeopleScreen(
  db: AdminClient,
  workspaceId: string,
  now: Date = new Date(),
): Promise<PeopleState> {
  const today = now.toISOString().slice(0, 10);

  const { data, error } = await db
    .from("person")
    .select(
      "id, name, role, last_interaction, company:company!person_company_id_fkey(name)",
    )
    .eq("workspace_id", workspaceId)
    .order("last_interaction", { ascending: false, nullsFirst: false });

  if (error) console.warn("[rob-os] loadPeopleScreen failed:", error.message);

  // One query for every open promise, rather than one per person.
  const { data: commitments } = await db
    .from("commitment")
    .select("owed_by_person_id, owed_to_person_id, owed_by_principal, deadline, status")
    .eq("workspace_id", workspaceId)
    .in("status", ["open", "due", "overdue"]);

  const owedByPrincipalTo = new Map<string, { count: number; overdue: number }>();
  for (const row of commitments ?? []) {
    if (!row.owed_by_principal || !row.owed_to_person_id) continue;
    const entry = owedByPrincipalTo.get(row.owed_to_person_id) ?? { count: 0, overdue: 0 };
    entry.count += 1;
    if (row.deadline !== null && row.deadline < today) entry.overdue += 1;
    owedByPrincipalTo.set(row.owed_to_person_id, entry);
  }

  const rows: ObjectListRow[] = (data ?? []).map((person) => {
    const company = (person.company as { name: string } | null)?.name ?? null;
    const owed = owedByPrincipalTo.get(person.id);
    const silentDays = person.last_interaction
      ? Math.floor((now.getTime() - new Date(person.last_interaction).getTime()) / 86_400_000)
      : null;
    const cooling = silentDays !== null && silentDays >= COOLING_AFTER_DAYS;

    return {
      id: person.id,
      href: routes.person(person.id),
      tile: "person" as const,
      name: person.name,
      subtitle: [person.role, company].filter(Boolean).join(" · ") || null,
      meta: person.last_interaction
        ? `${relativeAge(person.last_interaction, now)}`
        : "never",
      // The badge answers "is anything wrong here" at a glance: an overdue promise
      // outranks a cooling relationship, which outranks nothing.
      badgeLabel:
        owed && owed.overdue > 0
          ? "You're late"
          : cooling
            ? "Cooling"
            : owed && owed.count > 0
              ? "You owe"
              : null,
      badgeTone:
        owed && owed.overdue > 0 ? "crit" : cooling ? "warn" : owed ? "neutral" : null,
    };
  });

  return { rows };
}
