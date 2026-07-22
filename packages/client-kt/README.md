# Kotlin API Client

Generated Kotlin client for the SpicyHome POS Android tablet app.

## Generation approach

**Checked-in sources** workflow — generation runs on the host via `bazel run`,
sources are committed to `src/generated/`.

- **Generator**: `openapi-generator-cli` 7.14.0 (managed via npm wrapper
  `@openapitools/openapi-generator-cli@2.15.3`).
- **Library**: `jvm-retrofit2` (Retrofit2 + OkHttp + Gson).
- **Package**: `com.spicyhome.client`.
- **Options**: `collectionFormat=csv`, `dateLibrary=string`.

### Regenerate

```sh
bazel run //packages/client-kt:generate
```

Requires Java 21+ on the host (`brew install openjdk`). The first run downloads
the openapi-generator JAR (~30 MB) to the npm cache.

### Tests

| Test | Command | What it checks |
|---|---|---|
| Verify | `bazel test //packages/client-kt:test` | All expected API classes (AuthApi, MenuApi, OrdersApi, TablesApi, PrintersApi), models (LoginDto, CreateOrderDto, etc.), and infrastructure classes exist in the checked-in sources. Always runs, no Java needed. |
| Drift | Included in `:test`, auto-skips when Java unavailable | Regenerates to a temp dir, diffs against checked-in sources. Fails if the spec changed but sources weren't regenerated. |

### Structure

```
src/generated/
├── build.gradle          # Gradle build (for reference; Bazel will use rules_kotlin)
├── settings.gradle
└── src/main/kotlin/com/spicyhome/client/
    ├── apis/              # AuthApi.kt, MenuApi.kt, OrdersApi.kt, TablesApi.kt, PrintersApi.kt
    ├── auth/              # HttpBearerAuth.kt
    ├── infrastructure/    # ApiClient.kt, Serializer.kt, CollectionFormats.kt
    └── models/            # LoginDto.kt, CreateOrderDto.kt, ... (19 DTOs)
```

## Step 8 consumption

When `rules_kotlin` and `rules_android` are set up:

1. The `filegroup //packages/client-kt:sources` exposes all `.kt` files.
2. Create a `kt_jvm_library` (or `kt_android_library`) that compiles these sources.
3. Add Retrofit2, OkHttp, Gson as Maven dependencies (via `rules_jvm_external`).
4. The Android app (`apps/android`) depends on that `kt_jvm_library`.

## Risks

- **Response types are `Unit`**: The NestJS controllers lack `@ApiResponse` decorators,
  so the generator produces `Call<Unit>` instead of typed response models. Add
  `@ApiResponse({ type: ... })` to controllers for full type fidelity.
- **No-package `node_modules` conflict**: If `pnpm` creates a `node_modules` in
  `packages/client-kt`, run `pnpm install` from root and ensure the directory
  is listed in `.bazelignore`.
