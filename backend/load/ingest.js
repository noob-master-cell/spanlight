// Ingestion load: 5 requests a second of 100 spans each, so 500 spans a second, sent to
// POST /v1/traces with the project's ingest key. The target is the web service (Caddy), which is
// the path every self-hosted request takes. Threshold: p95 of the request time below 200 ms.
//
// Environment (all optional in the container the workflow starts):
//   BASE_URL          where the web service listens, default http://localhost:8080
//   DURATION          how long to hold the rate, default 30s
//   CREDENTIALS_FILE  JSON written by seed.py, default /creds/credentials.json
//   RESULTS_DIR       where the JSON and Markdown summaries go, default /results
import http from 'k6/http';
import exec from 'k6/execution';
import { check } from 'k6';
import { TREND_STATS, summarize } from './summary.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const DURATION = __ENV.DURATION || '30s';
const RESULTS_DIR = __ENV.RESULTS_DIR || '/results';
const credentials = JSON.parse(open(__ENV.CREDENTIALS_FILE || '/creds/credentials.json'));

const REQUESTS_PER_SECOND = 5;
const SPANS_PER_REQUEST = 100;

// A 429 or any other status outside 2xx counts as a failed request, not just a slow one.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }));

export const options = {
  scenarios: {
    ingest: {
      executor: 'constant-arrival-rate',
      rate: REQUESTS_PER_SECOND,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 20,
      maxVUs: 100,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<200'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    // The rate was held: k6 drops an iteration when it has no free virtual user left.
    dropped_iterations: ['count==0'],
  },
  summaryTrendStats: TREND_STATS,
};

// Trace and span ids must be new for every request, or the pipeline would update rows that
// already exist instead of inserting. The run id keeps a second run from repeating the first.
const RUN_ID = hex(Date.now(), 12);
const MODELS = [
  ['anthropic', 'claude-haiku-4-5'],
  ['openai', 'gpt-4o-mini'],
  ['anthropic', 'claude-sonnet-4-5'],
  ['openai', 'gpt-4.1'],
];
// About 260 bytes, the size of the payloads in the seeded data (200 to 800 bytes).
const TEXT = [
  'The customer asks for a refund on the last invoice and says the card was charged twice.',
  'Please confirm the shipping address before the order leaves the warehouse tomorrow.',
  'Summarize the ticket history and list the open questions for the account owner.',
].join(' ');

function hex(value, width) {
  return value.toString(16).padStart(width, '0');
}

// One trace of `size` spans: a single call, or a root span with `size - 1` children.
function buildTrace(iteration, traceNumber, size, firstSpanNumber, nowMs) {
  const traceId = RUN_ID + hex(iteration, 12) + hex(traceNumber, 8);
  const spanId = (offset) => hex(iteration, 8) + hex(firstSpanNumber + offset + 1, 8);
  const spans = [];
  for (let offset = 0; offset < size; offset++) {
    const startMs = nowMs - 3000 + offset * 200;
    const [provider, model] = MODELS[(firstSpanNumber + offset) % MODELS.length];
    const isRoot = size > 1 && offset === 0;
    // The root spans its children; each call takes 100 ms and a little longer than the one before.
    const endMs = isRoot ? nowMs - 3000 + size * 200 : startMs + 100 + offset * 20;
    const span = {
      trace_id: traceId,
      span_id: spanId(offset),
      parent_span_id: size > 1 && offset > 0 ? spanId(0) : null,
      name: isRoot ? 'agent run' : 'chat completion',
      kind: isRoot ? 'chain' : 'llm',
      status: 'ok',
      start_time: new Date(startMs).toISOString(),
      end_time: new Date(endMs).toISOString(),
      input: TEXT,
      output: TEXT,
    };
    if (!isRoot) {
      span.provider = provider;
      span.model = model;
      span.usage = { input_tokens: 300 + offset * 50, output_tokens: 100 + offset * 20 };
    }
    if (offset === 0) {
      span.trace = { name: 'load-test', environment: 'load-test' };
    }
    spans.push(span);
  }
  return spans;
}

function buildBatch(iteration, nowMs) {
  const spans = [];
  for (let trace = 0; spans.length < SPANS_PER_REQUEST; trace++) {
    const size = Math.min(1 + (trace % 6), SPANS_PER_REQUEST - spans.length); // 1 to 6 spans
    spans.push(...buildTrace(iteration, trace, size, spans.length, nowMs));
  }
  return spans;
}

let reportedFailure = false;

export default function () {
  const iteration = exec.scenario.iterationInTest;
  const response = http.post(
    `${BASE_URL}/v1/traces`,
    JSON.stringify({ spans: buildBatch(iteration, Date.now()) }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credentials.ingest_key}`,
      },
      tags: { name: 'POST /v1/traces' },
    },
  );
  const accepted = check(response, {
    'status is 200': (r) => r.status === 200,
    'every span accepted': (r) => {
      if (r.status !== 200) return false;
      const body = r.json();
      return body.accepted === SPANS_PER_REQUEST && body.rejected.length === 0;
    },
  });
  if (!accepted && !reportedFailure) {
    reportedFailure = true; // once per virtual user, so a broken run does not flood the log
    console.error(`ingest: HTTP ${response.status} ${String(response.body).slice(0, 300)}`);
  }
}

export function handleSummary(data) {
  return summarize({
    name: 'ingest',
    title: `Ingest: ${REQUESTS_PER_SECOND * SPANS_PER_REQUEST} spans per second`,
    description:
      `${REQUESTS_PER_SECOND} requests a second of ${SPANS_PER_REQUEST} spans for ${DURATION}.`,
    data,
    options,
    resultsDir: RESULTS_DIR,
  });
}
