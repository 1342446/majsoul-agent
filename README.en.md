# Majsoul AI Analysis & Review Agent · Mahjong analysis and review

[简体中文](README.md) | **English** | [日本語](README.ja.md)

A browser extension for the Mahjong Soul web client. Inspect the table in an in-game panel, keep local match results, and analyze locally or call your own LLM service manually or automatically after consent. Built with Manifest V3, with no third-party runtime dependencies or telemetry. LLM analysis is disabled by default.

**Bring your own model and API.** Set your endpoint URL, model ID, and API key to connect cloud models, third-party gateways, or local model services that provide an **OpenAI Chat Completions-compatible API**. Choose your provider freely. Requests go directly to your configured service without a relay operated by this project. [See setup instructions](#llm-setup).

These language links switch the documentation only. The extension UI is currently in Simplified Chinese. English and Japanese documentation does not imply support for other regional game servers.

This document describes **0.4.0**. It integrates the 0.3.0 analysis modules with a separate Agent layer, a harness, and a collector-only distribution. Both installation profiles have passed synthetic-game checks in isolated Edge and Chrome environments. Full live protocol coverage for the current Unity client, reconnection recovery, and the quality of real model advice remain unverified. No live recognition accuracy or playing strength is claimed.

The project is maintained at [oreki-L/majsoul-ai-analysis-and-review-agent](https://github.com/oreki-L/majsoul-ai-analysis-and-review-agent), with the complete original private development history retained after sanitization. See the [history migration notes](docs/HISTORY.md) (Chinese).

![Floating analysis card with synthetic game data and model output](docs/images/agent-floating-preview.png)

## Features

- **Bring your own model API:** customize the endpoint, model ID, and API key to use different compatible services. Select table information, all or selected discard pools, and optionally your own hand; preview the payload and manually request danger or discard advice.
- **Floating analysis card:** a separate, persistent result card with a draggable title and saved position. Click candidate tiles to compare explanations; hand details, local efficiency tables, and traces stay folded. The collector starts collapsed and opens independently for discards, dora, and history.
- **Hand annotations:** after manual calibration, recommendations and high-risk tiles appear over the current live hand, including matching copies. Normal annotations let game clicks pass through. A changed state clears old markers immediately; delayed results cannot annotate a newer state.
- **Dora display:** indicators and corresponding dora shown side by side, including honor-tile cycles, red fives, and three-player manzu rules. Hidden ura-dora is not inferred.
- **Match history:** browse wins, draws, final hand scores, and score changes by match, hand, and honba. Collection continues while viewing an older hand.
- **Replay inspection:** parse an already downloaded replay and inspect it with an independent event cursor, including all four hands when present in the replay.

Local history retains up to 20 matches and 100 hands per match, evicting the oldest matches at roughly 4 MiB total. Records are end-of-hand snapshots, not event-by-event replays. Refreshes or disconnects may split a match into separate records. Tiles are sorted by suit; manually rearranging tiles in the game is not mirrored.

## Installation

| Package | Capabilities |
| --- | --- |
| `majsoul-ai-analysis-and-review-agent-0.4.0.zip` | Collector, panel, match history, Agent, model settings, and harness traces |
| `majsoul-collector-0.4.0.zip` | Collection, display, history, and export only; no model code, settings page, or model host permissions |

Enable only one profile on a game page. The collector works independently and can export records for offline review. The profiles have separate local storage and do not migrate data automatically. The source `extension/` directory is the full edition; `npm run build` generates both loadable directories.

The independent `extension/profiles/agent.json` and `collector.json` profiles select `apps/agent-app.js` and `apps/collector-app.js` as composition entries. Building follows each profile's dependency closure to produce `dist/majsoul-ai-analysis-and-review-agent-0.4.0/` and `dist/majsoul-collector-0.4.0/`; load either directory directly. The collector package contains only the files needed for collection, display, history, and export.

1. Download and extract the source ZIP, or clone the repository. For a source checkout, use the **`extension/` directory**.
2. Open `edge://extensions` in Edge or `chrome://extensions` in Chrome, and enable Developer mode.
3. Choose **Load unpacked** and select that directory. For the dedicated extension ZIP, select the extracted directory that directly contains `manifest.json`.
4. Refresh the Mahjong Soul page so the collector loads before the game connection is established, then enter a game or reopen a replay.
5. The full edition shows a separate `Majsoul AI Analysis & Review Agent` card on the right and a collapsed `牌局` collector entry on the left. The collector-only edition shows the left entry. Drag either title to move it; positions are saved independently. Recent events and collection status start collapsed.

After updating, reload the extension in the browser’s extension manager, then refresh the game. Refreshing resets your replay position. Existing connections and previously downloaded replay data cannot be read retroactively.

Only **`https://game.maj-soul.com/*`** is currently matched. Other regional domains, Firefox, Safari, and the Steam desktop client are not supported. Architectural compatibility with Chrome or Brave is not a substitute for testing.

## Agent and harness

The collector controller owns table state, replay cursors, history, and exports; the UI interacts through views and commands. A separate adapter maps the user's selection to the standard `mj-analysis-v1` DTO. The Agent depends on the pure data contract without reading collector state layouts, so another collector can supply the same DTO. The analysis panel receives only a snapshot function and display inputs. Composition entries connect these components; see [decoupling design](docs/DECOUPLING.md) and [architecture](ARCHITECTURE.md) (Chinese).

The Agent maps danger, tile-efficiency, and combined tasks to bounded workflows. The harness executes registered tools, limits steps and runtime, propagates cancellation, and records tool metadata without game payloads or credentials. The full edition runs snapshot validation → local analysis and prompt preparation → model explanation → result validation. Successful results include a collapsible `Agent 运行记录` trace. This first version uses a fixed plan and at most one model request per run; the model does not select tools autonomously or retry indefinitely.

Review a collector `mj-observer-v1` JSON export locally with Node.js 22+:

```sh
npm run review -- observation.json --seat 0 --hand --cursor 12
npm run eval
```

`--seat` is a protocol seat ID from 0 to 3. `--hand` explicitly includes your own hand, which is excluded by default. For replays, `--cursor` applies only the first N events and never uses future states. Omit it for live exports, which use the exported snapshot. The CLI performs local analysis without a model request. The built-in evaluation contains three synthetic shanten regressions; it does not measure model quality or playing strength. See [Agent and harness](docs/AGENT.md) (Chinese).

## LLM setup

The full edition accepts your own model API; no project-specific service or account is required. LLM analysis and explanation remain the main use. The default provider is `chat`, with analysis disabled. One `chat` and one optional `mjai` configuration are retained separately; only the selected provider runs per request.

| Service type | How to connect |
| --- | --- |
| Cloud model or compatible third-party gateway | Enter the full HTTPS Chat Completions endpoint, model ID, and your API key |
| Local model service | Enable its Chat Completions-compatible API and enter a localhost or 127.0.0.1 address with its port; leave the key empty if authentication is not required |
| Service offering only another native protocol | Use a gateway that exposes a Chat Completions-compatible API, then configure the gateway endpoint |

Local analysis is available without an API. The card offers danger, hand-efficiency and offense/defense switches, with a combined preset. Model calls and automatic analysis are both off by default.

1. To use a model, open `分析设置 · 调用时机与数据授权`, configure your service in `模型设置`, and grant its host permission.
2. Enable `调用模型` and confirm consent to send public table information and your own hand. Your seat must be known; opponents' hidden tiles and account credentials are excluded.
3. Analyze manually, or enable `自动分析`. Choose every turn or from turn N onward (initially turn 7, adjustable from 2–18). Earlier turns use local calculations. Turn numbers are your discard count plus one.
4. Automatic calls run only at your own discard decisions, combining enabled modules in one request. The default minimum interval is 8 seconds, with 20 automatic model calls per round; both are adjustable. Replays remain manual. Changes invalidate old results and cancel pending requests. Round counters reset when the panel is reloaded.

With model calls disabled, local shanten, improving tiles and genbutsu/suji/kabe evidence require no model request. Integrated strategic explanations require a model. You can inspect analysis data or revoke model consent in settings.

To annotate game tiles, open `分析设置 · 调用时机与数据授权 → 校准手牌提示` at the table. Position the frame over 13 concealed slots, the gap, and the drawn slot, then confirm. Calibration is saved relative to a single visible game Canvas. It assumes manzu, pinzu, souzu, and honors in that order, with shorter hands aligned left after calls; it does not detect individual tile coordinates or follow manual rearrangements. Recalibrate after layout changes or misalignment. Unknown hands, multiple canvases, replays, and historical views receive no markers. Current output shows recommendations and qualitative risk, not fabricated probabilities derived from preferences or unseen-tile upper bounds.

The three analysis tasks use separate data contracts and modular prompts. Danger analysis retains selected players’ ordered discards, discard-from-hand/draw distinctions, riichi, and melds. Tile-efficiency analysis sends only your hand, melds, rules, and authorized visible-tile counts, excluding full discard histories. Combined offense/defense analysis uses both modules in one request.

The extension computes shape-based shanten and improving tiles locally for standard hands, seven pairs, and thirteen orphans. The model explains these results and weighs offense against defense. The table’s unseen-tile counts are upper bounds, not counts of tiles remaining in the wall; zero means all copies have been seen. For high-shanten hands, the calculation compares shape improvements rather than exhaustively searching every future draw/discard sequence. A 13-tile hand shows only its current shanten and improving tiles. After riichi, only the confirmed newly drawn tile can be recommended for discard; if it is unknown, no specific discard is suggested. Completed hands are analyzed only as mathematical reviews.

Model output must follow a JSON Schema; JSON code fences are accepted. The extension rejects discard suggestions outside your hand or unsupported by locally legal candidates. Claims that a tile is genbutsu require local evidence from the relevant opponent’s discards. Shanten and improving-tile counts come from local calculations; model-provided numeric fields outside the contract are rejected. The preview shows the actual outgoing data, and local calculations run within the extension.

The endpoint must support non-streaming `POST /chat/completions` with string content in `choices[0].message.content`; provider-side `response_format` support is not required. Native Anthropic, Gemini, and Responses API formats require a compatible gateway. Both request and response formats must be compatible, and the model must follow the JSON Schema described above. Requests time out after 25 seconds, with one concurrent request per tab.

Advice may be wrong or late, calls may incur charges, and the configured provider processes the input. Real provider compatibility and advice quality still need validation. The API key stays in extension-local storage, is read only by the background component, and is excluded from game exports and the page bridge. See [SECURITY.md](SECURITY.md) for details.

## Optional local mjai engine

Mortal/mjai is an optional adapter, disabled by default. Bring your own model, weights, and inference dependencies. It does not replace the main LLM analysis workflow. The full edition can connect to a manually started local bridge; the independent collector retains no third-party runtime dependencies, engine modules, or engine permissions.

```sh
npm run engine:serve -- --config runtime.json --port 17341
npm run engine:review -- observation.json --config runtime.json --seat 0 --hand --cursor 12
```

`runtime.json` names a trusted local program. Its JSONL protocol receives one complete event array and returns one action line. A Python `Bot.react` wrapper is provided, but your module must initialize the bot and load your weights; an arbitrary upstream `bot.py` is not automatically compatible. Configured commands are not sandboxed, and upstream licenses apply separately. Select `mjai` in settings and enter the local `/analyze` URL and Bearer token. The browser Agent currently accepts only complete four-player rounds without melds, with validated discards, riichi intent, or pass actions; an own-hand 14-tile opening record is rejected. Q values are not deal-in probabilities. There is no automatic play or validation with real model weights. See the [setup, configuration, and limits](docs/MJAI.md) (Chinese).

## Optional NAGA replay export

The full edition's `牌谱复盘 · NAGA` panel is disabled by default. Open a complete replay, enable it, explicitly select East-only / South game, one red five per suit / no red fives, and four-player open tanyao rules, then confirm generation. Conversion reads the entire replay locally, independently of the cursor. Select hands, preview, copy, or download one `Tenhou URL` per hand, then sign in and submit yourself on the [official NAGA page](https://naga.dmv.nico/naga_report/order_form/). Exports include all four hands and replace player names with seat labels.

The first version supports standard four-player calls, kans, riichi, single-winner hands, and ordinary exhaustive draws. Multiple winners, responsibility payments, nagashi mangan, abortive draws, three-player games, unknown yaku, and missing data are rejected per hand. See [NAGA integration](docs/NAGA-INTEGRATION.md) for exact limits. The extension does not automatically upload, charge, read reports, or collect account credentials. Official prices and acceptance are determined on the official site. The collector-only edition contains no NAGA modules.

## History and replays

Hand results show tsumo, ron, exhaustive draws, or abortive draws, along with scores and net changes from the start of the hand, including riichi payments. Missing final scores remain unknown and may be completed when the next hand begins.

Expand `整场记录`, select a match, and click `查看` for a hand to inspect its result snapshot. Click `返回当前牌局` to return to the current table. Uncollected earlier hands cannot be recovered automatically. Loading a complete replay can archive its hands; repeated loads of the same replay are deduplicated.

The replay cursor is **independent of game playback**. Use the previous/next event controls to align it manually; it does not follow playback automatically. Live collection uses only your own information and public table data already delivered to the client. Seeing four hands in a replay does not mean opponents’ concealed tiles are available during a live game.

## Limitations

- The current client protocol still needs full-match live validation. Special rules, protocol changes, and reconstruction after reconnecting are not fully covered.
- State is derived from received events. Missing frames, joining mid-hand, or late seat detection may affect the hand. Completeness markers are retained without persistent warnings.
- Seat winds rotate with the dealer and are not fixed screen positions. Your seat can be detected automatically or selected manually.
- The extension does not play automatically, alter game messages, proactively download replays, or infer the tile wall or opponents’ concealed hands.
- Read-only operation does not imply approval from the game operator. Check the platform rules. This is an unofficial project with no affiliation with the game publisher.

## Development and validation

Use Node.js 22 or newer. No runtime dependencies need to be installed:

```sh
npm run check
npm test
npm run build
```

`check` validates static dependency boundaries, browser-free core modules, profile resources, and loading order. `build` copies each profile's dependency closure without rewriting shared UI source. These checks do not establish live protocol compatibility or model quality.

Serve `tests/preview.html` with a local static server for the offline demo. For example, with Python installed:

```sh
python -m http.server 8126 --bind 127.0.0.1
```

Open `http://127.0.0.1:8126/tests/preview.html`. Tests and demos use synthetic protocol frames, mocked browser APIs, and simulated model responses. They do not connect to an account or a real model and do not establish live capture accuracy or advice quality. See [VALIDATION.md](VALIDATION.md).

| Document | Contents |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Module responsibilities, events, and model data flow |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Local development, reproduction data, and PR requirements |
| [SECURITY.md](SECURITY.md) | Permissions, credentials, data handling, and vulnerability reports |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [docs/PUBLISHING.md](docs/PUBLISHING.md) | Clean snapshot packaging and publication steps |

The supporting documents above are currently in Simplified Chinese. When updating a README, keep the feature descriptions and limitations consistent across all three languages.

## License and references

Source code and 37 original SVG tile faces are available under the [MIT License](LICENSE). Tile faces are generated by this repository’s script; no game screenshots or external fonts are bundled.

[mj_helper](https://github.com/tzp1021/mj_helper) informed the collection/state-machine layering and open-source repository organization, alongside other protocol research. This project focuses on an in-browser panel, result history, and user-selected models. It does not bundle mj_helper’s Python decision engine or claim equivalent playing strength. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for references and the handling of legacy assets.
