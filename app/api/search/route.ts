import { NextResponse } from "next/server";

import { search } from "@features/search";
import { getWorkspaceContext } from "@shared/services/workspace";

/**
 * Backs the ⌘K palette. Runs server-side so the browser never holds a database
 * credential and the query is always scoped to the caller's workspace.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const query = new URL(request.url).searchParams.get("q") ?? "";

  const context = await getWorkspaceContext();
  if (!context) {
    return NextResponse.json({ query, groups: [], total: 0 });
  }

  const results = await search(context.db, context.workspaceId, query);
  return NextResponse.json(results);
}
