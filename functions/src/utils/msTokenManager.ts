import axios from "axios";

/**
 * Microsoft Graph Token Manager
 *
 * Handles OAuth2 token lifecycle:
 *  - Reads credentials from environment variables (set in .env.bulsuspace)
 *  - Exchanges refresh token → access token via Microsoft OAuth2 endpoint
 *  - Caches the access token in-memory until it expires
 *  - Automatically rotates the refresh token when Microsoft issues a new one
 *
 * Environment variables required:
 *  MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_REFRESH_TOKEN
 */

// ─── Types ──────────────────────────────────────────────────────────────────────
interface TokenResponse {
  token_type: string;
  scope: string;
  expires_in: number;
  ext_expires_in: number;
  access_token: string;
  refresh_token?: string; // Microsoft may return a rotated refresh token
}

interface CachedToken {
  accessToken: string;
  expiresAt: number; // Unix timestamp in ms
}

// ─── In-memory cache ────────────────────────────────────────────────────────────
let cachedToken: CachedToken | null = null;

/**
 * In-memory refresh token — starts with the value from env and gets rotated
 * whenever Microsoft returns a new one in the token response.
 */
let currentRefreshToken: string | null = null;

// ─── Helpers ────────────────────────────────────────────────────────────────────

function getMsConfig() {
  const tenantId = process.env.MS_TENANT_ID;
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  const refreshToken = process.env.MS_REFRESH_TOKEN;

  if (!tenantId || !clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing Microsoft Graph environment variables. " +
      "Ensure MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, and MS_REFRESH_TOKEN " +
      "are set in functions/.env.bulsuspace"
    );
  }

  return { tenantId, clientId, clientSecret, refreshToken };
}

function getRefreshToken(): string {
  if (currentRefreshToken) return currentRefreshToken;

  const config = getMsConfig();
  currentRefreshToken = config.refreshToken;
  return currentRefreshToken;
}

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Get a valid Microsoft Graph access token.
 *
 * - Returns cached token if it's still valid (with a 5-minute safety margin).
 * - Otherwise, exchanges the refresh token for a fresh access token.
 * - If Microsoft returns a rotated refresh token, it's stored in-memory
 *   for subsequent calls within the same Cloud Function instance.
 */
export async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (5 min buffer)
  const BUFFER_MS = 5 * 60 * 1000;
  if (cachedToken && Date.now() < cachedToken.expiresAt - BUFFER_MS) {
    return cachedToken.accessToken;
  }

  const { tenantId, clientId, clientSecret } = getMsConfig();
  const refreshToken = getRefreshToken();

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: "https://graph.microsoft.com/Mail.Send offline_access openid profile email",
  });

  try {
    const response = await axios.post<TokenResponse>(tokenUrl, params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const data = response.data;

    // Cache the access token
    cachedToken = {
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    // Rotate the refresh token if Microsoft issued a new one
    if (data.refresh_token) {
      currentRefreshToken = data.refresh_token;
      console.log("🔄 Microsoft refresh token rotated (in-memory)");
    }

    console.log(
      `✅ Microsoft Graph access token acquired — expires in ${data.expires_in}s`
    );
    return data.access_token;
  } catch (error: any) {
    // Clear cache on failure
    cachedToken = null;

    const detail =
      error?.response?.data?.error_description ||
      error?.response?.data?.error ||
      error?.message ||
      "Unknown error";

    console.error("❌ Failed to get Microsoft Graph access token:", detail);
    throw new Error(`Failed to get Microsoft Graph access token: ${detail}`);
  }
}

/**
 * Invalidate the cached access token — useful for forced re-auth.
 */
export function clearTokenCache(): void {
  cachedToken = null;
  console.log("🗑️ Microsoft Graph token cache cleared");
}
