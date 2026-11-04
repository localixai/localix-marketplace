import { expect, test } from "bun:test";
import { formatCheck, type CheckReport } from "./check";

const residue = {
  title: "template residue",
  ok: false,
  problems: ["backend/items.ts still names the template domain (`itemInputSchema`)"],
};
const passing = (title: string) => ({ title, ok: true, problems: [] });

// `mini-app check template --template` passed (exit 0) yet printed "1 check(s) failed" and
// "template residue: FAILED" over the template's own names, so CI logs read as a failure.
test("the template, checked as the template, reads as passing over its own names", () => {
  const report: CheckReport = {
    ok: false,
    buildable: true,
    steps: [residue, passing("manifest"), passing("tests")],
  };
  const text = formatCheck("template", report, { template: true });
  expect(text).not.toContain("FAILED");
  expect(text.split("\n")[0]).toBe("template: every check passed.");
  expect(text).toContain("- template residue: ok, the template names its own domain");
});

test("the template still reports a real failure in another step", () => {
  const report: CheckReport = {
    ok: false,
    buildable: false,
    steps: [residue, { title: "tests", ok: false, problems: ["1 failed"] }],
  };
  const text = formatCheck("template", report, { template: true });
  expect(text.split("\n")[0]).toBe("template: 1 check(s) failed.");
  expect(text).toContain("- tests: FAILED");
});
