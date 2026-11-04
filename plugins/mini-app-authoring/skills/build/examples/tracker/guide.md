_Use: Keep the person's job search: companies and the applications made to them. Add an application,
move it through its stages, find one, report where things stand. Use when they say they applied,
heard back, were rejected, or ask how the search is going; not for CVs, cover letters or anything
the tracker does not hold._

# Record what happens

- "I applied to Acme as a designer": call `example_tracker_add_application` once per application
  with the company by name (it is created when it is new), the `role`, and `status: "applied"`. Give
  `salary` and `appliedOn` only when the person said them.
- "They invited me to an interview", "I got an offer", "they rejected me": find the application's id
  in the list on screen or with `example_tracker_report`, then call
  `example_tracker_update_application` with only the `status`. The timeline gains an entry by
  itself.
- A company the person wants gone: `example_tracker_remove_company` removes it AND every application
  made to it. Say how many applications that is and call it only when they asked.

Each tool answers with the whole search. Tell the person what changed in one line, not the whole
list.

# Answer about the search

While the Job search tab is open, the person's message carries what it shows. Answer from it; call
`example_tracker_report` when nothing is attached (it also names applications waiting more than 14
days for an answer, worth a follow-up). Use `example_tracker_find` to find an application by meaning
("the remote design ones"); while the embedding model is not ready it answers so, and the report is
the fallback.
