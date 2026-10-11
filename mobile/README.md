# Trucker mobile

Expo (React Native) app for the Trucker API. Targets iOS; Android should work too.

## Screens

- **Today** – the active plan's exercises for today, pre-filled with target sets.
  Tick off sets as you do them, then *Finish workout*; only ticked sets are logged.
  The in-progress workout is saved on the device, so closing the app loses nothing.
- **History** – logged workouts; tap one for details or to delete it.
- **Progress** – estimated 1RM and volume per exercise.
- **Settings** – API server URL and the active training plan.

## Running on your iPhone

Requires Node 20.19+ (`nvm use` picks up `.nvmrc`).

```sh
# terminal 1, repo root: the Go API on :8081
air

# terminal 2
cd mobile
npm install
npm start          # Metro on :8082 (8081 is taken by the API)
```

Install **Expo Go** from the App Store and scan the QR code with the Camera app.
The phone must be on the same Wi-Fi as your Mac. The app defaults to the API on
the machine running Metro (`http://<your-mac-ip>:8081`); change it under
Settings, or set `EXPO_PUBLIC_API_URL` before `npm start`.

## Checks

```sh
npm run lint
npm run typecheck
```

## Shipping a standalone build

Use EAS (`npx eas-cli@latest build -p ios`) – it needs an Apple Developer
account. A release build only talks to HTTPS servers, so put the API behind TLS
(e.g. Caddy in front of the Docker container) first.
