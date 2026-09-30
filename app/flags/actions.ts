"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { clientIp, LIMITS, rateLimit } from "@/lib/rate-limit";
import { nextOpenFlagId } from "@/lib/review";
import { actor, decisionOwner, getViewer } from "@/lib/viewer";

export type DecisionState = { error?: string };

const decisionSchema = z
  .object({
    flagId: z.string().min(1).max(40),
    outcome: z.enum(["APPROVED", "DISMISSED"]),
    note: z.string().trim().max(1000, "Keep the note under 1,000 characters."),
  })
  .refine((d) => d.outcome !== "DISMISSED" || d.note.length >= 3, {
    message: "Add a short note saying why you're dismissing this flag.",
  });

async function tooManyDecisions() {
  const { ok } = await rateLimit(`decision:${clientIp(await headers())}`, LIMITS.decision);
  return !ok;
}

/** Records this viewer's decision on a flag (replacing an earlier one), then opens the next flag. */
export async function decideFlag(_: DecisionState, formData: FormData): Promise<DecisionState> {
  const viewer = await getViewer();
  if (!viewer) return { error: "Your session has expired. Reload the page and try again." };
  if (await tooManyDecisions()) {
    return { error: "You're deciding faster than a person can read. Wait a minute and try again." };
  }

  const parsed = decisionSchema.safeParse({
    flagId: formData.get("flagId"),
    outcome: formData.get("outcome"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { flagId, outcome, note } = parsed.data;

  const flag = await db.flag.findUnique({
    where: { id: flagId },
    select: { id: true, ruleId: true },
  });
  if (!flag) return { error: "That flag no longer exists." };

  const data = { outcome, note: note || null, createdAt: new Date() };
  await db.$transaction([
    viewer.kind === "admin"
      ? db.decision.upsert({
          where: { userId_flagId: { userId: viewer.userId, flagId } },
          create: { ...data, flagId, userId: viewer.userId },
          update: data,
        })
      : db.decision.upsert({
          where: { guestSessionId_flagId: { guestSessionId: viewer.guestSessionId, flagId } },
          create: { ...data, flagId, guestSessionId: viewer.guestSessionId },
          update: data,
        }),
    db.auditLog.create({
      data: {
        ...actor(viewer),
        action: outcome === "APPROVED" ? "flag.approve" : "flag.dismiss",
        entityType: "Flag",
        entityId: flagId,
        metadata: { ruleId: flag.ruleId, ...(note ? { note } : {}) },
      },
    }),
  ]);

  revalidatePath("/");
  const next = await nextOpenFlagId(viewer, flagId);
  const toast = `decided=${outcome.toLowerCase()}&undo=${flagId}`;
  redirect(next ? `/flags/${next}?${toast}` : `/?${toast}`);
}

/** Takes back this viewer's decision on a flag (the toast's Undo) and reopens that flag. */
export async function undoDecision(formData: FormData) {
  const viewer = await getViewer();
  const flagId = z.string().min(1).max(40).safeParse(formData.get("flagId"));
  if (!viewer || !flagId.success || (await tooManyDecisions())) redirect("/");

  await db.$transaction(async (tx) => {
    const { count } = await tx.decision.deleteMany({
      where: { ...decisionOwner(viewer), flagId: flagId.data },
    });
    if (count > 0) {
      await tx.auditLog.create({
        data: { ...actor(viewer), action: "flag.undo", entityType: "Flag", entityId: flagId.data },
      });
    }
  });
  revalidatePath("/");
  redirect(`/flags/${flagId.data}`);
}

/** Clears every decision this viewer has made, so the whole queue is open again. */
export async function resetDecisions() {
  const viewer = await getViewer();
  if (!viewer || (await tooManyDecisions())) redirect("/");

  await db.$transaction(async (tx) => {
    const { count } = await tx.decision.deleteMany({ where: decisionOwner(viewer) });
    await tx.auditLog.create({
      data: {
        ...actor(viewer),
        action: "decisions.reset",
        entityType: "Decision",
        entityId: "*",
        metadata: { cleared: count },
      },
    });
  });
  revalidatePath("/");
  redirect("/");
}
