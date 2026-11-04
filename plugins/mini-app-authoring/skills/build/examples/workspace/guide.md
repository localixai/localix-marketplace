_Use: Keep HTTP requests for this chat — save one the person describes or pastes, read the saved ones,
hand over the curl command, and remove one; not for sending a request yourself._

# Save and read requests

- The person asks for a request ("a GET for the users endpoint") or pastes one: call
  `example_workspace_save_request` once per request, with a short `name`, the `method`, the `url`,
  `headers` as `Name: value` lines and a `body` only when there is one.
- To find a request, call `example_workspace_list_requests`; every line ends with its id.
- To hand over a command, call `example_workspace_curl_request` with the id and give the person the
  line. The person runs a saved request themselves: with the Run button on the strip above the
  composer, or on the card of the save in the transcript. Do not run it for them.
- To remove one, call `example_workspace_remove_request` with the id the person named. Never remove
  one they did not name.

Each save and removal answers with the whole list. Tell the person what changed in one line.

# The `.http` files

A file ending in `.http` opens in an editor with the file's requests listed under it, each with a Go
to and a Run button. Its format is requests separated by `### name` lines, then `METHOD url`, header
lines, a blank line and the body. When the person wants requests in a file, write the file with your
file tools in that format; this app only reads it. A saved request mentioned with `@` arrives as the
same text.
