import { Card } from "@/components/ui/card";

import { InlineCodeText } from "./inline-code-text";

interface FixCardProps {
  title: string;
  text: string;
  className?: string;
}

/** One catalogue paragraph in a card: "Suggested fix" or "How to verify". */
function TextCard({ title, text, className }: FixCardProps) {
  return (
    <Card role="region" aria-label={title} className={className}>
      <div className="flex flex-col gap-3 p-5 sm:p-6">
        <h2 className="text-card">{title}</h2>
        <p className="text-sm leading-relaxed text-foreground">
          <InlineCodeText text={text} />
        </p>
      </div>
    </Card>
  );
}

interface FixAndVerificationProps {
  fix: string;
  verification: string;
}

/** The top row, above the fold: the fix and, beside it, how to confirm it worked. */
export function FixAndVerification({ fix, verification }: FixAndVerificationProps) {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <TextCard title="Suggested fix" text={fix} />
      <TextCard title="How to verify" text={verification} />
    </div>
  );
}
