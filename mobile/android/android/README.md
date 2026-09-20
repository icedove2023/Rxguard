# RxGuard — Native Android Project

This is a hand-authored scaffold matching React Native 0.73.4's standard
template (Kotlin, New Architecture off, Hermes on), configured for the
RxGuard app (package `ng.rxguard`).

## One-time setup after cloning

Two files can't be generated as plain text and must be created locally:

### 1. Gradle wrapper JAR

`gradle/wrapper/gradle-wrapper.jar` is a binary and isn't included. Generate it with:

```bash
cd android
gradle wrapper --gradle-version 8.3
```

(or copy it from any other RN 0.73 project's `android/gradle/wrapper/` folder —
it's identical across projects for a given Gradle version).

### 2. Debug signing keystore

`app/debug.keystore` is referenced by `app/build.gradle` for debug builds
but isn't included. Generate it with:

```bash
cd android/app
keytool -genkeypair -v -storetype PKCS12 \
  -keystore debug.keystore -alias androiddebugkey \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass android -keypass android \
  -dname "CN=Android Debug,O=Android,C=US"
```

## Deep linking (Supabase Auth)

`app/src/main/AndroidManifest.xml` registers a custom URL scheme:

```
rxguard://auth-callback
```

For Supabase's email confirmation and password-recovery links to open
directly in the app (instead of the phone's browser), add this exact URL
as an additional **Redirect URL** in the Supabase Dashboard: **Authentication
→ URL Configuration** — alongside the existing web callback URL from
`backend/SUPABASE_SETUP.md`. Then set `SUPABASE_AUTH_REDIRECT_URL` for
mobile-initiated auth requests (register/forgot-password calls made from
the app) to `rxguard://auth-callback` instead of the web URL — see
`src/services/deepLinking.ts` for how the app parses the incoming link,
and `src/navigation/linking.ts` for the React Navigation wiring.

Note the backend currently has a single `SUPABASE_AUTH_REDIRECT_URL` used
for all clients. Since web and mobile need different redirect targets,
either pass an explicit `redirect_to` per-request (the app already does
this — see `AuthService` calls that accept a redirect override) or run
separate deployments/env values per client if you need this to differ
by default too.

## Building

```bash
cd android
./gradlew assembleDebug      # APK at app/build/outputs/apk/debug/
./gradlew installDebug       # build + install on a connected device/emulator
```

Or from the project root: `npx react-native run-android`.

## What's NOT included

- `local.properties` (your local Android SDK path) — Android Studio
  creates this automatically on first open, or create it manually with
  `sdk.dir=/path/to/Android/sdk`.
- Play Store release signing config — the release build type currently
  reuses the debug signing config so `assembleRelease` works out of the
  box for testing. Replace with your own upload keystore before
  publishing (see Android's official signing documentation).
- Push notification setup (Firebase/FCM) — not part of this pass.
