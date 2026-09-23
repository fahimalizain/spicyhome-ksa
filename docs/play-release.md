# Android Google Play Release

## What this is

`.github/workflows/deploy-android.yml` (workflow name **Deploy Android (Google
Play)**) is a manual (`workflow_dispatch`) GitHub Actions workflow that builds a
release-signed Android App Bundle (AAB) with Gradle on `ubuntu-latest` (JDK 21,
Android SDK 36), validates the version against Google Play, and uploads the AAB
to the selected Play track. It is separate from `.github/workflows/release.yml`,
which builds the debug APK for GitHub Releases — only the AAB goes to Play.

## One-time setup

### 1. Create the upload keystore

Generate a PKCS12 keystore (the alias is your choice, but it must match the
`SPICYHOME_ANDROID_KEY_ALIAS` secret later):

```sh
keytool -genkeypair -v -keystore spicyhome-upload.jks -storetype PKCS12 \
  -alias spicyhome-upload -keyalg RSA -keysize 4096 -validity 10000
```

- Use a strong store password and key password, and keep the keystore file
  **outside the repository**. `*.jks` is gitignored as a safety net, not as a
  licence to store the keystore in-repo.
- **Back the keystore and passwords up.** This is the upload key for Play App
  Signing; losing it blocks updates until Google approves an upload-key reset.

### 2. Add the four keystore secrets

In the GitHub repository go to **Settings → Secrets and variables → Actions**
and add these repository secrets:

| Secret                                | Value                          |
| ------------------------------------- | ------------------------------ |
| `SPICYHOME_ANDROID_KEYSTORE_BASE64`   | Base64 of the keystore file    |
| `SPICYHOME_ANDROID_KEYSTORE_PASSWORD` | Keystore (store) password      |
| `SPICYHOME_ANDROID_KEY_ALIAS`         | Key alias (`spicyhome-upload`) |
| `SPICYHOME_ANDROID_KEY_PASSWORD`      | Key password                   |

Encode the keystore as one line with no wrapping:

```sh
# macOS
base64 -i spicyhome-upload.jks | pbcopy

# Linux
base64 -w0 spicyhome-upload.jks
```

### 3. Create the Google Cloud service account

1. Create or choose a Google Cloud project.
2. Enable the **Google Play Android Developer API** for that project.
3. Create a service account, create a **JSON** key for it, and download the key
   file.

### 4. Grant it access in Play Console

In **Play Console → Users and permissions → Invite new users**, paste the
service account email (`...@....iam.gserviceaccount.com`), then under **App
permissions** select this app and grant the release permissions it needs
(releasing to production and to whichever testing tracks you deploy to).
Without this invitation the workflow fails with a `403` / permission error when
it calls the Play API.

### 5. Add the Play secret

Add the repository secret `PLAY_SERVICE_ACCOUNT_JSON` containing the full JSON
key file contents (a single line is fine).

### 6. Play Console app-content prerequisites for the first production release

- **App content** must be complete: the content rating questionnaire, the Data
  safety form, target audience, the ads declaration, and a privacy policy URL.
  This project uses `https://fahimalizain.com/spicyhome-ksa/privacy/`.
- **Store listing** must be complete: app name, descriptions, screenshots,
  feature graphic, and icon.
- The first AAB upload enrolls the app in **Play App Signing**; this keystore
  becomes the _upload_ key (Google holds the app-signing key).
- If the app is on a recently created **personal/individual** developer account,
  Google additionally requires a closed test with at least **12 testers opted
  in for 14 continuous days** before production access is granted.

## Versioning

`VERSION` at the repository root is the single source of truth (currently
`202609.23.1`). `apps/android/app/build.gradle.kts` derives the Play
`versionCode` from it:

```text
versionCode = YYYYMM * 10000 + DD * 100 + min(N, 99)
```

For `202609.23.1` that is `202609 * 10000 + 23 * 100 + 1 = 2026092301`. The
workflow reads the resolved pair from `./gradlew :app:printVersionInfo`, then
queries the Play API for the highest `versionCode` already uploaded and
**refuses to build/upload when the computed code is not strictly greater**,
telling you to run `scripts/bump-version.sh date`, commit the bump, and re-run.

- A same-day re-release bumps `.N`, which adds 1 to the `versionCode`.
- A release on a new day bumps `DD`, which adds 100.
- The scheme saturates at `N = 99` (`min(N, 99)`), so a 100th same-day release
  cannot get a fresh code until the next day.

## Release notes

Release notes are generated automatically from conventional-commit subjects
(`feat`, `fix`, `perf`) since the previous release tag. When a tag matching
`VERSION` already exists it is excluded, so the notes describe the release being
deployed rather than only the commits after its tag. The generated notes are
capped at 500 characters; if there are no matching commits the workflow falls
back to `- Improvements and bug fixes.` (or `- Initial release.` when no
baseline tag exists). The deploy never fails because notes are empty.

With `status: draft` you can edit the notes in Play Console before rolling out.

## Running a deploy

Go to **Actions → Deploy Android (Google Play) → Run workflow**, select branch
`master`, and choose the inputs:

| Input    | Options                          | Default      | Effect                                                                                           |
| -------- | -------------------------------- | ------------ | ------------------------------------------------------------------------------------------------ |
| `track`  | `production`, `internal`, `beta` | `production` | Play track that receives the AAB                                                                 |
| `status` | `draft`, `completed`             | `draft`      | `draft` uploads the AAB with no rollout; `completed` rolls the release out to the selected track |

- **`draft`** (recommended for the first production release): the AAB is
  uploaded and visible in Play Console, but nothing reaches users until you
  review it and roll it out.
- **`completed`**: the release is rolled out as part of the workflow run.

For a first run, use `internal` + `draft` to prove signing, the service account,
and the upload path end to end before touching production.

The workflow warns (it does not fail) when run from a branch other than
`master`. The AAB is built from the ref you select, so `VERSION` must already be
committed there.

## Troubleshooting

- **`Missing required repository secrets: ...`** — one of
  `SPICYHOME_ANDROID_KEYSTORE_BASE64`, `SPICYHOME_ANDROID_KEYSTORE_PASSWORD`,
  `SPICYHOME_ANDROID_KEY_ALIAS`, `SPICYHOME_ANDROID_KEY_PASSWORD`, or
  `PLAY_SERVICE_ACCOUNT_JSON` is unset. Add it under **Settings → Secrets and
  variables → Actions**.
- **`403` / permission errors from the Play API** — the service account has not
  been invited in Play Console, or its app permissions do not cover releasing
  to the selected track. See step 4 above.
- **`Cannot read the upload keystore`** — the base64 blob, store password, and
  alias do not all match the same keystore. Re-encode the file and re-check the
  secret values.
- **`versionCode ... is not greater`** — Play already has a bundle with an equal
  or higher code. Run `scripts/bump-version.sh date`, commit the bump, and
  re-run the workflow.
- **`PLAY_SERVICE_ACCOUNT_JSON is not valid JSON`** — the secret does not hold
  the complete service-account key file. Replace it with the full JSON.
- **Sentry** — the optional `SENTRY_ANDROID_DSN` secret enables Sentry in the
  AAB when set, matching the APK release; without it the DSN is empty and Sentry
  stays off.

## Security notes

- All signing and Play credentials live only in GitHub Actions secrets; never
  commit a keystore or a service-account JSON.
- The minted Play access token is masked in the workflow logs before it can be
  printed.
- Rotate the service-account key by replacing the `PLAY_SERVICE_ACCOUNT_JSON`
  secret with the new key file's contents.
