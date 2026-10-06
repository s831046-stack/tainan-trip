import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) return json({ error: "content_type_must_be_json" }, 415);
  const raw = await req.text();
  if (raw.length > 12000) return json({ error: "request_too_large" }, 413);
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(raw); } catch { return json({ error: "invalid_json" }, 400); }
  const allowed = ["p_item", "p_amount", "p_payer_nickname", "p_participants", "p_note"];
  if (Object.keys(payload).some((key) => !allowed.includes(key))) return json({ error: "unexpected_field" }, 400);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "server_not_configured" }, 500);
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await admin.rpc("add_trip_expense", {
    p_item: payload.p_item, p_amount: payload.p_amount, p_payer_nickname: payload.p_payer_nickname,
    p_participants: payload.p_participants, p_note: payload.p_note ?? null,
  });
  if (error) {
    const safeErrors = new Set(["item_invalid", "amount_invalid", "payer_invalid", "participants_invalid", "participants_duplicate", "participant_invalid", "note_invalid"]);
    return json({ error: safeErrors.has(error.message) ? error.message : "expense_rejected" }, 400);
  }
  return json({ expense: data }, 201);
});
