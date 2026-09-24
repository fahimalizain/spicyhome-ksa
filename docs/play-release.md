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

`VERSION` at the repository root remains the source of truth for the release
version **name** (currently `202609.23.1`): it drives the AAB's `versionName`,
release tags, and the Windows package. It no longer influences the Android
`versionCode`.

**Google Play is the sole authority for `versionCode`.** On every run the
workflow reads the highest `versionCode` already on Play — via
`edits.bundles.list`, app-wide across all tracks — and uses **that + 1**; there
is no local counter and no formula. A brand-new app with no uploads therefore
starts at `versionCode 1` (this app is at `1` now).

Because the number is re-read from Play on every run, abandoned uploads do
not cause collisions: a bundle that was uploaded but never released still
counts, so the next run moves past it. Deploys no longer need
`scripts/bump-version.sh date` — that script is still how release versions in
`VERSION` get bumped for a release, but it is not a deploy prerequisite.

Google Play's maximum `versionCode` is **2,100,000,000**. At +1 per release that
is ~2.1 billion releases of headroom. If the computed code would exceed it, the
workflow fails with an actionable error instead of letting Play reject the
upload.

The bundle list is **app-wide, not per-track**: `edits.bundles.list` returns
every bundle of the app, so a versionCode already used on `internal` or `alpha`
also counts for a `production` deploy. The workflow **fails closed**: if Play's
bundle list cannot be read, the run stops instead of guessing a code.

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

| Input    | Options                                   | Default | Effect                                                                                           |
| -------- | ----------------------------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| `track`  | `internal`, `alpha`, `beta`, `production` | `alpha` | Play track that receives the AAB (`alpha` is Play's first closed testing track)                  |
| `status` | `draft`, `completed`                      | `draft` | `draft` uploads the AAB with no rollout; `completed` rolls the release out to the selected track |

- **`draft`** (recommended for the first production release): the AAB is
  uploaded and visible in Play Console, but nothing reaches users until you
  review it and roll it out.
- **`completed`**: the release is rolled out as part of the workflow run.

For a first run, use `alpha` + `draft` (both are the defaults) to prove signing,
the service account, and the upload path end to end; `internal` + `draft` is the
quickest smoke test, because internal testing needs no tester group.

The workflow warns (it does not fail) when run from a branch other than
`master`. The AAB is built from the ref you select, so `VERSION` must already be
committed there.

### Closed testing (alpha)

`alpha` is the workflow default and is Play's first closed testing track.
`status` still defaults to `draft`, so nothing reaches testers until you roll the
release out in Play Console.

Testers are managed in Play Console, not by this workflow. Go to **Test and
release → Testing → Closed testing** and attach a tester group (a Google Group
or an email list). The workflow and the Play API can create and update the
release, but they cannot manage testers — a release on a track with no testers
cannot be installed by anyone.

- Testers receive the build only after the release is rolled out
  (`status: completed`); a `draft` release is invisible to them.
- After a closed test is first published, Play's opt-in link can take several
  hours before it becomes available to testers.
- A recently created personal/individual developer account still needs at least
  **12 testers opted in for 14 continuous days** in closed testing before
  production access is granted (see step 6 above).
- To promote a tested build, use Play Console's promote-release flow for that
  bundle rather than re-dispatching this workflow: the `versionCode` is always
  (highest on Play + 1), so a re-dispatch produces a **new** `versionCode` and
  therefore a _different_ bundle than the one that was tested.

See Google's [tester setup guide](https://support.google.com/googleplay/android-developer/answer/9845334).

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
- **`Computed versionCode ... exceeds the Google Play maximum of 2100000000`** —
  the ceiling has been reached and the numbering scheme must change (see
  [Versioning](#versioning)).
- **Play rejects the upload with `Version code ... has already been used`** —
  the workflow derives the code from Play's bundle list on every run and fails
  closed rather than guessing, so if Play still rejects a code, something
  consumed it that the bundle list does not show. Reconcile Play Console →
  **App Bundle Explorer** (this is how this project recovered: the stray bundle
  was deleted there) and re-run the workflow.
- **`PLAY_SERVICE_ACCOUNT_JSON is not valid JSON`** — the secret does not hold
  the complete service-account key file. Replace it with the full JSON.
- **A release on closed testing that no tester can install** — no tester group is
  attached to the track, or the release is still a `draft`. See
  [Closed testing (alpha)](#closed-testing-alpha).
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
