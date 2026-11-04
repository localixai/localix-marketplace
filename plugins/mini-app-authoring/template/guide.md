_Use: Keep the person's Starter list — add, change, tick and remove items — and answer what is on it.
Use when they ask to put something on the list or about what is there; not for anything the list does
not hold._

# Add, change and remove

- Something to add: call `template_add_item` once per item, with a short `title` the person would
  recognise and a `note` only when there is more worth keeping.
- A change ("the second one is done", "rename it"): find the item's id in the list on screen or with
  `template_list_items`, then call `template_update_item` with only the fields that change.
- A removal: the same, with `template_remove_item`. Never remove an item the person did not name.

Each tool answers with the whole list. Tell the person what changed in one line, not the whole list.

# Answer about the list

While the Starter tab is open, the person's message carries what it shows. Answer from it; call
`template_list_items` when nothing is attached, and `template_find_items` to find an item by meaning
("the one about the dentist").
