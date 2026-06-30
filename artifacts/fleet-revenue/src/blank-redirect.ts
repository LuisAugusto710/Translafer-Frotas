/**
 * OAuth popup redirect handler.
 *
 * This module runs ONLY inside the MSAL auth popup window after Microsoft
 * redirects back to /blank.html?code=...&state=...
 *
 * `broadcastResponseToMainFrame` (from MSAL's redirect-bridge) parses the auth
 * response from the URL, broadcasts the payload to the parent window via a
 * BroadcastChannel keyed on the request state id, and closes the popup.
 *
 * Using the package's purpose-built bridge function (instead of spinning up a
 * second PublicClientApplication and calling handleRedirectPromise) guarantees
 * the exact same MSAL version as the main app and the correct popup handshake.
 */
import { broadcastResponseToMainFrame } from "@azure/msal-browser/redirect-bridge";

broadcastResponseToMainFrame().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[LAFER/blank] MSAL redirect bridge error:", err);
});
