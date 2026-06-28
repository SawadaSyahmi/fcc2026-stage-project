import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const TRIGGERS = new Set([
  'initiate future cities',
  'ai initiate fcc 2026',
  'initiate fcc 2026',
  'please initiate fcc 2026',
  'please initiate the fcc 2026'
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function normalize(input: string) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const GIMMICK_PIN = Deno.env.get('GIMMICK_PIN');

  if (!SUPABASE_URL || !SERVICE_KEY || !GIMMICK_PIN) {
    return json({ error: 'Server environment is not configured.' }, 500);
  }

  const body = await req.json().catch(() => null);
  if (!body) return json({ error: 'Invalid JSON body.' }, 400);

  const type = String(body.type || '').toUpperCase();
  const pin = String(body.pin || '');
  const session_id = String(body.session_id || 'fcc2026-main-stage').trim();
  const transcript = String(body.transcript || '');
  const normalized = normalize(transcript);

  if (pin !== GIMMICK_PIN) {
    return json({ error: 'Invalid ceremony PIN.' }, 401);
  }

  if (!session_id || session_id.length > 80) {
    return json({ error: 'Invalid session_id.' }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false }
  });

  let action = 'IGNORED';
  let safety_status = 'SYSTEM';
  let stateStatus = 'idle';
  let allowed = false;
  let message = 'Command ignored.';

  if (type === 'ARM') {
    action = 'ARM';
    safety_status = 'SYSTEM';
    stateStatus = 'armed';
    message = 'AI armed. AV room is on standby.';
  } else if (type === 'LISTENING') {
    action = 'LISTENING';
    safety_status = 'SYSTEM';
    stateStatus = 'listening';
    message = 'Stage AI is listening.';
  } else if (type === 'RESET') {
    action = 'RESET';
    safety_status = 'SYSTEM';
    stateStatus = 'reset';
    message = 'AV reset signal sent.';
  } else if (type === 'INITIATE') {
    action = 'PLAY_INIT_VIDEO';
    safety_status = 'ALLOWED';
    stateStatus = 'initiated';
    allowed = true;
    message = 'Manual initiation approved.';
  } else if (type === 'TRANSCRIPT') {
    if (TRIGGERS.has(normalized)) {
      action = 'PLAY_INIT_VIDEO';
      safety_status = 'ALLOWED';
      stateStatus = 'initiated';
      allowed = true;
      message = 'Voice command approved.';
    } else {
      action = 'IGNORED';
      safety_status = 'REJECTED';
      stateStatus = 'ignored';
      message = 'Safety gate rejected the phrase. Only the approved FCC2026 initiation command is allowed.';
    }
  } else {
    return json({ error: 'Invalid command type.' }, 400);
  }

  // Cooldown prevents double playback from repeated taps or duplicate speech events.
  if (allowed) {
    const cutoff = new Date(Date.now() - 10_000).toISOString();
    const { data: recent, error: recentError } = await supabase
      .from('fcc2026_gimmick_commands')
      .select('id, created_at')
      .eq('session_id', session_id)
      .eq('action', 'PLAY_INIT_VIDEO')
      .gte('created_at', cutoff)
      .limit(1);

    if (recentError) return json({ error: recentError.message }, 500);
    if (recent && recent.length > 0) {
      return json({
        allowed: false,
        message: 'Cooldown active. Duplicate initiation was blocked for safety.'
      }, 429);
    }
  }

  const { data: command, error: insertError } = await supabase
    .from('fcc2026_gimmick_commands')
    .insert({
      session_id,
      transcript,
      normalized_transcript: normalized,
      action,
      safety_status,
      source: 'stage'
    })
    .select('*')
    .single();

  if (insertError) return json({ error: insertError.message }, 500);

  const { error: stateError } = await supabase
    .from('fcc2026_gimmick_state')
    .upsert({
      session_id,
      status: stateStatus,
      active_command_id: allowed ? command.id : null,
      last_transcript: transcript,
      last_action: action,
      updated_at: new Date().toISOString()
    }, { onConflict: 'session_id' });

  if (stateError) return json({ error: stateError.message }, 500);

  return json({
    ok: true,
    allowed,
    action,
    safety_status,
    command_id: command.id,
    message
  });
});
