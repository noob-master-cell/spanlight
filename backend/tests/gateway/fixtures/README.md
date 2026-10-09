# Gateway contract fixtures

Provider responses the gateway contract tests replay through the official OpenAI and Anthropic
SDKs. Each fixture is either **constructed** (written by hand from the provider's API reference)
or **recorded** (captured from the real API by `backend/scripts/record_gateway_fixtures.py`).
Provider ids in every file are fake but well formed (`chatcmpl-test…`, `resp_test…`,
`msg_test_…`, `req_test_…`).

## Versions

| Component | Version | Source |
| --- | --- | --- |
| `anthropic` SDK | 1.12.0 | `backend/uv.lock` |
| `openai` SDK | not yet in `backend/uv.lock`; the contract tests add it as a dev dependency (the SDK package under `sdks/python` currently locks 3.26.0) | `backend/pyproject.toml` |
| Anthropic API version | `2023-06-01` (`anthropic-version` header) | Anthropic API reference |
| Anthropic model | `claude-haiku-4-5` | recording script |
| OpenAI API surfaces | Chat Completions (`/v1/chat/completions`) and Responses (`/v1/responses`) | OpenAI API reference |
| OpenAI model | `gpt-4.1-mini` | constructed fixtures |

Update the SDK rows when `backend/uv.lock` changes.

## Provenance

### `openai/` (all constructed)

There is no OpenAI key in the project, so these were written by hand to match the current
OpenAI API reference. They are shaped like real responses but were not captured from the API.

| File | Contents |
| --- | --- |
| `chat.json` | `chat.completion`; usage includes `prompt_tokens_details.cached_tokens` |
| `chat_stream.sse` | `chat.completion.chunk` frames, a final usage chunk with empty `choices` (the gateway injects `include_usage`), then `data: [DONE]` |
| `chat_tools.json` | two `tool_calls` in one assistant message, `finish_reason` `tool_calls` |
| `chat_tools_stream.sse` | the same two tool calls as streamed deltas (index, id, name, arguments split across chunks) |
| `chat_vision.json` | reply to a request with an `image_url` content part |
| `responses.json` | Responses API object with usage (`input_tokens_details.cached_tokens`) |
| `responses_stream.sse` | `response.created` through `response.completed` events, usage on the completed event |
| `error_429.json` | `{"error": {...}}` rate-limit body |

### `anthropic/`

| File | Status | Recorded |
| --- | --- | --- |
| `messages.json` | recorded | pending: record with the script, then fill in the date |
| `messages_stream.sse` | recorded | pending |
| `messages_tools.json` | recorded | pending |
| `messages_tools_stream.sse` | recorded | pending |
| `messages_vision.json` | recorded | pending |
| `error_529.json` | constructed | an overloaded response cannot be triggered on demand; written from the Anthropic error reference |

The five recorded files do not exist until a maintainer runs the script once with a key. The
script prints a `README provenance:` line per file with the recording date; copy those dates
into the table above in the same commit as the fixtures.

## Re-recording

The script is run by hand, never in CI (it refuses to start when `CI` is set), and spends real
money. It requires `--max-usd`, which must be at most 0.10; it estimates the worst case before
each call and stops rather than pass the cap. Expected cost is well under one cent.

```bash
cd backend
uv run python scripts/record_gateway_fixtures.py --max-usd 0.05 --dry-run   # plan, no calls
ANTHROPIC_API_KEY=... uv run python scripts/record_gateway_fixtures.py --max-usd 0.05
```

Pass `--openai` with `OPENAI_API_KEY` set to replace the constructed OpenAI success fixtures
with recordings (`error_429.json` stays constructed). After doing so, change the `openai/`
heading above from constructed to recorded and add the dates.

The script writes each fixture only after a successful `200` reply, replaces provider ids with
fake ones, never writes an API key, and aborts when a key-shaped string survives scrubbing.
Review the diff of re-recorded fixtures before committing them.

Files use LF line endings; SSE frames are separated by a blank line.
