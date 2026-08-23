import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractFailedGeneration,
  formatChatCompletionError,
  groqJsonModeExtras,
  isJsonValidateFailed,
} from './groq-json';

describe('groqJsonModeExtras', () => {
  it('disables Qwen reasoning so JSON mode is not truncated by thinking tokens', () => {
    assert.deepEqual(groqJsonModeExtras('qwen/qwen3.6-27b'), {
      reasoning_effort: 'none',
      reasoning_format: 'parsed',
    });
  });

  it('keeps gpt-oss reasoning out of JSON content', () => {
    assert.deepEqual(groqJsonModeExtras('openai/gpt-oss-120b'), {
      reasoning_effort: 'low',
      include_reasoning: false,
    });
  });

  it('returns no extras for non-reasoning Groq models', () => {
    assert.deepEqual(groqJsonModeExtras('llama-3.3-70b-versatile'), {});
  });
});

describe('extractFailedGeneration / isJsonValidateFailed', () => {
  it('reads failed_generation from the OpenAI SDK error body', () => {
    const error = {
      status: 400,
      message: '400 Failed to validate JSON',
      error: {
        message: 'Failed to validate JSON. Please adjust your prompt.',
        code: 'json_validate_failed',
        failed_generation: '{"script":[{"speaker":"Victor"',
      },
    };

    assert.equal(isJsonValidateFailed(error), true);
    assert.equal(extractFailedGeneration(error), '{"script":[{"speaker":"Victor"');
  });

  it('treats empty failed_generation as missing', () => {
    const error = {
      status: 400,
      error: { code: 'json_validate_failed', failed_generation: '' },
    };

    assert.equal(isJsonValidateFailed(error), true);
    assert.equal(extractFailedGeneration(error), undefined);
  });
});

describe('formatChatCompletionError', () => {
  it('includes the Groq status even when failed_generation is empty', () => {
    const message = formatChatCompletionError('groq', {
      status: 400,
      message: '400 Failed to validate JSON. Please adjust your prompt. See \'failed_generation\' for more details.',
      error: {
        message: 'Failed to validate JSON. Please adjust your prompt. See \'failed_generation\' for more details.',
        code: 'json_validate_failed',
        failed_generation: '',
      },
    });

    assert.match(message, /400/);
    assert.match(message, /Failed to validate JSON/);
  });
});
