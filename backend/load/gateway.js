// Gateway overhead: what a call costs for passing through Spanlight. Two scenarios of 50 requests
// a second each send the same chat completion, one after the other:
//
//   gateway  POST /gw/v1/chat/completions on the web service (Caddy), with a gateway key. The path
//            of a self-hosted call: Caddy, the api (key lookup, limits, the route, the sealed
//            credential, the upstream call) and the fake provider, with the span written
//            afterwards in the background.
//   direct   POST /v1/chat/completions on the fake provider itself (fake_provider.py).
//
// The provider answers at once, so what the gateway adds is the difference of the two. The overhead
// is the p95 of `gateway` minus the p95 of `direct`, and it must stay under 20 ms. Thresholds:
// p95 of `gateway` below 25 ms, p95 of `direct` below 5 ms (a slow provider would hide the
// overhead). k6 cannot compare two thresholds, so the overhead is computed in handleSummary,
// shown in the table and stored in the JSON as `overhead` with `ok`; the workflow fails the job
// when `ok` is not true.
//
// Environment (all optional in the container the workflow starts):
//   BASE_URL                  where the web service listens, default http://localhost:8080
//   FAKE_PROVIDER_URL         where the fake provider listens, default http://localhost:9000
//   GATEWAY_DURATION_SECONDS  how long each scenario holds its rate, default 60
//   GATEWAY_CREDENTIALS_FILE  JSON written by seed_gateway.py, default
//                             /creds/gateway-credentials.json
//   RESULTS_DIR               where the JSON and Markdown summaries go, default /results
import http from 'k6/http';
import { check } from 'k6';
import { TREND_STATS, formatValue, summarize } from './summary.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const FAKE_PROVIDER_URL = __ENV.FAKE_PROVIDER_URL || 'http://localhost:9000';
const DURATION_SECONDS = parseInt(__ENV.GATEWAY_DURATION_SECONDS || '60', 10);
const RESULTS_DIR = __ENV.RESULTS_DIR || '/results';
const credentials = JSON.parse(
  open(__ENV.GATEWAY_CREDENTIALS_FILE || '/creds/gateway-credentials.json'),
);

const REQUESTS_PER_SECOND = 50;
// The pause between the scenarios: the gateway's last spans are still being written when the
// first scenario ends, and that work should not overlap the second.
const PAUSE_SECONDS = 10;
const OVERHEAD_LIMIT_MS = 20;

const GATEWAY_URL = `${BASE_URL}/gw/v1/chat/completions`;
const DIRECT_URL = `${FAKE_PROVIDER_URL}/v1/chat/completions`;
const GATEWAY_DURATION_METRIC = 'http_req_duration{scenario:gateway}';
const DIRECT_DURATION_METRIC = 'http_req_duration{scenario:direct}';

// A 429 or any other status outside 2xx counts as a failed request, not just a slow one.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }));

function arrivalRate(exec, startTime) {
  return {
    executor: 'constant-arrival-rate',
    exec,
    startTime,
    rate: REQUESTS_PER_SECOND,
    timeUnit: '1s',
    duration: `${DURATION_SECONDS}s`,
    preAllocatedVUs: 20,
    maxVUs: 100,
  };
}

export const options = {
  scenarios: {
    gateway: arrivalRate('throughGateway', '0s'),
    direct: arrivalRate('direct', `${DURATION_SECONDS + PAUSE_SECONDS}s`),
  },
  thresholds: {
    [GATEWAY_DURATION_METRIC]: ['p(95)<25'],
    [DIRECT_DURATION_METRIC]: ['p(95)<5'],
    'http_req_failed{scenario:gateway}': ['rate<0.01'],
    'http_req_failed{scenario:direct}': ['rate<0.01'],
    checks: ['rate>0.99'],
    // The rate was held: k6 drops an iteration when it has no free virtual user left.
    dropped_iterations: ['count==0'],
  },
  summaryTrendStats: TREND_STATS,
};

