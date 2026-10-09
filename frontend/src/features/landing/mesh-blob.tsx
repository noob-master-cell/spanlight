import { cn } from "@/lib/utils";

const TONE_CLASSES = {
  lavender: "bg-mesh-1",
  butter: "bg-mesh-2",
  sky: "bg-mesh-3",
  violet: "bg-accent-card-from",
  fuchsia: "bg-fuchsia",
  lime: "bg-lime",
} as const;

interface MeshBlobProps {
  tone: keyof typeof TONE_CLASSES;
  /** Position, size and blur, e.g. `-top-[200px] -left-[180px] h-[560px] w-[820px] blur-[75px]`. */
  className: string;
  /**
   * Opacity. Omit it for the pastel mesh on the light canvas: those blobs follow the theme's
   * `--mesh-opacity` and fade in the dark theme. Blobs on always-dark panels pass a fixed value.
   */
  opacity?: number;
}

/** One soft, blurred ellipse of colour (Figma "Mesh blob"). Purely decorative. */
export function MeshBlob({ tone, className, opacity }: MeshBlobProps) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute rounded-full", TONE_CLASSES[tone], className)}
      style={{ opacity: opacity ?? "var(--mesh-opacity)" }}
    />
  );
}
