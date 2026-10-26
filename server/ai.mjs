import { createHash } from "node:crypto";
import {
  account,
  assert,
  text,
  integer,
  month,
  usedTokens,
  uid,
  pruneEvents,
} from "../shared/domain.js";
export function reserve(store, input, now = new Date()) {
  text(input.id, "Request ID", 100);
  text(input.prompt, "Prompt", 12000);
  text(input.project, "Project", 180);
  text(input.title, "Work label", 500);
  integer(input.maxOutputTokens, "Output cap", 4096);
  assert(input.maxOutputTokens >= 16, "Output cap must be at least 16.");
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify([
        input.accountId,
        input.project,
        input.title,
        input.prompt,
        input.maxOutputTokens,
      ]),
    )
    .digest("hex");
  // UTF-8 byte count plus a generous allowance is conservative for the configured text-only input.
  const reserved =
    Buffer.byteLength(input.prompt, "utf8") + 512 + input.maxOutputTokens;
  return store.transaction((s) => {
    const previous = store.request(input.id);
    if (previous) {
      assert(
        previous.fingerprint === fingerprint,
        "Request ID was already used with different content.",
      );
      return { duplicate: true, request: previous };
    }
    assert(
      !s.events.some((e) => e.source === "ai" && e.status === "pending"),
      "A managed AI request is already active. Wait for it to settle or reconcile an unknown result.",
    );
    const a = account(s, input.accountId);
    assert(!a.paused, "This account is paused.");
    assert(
      usedTokens(s, null, month(now)) + reserved <= s.settings.companyLimit,
      "Company token allowance is insufficient.",
    );
    assert(
      usedTokens(s, a.id, month(now)) + reserved <= a.limit,
      "Account token allowance is insufficient.",
    );
    const event = {
      id: "ai:" + input.id,
      source: "ai",
      kind: "request",
      accountId: a.id,
      project: input.project,
      title: input.title,
      time: now.toISOString(),
      inputTokens: null,
      outputTokens: null,
      reservedTokens: reserved,
      status: "pending",
      issue: "",
    };
    const request = {
      id: input.id,
      fingerprint,
      eventId: event.id,
      status: "pending",
      nonce: uid(),
      createdAt: now.toISOString(),
    };
    s.events.unshift(event);
    s.revision++;
    store.save(s);
    store.putRequest(request);
    return { duplicate: false, request };
  });
}
export function settle(
  store,
  request,
  { inputTokens, outputTokens, model, status, issue },
  now = new Date(),
) {
  return store.transaction((s) => {
    const r = store.request(request.id);
    if (!r || r.nonce !== request.nonce || r.status !== "pending") return false;
    const e = s.events.find((e) => e.id === r.eventId);
    assert(e, "Request evidence is missing.");
    if (inputTokens != null && outputTokens != null) {
      integer(inputTokens, "Input usage");
      integer(outputTokens, "Output usage");
      e.inputTokens = inputTokens;
      e.outputTokens = outputTokens;
      e.reservedTokens = 0;
    }
    e.status = status;
    e.model = model;
    e.issue = issue || "";
    e.settledAt = now.toISOString();
    r.status = status;
    r.finishedAt = e.settledAt;
    s.revision++;
    store.save(s);
    store.putRequest(r);
    return true;
  });
}
export function reconcile(store, input, now = new Date()) {
  integer(input.inputTokens, "Verified input tokens");
  integer(input.outputTokens, "Verified output tokens");
  text(input.note, "Provider reference note", 2000);
  return store.transaction((s) => {
    const e = s.events.find((e) => e.id === input.id);
    assert(
      e?.source === "ai" && e.status === "unknown",
      "Only an unknown AI request can be reconciled.",
    );
    e.inputTokens = input.inputTokens;
    e.outputTokens = input.outputTokens;
    e.reservedTokens = 0;
    e.status = "reconciled";
    e.attribution = "owner-entered";
    e.review = {
      status: "reviewed",
      note: input.note,
      time: now.toISOString(),
    };
    const r = store.request(input.id.slice(3));
    if (r) {
      r.status = "reconciled";
      store.putRequest(r);
    }
    s.revision++;
    return store.save(s);
  });
}
export function recoverPending(store, now = new Date()) {
  return store.transaction((s) => {
    let changed = false;
    const count = s.events.length;
    pruneEvents(s, now);
    changed = s.events.length !== count;
    for (const e of s.events) {
      if (e.status === "pending" && now - new Date(e.time) > 120000) {
        e.status = "unknown";
        e.issue =
          "The provider outcome is unknown. Check provider records before reconciling.";
        const r = store.request(e.id.slice(3));
        if (r) {
          r.status = "unknown";
          store.putRequest(r);
        }
        changed = true;
      }
    }
    if (changed) {
      s.revision++;
      store.save(s);
    }
    return changed;
  });
}
export async function managedRequest(store, input, env, fetcher = fetch) {
  assert(env.OPENAI_API_KEY, "OpenAI is not configured on this server.");
  const model = env.OPENAI_MODEL || "gpt-4.1-mini";
  const reserved = reserve(store, input);
  if (reserved.duplicate)
    return {
      duplicate: true,
      status: reserved.request.status,
      workspace: store.read(),
    };
  try {
    const response = await fetcher("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: input.prompt,
        max_output_tokens: input.maxOutputTokens,
        store: false,
      }),
      signal: AbortSignal.timeout(90000),
    });
    if (!response.ok) {
      // Explicit client rejections are known failures. Server/network errors may have consumed usage.
      const known = [400, 401, 403, 404, 422, 429].includes(response.status);
      settle(store, reserved.request, {
        inputTokens: known ? 0 : null,
        outputTokens: known ? 0 : null,
        model,
        status: known ? "rejected" : "unknown",
        issue: `Provider returned ${response.status}. ${known ? "Request rejected." : "Check provider usage before reconciling."}`,
      });
      throw new Error(
        `Provider returned ${response.status}. See the request ledger for accounting status.`,
      );
    }
    const data = await response.json();
    const usage = data.usage;
    const known =
      Number.isSafeInteger(usage?.input_tokens) &&
      usage.input_tokens >= 0 &&
      Number.isSafeInteger(usage?.output_tokens) &&
      usage.output_tokens >= 0;
    settle(store, reserved.request, {
      inputTokens: known ? usage.input_tokens : null,
      outputTokens: known ? usage.output_tokens : null,
      model: data.model || model,
      status: known ? "completed" : "unknown",
      issue: known
        ? data.status === "incomplete"
          ? "Provider response was incomplete. Inspect the result."
          : ""
        : "Provider did not report usable token counts. Check provider records.",
    });
    const answer = (data.output || [])
      .flatMap((o) => o.content || [])
      .filter((c) => c.type === "output_text")
      .map((c) => c.text)
      .join("\n");
    return { answer, workspace: store.read() };
  } catch (error) {
    settle(store, reserved.request, {
      inputTokens: null,
      outputTokens: null,
      model,
      status: "unknown",
      issue:
        "The provider outcome is unknown. The allowance remains reserved until verified.",
    });
    throw error;
  }
}
