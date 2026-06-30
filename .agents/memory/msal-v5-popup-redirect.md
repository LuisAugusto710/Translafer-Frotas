---
name: MSAL v5 browser popup redirect bridge
description: How to build the OAuth popup redirect page for @azure/msal-browser v5 so loginPopup actually resolves
---

# MSAL v5 popup redirect page

When using `@azure/msal-browser` v5 `loginPopup()`, the redirect-target page
(the `redirectUri`, e.g. `/blank.html`) must call **`broadcastResponseToMainFrame`**
from the subpath export `@azure/msal-browser/redirect-bridge` — NOT
`handleRedirectPromise()`.

**Why:** v5's popup handshake is a `BroadcastChannel` keyed on the request's
`libraryState.id`. The parent's `loginPopup()` waits on that channel
(`waitForBridgeResponse`). The bridge function parses the auth response from the
URL, posts `{v:1, payload}` to that channel, then `window.close()`s the popup.
`handleRedirectPromise()` on a fresh popup-side instance does NOT perform this
broadcast, so the popup hangs open and the auth code is never consumed by the
parent. Loading MSAL from a CDN (esm.sh) for the popup page also risks version
skew that breaks the channel protocol.

**How to apply:**
- Make the redirect page a real Vite entry (add it to `build.rollupOptions.input`
  alongside `index.html`) so it bundles the *exact installed* MSAL version.
- Entry module is just: `import { broadcastResponseToMainFrame } from
  "@azure/msal-browser/redirect-bridge"; broadcastResponseToMainFrame()`.
  No client ID, no config, no PublicClientApplication needed on the popup page.
- Set `auth.redirectUri = window.location.origin + "/<page>.html"` and register
  that exact URL in Azure → Authentication → Single-page application.
- Static deploys with a `/* -> /index.html` rewrite still serve the real
  `/blank.html` file first, so the bridge page loads correctly in production.
