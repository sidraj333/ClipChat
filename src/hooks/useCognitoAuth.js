import { useEffect, useState } from "react";
import config from "../config";
/*
  This hook handles user authentication with AWS Cognito using the Authorization Code Flow with PKCE
*/
const TOKEN_REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes

const storageGet = (keys) => {
  new Promise((resolve) =>  chrome.storage.local.get(keys, resolve));
}

const storageSet = (item) => {
  new Promise((resolve) => chrome.storage.local.set(item, resolve));
}

const storageRemove = (item) => {
  new Promise((resolve) => chrome.storage.local.remove(item, resolve));
}

export const clearAuthStorage = async () => {
  await storageRemove(["access_token", "id_token", "refresh_token", "expires_at"]);
}

export const getAuthSession = async () => {
  await storageGet(["access_token", "id_token", "refresh_token", "expires_at"]);
}

export const refreshWithCognito = async (refresh_token) => {
  const tokenResponse = await fetch(`${config.cognito.domain}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.cognito.appClientId,
      refresh_token,
    }).toString(),
  });

  const tokenResponseJson =  await tokenResponse.json();
  if (!tokenResponse.ok) {
    throw new Error(`Token refresh failed: ${JSON.stringify(tokenResponseJson)}`);
  }
  const { access_token, id_token, expires_in } = tokenResponseJson;
  await storageSet({
    access_token,
    id_token,
    expires_at: Date.now() + (expires_in || 0) * 1000,
  });
}

const base64UrlEncode = (buffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const sha256 = async (text) => {
  const data = new TextEncoder().encode(text);
  return crypto.subtle.digest("SHA-256", data);
};

const randomString = (len = 96) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
};

export default function useCognitoAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(["access_token"], (result) => {
      setIsAuthenticated(Boolean(result.access_token));
    });
  }, []);

  const getStoredAuthToken = async () => {
    const result = await chrome.storage.local.get(["id_token", "access_token"]);
    return result.id_token || result.access_token || null;
  };

  const logout = async () => {
    await chrome.storage.local.remove([
      "access_token",
      "id_token",
      "refresh_token",
      "token_type",
      "expires_at",
    ]);
    setIsAuthenticated(false);
  };

  const startLogin = async () => {
    try {
      if (!chrome?.identity?.launchWebAuthFlow) {
        throw new Error("chrome.identity.launchWebAuthFlow is unavailable. Check manifest permissions and extension reload.");
      }

      console.log("Starting login flow");
      const state = crypto.randomUUID();
      const redirectUri = chrome.identity.getRedirectURL("callback");
      const codeVerifier = randomString();
      const codeChallenge = base64UrlEncode(await sha256(codeVerifier));
      const urlAuth =
        `${config.cognito.domain}/oauth2/authorize` +
        "?response_type=code" +
        `&client_id=${config.cognito.appClientId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        "&scope=openid+email+profile" +
        `&state=${encodeURIComponent(state)}` +
        "&code_challenge_method=S256" +
        `&code_challenge=${encodeURIComponent(codeChallenge)}`;

      const callbackUrl = await chrome.identity.launchWebAuthFlow({
        url: urlAuth,
        interactive: true,
      });
      const callBackUrlObject = new URL(callbackUrl);
      const oauthError = callBackUrlObject.searchParams.get("error");
      const oauthErrorDescription = callBackUrlObject.searchParams.get("error_description");
      const code = callBackUrlObject.searchParams.get("code");
      const returnedState = callBackUrlObject.searchParams.get("state");

      if (oauthError) {
        throw new Error(`OAuth error: ${oauthError}${oauthErrorDescription ? ` - ${oauthErrorDescription}` : ""}`);
      }

      if (state !== returnedState) {
        throw new Error("State mismatch in authentication response");
      }
      if (!code) {
        throw new Error(`No code returned from authentication. Callback URL: ${callbackUrl}`);
      }

      const tokenResponse = await fetch(`${config.cognito.domain}/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: config.cognito.appClientId,
          code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }).toString(),
      });

      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok) {
        throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`);
      }

      chrome.storage.local.set(
        {
          access_token: tokenData.access_token,
          id_token: tokenData.id_token,
          refresh_token: tokenData.refresh_token,
          token_type: tokenData.token_type,
          expires_at: Date.now() + (tokenData.expires_in || 0) * 1000,
        },
        () => {
          setIsAuthenticated(true);
        }
      );
    } catch (e) {
      console.error("Authentication failed:", e);
    }
  };

  return { isAuthenticated, startLogin, getStoredAuthToken, logout };
}
