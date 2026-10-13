## Summary

<!-- Follow the STE-style guidance in AGENTS.md. Explain the user problem and final behavior in short sentences. Use at most 25 words per descriptive sentence. Use consistent terms and explicit subjects. Preserve exact technical identifiers. Link the tracking issue (Closes #NUMBER when complete). Target 150–250 words for the whole PR. Link detailed evidence. -->

## Release notes

<!-- Write 1–3 short bullets about final shipped behavior. Each bullet can contain more than one sentence. Keep descriptive sentences within 25 words. Use exactly Internal only. for maintenance with no user-facing impact. Do not list development steps or tests. -->

## Upgrade actions

<!-- Give each instruction one action. Use direct commands and at most 20 words per instruction. Use numbered steps when order matters. Put necessary conditions before their instructions. Preserve exact commands, settings, and migration names. Use bullets or numbered steps. Put each separate deployment limitation in a bullet. Do not use standalone paragraphs. Write None. when no action is needed. -->

## Validation

<!-- List commands and concise results. Preserve exact command names and test counts. Link detailed verification evidence instead of repeating it. Keep BREAKING CHANGE: footers when applicable. -->

<!-- If replacing notes from an earlier still-unreleased PR, add replaces-release-notes: #NUMBER in its own HTML comment and restate retained behavior and upgrade actions. -->

<!-- Valid upgrade example:
1. Run `npm run sa:package`.
2. Import `dist/stream-avatars/sa-helper-bridge.zip` into Stream Avatars.
3. Restore the private connection address.
4. Restore the private connection token.

- A stopped companion cannot update its indicator.
-->
