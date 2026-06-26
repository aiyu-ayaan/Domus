# Android release builder: JDK 21 + Android SDK (compileSdk 36) + Bun.
# Heavy image (SDK ~3 GB) — build once, then reuse. The actual app build runs at
# container start so NEXT_PUBLIC_API_URL + the signing keystore are runtime inputs.
#   docker compose -f docker-compose.release.yml run --rm android
FROM eclipse-temurin:21-jdk-jammy

ENV ANDROID_SDK_ROOT=/opt/android-sdk \
    ANDROID_HOME=/opt/android-sdk \
    DEBIAN_FRONTEND=noninteractive
ENV PATH=$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$ANDROID_SDK_ROOT/platform-tools:/root/.bun/bin:$PATH

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl unzip git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Android command-line tools + the packages this project targets (compileSdk 36).
RUN mkdir -p "$ANDROID_SDK_ROOT/cmdline-tools" \
    && curl -fsSL https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -o /tmp/cmdtools.zip \
    && unzip -q /tmp/cmdtools.zip -d "$ANDROID_SDK_ROOT/cmdline-tools" \
    && mv "$ANDROID_SDK_ROOT/cmdline-tools/cmdline-tools" "$ANDROID_SDK_ROOT/cmdline-tools/latest" \
    && rm /tmp/cmdtools.zip \
    && yes | sdkmanager --licenses >/dev/null \
    && sdkmanager --install "platform-tools" "platforms;android-36" "build-tools;36.0.0" >/dev/null

# Bun for the Next.js static export.
RUN curl -fsSL https://bun.sh/install | bash

WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile || bun install
RUN sed -i 's/\r$//' /app/scripts/*.sh && chmod +x /app/scripts/*.sh

ENTRYPOINT ["/app/scripts/release-android.sh"]
