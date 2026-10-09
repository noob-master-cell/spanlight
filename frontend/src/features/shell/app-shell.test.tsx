import { act, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { readLastProject } from "@/lib/last-project";
import { makeProject, mockSignedIn, ORG_ID, renderApp } from "@/test/render-app";

async function expectLastProject(projectId: string) {
  await waitFor(() => {
    expect(readLastProject()).toEqual({ orgId: ORG_ID, projectId });
  });
}

describe("AppShell", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("remembers every project it opens, so / can return to it", async () => {
    mockSignedIn([makeProject("proj_1", "Checkout"), makeProject("proj_2", "Search")]);
    const router = renderApp(`/${ORG_ID}/proj_1/settings/project`);
    await expectLastProject("proj_1");

    const switchTo = (projectId: string) =>
      act(() =>
        router.navigate({
          to: "/$orgId/$projectId/settings/project",
          params: { orgId: ORG_ID, projectId },
        }),
      );

    await switchTo("proj_2");
    await expectLastProject("proj_2");

    // Back to a project that is already cached: it loads instantly, and still counts as a visit.
    await switchTo("proj_1");
    await expectLastProject("proj_1");
  });

  it("doesn't remember a project that doesn't exist", async () => {
    mockSignedIn([makeProject("proj_1", "Checkout")]);
    renderApp(`/${ORG_ID}/missing/settings/project`);

    expect(await screen.findByText("Page not found")).toBeInTheDocument();
    expect(readLastProject()).toBeNull();
  });
});
