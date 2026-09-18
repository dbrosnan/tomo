# Contributing to Tomo

Thanks for helping Tomo grow. Small, focused pull requests are easiest to review.

## Setup

```bash
npm install
cp .env.example .env      # fill in DATABASE_URL and BOSON_API_KEY
npm run migrate
npm run build
npm start                 # http://localhost:8080
```

## Working agreements

- **Tests first.** Every behaviour change ships with a test in `tests/`. Run `npm test`.
- **Pure logic stays pure.** Relationship rules live in `server/petLogic.js` and `server/sentiment.js`
  and never touch the database or the network, so they are trivial to test.
- **Immutable state.** Functions return new objects; nothing mutates its input.
- **Small files.** Keep modules focused. If a file passes ~400 lines, split it.
- **No secrets in the repo.** API keys come from the environment only. `.env` is git-ignored.

## Adding an emote

Emotes are generated from archetypes × variants in `web/src/emotes.js`. Add an archetype (a face)
or a variant (an effect) and the count updates automatically. The test suite asserts the total, so
update `tests/emotes.test.js` alongside.

## Adding a sentiment

1. Add the label to `SENTIMENTS` and `EFFECTS` in `server/sentiment.js`.
2. Add Tomo's visible reaction and a display label in `web/src/sentiment.js`.
3. The existing tests iterate over every label, so they will tell you if you missed a step.

## Commit messages

Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.