// The same request both ways: a short chat completion. The gateway key has no cache, so every
// call goes upstream.
const BODY = JSON.stringify({
  model: credentials.model,
  messages: [{ role: 'user', content: 'Summarize the ticket history in one sentence.' }],
  max_tokens: 64,
});

function headers(token) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

function send(url, token, name) {
  return http.post(url, BODY, { headers: headers(token), tags: { name } });
}

function answered(response) {
  if (response.status !== 200) return false;
  try {
    const choices = response.json('choices');
    return Array.isArray(choices) && choices.length === 1;
  } catch (error) {
    return false; // a 200 that is not JSON
  }
}

// A few calls each way before the clock starts, so the first scenario does not pay for opening
// the api's connection to the provider, the first key lookup or a cold Python code path. A broken
// setup stops the run here with the reason instead of failing 3 000 requests one by one.
export function setup() {
  for (let call = 0; call < 20; call++) {
    const response = send(GATEWAY_URL, credentials.gateway_key, 'warm-up gateway');
    if (!answered(response)) {
      throw new Error(
        `gateway: HTTP ${response.status} ${String(response.body).slice(0, 300)} (is the gateway ` +
          'seeded, and the fake provider up?)',
      );
    }
    if (!answered(send(DIRECT_URL, 'load-test', 'warm-up direct'))) {
      throw new Error(`the fake provider did not answer at ${DIRECT_URL}`);
    }
  }
}

export function throughGateway() {
  const response = send(GATEWAY_URL, credentials.gateway_key, 'POST /gw/v1/chat/completions');
  check(response, { 'gateway: answered with one choice': answered });
}

export function direct() {
  const response = send(DIRECT_URL, 'load-test', 'POST /v1/chat/completions (direct)');
  check(response, { 'direct: answered with one choice': answered });
}

function p95Of(data, metricName) {
  const metric = data.metrics[metricName];
  const value = metric && metric.values ? metric.values['p(95)'] : undefined;
  return value === undefined ? null : value;
}

// The figure the run is about. Without both p95 values it cannot be computed, which is a failure.
function overheadOf(data) {
  const gateway = p95Of(data, GATEWAY_DURATION_METRIC);
  const direct = p95Of(data, DIRECT_DURATION_METRIC);
  const overhead = gateway === null || direct === null ? null : gateway - direct;
  return {
    gateway_p95_ms: gateway,
    direct_p95_ms: direct,
    overhead_ms: overhead,
    limit_ms: OVERHEAD_LIMIT_MS,
    ok: overhead !== null && overhead < OVERHEAD_LIMIT_MS,
  };
}

function overheadLines(overhead) {
  const observed =
    overhead.overhead_ms === null
      ? formatValue(undefined, 'time')
      : formatValue(overhead.overhead_ms, 'time');
  return [
    '| Figure | Limit | Observed | Result |',
    '|---|---|---|---|',
    '| Gateway overhead (p95 gateway − p95 direct) ' +
      `| below ${OVERHEAD_LIMIT_MS.toFixed(1)} ms | ${observed} ` +
      `| ${overhead.ok ? 'pass' : '**FAIL**'} |`,
  ];
}

export function handleSummary(data) {
  const overhead = overheadOf(data);
  const requests = data.metrics.http_reqs && data.metrics.http_reqs.values;
  return summarize({
    name: 'gateway',
    title: 'Gateway: overhead of a call through Spanlight',
    description:
      `${REQUESTS_PER_SECOND} requests a second for ${DURATION_SECONDS} s through the gateway, ` +
      'then the same directly to the fake provider, which answers at once.',
    // The overhead is stored in the JSON beside the metrics, for the workflow to check.
    data: Object.assign({}, data, { overhead }),
    resultsDir: RESULTS_DIR,
    latencies: [
      { label: 'Request time through the gateway', metric: GATEWAY_DURATION_METRIC },
      { label: 'Request time direct', metric: DIRECT_DURATION_METRIC },
    ],
    sent: requests ? `Sent ${requests.count} requests in all.` : 'No request was sent.',
    extraLines: overheadLines(overhead),
  });
}
