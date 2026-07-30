import { AskScreen, ask, synthesiseWithClaude } from "@features/ask";
import { Screen } from "@shared/components/Screen";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const question = q?.trim() ?? "";

  return (
    <Screen
      render={async ({ db, workspaceId }) => {
        if (question.length === 0) return <AskScreen answer={null} />;

        const answer = await ask(
          { db, synthesise: synthesiseWithClaude },
          workspaceId,
          question,
        );
        return <AskScreen answer={answer} />;
      }}
    />
  );
}
