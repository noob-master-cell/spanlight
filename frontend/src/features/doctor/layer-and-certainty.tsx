import { Card } from "@/components/ui/card";
import type { FailureLayer, InsightCertainty } from "@/lib/api";
import { cn } from "@/lib/utils";

import { CERTAINTY_COPY, FAILURE_LAYERS, LAYER_DESCRIPTIONS, LAYER_LABELS } from "./insight-format";

/** Figma "Where it fails": the six layers as a plain list, the insight's own in bold. */
export function LayerCard({ layer }: { layer: FailureLayer }) {
  return (
    <Card role="region" aria-label="Where it fails" className="flex flex-col gap-3 p-5 sm:p-6">
      <h2 className="text-card">Where it fails ({LAYER_LABELS[layer]})</h2>
      <ul className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {FAILURE_LAYERS.map((candidate, index) => {
          const active = candidate === layer;
          return (
            <li key={candidate} className="flex items-center gap-2">
              {index === 0 ? null : (
                <span aria-hidden className="text-subtle-foreground">
                  ·
                </span>
              )}
              <span
                aria-current={active ? "true" : undefined}
                className={cn(
                  active ? "font-bold text-foreground" : "font-medium text-subtle-foreground",
                )}
              >
                {LAYER_LABELS[candidate]}
                {active ? <span className="sr-only"> (this finding)</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-muted-foreground">{LAYER_DESCRIPTIONS[layer]}</p>
    </Card>
  );
}

/** Figma "Certainty": measured or inferred, with what that means. */
export function CertaintyCard({ certainty }: { certainty: InsightCertainty }) {
  const copy = CERTAINTY_COPY[certainty];
  return (
    <Card role="region" aria-label="Certainty" className="flex flex-col gap-3 p-5 sm:p-6">
      <h2 className="text-card">Certainty</h2>
      <p
        className={cn(
          "text-sm font-semibold",
          certainty === "inferred" ? "text-warning" : "text-foreground",
        )}
      >
        {copy.label}
      </p>
      <p className="text-sm text-muted-foreground">{copy.note}</p>
    </Card>
  );
}
