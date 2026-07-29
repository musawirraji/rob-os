"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { applyReviewDecision, type ReviewDecision } from "@features/review";
import { getWorkspaceContext } from "@shared/services/workspace";
import { routes } from "@shared/navigation/routes";

/**
 * Server actions for the queue. Each redirects back with the outcome message, so
 * the user gets confirmation of what was remembered rather than a silent
 * disappearance from the list.
 */
async function apply(formData: FormData, decision: ReviewDecision): Promise<never> {
  const id = String(formData.get("id") ?? "");
  const context = await getWorkspaceContext();

  if (!context || id.length === 0) {
    redirect(`${routes.review()}?m=${encodeURIComponent("Could not apply that.")}`);
  }

  const outcome = await applyReviewDecision(
    context.db,
    context.workspaceId,
    id,
    decision,
  );

  revalidatePath(routes.review());
  redirect(`${routes.review()}?m=${encodeURIComponent(outcome.message)}`);
}

export async function approveItem(formData: FormData): Promise<void> {
  await apply(formData, { action: "approve" });
}

export async function rejectItem(formData: FormData): Promise<void> {
  await apply(formData, { action: "reject" });
}

export async function correctItem(formData: FormData): Promise<void> {
  const entityId = formData.get("entityId");
  await apply(formData, {
    action: "correct",
    entityId: typeof entityId === "string" && entityId.length > 0 ? entityId : null,
  });
}
