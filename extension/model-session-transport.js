(function (root) {
  'use strict';
  const text = content => typeof content === 'string' ? content : (content || []).filter(x => x.type === 'text').map(x => x.text).join('\n');
  function messages(request) {
    const out = [{ role: 'system', content: request.systemPrompt }];
    for (const item of request.messages || []) {
      if (item.role === 'user') out.push({ role: 'user', content: text(item.content) });
      if (item.role === 'assistant') {
        const calls = (Array.isArray(item.content) ? item.content : []).filter(x => x.type === 'toolCall');
        out.push({ role: 'assistant', content: text(item.content) || null,
          // DeepSeek thinking + tools requires replaying reasoning for tool turns.
          // These messages exist only inside the current Pi run, not round history.
          ...(calls.length && typeof item.reasoning_content === 'string' ? { reasoning_content: item.reasoning_content } : {}),
          ...(calls.length ? { tool_calls: calls.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.arguments) } })) } : {}) });
      }
      if (item.role === 'toolResult') out.push({ role: 'tool', tool_call_id: item.toolCallId, content: text(item.content) });
    }
    return out;
  }
  function body(request, config, outputOptions) {
    const options = { ...outputOptions };
    for (const key of ['max_tokens', 'max_completion_tokens']) if (Number.isFinite(options[key])) options[key] = Math.min(options[key], request.maxTokens);
    return { model: config.model, stream: false, ...options, messages: messages(request),
      ...(request.tools?.length ? { tools: request.tools.map(tool => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } })) } : {}) };
  }
  function result(data, allowTools = false) {
    const choice = data?.choices?.[0], message = choice?.message;
    const finish = choice?.finish_reason;
    if (finish === 'length') throw new Error('模型输出达到长度上限，未完成分析。');
    if (finish === 'content_filter') throw new Error('模型输出被服务过滤，未完成分析。');
    if (['insufficient_system_resource', 'aborted'].includes(finish)) throw new Error('模型服务中断了生成，请稍后重试。');
    if (message?.tool_calls?.length) {
      if (!allowTools) throw new Error('当前请求未开启工具调用，或已到最终回答轮。');
      if (!Array.isArray(message.tool_calls) || message.tool_calls.length > 4) throw new Error('模型工具调用数量无效。');
      const ids = new Set();
      const calls = message.tool_calls.map(call => {
        if (call.type !== 'function' || typeof call.id !== 'string' || !call.id || call.id.length > 200 || ids.has(call.id) ||
            typeof call.function?.name !== 'string' || !/^[a-z_]{1,64}$/.test(call.function.name) || typeof call.function.arguments !== 'string' || call.function.arguments.length > 8000) throw new Error('模型工具调用格式无效。');
        ids.add(call.id);
        let args; try { args = JSON.parse(call.function.arguments); } catch (_) { throw new Error('模型工具参数不是有效 JSON。'); }
        if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('模型工具参数无效。');
        return { id: call.id, name: call.function.name, arguments: args };
      });
      return { text: typeof message.content === 'string' ? message.content : '', toolCalls: calls,
        ...(typeof message.reasoning_content === 'string' ? { reasoning_content: message.reasoning_content } : {}) };
    }
    const content = message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      if (typeof message?.reasoning_content === 'string' && message.reasoning_content.trim()) throw new Error('模型仅返回思考内容，未生成最终分析。');
      if (data?.error) throw new Error('模型接口返回错误，未提供有效分析，请检查服务状态与模型配置。');
      throw new Error('模型响应正文为空或格式不兼容，未取得分析结果。');
    }
    if (content.length > 32000) throw new Error('模型分析结果过长，请重试。');
    return { text: content };
  }
  const api = { messages, body, result };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MJModelSessionTransport = api;
})(globalThis);
