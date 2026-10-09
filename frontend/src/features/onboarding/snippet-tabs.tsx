import { CodeBlock } from "@/components/code-block";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { buildSnippets } from "./snippets";

interface SnippetTabsProps {
  /** The secret created during onboarding, or null to show the placeholder. */
  apiKey: string | null;
}

/**
 * The integration snippets (Figma "Snippets"): a segmented pill of tabs above the dark code
 * cards. Every snippet already contains this instance's host and, once created, the real key.
 */
export function SnippetTabs({ apiKey }: SnippetTabsProps) {
  const snippets = buildSnippets({ apiKey, host: window.location.origin });
  const first = snippets[0];

  return (
    <Tabs defaultValue={first?.id} className="flex min-w-0 flex-col">
      <TabsList aria-label="Integration method" className="self-start">
        {snippets.map((snippet) => (
          <TabsTrigger key={snippet.id} value={snippet.id}>
            {snippet.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {snippets.map((snippet) => (
        <TabsContent key={snippet.id} value={snippet.id} className="flex flex-col gap-3 pt-3">
          {snippet.blocks.map((block) => (
            <CodeBlock
              key={block.title}
              code={block.code}
              title={block.filename}
              language={block.language}
              label={`${snippet.label}: ${block.title}`}
            />
          ))}
          <p className="text-xs font-medium text-muted-foreground">{snippet.description}</p>
        </TabsContent>
      ))}
    </Tabs>
  );
}
