import { ListFilter, Loader2, Plus, Search, X } from "lucide-react";
import { useState, type KeyboardEvent, type SubmitEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFilterOptionsQuery } from "@/features/shell/project-context";
import { cn } from "@/lib/utils";

import type { TraceFilters } from "./search";
import { useDebouncedCallback } from "./use-debounced-callback";
import type { ActiveFilter, FilterKey, FilterPatch } from "./use-trace-filters";

const ANY = "__any__";
const SEARCH_DEBOUNCE_MS = 300;

/** Figma "Traces/Filter chip": 36px pills. */
const CHIP_BASE =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium";

interface TracesToolbarProps {
  search: TraceFilters;
  activeFilters: ActiveFilter[];
  isRefreshing: boolean;
  onFilterChange: <K extends FilterKey>(key: K, value: TraceFilters[K]) => void;
  onFiltersChange: (patch: FilterPatch) => void;
  onClearFilters: () => void;
}

/**
 * Search, facet chips and the applied-filter row. On phones the facet chips scroll sideways
 * instead of wrapping.
 */
export function TracesToolbar({
  search,
  activeFilters,
  isRefreshing,
  onFilterChange,
  onFiltersChange,
  onClearFilters,
}: TracesToolbarProps) {
  const optionsQuery = useFilterOptionsQuery();
  const options = optionsQuery.data;
  const chips = activeFilters.filter((filter) => filter.key !== "q");

  return (
    <div className="flex flex-col gap-4 md:gap-2.5">
      <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-center md:gap-2">
        <TraceSearchInput
          value={search.q ?? ""}
          onCommit={(value) => {
            onFilterChange("q", value.trim());
          }}
        />
        <div
          role="group"
          aria-label="Filters"
          className="-mx-4 flex [scrollbar-width:none] items-center gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:overflow-visible md:px-0"
        >
          <FacetSelect
            label="Status"
            value={search.status}
            options={["ok", "error"]}
            optionLabel={(value) => (value === "ok" ? "OK" : "Error")}
            onChange={(value) => {
              onFilterChange("status", value === "ok" || value === "error" ? value : undefined);
            }}
          />
          <FacetSelect
            label="Model"
            value={search.model}
            options={options?.models ?? []}
            loading={optionsQuery.isPending}
            onChange={(value) => {
              onFilterChange("model", value);
            }}
          />
          <FacetSelect
            label="Release"
            value={search.release}
            options={options?.releases ?? []}
            loading={optionsQuery.isPending}
            onChange={(value) => {
              onFilterChange("release", value);
            }}
          />
          <FacetSelect
            label="Tag"
            value={search.tag}
            options={options?.tags ?? []}
            loading={optionsQuery.isPending}
            onChange={(value) => {
              onFilterChange("tag", value);
            }}
          />
          <AddFilterPopover search={search} onApply={onFiltersChange} />
        </div>
        {isRefreshing ? (
          <span
            role="status"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground md:ml-auto"
          >
            <Loader2 aria-hidden className="size-3.5 animate-spin" />
            Updating
          </span>
        ) : null}
      </div>

      {chips.length > 0 ? (
        <ul aria-label="Active filters" className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {chips.map((filter) => (
            <li key={filter.key} className="min-w-0">
              <AppliedFilterChip
                filter={filter}
                onRemove={() => {
                  onFilterChange(filter.key, undefined);
                }}
              />
            </li>
          ))}
          <li>
            <Button
              variant="link"
              size="sm"
              onClick={onClearFilters}
              className="text-sm font-medium"
            >
              Clear all
            </Button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}

interface TraceSearchInputProps {
  value: string;
  onCommit: (value: string) => void;
}

/**
 * Free-text search. Typing is local and debounced; the URL is the source of
 * truth, so an external change (e.g. "Clear all") resets the draft.
 */
function TraceSearchInput({ value, onCommit }: TraceSearchInputProps) {
  const [draft, setDraft] = useState(value);
  const [syncedValue, setSyncedValue] = useState(value);
  const debounced = useDebouncedCallback(onCommit, SEARCH_DEBOUNCE_MS);

  if (value !== syncedValue) {
    setSyncedValue(value);
    setDraft(value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      debounced.flush();
    }
    if (event.key === "Escape" && draft !== "") {
      event.preventDefault();
      setDraft("");
      debounced.schedule("");
      debounced.flush();
    }
  }

  return (
    <div className="relative w-full md:w-80">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-subtle-foreground"
      />
      <Input
        type="search"
        aria-label="Search traces"
        placeholder="Search by name or trace ID"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          debounced.schedule(event.target.value);
        }}
        onKeyDown={handleKeyDown}
        className="h-10 rounded-full border-border pr-4 pl-10.5 shadow-card"
      />
    </div>
  );
}

interface FacetSelectProps {
  label: string;
  value: string | undefined;
  options: string[];
  loading?: boolean;
  optionLabel?: (value: string) => string;
  onChange: (value: string | undefined) => void;
}

/** Figma filter chip, default state: "Status: Any ⌄". */
function FacetSelect({
  label,
  value,
  options,
  loading = false,
  optionLabel = (option) => option,
  onChange,
}: FacetSelectProps) {
  // Keep a value from the URL selectable even if it's no longer in the 30-day options list.
  const choices = value !== undefined && !options.includes(value) ? [value, ...options] : options;
  const isEmpty = !loading && choices.length === 0;

  return (
    <Select
      value={value ?? ANY}
      onValueChange={(next) => {
        onChange(next === ANY ? undefined : next);
      }}
      disabled={isEmpty}
    >
      <SelectTrigger
        aria-label={label}
        title={isEmpty ? `No ${label.toLowerCase()} values in the last 30 days` : undefined}
        className={cn(
          CHIP_BASE,
          "w-auto max-w-64 justify-start border-border-strong bg-surface text-foreground [&>svg]:size-3.5 [&>svg]:text-foreground",
          value !== undefined && "border-accent/60",
        )}
      >
        <span className="flex min-w-0 items-center gap-1">
          <span className="shrink-0">{label}:</span>
          <span className="min-w-0 truncate">
            <SelectValue />
          </span>
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>Any</SelectItem>
        {choices.map((option) => (
          <SelectItem key={option} value={option}>
            {optionLabel(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface AddFilterPopoverProps {
  search: TraceFilters;
  onApply: (patch: FilterPatch) => void;
}

/** Exact-match filters for identifiers that have too many values for a dropdown. */
function AddFilterPopover({ search, onApply }: AddFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState("");
  const [session, setSession] = useState("");

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    onApply({ user: user.trim(), session: session.trim() });
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setUser(search.user ?? "");
          setSession(search.session ?? "");
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className={cn(CHIP_BASE, "text-muted-foreground hover:text-foreground [&_svg]:size-3.5")}
        >
          <Plus aria-hidden />
          Add filter
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <ListFilter aria-hidden className="size-3.5" />
            Filter by identifier (exact match)
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trace-filter-user">User ID</Label>
            <Input
              id="trace-filter-user"
              value={user}
              placeholder="e.g. user_123"
              autoComplete="off"
              className="font-mono text-label"
              onChange={(event) => {
                setUser(event.target.value);
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trace-filter-session">Session ID</Label>
            <Input
              id="trace-filter-session"
              value={session}
              placeholder="e.g. chat_8f2c"
              autoComplete="off"
              className="font-mono text-label"
              onChange={(event) => {
                setSession(event.target.value);
              }}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Apply filters
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** Figma filter chip, applied state: violet "environment: production ×". */
function AppliedFilterChip({ filter, onRemove }: { filter: ActiveFilter; onRemove: () => void }) {
  const isIdentifier = filter.key === "user" || filter.key === "session";
  const label = filter.label.toLowerCase();
  return (
    <span className={cn(CHIP_BASE, "max-w-full bg-accent-subtle pr-2 text-accent")}>
      <span className="flex min-w-0 items-center gap-1">
        <span className="shrink-0">{label}:</span>
        <span title={filter.value} className={cn("min-w-0 truncate", isIdentifier && "font-mono")}>
          {filter.value}
        </span>
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        className="-my-1 inline-flex size-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-accent/10"
      >
        <X aria-hidden className="size-3.5" />
      </button>
    </span>
  );
}
