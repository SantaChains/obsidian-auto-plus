import Ajv, { ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import pluginSchema from '../schema/v1.0.0.json';

const ajv = new Ajv({ allErrors: true, verbose: true });
addFormats(ajv);

// 添加主 schema 到 ajv 实例
ajv.addSchema(pluginSchema, 'plugin');

// 编译各子 schema 的验证函数
const validateRuleFn = ajv.compile(pluginSchema.$defs?.Rule || { type: 'object' });
const validateActionFn = ajv.compile(pluginSchema.$defs?.Action || { type: 'object' });
const validatePluginFn = ajv.compile(pluginSchema);

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  path: string;
  message: string;
  keyword: string;
  params: unknown;
}

export interface Rule {
  id?: string;
  name: string;
  enabled: boolean;
  priority?: number;
  trigger: unknown;
  source?: unknown;
  conditions: unknown;
  actions?: unknown[];
}

export interface Action {
  id: string;
  name: string;
  type: string;
  params?: Record<string, unknown>;
}

export class SchemaValidator {
  private schema: object;

  constructor() {
    this.schema = pluginSchema;
  }

  async loadSchema(version: string): Promise<void> {
    // 预留：支持动态加载不同版本 schema
    this.schema = pluginSchema;
  }

  validate(data: unknown): ValidationResult {
    const valid = validatePluginFn(data);
    return {
      valid: !!valid,
      errors: this.formatErrors(validatePluginFn.errors || [])
    };
  }

  validateRule(rule: Rule): ValidationResult {
    const valid = validateRuleFn(rule);
    return {
      valid: !!valid,
      errors: this.formatErrors(validateRuleFn.errors || [])
    };
  }

  validateAction(action: Action): ValidationResult {
    const valid = validateActionFn(action);
    return {
      valid: !!valid,
      errors: this.formatErrors(validateActionFn.errors || [])
    };
  }

  private formatErrors(errors: ErrorObject[]): ValidationError[] {
    return errors.map(e => ({
      path: e.instancePath || '/',
      message: e.message || 'Unknown error',
      keyword: e.keyword,
      params: e.params
    }));
  }
}

// 导出验证函数
export function validatePluginData(data: unknown): ValidationResult {
  const valid = validatePluginFn(data);
  return {
    valid: !!valid,
    errors: formatErrorsStatic(validatePluginFn.errors || [])
  };
}

export function validateRule(rule: unknown): ValidationResult {
  const valid = validateRuleFn(rule);
  return {
    valid: !!valid,
    errors: formatErrorsStatic(validateRuleFn.errors || [])
  };
}

export function validateAction(action: unknown): ValidationResult {
  const valid = validateActionFn(action);
  return {
    valid: !!valid,
    errors: formatErrorsStatic(validateActionFn.errors || [])
  };
}

function formatErrorsStatic(errors: ErrorObject[]): ValidationError[] {
  return errors.map(e => ({
    path: e.instancePath || '/',
    message: e.message || 'Unknown error',
    keyword: e.keyword,
    params: e.params
  }));
}
