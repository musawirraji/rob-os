"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { captureFile, captureText } from "@features/capture";
import type { SourceKind } from "@shared/interfaces/objects";
import { SOURCE_KINDS } from "@shared/interfaces/objects";
import { getWorkspaceContext } from "@shared/services/workspace";
import { routes } from "@shared/navigation/routes";

/** Body size guard — the bucket caps at 25MB, so reject before reading it all. */
const MAX_BYTES = 26_214_400;

function kindFrom(value: FormDataEntryValue | null): SourceKind {
  const kind = String(value ?? "note");
  return (SOURCE_KINDS as readonly string[]).includes(kind)
    ? (kind as SourceKind)
    : "note";
}

function back(message: string, ok: boolean): never {
  redirect(`${routes.inbox()}?m=${encodeURIComponent(message)}&ok=${ok ? "1" : "0"}`);
}

export async function capturePaste(formData: FormData): Promise<void> {
  const context = await getWorkspaceContext();
  if (!context) back("No workspace configured.", false);

  const result = await captureText(context.db, context.workspaceId, {
    title: String(formData.get("title") ?? ""),
    kind: kindFrom(formData.get("kind")),
    text: String(formData.get("text") ?? ""),
    occurredAt: null,
  });

  revalidatePath(routes.inbox());
  revalidatePath(routes.today());
  back(result.message, result.ok);
}

export async function captureUpload(formData: FormData): Promise<void> {
  const context = await getWorkspaceContext();
  if (!context) back("No workspace configured.", false);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) back("No file was selected.", false);

  if (file.size > MAX_BYTES) {
    back(`${file.name} is ${(file.size / 1_048_576).toFixed(1)}MB — the limit is 25MB.`, false);
  }

  const result = await captureFile(
    context.db,
    context.workspaceId,
    {
      name: file.name,
      type: file.type || null,
      bytes: new Uint8Array(await file.arrayBuffer()),
    },
    kindFrom(formData.get("kind")),
  );

  revalidatePath(routes.inbox());
  revalidatePath(routes.today());
  back(result.message, result.ok);
}
