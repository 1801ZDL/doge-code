// OAuth service stub — dl-code uses custom API key configuration via /login.
export class OAuthService {
  async getAuthCode(): Promise<never> {
    throw new Error('OAuth login is not supported. Use /login to configure your API endpoint.')
  }
  async exchangeCode(): Promise<never> {
    throw new Error('OAuth token exchange is not supported.')
  }
  async refreshToken(): Promise<never> {
    throw new Error('OAuth token refresh is not supported.')
  }
}
