#!/bin/bash
# deb post-install. electron-builder's default only makes chrome-sandbox setuid when user namespaces
# fail for root; on Ubuntu 24.04+ AppArmor blocks them for ordinary users only, so that test passes
# and the installed app then refuses to start. Always use the setuid sandbox.
if type update-alternatives >/dev/null 2>&1; then
    update-alternatives --install /usr/bin/docus docus /opt/Docus/docus 100 || ln -sf /opt/Docus/docus /usr/bin/docus
else
    ln -sf /opt/Docus/docus /usr/bin/docus
fi
chmod 4755 /opt/Docus/chrome-sandbox || true
if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi
if hash gtk-update-icon-cache 2>/dev/null; then
    gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
fi
