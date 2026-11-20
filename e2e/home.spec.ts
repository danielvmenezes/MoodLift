import { expect, test, type Page } from "@playwright/test";

function luminance([r, g, b]: number[]) {
  const [R, G, B] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrast(a: number[], b: number[]) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Brightest pixel of the card with its text hidden: the worst case for legibility.
async function brightestCardPixel(page: Page) {
  const card = page.getByTestId("quote-card");
  await page.addStyleTag({ content: "[data-testid=quote-card] * { visibility: hidden !important; }" });
  const png = await card.screenshot({ animations: "disabled" });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    // Skip the rounded corners / rim.
    const inset = 40;
    const { data } = ctx.getImageData(inset, inset, img.width - inset * 2, img.height - inset * 2);
    let best = [0, 0, 0];
    let bestSum = -1;
    for (let i = 0; i < data.length; i += 4) {
      const sum = data[i] + data[i + 1] + data[i + 2];
      if (sum > bestSum) {
        bestSum = sum;
        best = [data[i], data[i + 1], data[i + 2]];
      }
    }
    return best;
  }, png.toString("base64"));
}

test.describe("Main quote page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Quotes stream in from Supabase; wait until React has revealed the real
    // card (it sits hidden in the DOM for a moment before the swap).
    await expect(page.getByTestId("quote-card")).toBeVisible();
    await expect(page.getByTestId("quote-text")).not.toBeEmpty();
    await expect(page.getByTestId("next-quote-button")).toBeEnabled();
  });

  test("shows quote, journal button and new-quote circle in order", async ({ page }) => {
    const card = page.getByTestId("quote-card");
    const journal = page.getByTestId("journal-button");
    const next = page.getByRole("button", { name: "Show another quote" });

    await expect(card).toBeVisible();
    await expect(page.getByTestId("quote-text")).not.toBeEmpty();
    await expect(journal).toBeVisible();
    await expect(next).toBeVisible();

    const [c, j, n] = await Promise.all([card.boundingBox(), journal.boundingBox(), next.boundingBox()]);
    expect(c!.y + c!.height).toBeLessThanOrEqual(j!.y);
    expect(j!.y + j!.height).toBeLessThanOrEqual(n!.y);

    // Circle: square box, fully rounded, empty, and visibly bigger than the journal button.
    expect(Math.abs(n!.width - n!.height)).toBeLessThan(1);
    expect(n!.height).toBeGreaterThan(j!.height * 2);
    await expect(next).toHaveText("");
    await expect(next).toHaveCSS("border-radius", "50%");
  });

  test("clicking the circle shows a different quote", async ({ page }) => {
    const text = page.getByTestId("quote-text");
    const first = await text.textContent();
    await page.getByRole("button", { name: "Show another quote" }).click();
    await expect(text).not.toHaveText(first!);
  });

  test("undo sits left of the circle, vertically centred, and starts disabled", async ({ page }) => {
    const undo = page.getByRole("button", { name: "Undo, show previous quote" });
    const next = page.getByRole("button", { name: "Show another quote" });
    await expect(undo).toBeDisabled();
    await expect(undo).toHaveCSS("border-radius", "50%");
    await expect(undo.locator("svg")).toBeVisible();

    const [u, n] = await Promise.all([undo.boundingBox(), next.boundingBox()]);
    expect(u!.x + u!.width).toBeLessThanOrEqual(n!.x);
    expect(Math.abs(u!.y + u!.height / 2 - (n!.y + n!.height / 2))).toBeLessThan(1);
    expect(u!.width).toBeLessThan(n!.width);

    // Orb stays horizontally centred on the page.
    const viewport = page.viewportSize()!;
    expect(Math.abs(n!.x + n!.width / 2 - viewport.width / 2)).toBeLessThan(2);
  });

  test("undo walks back through every quote shown", async ({ page }) => {
    const text = page.getByTestId("quote-text");
    const next = page.getByRole("button", { name: "Show another quote" });
    const undo = page.getByRole("button", { name: "Undo, show previous quote" });

    const seen = [(await text.textContent())!];
    for (let i = 0; i < 8; i++) {
      await next.click();
      await expect(text).not.toHaveText(seen[seen.length - 1]);
      seen.push((await text.textContent())!);
    }

    for (let i = seen.length - 2; i >= 0; i--) {
      await undo.click();
      await expect(text).toHaveText(seen[i]);
    }
    await expect(undo).toBeDisabled();
  });

  test("draft bottom navigation shows Mood, Quotes, Journal with Quotes current", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("button")).toHaveText(["Mood", "Quotes", "Journal"]);
    await expect(nav.getByRole("button", { name: "Quotes" })).toHaveAttribute("aria-current", "page");
    await expect(nav.locator("svg")).toHaveCount(3);

    // Floats at the bottom, centred, inside the viewport.
    const box = (await nav.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(viewport.height - (box.y + box.height)).toBeLessThan(40);
    expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2);
  });

  test("page never scrolls and the controls clear the nav by one lg step", async ({ page }) => {
    const scroll = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    }));
    expect(scroll).toEqual({ x: 0, y: 0 });

    const [nav, next, undo] = await Promise.all([
      page.getByTestId("bottom-nav").boundingBox(),
      page.getByTestId("next-quote-button").boundingBox(),
      page.getByTestId("undo-button").boundingBox(),
    ]);
    // One lg step on the LiftKit scale, read from the page rather than hard-coded.
    const lg = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.height = "var(--lk-size-lg)";
      document.body.append(probe);
      const px = probe.getBoundingClientRect().height;
      probe.remove();
      return px;
    });
    expect(nav!.y - (next!.y + next!.height)).toBeGreaterThanOrEqual(lg - 0.5);
    expect(undo!.y + undo!.height).toBeLessThanOrEqual(nav!.y);
  });

  test("every quote fits the card, and the layout never moves", async ({ page }) => {
    const text = page.getByTestId("quote-text");
    const card = page.getByTestId("quote-card");
    const next = page.getByRole("button", { name: "Show another quote" });
    await page.evaluate(() => document.fonts.ready);

    const cardBox = (await card.boundingBox())!;
    const orbY = (await next.boundingBox())!.y;
    const credit = page.getByTestId("quote-credit");
    const creditY = async () =>
      (await credit.boundingBox())!.y - (await card.boundingBox())!.y;
    const creditStart = await creditY();
    const seen = new Set<string>();
    // Quotes are random from a large table, so check a sample of distinct ones;
    // e2e/quote-dataset.spec.ts checks that every quote in the data set fits.
    const SAMPLE = 15;
    for (let i = 0; i < 60 && seen.size < SAMPLE; i++) {
      const t = (await text.textContent())!;
      if (!seen.has(t)) {
        seen.add(t);
        const label = t.slice(0, 40);
        const fit = await card.evaluate((el) => ({
          overflow: el.scrollHeight - el.clientHeight,
          font: parseFloat(getComputedStyle(el.querySelector("blockquote")!).fontSize),
        }));
        expect(fit.overflow, label).toBeLessThanOrEqual(1);
        expect(fit.font, label).toBeGreaterThanOrEqual(12);
        // Card and buttons stay exactly where they were.
        expect((await card.boundingBox())!.height, label).toBeCloseTo(cardBox.height, 0);
        expect((await next.boundingBox())!.y, label).toBeCloseTo(orbY, 0);
        // Credit sits at the same height inside the card for every quote.
        expect(await creditY(), label).toBeCloseTo(creditStart, 0);
      }
      await next.click();
    }
    expect(seen.size).toBe(SAMPLE);
  });

  test("the quote is only shrunk when its full size wouldn't fit", async ({ page }) => {
    const next = page.getByRole("button", { name: "Show another quote" });
    await page.evaluate(() => document.fonts.ready);
    for (let i = 0; i < 12; i++) {
      const result = await page.getByTestId("quote-text").evaluate((quote: HTMLElement) => {
        const area = quote.parentElement!;
        const shrunk = quote.style.fontSize !== "";
        if (!shrunk) return { shrunk, fitsAtFullSize: quote.offsetHeight <= area.clientHeight + 1 };
        const fitted = quote.style.fontSize;
        quote.style.fontSize = "";
        const fitsAtFullSize = quote.offsetHeight <= area.clientHeight + 1;
        quote.style.fontSize = fitted;
        return { shrunk, fitsAtFullSize };
      });
      // Shrunk ⇔ the CSS size doesn't fit.
      expect(result.shrunk).toBe(!result.fitsAtFullSize);
      await next.click();
    }
  });

  test("wave background renders with WebGL and fills the viewport", async ({ page }) => {
    const wave = page.getByTestId("wave");
    await expect(wave).toHaveAttribute("data-wave", "webgl");
    await expect(wave).toHaveAttribute("data-wave-animating", "true");
    const box = await wave.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.width).toBeCloseTo(viewport.width, 0);
    expect(box!.height).toBeCloseTo(viewport.height, 0);
  });

  test("glass surfaces use backdrop blur", async ({ page }) => {
    for (const id of ["quote-card", "next-quote-button", "journal-button", "undo-button"]) {
      const filter = await page
        .getByTestId(id)
        .evaluate((el) => {
          const s = getComputedStyle(el);
          return s.backdropFilter || s.getPropertyValue("-webkit-backdrop-filter");
        });
      expect(filter, id).toContain("blur");
    }
  });

  test("quote and credit stay legible over the waves (WCAG AA)", async ({ page }) => {
    const [quoteRgb, creditRgb] = await Promise.all(
      ["quote-text", "quote-credit"].map((id) =>
        page.getByTestId(id).evaluate((el) => {
          const c = getComputedStyle(el).color.match(/[\d.]+/g)!.map(Number);
          return c;
        }),
      ),
    );
    const bg = await brightestCardPixel(page);
    // Credit colour is translucent white: blend it over the worst-case background.
    const a = creditRgb[3] ?? 1;
    const creditOnBg = creditRgb.slice(0, 3).map((v, i) => v * a + bg[i] * (1 - a));

    expect(contrast(quoteRgb.slice(0, 3), bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(creditOnBg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  test("screenshot", async ({ page }, testInfo) => {
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByTestId("wave")).toHaveAttribute("data-wave", "webgl");
    await page.screenshot({
      path: `e2e/screenshots/${testInfo.project.name}.png`,
      animations: "disabled",
    });
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("waves freeze on a single frame", async ({ page }) => {
    await page.goto("/");
    const wave = page.getByTestId("wave");
    await expect(wave).toHaveAttribute("data-wave", "webgl");
    await expect(wave).toHaveAttribute("data-wave-animating", "false");
  });
});
