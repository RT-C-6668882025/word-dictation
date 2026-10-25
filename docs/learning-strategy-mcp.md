# WordTok learning strategy MCP contract (v1)

Default: no algorithm; practice only the active deck's whitelist in its original order. A profile can be shared by many decks; each deck independently selects a profile. Never let scheduling mutate whitelist membership.

## Commands exposed through the existing MCP transport

- `get_learning_context({deckId})`: return deck ID, whitelisted item IDs, available event fields, active profile ID and profile catalog.
- `create_algorithm({profile})`: validate and persist a versioned LearningProfile. Must not activate it automatically.
- `test_algorithm({deckId, profileId})`: execute with the current whitelist and learning history; return ordered IDs, reason and validation errors. Must be read-only.
- `set_algorithm({deckId, profileId})`: associate a deck with an existing profile. No change to any other deck.
- `get_algorithm({deckId})`: return active profile and resolved configuration.
- `reset_algorithm({deckId})`: set profileId to null (built-in none).
- `list_algorithms()`: return available profiles and installed plugin strategy IDs.

All commands should return structured JSON with `ok`, `data` or `error`. The MCP server should route to the app's existing authenticated command layer, not evaluate arbitrary AI-provided JavaScript.

## Rule formats

- React Query Builder: convert its query AST to the typed `Condition` AST in `src/learning/strategy.ts`.
- JSONLogic: allowlisted operations only; validate nesting, field names, input size and computational cost.
- Rete.js: convert supported graph nodes into the same AST. Rete is an optional authoring format, not an APK UI dependency.
- External algorithms such as FSRS: implement the `LearningStrategy` interface as registered, versioned plugins. They own private per-item state.

A condition AST alone is not a full spaced-repetition model. Scheduling modules must explicitly implement state updates and due-date calculations.

## Persistence and safety

- Persist `LearningProfile` by profile ID, and `DeckLearningSettings` by deck ID.
- Keep whitelist IDs separately from learning events and strategy state.
- Save whitelist edits immediately and flush again on deck exit; do not rely exclusively on an Android lifecycle exit callback.
- Learning events such as `revealed` must not imply `answered_correctly`.
- Limit plugin execution time/size and preserve a fallback path; never run untrusted source code directly.
- When changing algorithm versions, migrate plugin state or reset it explicitly without erasing events.
- Retain profile version and last-known-good configuration for rollback.

## Acceptance checks

1. A new deck defaults to no algorithm and practices whitelist only.
2. Editing whitelist persists across force-close/reopen and is independent across decks.
3. Two decks can use the same profile without sharing their learning history.
4. Algorithm errors fall back to original whitelist order.
5. MCP test never changes whitelist or active profile.
6. Left and right hide/show buttons execute current action on tap and immediately switch their own next-action label; no long press.


`record_learning_event({deckId,event,operation_id})` stores explicit results; event has id, deckId, itemId, type and millisecond at. Writes require operation_id. Profiles are immutable: use a new ID for revisions. Built-in rule JSON is executable today; Query Builder / JSONLogic / Rete adapters and external plugins remain future extensions. The app does not ship an algorithm editor.
