interface ModelSelectorProps {
  provider: string;
  model: string;
  onProviderChange: (value: string) => void;
  onModelChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

const MODELS: Record<string, string[]> = {
  anthropic: ['claude-sonnet-4-6', 'claude-3-7-sonnet-latest', 'claude-3-5-sonnet-latest'],
  openai: ['gpt-5', 'gpt-4.1', 'gpt-4o'],
  google: ['gemini-2.5-pro', 'gemini-2.5-flash'],
  ollama: ['llama3.1', 'qwen2.5-coder'],
};

export function ModelSelector({
  provider,
  model,
  onProviderChange,
  onModelChange,
  disabled = false,
  className = '',
}: ModelSelectorProps) {
  const providerModels = MODELS[provider] ?? [];

  return (
    <div className={`flex flex-wrap items-end gap-2 ${className}`}>
      <div>
        <label className="mb-1 block text-[11px] font-medium text-gray-600">Provider</label>
        <select
          value={provider}
          onChange={(e) => onProviderChange(e.target.value)}
          disabled={disabled}
          className="rounded border border-gray-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-60"
        >
          <option value="anthropic">Anthropic</option>
          <option value="openai">OpenAI</option>
          <option value="google">Google</option>
          <option value="ollama">Ollama</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-gray-600">Model</label>
        <select
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={disabled}
          className="rounded border border-gray-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-60"
        >
          {providerModels.length === 0 && <option value={model}>{model}</option>}
          {providerModels.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
