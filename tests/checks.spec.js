const fs = require("node:fs");
const { test, expect, AT, CARD, CARD_FILE, installView, openView, card, readCard, openEditor, findAll } =
  require("./helpers");
const VIEW = require("./view.json");

test.beforeAll(async ({ browser }) => {
  await installView(browser);
});

test("Home Assistant serves this copy of the card", async ({ page }) => {
  await openView(page, AT.twoDates);
  const served = await page.evaluate(async () => {
    const hass = document.querySelector("home-assistant").hass;
    const resources = await hass.callWS({ type: "lovelace/resources" });
    const found = resources.filter(r => /dawn-to-dusk-clock-card\.js/.test(r.url));
    if (found.length !== 1) return { error: `expected one card resource, found ${found.length}` };
    const response = await fetch(found[0].url, { cache: "no-store" });
    return { url: found[0].url, text: await response.text() };
  });
  expect(served.error, served.error).toBeUndefined();
  expect(served.text === fs.readFileSync(CARD_FILE, "utf8"),
    `${served.url} differs from ${CARD}.js in this checkout. Copy the file to Home Assistant first.`).toBe(true);
});

test("each clock shows its label and time, with no browser errors", async ({ page }) => {
  await openView(page, AT.twoDates);
  const shown = await readCard(page, 0);
  const clocks = VIEW.sections[0].cards[0].clocks;
  expect(shown.labels).toEqual(clocks.map(c => c.label));
  expect(shown.times).toHaveLength(clocks.length);
  for (const t of shown.times) expect(t).toMatch(/\d/);
  // 11:50 UTC is 12:50 AM in Auckland and 3:50 AM in San Francisco.
  expect(shown.times[0]).toContain("12:50");
  expect(shown.times.at(-1)).toContain("3:50");
  expect(page.messages).toEqual([]);
});

test("clocks on the same date share one date bar", async ({ page }) => {
  await openView(page, AT.oneDate);
  const shown = await readCard(page, 0);
  expect(shown.dates).toHaveLength(1);
  expect(shown.dates[0].columns.replace(/\s/g, "")).toBe("1/9");
  expect(shown.dates[0].text).toContain("11");
});

test("the date bar splits where the date changes", async ({ page }) => {
  await openView(page, AT.twoDates);
  const shown = await readCard(page, 0);
  expect(shown.dates.map(d => d.columns.replace(/\s/g, ""))).toEqual(["1/2", "2/9"]);
  expect(shown.dates[0].text).toContain("12");
  expect(shown.dates[1].text).toContain("11");
});

