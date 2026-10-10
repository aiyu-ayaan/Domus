# kotlinx.serialization ships its own consumer rules; OkHttp's optional TLS providers are not on Android.
-dontwarn org.bouncycastle.**
-dontwarn org.conscrypt.**
-dontwarn org.openjsse.**
