export class ProviderError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public providerType?: string,
    public upstreamStatus?: number,
    public isOverflow: boolean = false,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export type ProviderErrorType = 'provider_error' | 'context_overflow' | 'internal_error';

export interface UnifiedErrorResponse {
  error: {
    message: string;
    type: string;
    code: string | null;
    param: string | null;
  };
}
