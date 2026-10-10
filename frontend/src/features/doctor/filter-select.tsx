import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Radix selects cannot hold an empty value, so "All" has a stand-in. */
const ALL = "__all__";

interface FilterSelectProps<T extends string> {
  /** "Severity": names the control and prefixes its value. */
  label: string;
  value: T | undefined;
  options: readonly { value: T; label: string }[];
  onChange: (value: T | undefined) => void;
}

/** Figma "Doctor/Filter chip": a pill that reads "Severity: All" and opens the choices. */
export function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: FilterSelectProps<T>) {
  return (
    <Select
      value={value ?? ALL}
      onValueChange={(next) => {
        const option = options.find((candidate) => candidate.value === next);
        onChange(option?.value);
      }}
    >
      <SelectTrigger
        aria-label={label}
        className="h-9 w-auto min-w-0 gap-1.5 rounded-full border-border-strong px-3.5 text-label"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="font-medium text-muted-foreground">{label}:</span>
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
