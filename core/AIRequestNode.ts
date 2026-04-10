// ***************************************************************************************
// * AIRequestNode AI 请求节点
// * 支持与外部 AI API 集成 (OpenAI/Anthropic/Custom)
// ***************************************************************************************

import { AIRequest, AIProvider, AIOperation } from './types';

// ============================================================================
// AI 模型配置（可配置的最新默认模型）
// ============================================================================

export const AI_MODELS = {
  openai: {
    default: 'gpt-4o',
    alternatives: ['gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
  },
  anthropic: {
    default: 'claude-sonnet-4-20250514',
    alternatives: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
  },
  custom: {
    default: 'custom',
    alternatives: [],
  },
} as const;

export type OpenAIModel = typeof AI_MODELS.openai.default | typeof AI_MODELS.openai.alternatives[number];
export type AnthropicModel = typeof AI_MODELS.anthropic.default | typeof AI_MODELS.anthropic.alternatives[number];

// ============================================================================
// AI 响应接口
// ============================================================================

export interface AIResponse {
  success: boolean;
  content?: string;
  error?: string;
}

// ============================================================================
// Prompt 模板
// ============================================================================

const PROMPT_TEMPLATES: Record<AIOperation, string> = {
  summarize: '请总结以下内容的要点：\n{{content}}',
  classify: '请根据以下类别对内容进行分类：{{categories}}。内容：\n{{content}}',
  generate: '{{prompt}}\n{{content}}',
  extract: '请从以下内容中提取关键信息：\n{{content}}',
  translate: '请翻译以下内容：\n{{content}}',
};

// ============================================================================
// AIRequestNode AI 请求节点类
// ============================================================================

export class AIRequestNode {
  private provider: AIProvider;
  private operation: AIOperation;
  private model: string;
  private apiKey: string;
  private endpoint?: string;
  private customPrompt?: string;

  constructor(request: AIRequest, apiKey: string) {
    this.provider = request.provider;
    this.operation = request.operation;
    this.model = request.model || this.getDefaultModel();
    this.apiKey = apiKey;
    this.endpoint = request.endpoint;
    this.customPrompt = request.prompt;
  }

  /**
   * 获取默认模型
   */
  private getDefaultModel(): string {
    switch (this.provider) {
      case 'openai':
        return AI_MODELS.openai.default;
      case 'anthropic':
        return AI_MODELS.anthropic.default;
      case 'custom':
        return AI_MODELS.custom.default;
      default:
        return AI_MODELS.openai.default;
    }
  }

  /**
   * 获取可用模型列表
   */
  static getAvailableModels(provider: AIProvider): string[] {
    const config = AI_MODELS[provider];
    return [config.default, ...config.alternatives];
  }

  /**
   * 执行 AI 请求
   */
  async execute(input: {
    content?: string;
    categories?: string[];
    prompt?: string;
  }): Promise<AIResponse> {
    try {
      const systemPrompt = this.buildSystemPrompt(
        this.operation,
        input.categories,
        input.prompt
      );

      switch (this.provider) {
        case 'openai':
          return await this.callOpenAI(systemPrompt, this.model);
        case 'anthropic':
          return await this.callAnthropic(systemPrompt, this.model);
        case 'custom':
          if (!this.endpoint) {
            return { success: false, error: 'Custom provider requires endpoint' };
          }
          return await this.callCustom(this.endpoint, systemPrompt);
        default:
          return { success: false, error: `Unknown provider: ${this.provider}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 调用 OpenAI API
   */
  private async callOpenAI(prompt: string, model: string): Promise<AIResponse> {
    const url = 'https://api.openai.com/v1/chat/completions';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };

    const body: Record<string, unknown> = {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2000,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        return { success: false, error: 'No content in response' };
      }

      return { success: true, content: content.trim() };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * 调用 Anthropic API
   */
  private async callAnthropic(prompt: string, model: string): Promise<AIResponse> {
    const url = 'https://api.anthropic.com/v1/messages';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
    };

    const body: Record<string, unknown> = {
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      const content = data.content?.[0]?.text;

      if (!content) {
        return { success: false, error: 'No content in response' };
      }

      return { success: true, content: content.trim() };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * 调用自定义 API
   */
  private async callCustom(endpoint: string, prompt: string): Promise<AIResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const body: Record<string, unknown> = {
      prompt,
      model: this.model,
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      const content =
        data.content ||
        data.text ||
        data.result ||
        data.output ||
        data.message ||
        JSON.stringify(data);

      return { success: true, content };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * 构建系统 Prompt
   */
  private buildSystemPrompt(
    operation: AIOperation,
    categories?: string[],
    customPrompt?: string
  ): string {
    if (customPrompt) {
      return customPrompt;
    }

    let template = PROMPT_TEMPLATES[operation];

    switch (operation) {
      case 'summarize':
      case 'extract':
      case 'translate':
        return template;

      case 'classify':
        if (categories && categories.length > 0) {
          template = template.replace('{{categories}}', categories.join('、'));
        }
        return template;

      case 'generate':
        if (this.customPrompt) {
          template = template.replace('{{prompt}}', this.customPrompt);
        }
        return template;

      default:
        return template;
    }
  }
}