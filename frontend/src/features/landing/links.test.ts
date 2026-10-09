import { describe, expect, it } from "vitest";

import { EXTERNAL_LINKS, NAV_LINKS, REPOSITORY_URL, repositoryLink } from "./links";

const REPO = "https://github.com/acme/spanlight";

describe("repositoryLink", () => {
  it("returns the repository itself without a target", () => {
    expect(repositoryLink(REPO)).toBe(REPO);
    expect(repositoryLink(`${REPO}/`)).toBe(REPO);
  });

  it("appends README anchors to the repository URL", () => {
    expect(repositoryLink(REPO, "#readme")).toBe(`${REPO}#readme`);
  });

  it("links files on the default branch, keeping their anchor", () => {
    expect(repositoryLink(REPO, "sdks/python/README.md")).toBe(
      `${REPO}/blob/main/sdks/python/README.md`,
    );
    expect(repositoryLink(`${REPO}/`, "/docs/api-deviations.md#errors")).toBe(
      `${REPO}/blob/main/docs/api-deviations.md#errors`,
    );
  });
});

describe("landing links", () => {
  it("point at the real Spanlight repository", () => {
    expect(REPOSITORY_URL).toMatch(/^https:\/\/github\.com\/[^/]+\/spanlight$/);
  });

  it("derive every external link from the repository URL", () => {
    for (const href of Object.values(EXTERNAL_LINKS)) {
      expect(href.startsWith(REPOSITORY_URL.replace(/\/+$/, ""))).toBe(true);
    }
  });

  it("scroll to the landing sections from the nav", () => {
    expect(NAV_LINKS.map((link) => link.href)).toEqual([
      "#features",
      "#how-it-works",
      "#open-source",
      EXTERNAL_LINKS.docs,
    ]);
  });
});
