import { ListFilter, Loader2, Plus } from "lucide-react";
import { useState, type SubmitEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useFilterOptionsQuery } from "@/features/shell/project-context";
import { ERROR_CLASSES, errorClassLabel, isErrorClass } from "@/lib/error-class";
import { cn } from "@/lib/utils";

import { AppliedFilterChip, CHIP_BASE, FacetSelect } from "./facet-chips";
import type { TraceFilters } from "./search";
import { TraceSearchInput } from "./trace-search-input";
import type { ActiveFilter, FilterKey, FilterPatch } from "./use-trace-filters";

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
            label="Error class"
            value={search.error_class}
            options={ERROR_CLASSES}
            optionLabel={(value) => (isErrorClass(value) ? errorClassLabel(value) : value)}
            onChange={(value) => {
              onFilterChange(
                "error_class",
                value !== undefined && isErrorClass(value) ? value : undefined,
              );
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
