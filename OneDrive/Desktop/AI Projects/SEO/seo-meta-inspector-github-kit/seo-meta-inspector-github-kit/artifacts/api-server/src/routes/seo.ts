import { Router, type IRouter } from "express";
import { InspectSeoBody, InspectSeoResponse } from "@workspace/api-zod";

type TagStatus = "pass" | "warn" | "fail" | "info";
type TagCategory = "core" | "social" | "technical" | "content";

type SeoTag = {
  key: string;
  label: string;
  value: string | null;
  status: TagStatus;
  note: string;
  category: TagCategory;
  weight: number;
};

const router: IRouter = Router();

const decodeHtml = (value: string) =>
  value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16)),
    );

const clean = (value: string | undefined | null) =>
  decodeHtml((value ?? "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

const getAttribute = (raw: string, attribute: string) => {
  const pattern = new RegExp(
    `${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i",
  );
  const match = raw.match(pattern);
  return clean(match?.[1] ?? match?.[2] ?? match?.[3]);
};

const getMeta = (html: string, key: string) => {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const normalizedKey = key.toLowerCase();
  for (const tag of tags) {
    const name = getAttribute(tag, "name")?.toLowerCase();
    const property = getAttribute(tag, "property")?.toLowerCase();
    if (name === normalizedKey || property === normalizedKey) {
      return getAttribute(tag, "content") || null;
    }
  }
  return null;
};

const hasMeta = (html: string, key: string) => Boolean(getMeta(html, key));

const getTitle = (html: string) => {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return clean(match?.[1]) || null;
};

const getHtmlLanguage = (html: string) => {
  const match = html.match(/<html\b[^>]*>/i);
  return match ? getAttribute(match[0], "lang") || null : null;
};

const getLink = (html: string, rel: string) => {
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const relValue = getAttribute(tag, "rel")
      ?.toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (relValue?.includes(rel.toLowerCase())) {
      return getAttribute(tag, "href") || null;
    }
  }
  return null;
};

const countTags = (html: string, tag: string) =>
  (html.match(new RegExp(`<${tag}\\b`, "gi")) ?? []).length;

const resolveUrl = (value: string | null, baseUrl: string) => {
  if (!value) return null;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
};

const isBlockedHost = (hostname: string) => {
  const normalized = hostname.toLowerCase();
  if (
    normalized === "localhost" ||
    normalized.endsWith(".local") ||
    normalized === "::1" ||
    normalized === "0.0.0.0"
  ) {
    return true;
  }
  const octets = normalized.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => Number.isNaN(octet))) {
    return false;
  }
  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
};

const makeTag = (
  key: string,
  label: string,
  value: string | null,
  status: TagStatus,
  note: string,
  category: TagCategory,
  weight = 1,
): SeoTag => ({ key, label, value, status, note, category, weight });

const buildTags = (html: string, pageUrl: URL) => {
  const title = getTitle(html);
  const description = getMeta(html, "description");
  const canonical = resolveUrl(getLink(html, "canonical"), pageUrl.toString());
  const h1Count = countTags(html, "h1");
  const lang = getHtmlLanguage(html);
  const charset =
    html.match(/<meta\b[^>]*(?:charset\s*=\s*["']?[^"' >]+|http-equiv\s*=\s*["']?content-type)/i) !==
    null;
  const viewport = hasMeta(html, "viewport");
  const robots = getMeta(html, "robots");
  const ogTitle = getMeta(html, "og:title");
  const ogDescription = getMeta(html, "og:description");
  const ogImage = resolveUrl(getMeta(html, "og:image"), pageUrl.toString());
  const ogUrl = resolveUrl(getMeta(html, "og:url"), pageUrl.toString());
  const ogSiteName = getMeta(html, "og:site_name");
  const ogImageAlt = getMeta(html, "og:image:alt");
  const twitterCard = getMeta(html, "twitter:card");
  const twitterTitle = getMeta(html, "twitter:title");
  const twitterDescription = getMeta(html, "twitter:description");
  const twitterImage = resolveUrl(getMeta(html, "twitter:image"), pageUrl.toString());
  const titleLength = title?.length ?? 0;
  const descriptionLength = description?.length ?? 0;

  const core: SeoTag[] = [
    makeTag(
      "title",
      "Title tag",
      title,
      !title ? "fail" : titleLength >= 30 && titleLength <= 60 ? "pass" : "warn",
      !title
        ? "Add a unique title between 30 and 60 characters."
        : titleLength >= 30 && titleLength <= 60
          ? `${titleLength} characters — within the recommended range.`
          : `${titleLength} characters — aim for 30–60 characters.`,
      "core",
      3,
    ),
    makeTag(
      "description",
      "Meta description",
      description,
      !description
        ? "fail"
        : descriptionLength >= 120 && descriptionLength <= 160
          ? "pass"
          : "warn",
      !description
        ? "Add a description that explains the page in search results."
        : `${descriptionLength} characters — aim for 120–160 characters.`,
      "core",
      3,
    ),
    makeTag(
      "canonical",
      "Canonical URL",
      canonical,
      canonical ? "pass" : "warn",
      canonical ? "Canonical URL is declared." : "Declare the preferred URL to prevent duplicate content.",
      "technical",
      2,
    ),
    makeTag(
      "h1",
      "H1 heading",
      h1Count ? `${h1Count} found` : null,
      h1Count === 1 ? "pass" : h1Count === 0 ? "fail" : "warn",
      h1Count === 1
        ? "One primary H1 heading found."
        : h1Count === 0
          ? "Add one clear H1 heading that describes the page."
          : `${h1Count} H1 headings found — keep one primary heading.`,
      "content",
      2,
    ),
  ];

  const technical: SeoTag[] = [
    makeTag(
      "viewport",
      "Mobile viewport",
      viewport ? getMeta(html, "viewport") : null,
      viewport ? "pass" : "fail",
      viewport ? "Responsive viewport is configured." : "Add a viewport tag for mobile-friendly rendering.",
      "technical",
      2,
    ),
    makeTag(
      "charset",
      "Character encoding",
      charset ? "UTF-8 declared" : null,
      charset ? "pass" : "warn",
      charset ? "Character encoding is declared." : "Declare UTF-8 early in the document head.",
      "technical",
    ),
    makeTag(
      "lang",
      "HTML language",
      lang,
      lang ? "pass" : "warn",
      lang ? `Document language is set to ${lang}.` : "Add a language attribute to the HTML element.",
      "technical",
    ),
    makeTag(
      "robots",
      "Robots directive",
      robots,
      robots?.toLowerCase().includes("noindex") ? "warn" : robots ? "pass" : "info",
      robots?.toLowerCase().includes("noindex")
        ? "This page asks search engines not to index it."
        : robots
          ? "Robots directive is present."
          : "No robots tag — search engines will use their default behavior.",
      "technical",
    ),
  ];

  const social: SeoTag[] = [
    makeTag(
      "og:title",
      "Open Graph title",
      ogTitle,
      ogTitle ? "pass" : "fail",
      ogTitle ? "Social title is configured." : "Add og:title for a reliable social headline.",
      "social",
      2,
    ),
    makeTag(
      "og:description",
      "Open Graph description",
      ogDescription,
      ogDescription ? "pass" : "fail",
      ogDescription ? "Social description is configured." : "Add og:description for social shares.",
      "social",
      2,
    ),
    makeTag(
      "og:image",
      "Open Graph image",
      ogImage,
      ogImage ? "pass" : "fail",
      ogImage ? "A share image is configured." : "Add og:image to control how the page looks when shared.",
      "social",
      2,
    ),
    makeTag(
      "og:url",
      "Open Graph URL",
      ogUrl,
      ogUrl ? "pass" : "warn",
      ogUrl ? "Share URL is declared." : "Declare og:url so platforms know the canonical share URL.",
      "social",
    ),
    makeTag(
      "twitter:card",
      "X/Twitter card",
      twitterCard,
      twitterCard ? "pass" : "warn",
      twitterCard ? `Card type: ${twitterCard}.` : "Add twitter:card to choose the share layout.",
      "social",
    ),
    makeTag(
      "og:image:alt",
      "Social image alt text",
      ogImageAlt,
      ogImageAlt ? "pass" : "info",
      ogImageAlt ? "Share image has alternative text." : "Add og:image:alt for more accessible shares.",
      "social",
    ),
  ];

  const groups = [
    { key: "core", label: "Core metadata", tags: core },
    { key: "technical", label: "Technical SEO", tags: technical },
    { key: "social", label: "Social previews", tags: social },
  ].map((group) => ({
    ...group,
    passed: group.tags.filter((tag) => tag.status === "pass" || tag.status === "info").length,
    total: group.tags.length,
  }));

  const tags = [...core, ...technical, ...social];
  const scoreTotal = tags.reduce((sum, tag) => sum + tag.weight, 0);
  const scoreEarned = tags.reduce(
    (sum, tag) =>
      sum + (tag.status === "pass" || tag.status === "info" ? tag.weight : tag.status === "warn" ? tag.weight * 0.55 : 0),
    0,
  );
  const score = Math.round((scoreEarned / scoreTotal) * 100);
  const passed = tags.filter((tag) => tag.status === "pass" || tag.status === "info").length;
  const warnings = tags.filter((tag) => tag.status === "warn").length;
  const failures = tags.filter((tag) => tag.status === "fail").length;

  return {
    groups,
    score,
    scoreLabel: score >= 90 ? "Excellent" : score >= 75 ? "Good foundation" : score >= 55 ? "Needs attention" : "Critical issues",
    passed,
    warnings,
    failures,
    title: title ?? "",
    description: description ?? "",
    preview: {
      title: ogTitle ?? title ?? pageUrl.hostname,
      description: ogDescription ?? description ?? "No social description found.",
      url: ogUrl ?? pageUrl.toString(),
      siteName: ogSiteName ?? pageUrl.hostname.replace(/^www\./, ""),
      image: ogImage ?? twitterImage,
      imageAlt: ogImageAlt,
      twitterCard: twitterCard ?? "summary",
      locale: getMeta(html, "og:locale") ?? lang ?? "en",
    },
  };
};

router.post("/seo/inspect", async (req, res) => {
  const parsed = InspectSeoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid website URL." });
    return;
  }

  let target: URL;
  try {
    target = new URL(parsed.data.url);
    if (!["http:", "https:"].includes(target.protocol) || isBlockedHost(target.hostname)) {
      throw new Error("Unsupported or private URL");
    }
  } catch {
    res.status(400).json({ error: "Enter a public http or https website URL." });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  const startedAt = Date.now();
  try {
    const response = await fetch(target, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "SEO-Meta-Inspector/1.0 (+https://replit.com)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) {
      res.status(502).json({ error: `The website returned ${response.status}.` });
      return;
    }
    const html = (await response.text()).slice(0, 2_000_000);
    const fetchedUrl = new URL(response.url || target.toString());
    if (isBlockedHost(fetchedUrl.hostname)) {
      res.status(502).json({ error: "The website redirected to a private address." });
      return;
    }
    const result = buildTags(html, fetchedUrl);
    const payload = {
      url: target.toString(),
      fetchedUrl: fetchedUrl.toString(),
      hostname: fetchedUrl.hostname,
      title: result.title,
      description: result.description,
      score: result.score,
      scoreLabel: result.scoreLabel,
      passed: result.passed,
      warnings: result.warnings,
      failures: result.failures,
      checkedAt: new Date().toISOString(),
      responseTimeMs: Date.now() - startedAt,
      groups: result.groups,
      preview: result.preview,
    };
    res.json(InspectSeoResponse.parse(payload));
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "The website took too long to respond."
      : "We could not fetch that website. Check the URL and try again.";
    res.status(502).json({ error: message });
  } finally {
    clearTimeout(timeout);
  }
});

export default router;