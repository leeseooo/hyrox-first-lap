import { divisions } from './data/divisions.js';

// WebMCP: lets in-browser AI agents read and drive the race through typed tools.
// Silently skipped in browsers without document.modelContext.
export function registerWebMcpTools(api) {
  if (!document.modelContext?.registerTool) return;
  for (const tool of [
    {
      name: 'set_race_division',
      description:
        'Restart with one of the five Open divisions. Mixed Doubles also accepts the player role.',
      inputSchema: {
        type: 'object',
        properties: {
          division: { type: 'string', enum: divisions.map((d) => d.id) },
          role: { type: 'string', enum: ['male', 'female'] },
        },
        required: ['division'],
        additionalProperties: false,
      },
      execute: ({ division, role = 'male' }) => api.setDivision(division, role),
    },
    {
      name: 'skip_run',
      description:
        'Skip only the current demonstration run and continue with the entrance route. Has no effect during other segments. Turns the attempt into a practice finish without a time.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => ({ skipped: api.skipRun(), ...api.getState() }),
    },
    {
      name: 'get_race_progress',
      description:
        "Read the current race segment, route, progress, camera position, heart-rate effort (0–1), pace (0–1), blow-ups, the race clock in game seconds and as a race-time equivalent (×15, h:mm:ss), and the ghost being raced (your best or a friend's link) with the live gap in race time.",
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: () => api.getState(),
    },
    {
      name: 'select_race_segment',
      description:
        'Pause and move to a race segment. Phases 0–15 alternate runs and workouts. Normal play includes entrance routes, exit routes and the finish. Turns the attempt into a practice finish without a time.',
      inputSchema: {
        type: 'object',
        properties: { phase: { type: 'integer', minimum: 0, maximum: 15 } },
        required: ['phase'],
        additionalProperties: false,
      },
      execute: ({ phase }) => {
        api.selectPhase(phase);
        return api.getState();
      },
    },
  ]) {
    try {
      Promise.resolve(document.modelContext.registerTool(tool)).catch(() => {});
    } catch {}
  }
}
