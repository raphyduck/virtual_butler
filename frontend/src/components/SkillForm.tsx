'use client';

import { type Skill, type SkillCreate } from '@/lib/api';

const PROVIDERS = ['anthropic', 'openai', 'google', 'ollama'] as const;
const DELIVERABLE_TYPES = ['code', 'website', 'document', 'video', 'other'] as const;
const TARGET_TYPES = ['github', 's3', 'local', 'ftp', 'youtube', 'other'] as const;

type FormData = SkillCreate;

interface Props {
  initial?: Partial<Skill>;
  onSubmit: (data: FormData) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export default function SkillForm({ initial, onSubmit, loading, error }: Props) {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data: FormData = {
      name: fd.get('name') as string,
      description: (fd.get('description') as string) || null,
      provider: fd.get('provider') as string,
      model: fd.get('model') as string,
      system_prompt: (fd.get('system_prompt') as string) || null,
      deliverable_type: fd.get('deliverable_type') as string,
      target_type: fd.get('target_type') as string,
      target_config: (fd.get('target_config') as string) || null,
      provider_config: (fd.get('provider_config') as string) || null,
    };
    onSubmit(data);
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-5 max-w-xl">
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <Field label="Name *" name="name" defaultValue={initial?.name} required />
      <Field
        label="Description"
        name="description"
        defaultValue={initial?.description ?? ''}
        as="textarea"
      />

      <div className="grid grid-cols-2 gap-4">
        <SelectField
          label="Provider *"
          name="provider"
          defaultValue={initial?.provider ?? 'anthropic'}
          options={PROVIDERS}
          required
        />
        <Field
          label="Model *"
          name="model"
          defaultValue={initial?.model ?? 'claude-sonnet-4-6'}
          required
          placeholder="e.g. claude-sonnet-4-6"
        />
      </div>

      <Field
        label="System prompt"
        name="system_prompt"
        defaultValue={initial?.system_prompt ?? ''}
        as="textarea"
        rows={4}
        placeholder="You are a helpful assistant that…"
      />

      <div className="grid grid-cols-2 gap-4">
        <SelectField
          label="Deliverable type *"
          name="deliverable_type"
          defaultValue={initial?.deliverable_type ?? 'code'}
          options={DELIVERABLE_TYPES}
          required
        />
        <SelectField
          label="Target type *"
          name="target_type"
          defaultValue={initial?.target_type ?? 'local'}
          options={TARGET_TYPES}
          required
        />
      </div>

      <Field
        label="Target config (JSON)"
        name="target_config"
        defaultValue={initial?.target_config ?? ''}
        as="textarea"
        rows={2}
        placeholder='{"repo": "owner/repo", "branch": "main"}'
      />

      <Field
        label="Provider config (JSON)"
        name="provider_config"
        defaultValue={initial?.provider_config ?? ''}
        as="textarea"
        rows={2}
        placeholder='{"api_key": "sk-..."}'
      />

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? 'Saving…' : 'Save skill'}
      </button>
    </form>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement | HTMLTextAreaElement> {
  label: string;
  name: string;
  as?: 'input' | 'textarea';
  rows?: number;
}

function Field({ label, name, as: As = 'input', rows, ...rest }: FieldProps) {
  return (
    <div>
      <label htmlFor={name} className="label">{label}</label>
      {As === 'textarea' ? (
        <textarea
          id={name}
          name={name}
          rows={rows ?? 3}
          className="input resize-none"
          {...(rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      ) : (
        <input id={name} name={name} className="input" {...(rest as React.InputHTMLAttributes<HTMLInputElement>)} />
      )}
    </div>
  );
}

interface SelectProps {
  label: string;
  name: string;
  defaultValue?: string;
  options: readonly string[];
  required?: boolean;
}

function SelectField({ label, name, defaultValue, options, required }: SelectProps) {
  return (
    <div>
      <label htmlFor={name} className="label">{label}</label>
      <select id={name} name={name} defaultValue={defaultValue} required={required} className="input">
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}
