const STACK = ["OpenAI", "Anthropic", "OpenTelemetry", "Python", "Docker", "PostgreSQL"] as const;

/** Text wordmarks of the providers and tools the product integrates with (no logos). */
export function WorksWithSection() {
  return (
    <section
      aria-labelledby="works-with-title"
      className="flex flex-col items-center gap-[18px] px-5 pt-10 text-subtle-foreground md:px-8 lg:gap-7 lg:pt-14"
    >
      <h2 id="works-with-title" className="text-overline uppercase">
        Works with the stack you already run
      </h2>
      <ul className="flex w-full max-w-[1200px] flex-wrap items-center justify-center gap-x-[22px] gap-y-3 text-[18px] leading-[1.25] font-extrabold tracking-[-0.02em] lg:justify-between lg:px-12 lg:text-2xl lg:leading-[1.25]">
        {STACK.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
    </section>
  );
}
