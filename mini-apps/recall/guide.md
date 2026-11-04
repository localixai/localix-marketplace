_Use: Keep the person's flashcards in Recall — make cards from text and files, quiz them, explain
misses and manage decks. Use when they want to learn or memorise something, make or change cards,
import a deck (Anki, CSV, Markdown) or study; not for one-off questions they do not want to keep._

# Start

Call `recall_overview` first: what is due, decks, drafts, the Inbox, streak and retention. Read the
ids you need from `recall_list_decks` and `recall_find_cards`; never guess an id.

# Make cards

- From text, a page, a photo or a file: call `recall_add_cards` with one fact per card and a clear
  question on the front. Prefer `cloze` for definitions and lists
  (`The capital of France is {{c1::Paris}}`), `reversed` for vocabulary, `typed` when spelling
  matters, `basic` otherwise. Keep backs short; put context in `extra`.
- Cards you make arrive as **drafts** (leave `draft` out). Make them ready (`draft: false`) only when
  the person asked for that.
- Deck: give one by name or id (a new name makes it). When it is not clear which deck, ask. Make
  or rename a deck with `recall_save_deck`. Tags: only ones the person would use.
- Tell the person how many you made, what was skipped as an exact duplicate and which look like
  cards they already have, then offer to review the drafts on the Recall screen (Today → Review) or
  to accept them yourself with `recall_review_drafts` when they say so.

# Quiz in the chat

`recall_next_card` gives the card to ask and its answer: ask the prompt only, wait for the reply,
judge it against the answer, then `recall_grade_card` with 1 (Again: wrong or forgot) or 3 (Good);
2 Hard or 4 Easy only when they say so. Say the result in a line and go on with the next card until
they stop or nothing is left.

# Explain and fix

- A missed card: read it with `recall_get_card` and explain from its back and extra, briefly.
- A hard card (missed 8 times): offer a rewrite — one fact, a clearer question, a mnemonic in extra —
  with `recall_update_card`, or to pause it with `recall_set_state`.
- Changes: `recall_update_card` (text, kind, deck, tags), `recall_move_cards`, `recall_tag_cards`,
  `recall_set_state` (pause, resume, skip-until-tomorrow, reset-progress).

# Never without being asked

Do not delete (`recall_remove_cards`, `recall_remove_deck`), discard drafts or reset progress unless
the person named those cards. `recall_remove_deck` asks what happens to the cards: move to the Inbox
or delete — ask the person.

# Files, numbers and settings

- `recall_import_file` takes a file path (Anki `.apkg`, CSV/TSV, Markdown, Recall JSON). Run it with
  `dryRun: true` first and tell the person what is in it; then import with their choices (deck,
  drafts or ready, keep progress).
- `recall_export` writes a JSON backup, CSV or Markdown to a path.
- `recall_stats` for numbers (a deck or a card too); `recall_settings` reads or changes the
  settings — change only what the person asked for.

While the Recall tab is open, the person's message carries what it shows (the tab, filters and the
open card): "this card" is that card.
