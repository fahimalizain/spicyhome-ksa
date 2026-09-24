package com.spicyhome.pos.update

/**
 * Date-based version in the `YYYYMM.DD.N` format (e.g. `202608.01.1`).
 *
 * Versions are compared as three integers: `(yyyymm, day, increment)`.
 * An optional leading `v` is tolerated when parsing (GitHub tags are often
 * published as `v202608.01.1`).
 */
data class AppVersion(
    val yyyymm: Int,
    val day: Int,
    val increment: Int,
) : Comparable<AppVersion> {

    override fun compareTo(other: AppVersion): Int =
        compareValuesBy(this, other, AppVersion::yyyymm, AppVersion::day, AppVersion::increment)

    override fun toString(): String = "%06d.%02d.%d".format(yyyymm, day, increment)

    /**
     * Android versionCode matching the Gradle `computeVersionCode` formula:
     * `yyyymm * 10000 + day * 100 + min(increment, 99)`.
     *
     * Monotonic for all version bumps (the day cap of 99 increments is far
     * below what a single release day produces). Keep in sync with
     * `computeVersionCode` in `apps/android/app/build.gradle.kts`.
     */
    fun toVersionCode(): Int = yyyymm * 10000 + day * 100 + increment.coerceAtMost(99)

    companion object {
        private val VERSION_REGEX = Regex("""^v?(\d{6})\.(\d{2})\.(\d+)$""")

        /** Parses a `YYYYMM.DD.N` version string (optionally prefixed with `v`). */
        fun parse(version: String): AppVersion? {
            val match = VERSION_REGEX.matchEntire(version.trim()) ?: return null
            val yyyymm = match.groupValues[1].toIntOrNull() ?: return null
            val day = match.groupValues[2].toIntOrNull() ?: return null
            val increment = match.groupValues[3].toIntOrNull() ?: return null
            return AppVersion(yyyymm = yyyymm, day = day, increment = increment)
        }

        /** Returns true when [candidate] is a valid version newer than [current]. */
        fun isNewerThan(current: String, candidate: String): Boolean {
            val currentVersion = parse(current) ?: return false
            val candidateVersion = parse(candidate) ?: return false
            return candidateVersion > currentVersion
        }
    }
}
