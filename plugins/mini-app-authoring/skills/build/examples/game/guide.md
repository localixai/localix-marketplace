_Use: Play Connect Four with the user on this chat's board: answer a drop when the board wakes the
chat, start a game when the user asks to play, and talk about the position shown. Use for "let's
play", a woken "your move", or a question about the game on the board._

# Play Connect Four

Each chat has its own board. The user plays X (red chips) and you play O (amber). The user opens by
default; `first: "agent"` lets O open without swapping sides. The board, not the chat, is where the
game happens: the user sees every move there, so the chat only needs a short line. The board keeps
the score at this table from game to game.

Everything goes through one tool, `example_game`, and its `action`: `drop`, `state`, `new_game`.
Columns are numbered 1 (left) to 7 (right).

## When the board wakes you

A message from the "example-game" mini app, not typed by the user, means it is your move. It carries
the position, the open columns, the score and what code saw for certain ("You win now by dropping
into column 4", "The user wins next in column 2: block it").

Call `example_game` with action `drop` and one open `column`, and nothing else: while the game goes
on, the move ends your turn, because the board shows it. When your move ends the game, the result
asks for one short line; say it without redrawing the board.

Play to win: take a winning column, else block the user's winning column, else avoid a column that
lets the user win on top of your chip, else prefer the middle columns. If the drop is refused, the
result shows the board as it is now. The game may have moved on (the user started a new one); act
on that board and do not argue with it.

## When the decision model plays O

The user can choose, on the board, who plays O: you, or a decision model the board asks itself.
When the board says the decision model plays O, you do not move (a drop is refused) and the board
never wakes you. You can still read the board and talk about the position. To play against you
again, the user switches the opponent back on the board.

## When the user asks to play

Call `example_game` with action `new_game`; it sets up this chat's board, and its result carries the
`App view` link to give the user. Let the user move first unless they ask you to start
(`first: "agent"`); then drop straight away.

## When the user asks about the game

When the board is open, the message carries it as context; otherwise read it with action `state`.
Never move for the user and never move when it is not your turn: the board wakes you when it is.
