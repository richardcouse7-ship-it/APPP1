import { CheerioCrawler, Configuration } from "crawlee";
import type { CrawledPage, CrawlResult } from "./types.js";

const MAX_PAGES = 6;
const MAX_TEXT_CHARS_PER_PAGE = 20000;

const CONTACT_PATH_KEYWORDS = [
  "contact",
  "about",
  "team",
  "staff",
  "people",
  "management",
  "leadership",
  "who-we-are",
  "meet-the-team",
  "our-people",
];

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return new URL(withScheme).toString();
}

function looksLikeContactPage(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return CONTACT_PATH_KEYWORDS.some((keyword) => path.includes(keyword));
  } catch {
    return false;
  }
}

/**
 * Crawls a company's homepage plus same-domain contact/about/team subpages
 * (Cheerio only — no JS rendering, so client-side-rendered sites will yield
 * thin or empty page text). Capped at MAX_PAGES total requests.
 */
export async function crawlCompanySite(startUrl: string): Promise<CrawlResult> {
  const normalizedStart = normalizeUrl(startUrl);
  const domain = new URL(normalizedStart).hostname;
  const pages: CrawledPage[] = [];

  const crawler = new CheerioCrawler(
    {
      maxRequestsPerCrawl: MAX_PAGES,
      maxConcurrency: 2,
      requestHandlerTimeoutSecs: 30,
      maxRequestRetries: 1,
      async requestHandler({ request, $, enqueueLinks }) {
        const title = $("title").first().text().trim();
        $("script, style, noscript, svg").remove();
        const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_CHARS_PER_PAGE);

        if (text) {
          pages.push({ url: request.loadedUrl || request.url, title, text });
        }

        const isHomepage = request.userData?.role === "root";
        if (isHomepage && pages.length < MAX_PAGES) {
          await enqueueLinks({
            strategy: "same-domain",
            transformRequestFunction: (req) => {
              if (!looksLikeContactPage(req.url)) return false;
              req.userData = { role: "child" };
              return req;
            },
          });
        }
      },
    },
    new Configuration({ persistStorage: false }),
  );

  await crawler.run([{ url: normalizedStart, userData: { role: "root" } }]);

  return { startUrl: normalizedStart, domain, pages };
}
