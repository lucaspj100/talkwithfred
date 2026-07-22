import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const modeEnum = z.enum([
  "free_conversation",
  "travel_english",
  "job_interview",
  "business_english",
  "daily_life",
  "beginner_practice",
  "custom",
]);

const createConversationSchema = z
  .object({
    mode: modeEnum,
    customTopic: z.string().trim().min(3).max(300).optional(),
  })
  .refine((v) => v.mode !== "custom" || (v.customTopic && v.customTopic.length >= 3), {
    message: "customTopic is required for custom mode",
    path: ["customTopic"],
  });

function titleFromTopic(topic: string): string {
  const clean = topic.replace(/\s+/g, " ").trim();
  if (clean.length <= 50) return clean;
  return clean.slice(0, 47).trimEnd() + "…";
}

export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("conversations")
      .select("id, title, mode, updated_at, created_at")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => createConversationSchema.parse(i))
  .handler(async ({ data, context }) => {
    const isCustom = data.mode === "custom";
    const customTopic = isCustom ? data.customTopic!.trim() : null;
    const title = isCustom && customTopic ? titleFromTopic(customTopic) : "Nova conversa";
    const { data: row, error } = await context.supabase
      .from("conversations")
      .insert({
        user_id: context.userId,
        mode: data.mode,
        title,
        custom_topic: customTopic,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const getConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const [{ data: conv }, { data: msgs }] = await Promise.all([
      context.supabase
        .from("conversations")
        .select("id, title, mode, created_at")
        .eq("id", data.id)
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("messages")
        .select("id, role, content, input_type, created_at")
        .eq("conversation_id", data.id)
        .order("created_at", { ascending: true }),
    ]);
    if (!conv) throw new Error("Conversation not found");
    return { conversation: conv, messages: msgs ?? [] };
  });

export const persistTurn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      conversationId: z.string().uuid(),
      userMessage: z.string().min(1).max(4000),
      assistantMessage: z.string().min(1).max(8000),
      inputType: z.enum(["text", "voice"]).default("text"),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    // verify ownership
    const { data: conv } = await context.supabase
      .from("conversations").select("id, title").eq("id", data.conversationId).eq("user_id", context.userId).maybeSingle();
    if (!conv) throw new Error("Conversation not found");

    await context.supabase.from("messages").insert([
      { conversation_id: data.conversationId, user_id: context.userId, role: "user", content: data.userMessage, input_type: data.inputType },
      { conversation_id: data.conversationId, user_id: context.userId, role: "assistant", content: data.assistantMessage, input_type: "text" },
    ]);

    // Update title from first user message if still default
    if (conv.title === "New conversation" || conv.title === "Nova conversa") {
      const title = data.userMessage.slice(0, 60);
      await context.supabase.from("conversations").update({ title, updated_at: new Date().toISOString() }).eq("id", data.conversationId);
    } else {
      await context.supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", data.conversationId);
    }
    await context.supabase.from("usage_logs").insert({
      user_id: context.userId, action_type: "chat_turn", messages_sent: 1,
    });
    return { ok: true };
  });

/**
 * Persist an unpaired user turn — used when the user ends the conversation
 * before Fred's reply is captured, so the last utterance isn't lost.
 * Dedupes against the most recent user message with identical content.
 */
export const persistUserOnly = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      conversationId: z.string().uuid(),
      userMessage: z.string().min(1).max(4000),
      inputType: z.enum(["text", "voice"]).default("voice"),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: conv } = await context.supabase
      .from("conversations").select("id, title").eq("id", data.conversationId).eq("user_id", context.userId).maybeSingle();
    if (!conv) throw new Error("Conversation not found");

    const clean = data.userMessage.trim();
    if (!clean) return { ok: true, skipped: true };

    const { data: last } = await context.supabase
      .from("messages")
      .select("id, role, content")
      .eq("conversation_id", data.conversationId)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last && last.role === "user" && (last.content ?? "").trim() === clean) {
      return { ok: true, deduped: true };
    }

    await context.supabase.from("messages").insert({
      conversation_id: data.conversationId,
      user_id: context.userId,
      role: "user",
      content: clean,
      input_type: data.inputType,
    });
    if (conv.title === "New conversation") {
      await context.supabase.from("conversations").update({ title: clean.slice(0, 60), updated_at: new Date().toISOString() }).eq("id", data.conversationId);
    } else {
      await context.supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", data.conversationId);
    }
    return { ok: true };
  });
