# ACOMS-AI

A computing-and-informatics focused chat assistant built with React, TypeScript, Vite, Tailwind, Zustand, Firebase (Auth + Realtime Database), Groq, and Cloudflare Workers AI.

## Features

- Multiple chats with Firebase Realtime Database persistence at `chats/${uid}/${chatId}`
- Streaming Groq chat responses with computing-topic filtering and voice transcription (Whisper)
- Text-to-image generation through Cloudflare Workers AI, with canvas cropping and compact Data URLs
- Image attachments (Groq vision), file context, export/import, themes, and compressed avatar persistence
- Attached documents are parsed in the browser and sent to Groq from memory; chat records keep only file name/type/size metadata, and Firebase Storage is not used at all

## Requirements

- Node.js and npm
- A Firebase project with Auth and Realtime Database enabled
- A Groq API key
- A Cloudflare account with Workers AI access (for image generation)

## Setup

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in the Firebase and Groq values.

3. For image generation, either:

   - Deploy `netlify/functions/cf-image.mjs` as a Netlify Function and set the **server-side** environment variables `CF_ACCOUNT_ID` and `CF_AI_TOKEN` (scope must include Functions); or
   - Set `VITE_CF_ACCOUNT_ID` and `VITE_CF_AI_TOKEN` in `.env` for local development only.

   The function serves both `/api/cf-image` and `/.netlify/functions/cf-image`. The browser tries those same-origin endpoints first. The direct Cloudflare API path is only used by the Vite dev server and is never used in production builds.

   > Security note: values prefixed with `VITE_` are inlined into the client bundle. Do not deploy production secrets as `VITE_*`; use the server-side function variables and rotate any keys that were previously exposed.

4. Start the app:

```bash
npm run dev
```

## Netlify production deploy

`netlify.toml`, `netlify/functions/cf-image.mjs`, and the redirect rules must be committed to Git (or uploaded by the CLI). A Git-enabled Netlify build will not see untracked files.

```bash
# One-time setup: log in and link the correct site
npx netlify-cli login
npx netlify-cli link --name acoms-ai2
npx netlify-cli status

# Verify locally, then deploy
npx tsc --noEmit
npm run build
npm run functions:build
npm run deploy:prod
```

`deploy:prod` explicitly passes `--dir=dist --functions=netlify/functions --site=acoms-ai2` so a manual CLI deploy cannot silently skip the function or target another site. Confirm `CF_ACCOUNT_ID` and `CF_AI_TOKEN` exist in the site's Netlify environment variables with Functions scope, then redeploy after changing them.

## Verification

```bash
npx tsc --noEmit
npm run build
npm run functions:build
```

A deployed function should answer `GET /api/cf-image` with `405 Use POST for image generation.`; a `404` means the function was not uploaded to that site.
