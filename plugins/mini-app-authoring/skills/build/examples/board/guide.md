_Use: Keep this chat's kanban board: add cards, move them between Backlog, In progress, Review and
Done, and answer what is on it. Use when the person talks about tasks or progress in this chat; not
for work that belongs on another chat's board._

# Add and move cards

- A new task: call `example_board_add_card` once per task, with a short `title`. Add `points` and
  `due` only when the person gave them; pass `stage` only when the card does not start in the
  Backlog.
- "It's in review", "that's done": find the card's id in the board on screen or with
  `example_board_show`, then call `example_board_move_card` with that id and the stage.
- Each tool answers with the whole board. Tell the person what changed in one line, not the board.

The board is this chat's: another chat has its own cards. If a tool says there is no chat, tell the
person to open the board from a chat.

# Answer about the board

While the board tab is open, the person's message carries what it shows, column by column. Answer
from it, and call `example_board_show` when nothing is attached. The person sees the card move on
the screen as you move it; do not describe the movement twice.
