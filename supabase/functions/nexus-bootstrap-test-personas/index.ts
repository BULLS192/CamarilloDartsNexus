import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

// The one-time production bootstrap completed successfully on 2026-09-09.
// Keep this endpoint permanently closed unless a new reviewed bootstrap is required.
Deno.serve(() => new Response(JSON.stringify({
  ok: false,
  error: 'NEXUS test-persona bootstrap is closed.',
}), {
  status: 410,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
}))
