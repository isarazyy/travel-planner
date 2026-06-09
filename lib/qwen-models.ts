/**
 * DashScope 模型选择：默认优先速度（turbo），避免标准模式长期卡在 qwen-plus。
 *
 * 环境变量（可选）：
 * - QWEN_MODEL_FAST：极速生成（默认 qwen-turbo）
 * - QWEN_MODEL_STANDARD：标准双方案（默认 qwen-turbo；可设为 qwen-plus / qwen-flash 等）
 * - QWEN_MODEL_CHAT：对话改方案（默认 qwen-turbo）
 */
export function resolveGenerateModel(isFast: boolean): string {
  if (isFast) {
    return process.env.QWEN_MODEL_FAST?.trim() || 'qwen-turbo';
  }
  return process.env.QWEN_MODEL_STANDARD?.trim() || 'qwen-turbo';
}

export function resolvePlanChatModel(): string {
  return process.env.QWEN_MODEL_CHAT?.trim() || 'qwen-plus';
}
