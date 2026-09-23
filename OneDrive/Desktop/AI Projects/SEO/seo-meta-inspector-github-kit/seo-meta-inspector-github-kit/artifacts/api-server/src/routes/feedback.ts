import { Router, type IRouter } from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import {
  SubmitFeedbackBody,
  SubmitFeedbackResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const connectors = new ReplitConnectors();

const categoryLabels = {
  problem: "Problem report",
  suggestion: "Suggestion",
  question: "Question",
  other: "Other feedback",
} as const;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

router.post("/feedback", async (req, res): Promise<void> => {
  const parsed = SubmitFeedbackBody.safeParse(req.body);
  if (!parsed.success || parsed.data.website) {
    res.status(400).json({ error: "Check the form and try again." });
    return;
  }

  const recipient = process.env.FEEDBACK_RECIPIENT_EMAIL;
  if (!recipient) {
    req.log.error("Feedback recipient is not configured");
    res.status(502).json({ error: "Feedback delivery is not configured yet." });
    return;
  }

  const { category, email, message } = parsed.data;
  const label = categoryLabels[category];
  const replyTo = email?.trim();
  const safeMessage = escapeHtml(message.trim()).replace(/\n/g, "<br>");

  try {
    const response = await connectors.proxy("resend", "/emails", {
      method: "POST",
      body: JSON.stringify({
        from:
          process.env.FEEDBACK_FROM_EMAIL ??
          "SEO Meta Inspector <feedback@seo-meta-inspector.com>",
        to: [recipient],
        subject: `[SEO Meta Inspector] ${label}`,
        html: `
          <h2>${label}</h2>
          <p>${safeMessage}</p>
          <hr>
          <p><strong>Reply address:</strong> ${replyTo ? escapeHtml(replyTo) : "Not provided"}</p>
        `,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      req.log.error(
        { statusCode: response.status, providerResponse: details.slice(0, 500) },
        "Resend rejected feedback email",
      );
      res.status(502).json({ error: "We could not send your feedback right now." });
      return;
    }

    res.json(SubmitFeedbackResponse.parse({ delivered: true }));
  } catch (error) {
    req.log.error({ err: error }, "Feedback email delivery failed");
    res.status(502).json({ error: "We could not send your feedback right now." });
  }
});

export default router;