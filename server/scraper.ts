import puppeteer, { type Browser } from "puppeteer";
import TurndownService from "turndown";

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.connected) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    });
  }
  return browserInstance;
}

const turndown = new TurndownService({ headingStyle: "atx", bulletListMarker: "-" });

export async function scrapeJobDescription(url: string): Promise<string> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    );
    await page.goto(url, { waitUntil: "networkidle2", timeout: 15_000 });
    const html = await page.evaluate(() => {
      const selectors = [
        '[class*="description"]',
        '[class*="job-detail"]',
        '[class*="posting-"]',
        '[id*="description"]',
        "article",
        "main",
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent && el.textContent.trim().length > 100) {
          return el.innerHTML;
        }
      }
      return document.body.innerHTML;
    });
    const md = turndown.turndown(html);
    return md.slice(0, 5000);
  } finally {
    await page.close();
  }
}
