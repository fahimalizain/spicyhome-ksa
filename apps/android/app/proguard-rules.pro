# ProGuard rules for SpicyHome POS
# Retrofit/OkHttp
-keepattributes Signature
-keepattributes *Annotation*
-dontwarn okhttp3.**
-dontwarn retrofit2.**
-keep class com.spicyhome.client.** { *; }
