# Putting domochi on Google Play

The Android app is the same game, wrapped by Capacitor (`capacitor.config.ts`, `android/`). It saves to the phone's own storage, starts in landscape (Settings can switch it to Portrait or Auto-rotate), hides the status bar, and Android's back button closes pop-ups and returns to the Lobby.

**App id:** `com.domochitreats.game`. This can never change once it's on Play.

---

## 1. One-time setup on this PC

1. Install **Android Studio**: https://developer.android.com/studio. It comes with Java and the Android SDK.
2. Open Android Studio once and finish the setup wizard (the "Standard" choices are fine).
3. In the project folder, run `npm run android:open`. Android Studio opens the `android/` project and downloads what it needs. The first time takes a few minutes; wait until the bottom bar stops saying "Gradle sync".

## 2. Try it on your phone

1. On the phone, turn on **Developer options** (Settings → About phone → tap *Build number* 7 times). Then turn on **USB debugging** (Settings → System → Developer options).
2. Plug the phone into the PC with a USB cable and allow the "USB debugging" prompt on the phone.
3. In Android Studio, pick your phone at the top and press the green **Run ▶** button.

After any change to the game, run `npm run android:sync`, then press Run again.

## 3. Make your upload key (once, and keep it safe)

Google Play signs the app for players. You sign each upload with your own **upload key**.

1. Make a folder **outside the project**, for example `C:\Users\kumar\domochi-keys`.
2. In a terminal, run (one line):
   ```
   "C:\Users\kumar\.jdks\jbr-21.0.11\bin\keytool.exe" -genkeypair -v -keystore C:\Users\kumar\domochi-keys\domochi-upload.jks -alias domochi -keyalg RSA -keysize 2048 -validity 10000
   ```
   It asks for a password (make a strong one), then your name and city. Those can be anything; they aren't shown to players.
3. Create the file `android/keystore.properties`. It's git-ignored, so it never goes to GitHub:
   ```
   storeFile=C:/Users/kumar/domochi-keys/domochi-upload.jks
   storePassword=YOUR_PASSWORD
   keyAlias=domochi
   keyPassword=YOUR_PASSWORD
   ```
4. **Back up** the `.jks` file and the password somewhere safe, such as a USB stick or a password manager. If they're lost, Google support has to reset the key before you can update the app.

## 4. Build the upload file

```
npm run android:bundle
```

The file is `android/app/build/outputs/bundle/release/app-release.aab`.

- If it says JAVA_HOME isn't set, run this first in the same terminal: `set JAVA_HOME=C:\Users\kumar\.jdks\jbr-21.0.11` (the Java 21 that Android Studio downloaded).
- You can also build it in Android Studio: **Build → Generate Signed App Bundle**.

**Every later update:** raise `versionCode` (1 → 2 → 3…) and `versionName` in `android/app/build.gradle`, then build again.

## 5. Google Play Console

1. Sign up at https://play.google.com/console. It's a **personal** account: $25 once, plus ID verification.
2. **Create app:**
   - Name: *domochi: mochi donut game*
   - Type: Game
   - Price: Free
   - Accept the declarations.
3. **Store listing:** the text and images are in `store/` (descriptions, icon, feature graphic, screenshots).
4. **App content** (left menu → *Policy and programs → App content*):
   - **Privacy policy:** https://darshankumar2004.github.io/domochi/privacy.html
   - **Ads:** No ads.
   - **App access:** All functionality is available without special access.
   - **Target audience:** 13 and over. Choosing under-13 brings in Google's Families rules.
   - **Content rating:** answer the questionnaire. There's no violence, no gambling and no user-to-user chat, so it should come out as Everyone or PEGI 3.
   - **Data safety:** see the answers below.
5. **Closed testing first.** New personal accounts must have **at least 12 testers opted in for 14 days in a row** before the app can go public.
   - Go to *Test and release → Testing → Closed testing*, create a track and upload the `.aab`.
   - Add testers by email: friends, family, domochi regulars.
   - Send them the opt-in link. Each tester must accept it and install the app from Play.
   - After 14 days, apply for production access (*Dashboard*). Google asks a few questions about the test, and review takes up to about a week.
6. **Production:** create a release with the same `.aab` (or a newer one) and send it for review.

### Data safety answers

- **Does the app collect or share data?** Yes, it collects data (it shares none).
- **Personal info → Name:** collected, optional (the first name on a note). Purpose: Developer communications.
- **Messages → Other in-app messages:** collected, optional (flavour ideas and notes for Ethan). Purpose: Developer communications.
- **Is data encrypted in transit?** Yes (HTTPS).
- **Can users ask for data to be deleted?** Yes, through the contact on the privacy page.
- **Not collected:** location, contacts, device IDs, analytics, purchases, photos.

## 6. Notes from players in the app

The app sends notes from `https://localhost`, which is how Capacitor serves it. The relay already lists that origin in `relay/wrangler.toml`, but it has to be redeployed once for it to take effect:
```
cd relay
npx wrangler deploy
```
