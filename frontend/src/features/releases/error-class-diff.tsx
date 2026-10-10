import { DeltaPill } from "@/components/delta-pill";
import { ErrorClassChip } from "@/components/error-class-chip";
import { SectionCard } from "@/components/section-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowHeader,
} from "@/components/ui/table";
import type { ErrorClassChange } from "@/lib/api";
import { formatInteger } from "@/lib/format";

/** Figma "Error classes": failed spans per class in A and B and the change; more failures are worse. */
export function ErrorClassDiff({ classes }: { classes: readonly ErrorClassChange[] }) {
  return (
    <SectionCard title="Error classes" description="Failed spans by class" className="h-full">
      {classes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No failed spans in either release.</p>
      ) : (
        <Table aria-label="Failed spans by error class in both releases">
          <TableHeader>
            <TableRow>
              <TableHead>Class</TableHead>
              <TableHead className="text-right">A</TableHead>
              <TableHead className="text-right">B</TableHead>
              <TableHead className="text-right">Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {classes.map((row) => (
              <TableRow key={row.error_class ?? "unclassified"}>
                <TableRowHeader>
                  {row.error_class === null ? (
                    <span className="text-muted-foreground italic">Unclassified</span>
                  ) : (
                    <ErrorClassChip errorClass={row.error_class} />
                  )}
                </TableRowHeader>
                <TableCell className="text-right tabular">{formatInteger(row.a_count)}</TableCell>
                <TableCell className="text-right font-semibold tabular">
                  {formatInteger(row.b_count)}
                </TableCell>
                <TableCell className="text-right">
                  <DeltaPill
                    delta={row.b_count - row.a_count}
                    increaseIsGood={false}
                    format={(count) => formatInteger(count) ?? "0"}
                    showArrow
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SectionCard>
  );
}
