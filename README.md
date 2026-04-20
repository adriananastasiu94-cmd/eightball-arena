# Eightball Arena

Original browser-based 8-ball game with server-authoritative multiplayer, premium HUD, and deterministic 2D physics.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/adriananastasiu94-cmd/eightball-arena)

## Stack

- Next.js 15 + React + TypeScript
- Tailwind CSS
- HTML5 Canvas renderer
- Socket.io realtime server (custom `server.ts`)
- PostgreSQL + Prisma
- JWT cookie auth

## Features implemented

- Deterministic fixed-step cue-sports physics
- 8-ball state machine (break, groups, fouls, scratches, 8-ball legality)
- Server-authoritative shot validation and outcome simulation
- Matchmaking queue and 1v1 room pairing
- Reconnect grace flow for short disconnects
- Login/signup/logout and profile stats
- Match persistence and recent history
- Sandbox mode for local physics/rules tuning without matchmaking
- Mobile-friendly controls with drag aiming, cue preview line, and power scaling
- Lightweight procedural audio feedback

## Project structure

- `src/game/physics`: fixed-step simulation engine and vector math
- `src/game/rules`: 8-ball rules adjudication and turn transition logic
- `src/game/rendering`: visual palette/theme primitives
- `src/game/audio`: web audio feedback layer
- `src/game/network.ts`: socket contracts
- `src/server`: matchmaking, authoritative room lifecycle, socket gateway, limiter
- `src/lib`: Prisma client, JWT, validators, HTTP rate limit helpers
- `src/app`: Next.js pages and API routes
- `src/components`: canvas table + auth UI
- `src/hooks`: socket integration hook
- `prisma/schema.prisma`: relational models

## Database models

- `User`
- `Session`
- `PlayerStats`
- `Match`
- `MatchParticipant`
- `MatchHistory`
- `QueueEntry`

## Local setup

1. Copy env template:
   - `cp .env.example .env` (Windows PowerShell: `Copy-Item .env.example .env`)
2. Set `DATABASE_URL` and `JWT_SECRET`.
3. Install dependencies:
   - `npm install`
4. Generate Prisma client:
   - `npm run prisma:generate`
5. Run migrations:
   - `npm run prisma:migrate`
6. (Optional) seed demo user:
   - `npm run seed`
7. Start dev server:
   - `npm run dev`
8. Open `http://localhost:3000`.

## Production build

- `npm run build`
- `npm run start`

## Physics loop details

`src/game/physics/engine.ts` uses a deterministic fixed-step loop at `PHYSICS.stepHz`.

Each step does:

1. Integrate ball positions from velocities.
2. Resolve cushion and pocket interactions.
3. Resolve pairwise ball collisions with overlap correction + impulse response.
4. Apply friction decay.
5. Detect stable rest and stop when settled for `PHYSICS.settleFrames` frames.

Events emitted during sim:

- first cue-ball contact target
- pocketed ball ids

These events feed the rules engine to determine legal/foul outcomes.

## Server-authoritative multiplayer flow

1. Client submits shot intent (`angle`, `power`, optional `spin`).
2. Socket gateway validates payload and applies shot rate limiting.
3. Room verifies turn ownership and match phase.
4. Server runs official simulation + rules adjudication.
5. Server mutates canonical match state and broadcasts synchronized state.
6. Match result persists to DB and player stats/history update.

Clients never decide official outcomes.

## Tuning constants

Edit `src/game/constants.ts`:

- `frictionPerSecond`: lower -> table feels slower/stickier
- `restitutionBall`: lower -> less lively ball collisions
- `restitutionCushion`: lower -> softer rail response
- `pocketRadius`: larger -> easier pocketing
- `maxShotSpeed`: controls max power scaling
- `minVelocity` and `settleFrames`: affects stop stability and anti-jitter behavior

## Security and validation

- JWT cookie auth for protected profile/session actions
- Rate limiting on login/signup APIs and shot events
- Zod validation on auth payloads and shot payloads
- Turn ownership checks on server
- Ball-in-hand and shot flow enforced server-side

## Current status

Ready now:

- Playable online 1v1 queue flow
- Authoritative multiplayer simulation
- Offline sandbox testing mode
- Account/profile core and match persistence

Recommended next extensions:

1. Interpolated replay streaming per-shot for even smoother remote animation
2. AI opponent for solo progression
3. Friend invites/private room codes
4. Cloud avatar uploads + storage lifecycle
5. Expanded progression ladder and seasonal rankings
