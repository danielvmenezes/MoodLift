import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

type Row = { slug: string; text: string; form: "prose" | "verse" };

const quotes: Row[] = JSON.parse(
  readFileSync(join(process.cwd(), "data", "quotes", "quotes.json"), "utf8"),
);

// Every quote in the data set must fit the smallest card (320px-wide phone)
// at the 12px floor. Renders each into the live card the way QuoteView does.
test("every quote in the data set fits the smallest card at 12px", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-small", "smallest viewport only");
  test.setTimeout(120_000);
  await page.goto("/");
  const text = page.getByTestId("quote-text");
  await expect(page.getByTestId("quote-card")).toBeVisible();
  await expect(text).not.toBeEmpty();
  await page.evaluate(() => document.fonts.ready);

  const tooLong = await text.evaluate((quote: HTMLElement, rows: Row[]) => {
    // CSS-module class names are hashed; find the verse/line ones by suffix.
    const selectors = [...document.styleSheets].flatMap((s) => {
      try {
        return [...s.cssRules].map((r) => (r as CSSStyleRule).selectorText ?? "");
      } catch {
        return [];
      }
    });
    const cls = (name: string) =>
      selectors.map((s) => s.match(new RegExp(`\\.([\\w-]*_${name})\\b`))?.[1]).find(Boolean)!;
    const verseClass = cls("verse");
    const lineClass = cls("line");
    const area = quote.parentElement!;
    const base = quote.className.split(" ").filter((c) => c !== verseClass).join(" ");

    const failures: string[] = [];
    for (const row of rows) {
      quote.className = row.form === "verse" ? `${base} ${verseClass}` : base;
      quote.replaceChildren();
      if (row.form === "verse") {
        for (const line of row.text.split("\n")) {
          const span = document.createElement("span");
          span.className = lineClass;
          span.textContent = line;
          quote.append(span);
        }
      } else {
        quote.textContent = `“${row.text}”`;
      }
      quote.style.fontSize = "12px";
      if (quote.offsetHeight > area.clientHeight + 1) failures.push(row.slug);
    }
    return failures;
  }, quotes);

  expect(tooLong, `quotes too long for the card: ${tooLong.join(", ")}`).toEqual([]);
});