test("the visual editor opens with the card's clocks", async ({ page }) => {
  await openView(page, AT.twoDates, { edit: true });
  await openEditor(page, 1);
  const editor = await page.evaluate(([find, tag]) => {
    const ed = new Function(`return ${find}`)()(`${tag}-editor`)[0];
    const values = [];
    const walk = root => {
      for (const el of root.querySelectorAll("*")) {
        if ("value" in el && typeof el.value === "string") values.push(el.value);
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    };
    walk(ed.shadowRoot);
    return values;
  }, [findAll.toString(), CARD]);
  for (const label of VIEW.sections[0].cards[1].clocks.map(c => c.label)) expect(editor).toContain(label);
  expect(page.messages).toEqual([]);
});

// Draws a fresh card `width` pixels wide and returns each label, time and date that is wider than its space.
async function overflowAt(page, config, width) {
  return page.evaluate(([tag, cfg, w]) => {
    const box = document.createElement("div");
    box.style.cssText = `position:absolute; left:0; top:0; width:${w}px; z-index:9999`;
    const el = document.createElement(tag);
    el.setConfig(cfg);
    el.hass = document.querySelector("home-assistant").hass;
    box.appendChild(el);
    document.body.appendChild(box);
    const over = [...el.shadowRoot.querySelectorAll(".label, .time, .date")]
      .filter(e => e.scrollWidth > e.clientWidth + 1)
      .map(e => `${e.className} "${e.textContent}" needs ${e.scrollWidth}px, has ${e.clientWidth}px`);
    box.remove();
    return over;
  }, [CARD, config, width]);
}

// The width of the preview in Home Assistant's card editor, at this viewport.
const PREVIEW_WIDTH = 470;

test("four clocks with smaller text fit the editor preview", async ({ page }) => {
  await openView(page, AT.twoDates);
  const { type, grid_options, ...config } = VIEW.sections[0].cards[1];
  expect(await overflowAt(page, config, PREVIEW_WIDTH)).toEqual([]);
});

// Draws a fresh card in the page and returns its labels, times and date bars. `locale` replaces fields of Home
// Assistant's language and time-format settings for this card only, so the test user's profile is never changed.
async function drawCard(page, config, locale) {
  return page.evaluate(([tag, cfg, loc]) => {
    const real = document.querySelector("home-assistant").hass;
    const box = document.createElement("div");
    box.style.cssText = "position:absolute; left:0; top:0; width:1400px; z-index:9999";
    const el = document.createElement(tag);
    el.setConfig(cfg);
    el.hass = loc ? { ...real, locale: { ...real.locale, ...loc } } : real;
    box.appendChild(el);
    document.body.appendChild(box);
    const text = sel => [...el.shadowRoot.querySelectorAll(sel)].map(e => e.textContent);
    const shown = {
      times: text(".time"),
      dates: [...el.shadowRoot.querySelectorAll(".date")]
        .map(e => ({ text: e.textContent, columns: e.style.gridColumn.replace(/\s/g, "") })),
    };
    box.remove();
    return shown;
  }, [CARD, config, locale || null]);
}

// The eight-clock card's settings, without the dashboard-only keys. At AT.twoDates: Auckland 12:50 AM Thu,
// London 11:50 AM Wed, San Francisco 3:50 AM Wed.
function eightClocks() {
  const { type, grid_options, ...config } = VIEW.sections[0].cards[0];
  return JSON.parse(JSON.stringify(config));
}
const AUCKLAND = 0, LONDON = 4, SAN_FRANCISCO = 7;

test("system format follows Home Assistant's language and 24-hour setting", async ({ page }) => {
  await openView(page, AT.twoDates);
  const shown = await drawCard(page, { ...eightClocks(), format: "system" }, { language: "en-GB", time_format: "24" });
  for (const t of shown.times) expect(t).not.toMatch(/AM|PM/i);
  expect(shown.times[AUCKLAND]).toMatch(/^0?0:50$/);
  expect(shown.times[LONDON]).toBe("11:50");
  expect(shown.times[SAN_FRANCISCO]).toMatch(/^0?3:50$/);
  // en-GB puts the day before the month.
  expect(shown.dates.map(d => d.columns)).toEqual(["1/2", "2/9"]);
  expect(shown.dates[0].text).toMatch(/12 Nov/);
  expect(shown.dates[1].text).toMatch(/11 Nov/);
  expect(page.messages).toEqual([]);
});

test("custom format uses its own locale and hour cycle", async ({ page }) => {
  await openView(page, AT.twoDates);
  // Home Assistant says en-US 12-hour; the card's own settings win.
  const shown = await drawCard(page, { ...eightClocks(), format: "custom", locale: "de-DE", hour_cycle: 24 },
    { language: "en", time_format: "12" });
  for (const t of shown.times) expect(t).not.toMatch(/AM|PM/i);
  expect(shown.times[AUCKLAND]).toMatch(/^0?0:50$/);
  expect(shown.times[LONDON]).toBe("11:50");
  // German day and month names: Do = Thursday, Mi = Wednesday.
  expect(shown.dates[0].text).toMatch(/Do/);
  expect(shown.dates[0].text).toMatch(/Nov/);
  expect(shown.dates[1].text).toMatch(/Mi/);
  expect(page.messages).toEqual([]);
});

test("one clock can keep the default format while the card uses another", async ({ page }) => {
  await openView(page, AT.twoDates);
  const config = { ...eightClocks(), format: "custom", locale: "de-DE", hour_cycle: 24 };
  config.clocks[SAN_FRANCISCO].format = "default";
  const shown = await drawCard(page, config);
  expect(shown.times[SAN_FRANCISCO]).toBe("3:50 AM");
  expect(shown.times[LONDON]).toBe("11:50");
  // Bars group by calendar date, not by format, and show their first clock's format (Japan's, German).
  expect(shown.dates.map(d => d.columns)).toEqual(["1/2", "2/9"]);
  expect(shown.dates[1].text).toMatch(/Mi/);
  expect(page.messages).toEqual([]);
});

test("at midnight the date bar splits without a reload", async ({ page }) => {
  // Start well before midnight so the page has time to load, then stop the clock 10 seconds short of it.
  const midnight = new Date(AT.aucklandMidnight).getTime();
  await openView(page, new Date(midnight - 120_000), { running: true });
  await page.clock.pauseAt(new Date(midnight - 10_000));
  await page.evaluate(() => { window.__sameLoad = true; });

  let shown = await readCard(page, 0);
  expect(shown.dates).toHaveLength(1);
  expect(shown.dates[0].columns.replace(/\s/g, "")).toBe("1/9");
  expect(shown.dates[0].text).toContain("Nov 11");
  expect(shown.times[0]).toBe("11:59 PM");

  // 20 seconds on; the card's own one-second timer has to notice the new day.
  await page.clock.runFor(20_000);
  shown = await readCard(page, 0);
  expect(await page.evaluate(() => window.__sameLoad)).toBe(true);
  expect(shown.times[0]).toBe("12:00 AM");
  expect(shown.dates.map(d => d.columns.replace(/\s/g, ""))).toEqual(["1/2", "2/9"]);
  expect(shown.dates[0].text).toContain("Thu, Nov 12");
  expect(shown.dates[1].text).toContain("Wed, Nov 11");
  expect(page.messages).toEqual([]);
});
