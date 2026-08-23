# Roadmap Guidance

Use `## @tierN` headings as attention bands and `### @work|@proof|@risk|@gap|@unknown|@blocker|@decision|@finding @state` as item identities.

Allowed states are `@open`, `@active`, `@ready`, `@blocked`, `@deferred`, `@partial`, `@done`, `@accepted`, and `@dropped`. Do not mark work or proof done without an adjacent `@evidence` line.

Keep roadmap items concise. Link durable detail with `@memory`, incomplete proof with `@proof_gap`, prerequisites with `@blocker`, and accepted behavior with `@accept`. Update the roadmap date whenever its active state changes.

Tier routing is grep-first: read headings and mentions, enter the highest relevant open tier, and load only linked memory hooks before reading selected bodies.
