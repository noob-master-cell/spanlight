// Shared by ingest.js, overview.js and traces.js: turns what k6 hands to handleSummary into a
// Markdown table (printed, and kept beside the JSON) and the full JSON summary.

// Which statistics of a trend k6 reports; the scripts set `summaryTrendStats` to this.
export const TREND_STATS = ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'];

export const UNKNOWN = '—';

export function formatValue(value, contains) {
  if (value === undefined) return UNKNOWN;
  return contains === 'time' ? `${value.toFixed(1)} ms` : String(Number(value.toFixed(4)));
}

// One row per threshold: what was asked, what was observed, and whether k6 judged it met.
function thresholdRows(data, thresholds) {
  const rows = [];
  for (const name of Object.keys(thresholds)) {
    const metric = data.metrics[name];
    for (const expression of thresholds[name]) {
      const outcome = metric && metric.thresholds ? metric.thresholds[expression] : undefined;
      const stat = expression.split(/[<>=]/)[0].trim();
      const observed = metric ? formatValue(metric.values[stat], metric.contains) : UNKNOWN;
      const result = outcome === undefined ? 'unknown' : outcome.ok ? 'pass' : '**FAIL**';
      rows.push(`| \`${name}\` | \`${expression}\` | ${observed} | ${result} |`);
    }
  }
  return rows;
}

function latencyLine(data) {
  const values = data.metrics.http_req_duration.values;
  const parts = TREND_STATS.map((stat) => `${stat} ${values[stat].toFixed(1)}`);
  return `Request time in ms: ${parts.join(', ')}.`;
}

// The value for handleSummary. `name` names the files (<name>.json and <name>.md in `resultsDir`),
// `options` is the script's own options object (its thresholds are the table), and `extraLines`
// are Markdown lines added after the threshold table.
export function summarize({ name, title, description, data, options, resultsDir, extraLines = [] }) {
  const sent = data.metrics.http_reqs.values;
  const markdown = [
    `### ${title}`,
    '',
    `${description} Sent ${sent.count} requests (${sent.rate.toFixed(2)} a second).`,
    latencyLine(data),
    '',
    '| Metric | Threshold | Observed | Result |',
    '|---|---|---|---|',
    ...thresholdRows(data, options.thresholds),
    '',
    ...extraLines,
  ].join('\n');
  return {
    stdout: `\n${markdown}\n`,
    [`${resultsDir}/${name}.json`]: JSON.stringify(data, null, 2),
    [`${resultsDir}/${name}.md`]: markdown,
  };
}
