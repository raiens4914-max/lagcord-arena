# Lagcord Arena

Lagcord Arena is a Discord-inspired gamer chat site with:

- server and channel layout
- gamer-themed neon UI
- account creation and login
- shared live chat across visitors
- GIF posting support

## Run locally

Requirements:

- Node.js 18+

Start the app:

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

## Deploy on Render

This project is already prepared for Render with `package.json` and `render.yaml`.

Steps:

1. Create a new GitHub repository.
2. Upload all files from this folder except ignored local files.
3. Sign in to Render.
4. Create a new `Web Service`.
5. Connect your GitHub repo.
6. Render should detect:
   - Build Command: `npm install`
   - Start Command: `npm start`
7. Deploy and wait for your permanent `onrender.com` URL.

## Important note

This app currently stores users and chat data in a local `data.json` file when running on the server. That is okay for a simple demo, but for a real production app you would want a proper database.
