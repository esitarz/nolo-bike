import { Configuration, Auth, Tokens } from "ordercloud-javascript-sdk";

let tokenCache: { token: string; expires: number } | null = null;

/**
 * Authenticate as middleware client (Client Credentials grant).
 * Caches token until near-expiry.
 */
export async function getOcToken(): Promise<string> {
  // Configure at call time so env vars are available
  // OC SDK appends /v1 automatically — strip it if already present in env var
  let apiUrl = process.env.OC_API_URL || "https://sandboxapi.ordercloud.io";
  if (apiUrl.endsWith("/v1")) {
    apiUrl = apiUrl.slice(0, -3);
  }
  Configuration.Set({
    baseApiUrl: apiUrl,
  });

  const now = Date.now();
  if (tokenCache && tokenCache.expires > now + 30_000) {
    return tokenCache.token;
  }

  const clientId = process.env.OC_CLIENT_ID;
  const clientSecret = process.env.OC_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "[ordercloud] OC_CLIENT_ID and OC_CLIENT_SECRET must be set",
    );
  }

  const response = await Auth.ClientCredentials(clientSecret, clientId, [
    "Shopper",
    "MeAdmin",
    "OrderAdmin",
    "OrderReader",
  ]);

  tokenCache = {
    token: response.access_token!,
    expires: now + (response.expires_in ?? 600) * 1000,
  };

  Tokens.SetAccessToken(response.access_token!);
  return tokenCache.token;
}
