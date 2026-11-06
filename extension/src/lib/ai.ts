// ============================================================
// NEXORA AI Client
// OpenAI-compatible streaming API calls
// ============================================================

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
}

/**
 * Call an OpenAI-compatible chat completions endpoint with streaming.
 * Never fabricates responses — only returns what the API sends.
 */
export async function streamChatCompletion(
  config: AIConfig,
  messages: AIMessage[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  if (!config.endpoint || !config.apiKey) {
    callbacks.onError('AI is not configured. Please set endpoint and API key in Settings.');
    return;
  }

  const url = config.endpoint.endsWith('/chat/completions')
    ? config.endpoint
    : `${config.endpoint.replace(/\/$/, '')}/chat/completions`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model || 'gpt-4o-mini',
        messages,
        stream: true,
      }),
      signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      callbacks.onDone();
      return;
    }
    callbacks.onError(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  if (!response.ok) {
    let errMsg = `API error ${response.status}`;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body.error?.message) errMsg = body.error.message;
    } catch {}
    callbacks.onError(errMsg);
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    callbacks.onError('No response stream');
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const json = JSON.parse(trimmed.slice(6)) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const token = json.choices?.[0]?.delta?.content;
          if (token) callbacks.onToken(token);
        } catch {
          // Ignore individual SSE parse errors
        }
      }
    }
    callbacks.onDone();
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      callbacks.onDone();
    } else {
      callbacks.onError(`Stream error: ${err instanceof Error ? err.message : String(err)}`);
    }
  } finally {
    reader.releaseLock();
  }
}
