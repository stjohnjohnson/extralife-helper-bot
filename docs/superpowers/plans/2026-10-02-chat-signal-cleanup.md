# Chat Signal Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct bot and emote metrics and simplify low-signal HTML report sections.

**Architecture:** Merge repository bot defaults at the CLI boundary, normalize emotes onto chat events, and calculate human/bot emote breakdowns in the existing metrics layer. Keep compatibility fields in JSON while simplifying only the report presentation.

**Tech Stack:** CommonJS Node.js 24+, TMI.js metadata, Jest, deterministic HTML

**Spec:** `docs/plans/2026-10-02-chat-signal-cleanup-design.md`

## Global Constraints

- Work only in the attached `log-analyzer` worktree.
- Add no network calls or runtime dependencies.
- Preserve deterministic output and safely escaped private text.
- Keep `emoteCount`, `topWords`, `topBigrams`, and viewer sample counts in JSON for compatibility.
- Run `npm run lint` and `npm test` before committing.

## Review Focus

- A custom `--bot-user` must augment, not replace, the two repository defaults.
- Repeated occurrences of one emote in one message must each be counted.
- Authoritative structured `emotes: []` must not fall back to legacy text guesses.
- Bot-authored emotes must appear in bot and total counts but not human counts.
- Emote and bot matching must remain case-correct and deterministic.

---

### Task 1: Default bot classification and emote normalization

**Files:**
- Create: `src/analysis/emotes.js`
- Modify: `src/analysis/options.js`
- Modify: `app.js`
- Test: `tests/analysis/options.test.js`
- Test: `tests/eventMetadata.test.js`

**Interfaces:**
- Produces: `DEFAULT_BOT_USERS`, `legacyEmotes(text) -> string[]`, and `taggedEmotes(text, emoteTags) -> string[]`
- Consumes: Twitch/TMI `tags.emotes` objects and existing CLI arguments

- [ ] **Step 1: Add failing option and emote-normalization tests**

Assert that no bot flags yield `['stjohnbot', 'streamelements']`, custom flags merge and sort, legacy matching counts repeated exact catalog tokens, structured extraction preserves repeated tagged names, and an empty tag object returns an empty authoritative list.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/analysis/options.test.js tests/eventMetadata.test.js --runInBand`

Expected: FAIL because defaults and emote helpers do not exist.

- [ ] **Step 3: Implement defaults, catalog matching, and structured extraction**

Add the pure emote helpers, use defaults in `parseArguments`, and add `emotes: taggedEmotes(message, tags.emotes)` to structured chat metadata.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- tests/analysis/options.test.js tests/eventMetadata.test.js --runInBand`

Expected: PASS.

### Task 2: Human and bot emote metrics

**Files:**
- Modify: `src/analysis/metrics.js`
- Test: `tests/analysis/metrics.test.js`

**Interfaces:**
- Consumes: normalized `event.data.emotes` or `legacyEmotes(event.data.text)` when the property is absent
- Produces: `chat.emoteCount`, `chat.botEmoteCount`, and `chat.topEmotes[]` entries shaped as `{ value, total, human, bot }`

- [ ] **Step 1: Add failing metric tests**

Cover repeated legacy emotes, structured emotes, authoritative empty arrays, human/bot separation, and deterministic total-descending/name-ascending ranking.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/analysis/metrics.test.js --runInBand`

Expected: FAIL because emotes currently recognize only colon-wrapped human text.

- [ ] **Step 3: Implement emote aggregation**

Count normalized emote arrays across all chat, split counts through the existing bot classifier, retain human `emoteCount`, and return ranked breakdown rows.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- tests/analysis/metrics.test.js --runInBand`

Expected: PASS.

### Task 3: Simplify and clarify the HTML report

**Files:**
- Modify: `src/analysis/report.js`
- Test: `tests/analysis/report.test.js`

**Interfaces:**
- Consumes: `chat.emoteCount`, `chat.botEmoteCount`, and `chat.topEmotes`
- Produces: human/bot emote cards, ranked emote table, no word/bigram panels, and no coverage-sample game column

- [ ] **Step 1: Add failing report tests**

Assert the new emote labels and breakdown, escaped emote names, absence of `Top words`, `Top phrases`, and `Coverage samples`, and unchanged sortable game values.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/analysis/report.test.js --runInBand`

Expected: FAIL on the missing emote breakdown and still-present low-signal sections.

- [ ] **Step 3: Update report rendering**

Add an emote breakdown table, relabel chat cards, remove lexical panels, and remove the coverage cell/header without changing JSON.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- tests/analysis/report.test.js --runInBand`

Expected: PASS.

### Task 4: Documentation and acceptance

**Files:**
- Modify: `README.md`
- Generated, ignored: `reports/extralife-2025.html`
- Generated, ignored: `reports/extralife-2025.json`

**Interfaces:**
- Consumes: the primary checkout's ignored `extralife-2025.log`
- Produces: documented defaults and an updated local acceptance report

- [ ] **Step 1: Document defaults and emote limitations**

Explain default bot exclusions, additive `--bot-user`, authoritative future emote tags, and the checked-in legacy catalog.

- [ ] **Step 2: Regenerate and verify 2025 acceptance values**

Run the analyzer with default options and verify 224 human messages, 73 bot messages, 25 human chatters, and top-emote rows for `ExtraLife` 116/0/116, `PogChamp` 2/0/2, and `LUL` 1/1/0.

- [ ] **Step 3: Run final verification**

Run `npm run lint`, `npm test`, `git diff --check`, and `git status --short`.

Expected: lint and all tests pass; only intended source, tests, and documentation remain pending.

- [ ] **Step 4: Commit**

Commit the complete change with a detailed Conventional Commit covering metric semantics, privacy/security, configuration behavior, and cross-platform impact.
