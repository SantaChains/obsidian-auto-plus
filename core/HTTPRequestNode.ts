// ****************************************************************************
// * HTTPRequestNode HTTP 请求节点 v1.0
// * 支持与外部服务集成的 HTTP 请求封装
// ****************************************************************************

import { HTTPRequest, HTTPMethod, HTTPResponse } from './types';

/**
 * HTTP 请求节点
 * 提供变量替换、超时控制等功能的 HTTP 请求封装
 */
export class HTTPRequestNode {
  private readonly request: HTTPRequest;
  private readonly timeout: number;

  constructor(request: HTTPRequest) {
    this.request = request;
    this.timeout = request.timeout ?? 30000;
  }

  /**
   * 执行 HTTP 请求
   * @param variables 变量映射表
   */
  async execute(variables?: Record<string, unknown>): Promise<HTTPResponse> {
    try {
      // 替换 URL 和 headers 中的变量
      const url = this.replaceVariables(this.request.url, variables);
      const headers = this.replaceVariablesInObject(
        this.request.headers ?? {},
        variables
      ) as Record<string, string>;

      // 处理 body
      let body: unknown = undefined;
      if (this.request.body) {
        body = this.replaceVariablesInObject(this.request.body, variables);
      }

      return await this.sendRequest(url, headers, body);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 替换字符串中的变量
   * 支持: {{filename}}, {{ext}}, {{path}}, {{yaml.*}}, {{tags}}, {{env.*}}
   */
  private replaceVariables(
    str: string,
    vars?: Record<string, unknown>
  ): string {
    if (!vars || !str) return str;

    return str.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, key) => {
      // 优先从 vars 中获取
      if (vars[key] !== undefined) {
        const value = vars[key];
        return typeof value === 'string' ? value : JSON.stringify(value);
      }
      return match;
    });
  }

  /**
   * 递归替换对象中的变量
   */
  private replaceVariablesInObject(
    obj: Record<string, unknown>,
    vars?: Record<string, unknown>
  ): Record<string, unknown> {
    if (!obj || !vars) return obj;

    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = this.replaceVariables(value, vars);
      } else if (Array.isArray(value)) {
        result[key] = value.map((item) =>
          typeof item === 'string'
            ? this.replaceVariables(item, vars)
            : typeof item === 'object' && item !== null
            ? this.replaceVariablesInObject(
                item as Record<string, unknown>,
                vars
              )
            : item
        );
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.replaceVariablesInObject(
          value as Record<string, unknown>,
          vars
        );
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * 发送 HTTP 请求
   * 使用 fetch API 实现
   */
  private async sendRequest(
    url: string,
    headers: Record<string, string>,
    body: unknown
  ): Promise<HTTPResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const fetchOptions: RequestInit = {
        method: this.request.method,
        headers,
        signal: controller.signal,
      };

      // GET/DELETE 请求不使用 body
      if (
        this.request.method !== 'GET' &&
        this.request.method !== 'DELETE' &&
        body
      ) {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);

      // 解析响应头
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      // 尝试解析响应体
      let responseBody: unknown;
      const contentType = response.headers.get('content-type') ?? '';

      if (contentType.includes('application/json')) {
        responseBody = await response.json();
      } else {
        responseBody = await response.text();
      }

      return {
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseBody,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: `请求超时 (${this.timeout}ms)`,
        };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
