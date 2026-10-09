import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { makeProject, mockSignedIn, mockSignedOut, ORG_ID, renderApp } from "@/test/render-app";

const INDEX_HTML_TITLE = "Spanlight — Open-source LLM observability";

async function expectTitle(title: string) {
  await waitFor(() => {
    expect(document.title).toBe(title);
  });
}

describe("document titles", () => {
  beforeEach(() => {
    document.head.innerHTML = `<title>${INDEX_HTML_TITLE}</title>`;
  });

  it("names each page and follows navigation", async () => {
    const user = userEvent.setup();
    mockSignedOut();
    renderApp("/login");
    await expectTitle("Sign in · Spanlight");

    await user.click(screen.getByRole("link", { name: "Create an account" }));
    await expectTitle("Create an account · Spanlight");

    // Routes only manage the title; the meta tags stay index.html's.
    expect(document.head.querySelectorAll("meta")).toHaveLength(0);
  });

  it("names pages inside the app shell", async () => {
    mockSignedIn([makeProject("proj_1", "Checkout")]);
    renderApp(`/${ORG_ID}/proj_1/settings/project`);
    await expectTitle("Project settings · Spanlight");
  });

  it("names the traces page", async () => {
    mockSignedIn([makeProject("proj_1", "Checkout")]);
    renderApp(`/${ORG_ID}/proj_1/traces`);
    await expectTitle("Traces · Spanlight");
  });

  it("says when a page doesn't exist", async () => {
    mockSignedOut();
    renderApp("/no/such/page/here");
    expect(await screen.findByText("Page not found")).toBeInTheDocument();
    await expectTitle("Page not found · Spanlight");
  });
});
