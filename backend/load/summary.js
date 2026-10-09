// Shared by ingest.js, overview.js and traces.js: turns what k6 hands to handleSummary into a
// Markdown table (printed, and kept beside the JSON) and the full JSON summary.
//
// The data object (k6 2.3.0, `summarizeMetricsToObject`) holds, for each metric name:
//   { type, contains, values: { <stat>: number }, thresholds?: { <expression>: { ok: boolean } } }
// `thresholds` is keyed by the threshold's text, `p(95)<300`, and is absent when the metric has
// none. This module reads nothing else, and in particular not the script's exported `options`:
// k6 writes the resolved options back over that object, so its `thresholds` are no longer the
// lists of strings the script wrote.

// Which statistics of a trend k6 reports; the scripts set `summaryTrendStats` to this.
export const TREND_STATS = ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'];

export const UNKNOWN = '—';

// The order of the threshold table; a metric that is not listed follows, by name.
const THRESHOLD_ORDER = ['http_req_duration', 'http_req_failed', 'checks', 'dropped_iterations'];

export function formatValue(value, contains) {
  if (value === undefined) return UNKNOWN;
  return contains === 'time' ? `${value.toFixed(1)} ms` : String(Number(value.toFixed(4)));
}

function rank(name) {
  const index = THRESHOLD_ORDER.indexOf(name);
  return index === -1 ? THRESHOLD_ORDER.length : index;
}

function byThresholdOrder(a, b) {
  return rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0);
}

// One row per threshold: what was asked, what was observed, and whether k6 judged it met.
function thresholdRows(data) {
  const names = Object.keys(data.metrics).filter((name) => data.metrics[name].thresholds);
  const rows = [];
  for (const name of names.sort(byThresholdOrder)) {
    const metric = data.metrics[name];
    const values = metric.values || {};
    for (const [expression, outcome] of Object.entries(metric.thresholds)) {
      const stat = expression.split(/[<>=]/)[0].trim();
      const result = outcome && outcome.ok ? 'pass' : '**FAIL**';
      rows.push(
        `| \`${name}\` | \`${expression}\` | ${formatValue(values[stat], metric.contains)} | ${result} |`,
      );
    }
  }
  return rows;
}

function latencyLine(data) {
  const metric = data.metrics.http_req_duration;
  if (!metric || !metric.values) return 'No request time was recorded.';
  const parts = TREND_STATS.map((stat) => {
    const value = metric.values[stat];
    return `${stat} ${value === undefined ? UNKNOWN : value.toFixed(1)}`;
  });
  return `Request time in ms: ${parts.join(', ')}.`;
}

function sentLine(data) {
  const sent = data.metrics.http_reqs && data.metrics.http_reqs.values;
  if (!sent) return 'No request was sent.';
  return `Sent ${sent.count} requests (${sent.rate.toFixed(2)} a second).`;
}

// The value for handleSummary. `name` names the files (<name>.json and <name>.md in `resultsDir`)
// and `extraLines` are Markdown lines added after the threshold table.
export function summarize({ name, title, description, data, resultsDir, extraLines = [] }) {
  const markdown = [
    `### ${title}`,
    '',
    `${description} ${sentLine(data)}`,
    latencyLine(data),
    '',
    '| Metric | Threshold | Observed | Result |',
    '|---|---|---|---|',
    ...thresholdRows(data),
    '',
    ...extraLines,
  ].join('\n');
  return {
    stdout: `\n${markdown}\n`,
    [`${resultsDir}/${name}.json`]: JSON.stringify(data, null, 2),
    [`${resultsDir}/${name}.md`]: markdown,
  };
}
