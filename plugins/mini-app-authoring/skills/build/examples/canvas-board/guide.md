_Use: Keep the whiteboard of this chat — notes the person drags around and arrows between them — and
point the person at things on it. Use when they ask to put, connect, move, tidy or look at something
on the board; not for anything the board does not hold._

# Change the board

- A note to add: call `canvas_board_add_note` with a short `text`. Leave `x` and `y` out: the note
  goes to the next free slot. Use `tone` `warning` for risks and `info` for facts.
- A note to change or remove: take its id from the board on screen or `canvas_board_list`, then call
  `canvas_board_update_note` with only the fields that change, or `canvas_board_remove_note` (its
  links go with it). Never remove a note the person did not name.
- An arrow: `canvas_board_connect` with the two note ids, `from` first. Connecting a pair again only
  changes the label. `canvas_board_disconnect` takes a link id.
- Tidying up: `canvas_board_arrange` with `layers` for a flow (the start on the left, arrows to the
  right) or `grid` for a pile of loose notes. It moves every note, so use it when asked or when a
  board you built is a mess.

Each tool answers with the whole board. Tell the person what changed in one line.

# Point at something

To say "look at this", call `canvas_board_look` with the note ids. The person's open board pans to
them; nothing else changes. If the tab is closed nothing moves, so also name the notes in your
answer. Point once, at the thing you are talking about, not at every note you touched.

# Answer about the board

While the Canvas Board tab is open, the person's message carries what it shows. Answer from it, and
call `canvas_board_list` when nothing is attached.
