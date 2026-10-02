# Background memory

This follows the public Codex pattern of opt-in generation separate from recall,
idle background extraction and consolidation. It does not claim identical internal
algorithms. Public reference: https://learn.chatgpt.com/docs/customization/memories

## Controls

Conversation details have independent Use existing memories and Let this chat
contribute controls. Existing chats do not contribute by default. Enabling contribution
authorizes sending at most 30 recent user-message texts (4000 characters each) and
80 same-scope memories to the displayed conversation model endpoint. Tool output,
attachments and assistant messages are not included. Changing the endpoint requires
re-enabling contribution. These are separate from the explicit embedding-index action.

## Lifecycle

A 30-second worker selects at most one eligible conversation per pass, only while
foreground runs are idle. The conversation must have at least two user messages,
a completed run, no nonterminal runs and at least two minutes idle. Child and archived
conversations are excluded. Each source-event checkpoint is processed once; failures
are recorded without automatic retry loops. A crash can leave a running receipt:
it is not blindly replayed. A later user message creates a new checkpoint.

Extraction is tool-free and bounded in time. The model receives same-scope existing
entries to identify duplicates and conflicts. Host code validates exact source quotes,
filters common secret patterns, deduplicates normalized content and commits memories
with the processing receipt transactionally. New messages, scope/settings changes or
changed memories invalidate an in-flight result. Closing the service cancels the worker.

## Storage and scope

General chats contribute only to user memory. Project chats contribute only their
project. Project recall of user preferences remains an explicit separate choice.
Clear nonconflicting preferences activate automatically. Decisions and conflicts are
inactive candidates. Nothing overwrites old entries automatically. Records retain
conversation/event provenance, topic and revision. Deletion stores a content hash
tombstone to prevent exact-content regeneration. Background activity is visible on
the Memory page. Recall uses the existing lexical/hybrid index; extraction does not
automatically upload new entries to an embedding service.

## Limits

Secret filtering and semantic conflict detection are best effort, not a privacy proof.
Exact quote matching does not prove entailment. Paraphrased duplicate/forgotten entries
can evade normalized matching. Consolidation is additive with duplicate/conflict
checks, not unrestricted rewriting of a global summary. No provider account quota
endpoint is available, so the worker does not know remaining quota; it limits work to
one bounded request per eligible checkpoint and records failures/usage instead.
Switching off contribution does not delete existing memories. Delete them separately.
