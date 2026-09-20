import type { ChatProvider } from './llm-providers';

export type LlmProvider = ChatProvider;

type GroqApiError = {
  message?: string;
  status?: number;
  error?: {
    message?: string;
    code?: string;
    failed_generation?: string;
  };
};

export function groqJsonModeExtras(model: string): Record<string, unknown> {
  const id = model.toLowerCase();
  if (id.includes('qwen')) {
    // Qwen 3.x reasons by default. Those tokens share max_tokens with the
    // JSON body, so Groq JSON mode often truncates and returns 400 json_validate_failed.
    return {
      reasoning_effort: 'none',
      reasoning_format: 'parsed',
    };
  }
  if (id.includes('gpt-oss')) {
    return {
      reasoning_effort: 'low',
      include_reasoning: false,
    };
  }
  return {};
}

export function isJsonValidateFailed(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const apiError = error as GroqApiError;
  if (apiError.error?.code === 'json_validate_failed') {
    return true;
  }
  const message = apiError.error?.message ?? apiError.message ?? '';
  return message.includes('Failed to validate JSON');
}

export function extractFailedGeneration(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const failed = (error as GroqApiError).error?.failed_generation;
  if (typeof failed !== 'string') {
    return undefined;
  }
  const trimmed = failed.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function formatChatCompletionError(provider: LlmProvider, error: unknown): string {
  if (error && typeof error === 'object') {
    const apiError = error as GroqApiError;
    const failedGeneration = extractFailedGeneration(error);
    const baseMessage = apiError.error?.message ?? apiError.message ?? String(error);

    if (failedGeneration) {
      return `${provider} ${apiError.status ?? ''} ${baseMessage}\nfailed_generation: ${failedGeneration.slice(0, 500)}`.trim();
    }

    if (apiError.status) {
      return `${provider} ${apiError.status} ${baseMessage}`;
    }
  }

  return error instanceof Error ? error.message : String(error);
}
