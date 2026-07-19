// Screenshot all main pages of the Growth OS UI.
// Usage: node scripts/screenshot-pages.mjs [outDir] [width] [height]
import { chromium } from "playwright";

const outDir = process.argv[2] || "/tmp/growth-os-shots/before";
const width = Number(process.argv[3] || 1440);
const height = Number(process.argv[4] || 900);
const base = process.env.BASE_URL || "http://localhost:5173";

const pages = [
  ["dashboard", "老板驾驶舱"],
  ["growth", "成长首页"],
  ["scores", "成长评分"],
  ["trends", "组织趋势"],
  ["monthly", "月度会议"],
  ["tasks", "任务闭环"],
  ["settings", "设置"],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height } });
await page.goto(base, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

for (const [key, label] of pages) {
  const nav = page.locator(".nav-item", { hasText: label }).first();
  if (await nav.count()) {
    await nav.click();
    await page.waitForTimeout(900);
  }
  await page.screenshot({ path: `${outDir}/${key}.png`, fullPage: false });
  // also a full-page capture to see the stacking problem
  await page.screenshot({ path: `${outDir}/${key}-full.png`, fullPage: true });
  console.log("captured", key);
}
await browser.close();
console.log("done ->", outDir);
