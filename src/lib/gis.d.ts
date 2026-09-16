/** Kiểu tối thiểu cho Google Identity Services (https://accounts.google.com/gsi/client). */
declare namespace google {
  namespace accounts {
    namespace oauth2 {
      interface TokenResponse {
        access_token?: string
        expires_in?: number
        scope?: string
        error?: string
        error_description?: string
      }

      interface TokenClient {
        requestAccessToken(overrides?: { prompt?: string }): void
      }

      interface TokenClientConfig {
        client_id: string
        scope: string
        callback: (response: TokenResponse) => void
        error_callback?: (error: { type: string; message?: string }) => void
      }

      function initTokenClient(config: TokenClientConfig): TokenClient
      function revoke(token: string, done?: () => void): void
    }
  }
}
