// Server-only: the one place this app calls an external AI API. Reads a
// scanned bank document (photo or PDF) against the caller's own account list
// and proposes a match + what it found — nothing here ever writes to the
// database. Every proposal is reviewed and confirmed by the user in
// app/(app)/paper-in/actions.ts#applyScan before anything is applied, the
// same accept/ignore shape as FDIC sync and holding-company sync elsewhere
// in this app. Default model is Haiku (cheap, more than sufficient for
// reading a statement) — override with PAPER_IN_MODEL if a stronger model
// is ever wanted for a harder document.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

export type ScanDocType = "statement" | "dormancy_warning" | "tax_form" | "other";
export type ScanConfidence = "high" | "medium" | "low";

export interface ScanAccountCandidate {
  /** Index into the candidates array the model was given — its answer refers
   *  back to this, never to a real database id (keeps the tool schema from
   *  ever having to describe a UUID format to the model). */
  index: number;
  accountId: string;
  label: string; // e.g. "John · Checking"
  bankName: string;
  last4: string | null;
  currentBalance: number | null;
}

export interface ScanReadResult {
  docType: ScanDocType;
  confidence: ScanConfidence;
  matchedIndex: number | null;
  balance: number | null;
  statementDate: string | null; // YYYY-MM-DD
  summary: string;
}

const TOOL_NAME = "record_statement_read";

function buildTool(candidateCount: number): Anthropic.Tool {
  return {
    name: TOOL_NAME,
    description:
      "Record what you found on the scanned bank document: what kind of document it is, which account (if any) it belongs to, and any balance/date on it.",
    input_schema: {
      type: "object",
      properties: {
        doc_type: {
          type: "string",
          enum: ["statement", "dormancy_warning", "tax_form", "other"],
          description:
            "statement = a regular account statement showing a balance. dormancy_warning = a notice that the account may be closed/escheated for inactivity. tax_form = a 1099-INT or similar. other = anything else (welcome letter, rate notice, etc).",
        },
        has_account_match: {
          type: "boolean",
          description: "true if this document confidently belongs to one of the accounts listed below.",
        },
        matched_account_index: {
          type: "integer",
          minimum: 0,
          maximum: Math.max(candidateCount - 1, 0),
          description:
            "The index of the matching account from the numbered list, if has_account_match is true. Ignored otherwise — still required, just pass 0.",
        },
        confidence: {
          type: "string",
          enum: ["high", "medium", "low"],
          description: "How sure you are about the account match (or lack of one).",
        },
        has_balance: {
          type: "boolean",
          description: "true if the document states a clear ending/current balance figure.",
        },
        ending_balance: {
          type: "number",
          description: "The ending balance in dollars, if has_balance is true. Ignored otherwise — still required, pass 0.",
        },
        has_date: {
          type: "boolean",
          description: "true if the document states a statement date or period-ending date.",
        },
        statement_date: {
          type: "string",
          description: "The statement/as-of date as YYYY-MM-DD, if has_date is true. Ignored otherwise — still pass an empty string.",
        },
        summary: {
          type: "string",
          description:
            "One short sentence explaining your read — what evidence you used to match the account (e.g. 'account number ending 4821 matches') and what balance/date you found.",
        },
      },
      required: [
        "doc_type",
        "has_account_match",
        "matched_account_index",
        "confidence",
        "has_balance",
        "ending_balance",
        "has_date",
        "statement_date",
        "summary",
      ],
    },
  };
}

function buildPrompt(candidates: ScanAccountCandidate[]): string {
  const list = candidates
    .map((c) => {
      const bits = [c.bankName, c.label];
      if (c.last4) bits.push(`account ending ${c.last4}`);
      if (c.currentBalance != null) bits.push(`currently tracked at $${c.currentBalance.toFixed(2)}`);
      return `${c.index}. ${bits.join(" — ")}`;
    })
    .join("\n");

  return [
    "This is a photo or scan of a piece of mail from a bank. Read it and use the record_statement_read tool to report what you found.",
    "",
    "The accounts this could belong to (match by account number if visible, otherwise by bank name and/or holder name):",
    list || "(no accounts on file — use has_account_match: false)",
    "",
    "If the document doesn't clearly match one of these accounts, set has_account_match to false rather than guessing.",
  ].join("\n");
}

export interface ScanReadOutcome {
  result?: ScanReadResult;
  error?: string;
}

/** Reads one document. `fileBytes` is the raw file; `mimeType` decides
 *  whether it's sent as an image or a PDF document content block. Returns a
 *  friendly error (never throws) so a bad read degrades to "couldn't read
 *  this — enter it by hand", exactly like a failed FDIC lookup does. */
export async function readScannedDocument(
  fileBytes: Buffer,
  mimeType: string,
  candidates: ScanAccountCandidate[],
): Promise<ScanReadOutcome> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { error: "AI document reading isn't set up yet — ANTHROPIC_API_KEY is missing." };
  }

  const isPdf = mimeType === "application/pdf";
  const client = new Anthropic({ apiKey });
  const model = process.env.PAPER_IN_MODEL || DEFAULT_MODEL;

  const fileBlock: Anthropic.ContentBlockParam = isPdf
    ? {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: fileBytes.toString("base64") },
      }
    : {
        type: "image",
        source: {
          type: "base64",
          media_type: mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
          data: fileBytes.toString("base64"),
        },
      };

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      tools: [buildTool(candidates.length)],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [
        {
          role: "user",
          content: [fileBlock, { type: "text", text: buildPrompt(candidates) }],
        },
      ],
    });

    const block = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === TOOL_NAME,
    );
    if (!block) return { error: "The model didn't return a reading — try again." };

    const input = block.input as {
      doc_type: ScanDocType;
      has_account_match: boolean;
      matched_account_index: number;
      confidence: ScanConfidence;
      has_balance: boolean;
      ending_balance: number;
      has_date: boolean;
      statement_date: string;
      summary: string;
    };

    return {
      result: {
        docType: input.doc_type,
        confidence: input.confidence,
        matchedIndex: input.has_account_match ? input.matched_account_index : null,
        balance: input.has_balance ? Math.round(input.ending_balance * 100) / 100 : null,
        statementDate: input.has_date && input.statement_date ? input.statement_date : null,
        summary: input.summary,
      },
    };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return { error: "The AI reading key looks invalid — check ANTHROPIC_API_KEY." };
    }
    if (err instanceof Anthropic.RateLimitError) {
      return { error: "Rate limited — try again in a moment." };
    }
    if (err instanceof Anthropic.APIError) {
      return { error: `Couldn't read this document (${err.status ?? "error"}) — try again or enter it by hand.` };
    }
    return { error: "Couldn't read this document — try again or enter it by hand." };
  }
}
