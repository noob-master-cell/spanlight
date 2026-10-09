import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { FaultScenario } from "@/lib/api";

import { SCENARIO_FIELDS, type ParamField, type ParamText } from "./scenario-params";

interface ScenarioParamsFieldsProps {
  scenario: FaultScenario;
  values: ParamText;
  errors: Record<string, string>;
  onChange: (name: string, value: string) => void;
}

/** The parameters panel: the fields of the chosen scenario, or a note when it has none. */
export function ScenarioParamsFields({
  scenario,
  values,
  errors,
  onChange,
}: ScenarioParamsFieldsProps) {
  const fields = SCENARIO_FIELDS[scenario];

  return (
    <section
      aria-label="Parameters"
      className="flex flex-col gap-3.5 rounded-input bg-surface-muted p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-label font-semibold text-foreground">Parameters</h3>
        <code className="rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-xs text-foreground">
          {scenario}
        </code>
      </div>
      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">This scenario has no parameters.</p>
      ) : (
        fields.map((field) => (
          <ParamInput
            key={`${scenario}:${field.name}`}
            field={field}
            value={values[field.name] ?? ""}
            error={errors[field.name]}
            onChange={(value) => {
              onChange(field.name, value);
            }}
          />
        ))
      )}
    </section>
  );
}

interface ParamInputProps {
  field: ParamField;
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
}

function ParamInput({ field, value, error, onChange }: ParamInputProps) {
  if (field.kind === "choice") {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-label leading-5 font-semibold text-foreground">{field.label}</span>
        <SegmentedControl
          aria-label={field.label}
          tone="surface"
          value={value}
          onValueChange={onChange}
          options={field.options.map((option) => ({
            value: String(option),
            label: String(option),
          }))}
          className="w-fit max-w-full"
        />
        <p className="text-xs font-medium text-muted-foreground">{field.hint}</p>
      </div>
    );
  }

  return (
    <FormField label={field.label} hint={field.hint} error={error} className="max-w-xs">
      {field.kind === "number" ? (
        <Input
          inputMode={field.integer ? "numeric" : "decimal"}
          autoComplete="off"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      ) : (
        <Input
          autoComplete="off"
          spellCheck={false}
          maxLength={field.maxLength}
          className="font-mono"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      )}
    </FormField>
  );
}
