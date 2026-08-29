# ADR 0001: RAG Stack for Epic 3 (Corpus & Retrieval)

Status: Accepted
Date: 2026-08-29

## Context

Epic 3 needs to build retrieval over two distinct corpora:

1. The target codebase (source, README, existing specs) - so specs generated in Epic 4 stay consistent with existing patterns and don't contradict code that already exists.
2. An external standards corpus - OWASP ASVS, OWASP Top 10, and a coding style guide - so security/coding-standard requirements cite a specific standard, not model priors.

Epic 4 and Epic 5's issue bodies already commit to a hard requirement: every generated requirement and every automatically-closed gap must cite the specific codebase or standards passage it's grounded in. That requirement, decided before this ADR, drove several of the choices below - it ruled out at least one otherwise-attractive option (see Claude Projects, below).

This ADR was researched and decided 8/29/2026. RAG tooling moves fast; if this is being read more than a few months after that date, treat every specific model/product name below as "what we picked at the time," re-check current options before assuming they're still current, and only revise this ADR if the environment scan turns up something that actually changes the tradeoff.

## Decision

- **Embeddings: Voyage AI.** `voyage-code-3` for the codebase corpus, `voyage-4` or `voyage-4-lite` for the standards corpus.
- **Grounding/citations: Claude's native Citations feature** (`search_result` content blocks with `citations.enabled`), not a hand-rolled attribution scheme.
- **Vector store: LanceDB.** Embedded, in-process, no server.
- **Orchestration framework: none.** Direct calls to the Voyage SDK, LanceDB SDK, and Anthropic SDK.
- **Codebase chunking: tree-sitter-based**, chunked along function/class/module boundaries, not fixed-size text windows. Standards-corpus chunking stays plain sentence/section-based (it's prose, not code).
- **Explicitly rejected: Claude Projects' built-in RAG.** Zero-infra and genuinely good for a lot of use cases, but it does not currently support claim-specific source citations - which Epic 4/5 require as a hard constraint, not a preference. That one gap is disqualifying for this use case specifically; it is not a general knock on the feature.
- **Explicitly rejected: hosted vector services** (Pinecone, Qdrant Cloud, Weaviate Cloud, etc.). work-permit is a distributed CLI tool, not a hosted service - a corpus of "one repo's code plus a fixed standards set" doesn't justify a managed service dependency, and it would mean every user of the CLI needs an account with a third-party vector host just to run it.
- **Explicitly rejected (for now): LangChain.js / LlamaIndex.TS.** Both are mature, both work. Neither is justified for two corpora, one embedding call, one vector query, and one grounded Claude call - that's ~150-200 lines of direct code. A framework here adds abstraction and a dependency surface (which Epic 7's standards-compliance gate would then have to vet) without buying capability we need yet. Revisit if Epic 3 grows real complexity later - multi-hop retrieval, re-ranking, hybrid search, many more data sources - rather than adopting one preemptively.

## Why each piece, specifically

**Why Voyage over a generic embedding API.** Anthropic doesn't ship its own embedding model and directly recommends Voyage AI as the compatible partner - this isn't "a" choice among equals, it's the default path for anything built around Claude. Using two different models for the two corpora (code vs. prose) is normal RAG practice, not overengineering: a general-purpose text embedding model handles code's semantic structure (control flow, naming conventions, call graphs) poorly, since code isn't prose with different vocabulary, it's structurally different content.

**Why Citations over building our own attribution.** We'd already committed Epic 4/5 to "every requirement cites a specific passage" before researching tooling. Claude's Citations API returns citations parsed directly from the source document - exact character ranges, guaranteed to point at real text - rather than Claude describing where it thinks a claim came from. That's a stronger foundation than any custom scheme we'd write ourselves, and cited text doesn't count as output tokens, so it's also cheaper than the naive approach of dumping full retrieved chunks into the prompt and asking Claude to quote them back.

**Why LanceDB over Chroma/sqlite-vec/hosted options.** work-permit gets distributed as a CLI tool - anyone running it (starting with us, on any future target repo) needs zero infrastructure setup: no server, no Docker container, no third-party account. LanceDB is embedded and in-process with real Node/TypeScript bindings, and scales past what fits in RAM, which a fixed-size codebase-plus-standards corpus will not come close to needing but costs nothing to have. Chroma is the other embedded contender but leans more Python-native even with a JS client. sqlite-vec is worth remembering if we ever want everything collapsed into one `.db` file with no separate vector index - simpler ops story, less purpose-built for vector search specifically.

**Why no orchestration framework.** LangChain.js and LlamaIndex.TS both solve a bigger problem than we have: many data connectors, many retrieval strategies, agentic multi-step chains. work-permit's Epic 3 retrieval is one embed call, one vector query, one grounded generation call, against exactly two corpora. Adopting a framework here means Epic 7 (standards compliance) has to review a much larger dependency surface for a capability we don't use, and the abstraction makes the actual retrieval logic harder to reason about, not easier, at this scale.

**Why tree-sitter for code, not fixed-size chunks.** Fixed-size chunking (every N tokens) is fine for prose - OWASP docs don't care where a paragraph is cut. It actively breaks code retrieval: a naive chunk boundary can split a function's signature from its body, or its error handling from the rest of the function, handing Claude an incomplete unit that looks complete. Parsing the codebase into an AST and chunking along function/class/module boundaries keeps every retrieved chunk semantically whole. CocoIndex has a published reference implementation of this exact pattern for codebase indexing, worth pulling up when Epic 3's stories get built rather than re-deriving from scratch.

## Consequences

- Epic 3's story breakdown should include: a Voyage AI client wrapper (two model configs), a tree-sitter chunker for the codebase corpus, a plain chunker for the standards corpus, LanceDB read/write, and a retrieval-to-`search_result`-block adapter that Epic 4/5 consume directly.
- Epic 7 (standards compliance) has a smaller dependency surface to review than it would with a full orchestration framework in the stack - Voyage SDK, LanceDB SDK, Anthropic SDK, and a tree-sitter binding.
- If a future epic needs multi-hop retrieval, re-ranking, or many more data sources than the current two corpora, that's the trigger to revisit "no orchestration framework" - not a reason to add one now.

## Sources consulted (8/29/2026)

- Embeddings - Claude Platform Docs: https://platform.claude.com/docs/en/build-with-claude/embeddings
- Citations - Claude Platform Docs: https://platform.claude.com/docs/en/build-with-claude/citations
- Best Vector Databases in 2026: A Complete Comparison Guide (Firecrawl): https://www.firecrawl.dev/blog/best-vector-databases
- Testing Claude Projects' New RAG Feature: https://promptrevolution.poltextlab.com/testing-claude-projects-new-rag-feature-fast-setup-accurate-retrieval-across-113-articles/
- Build Real-Time Codebase Indexing for AI Code Generation (CocoIndex): https://cocoindex.io/blogs/index-code-base-for-rag/
- Building RAG on codebases: Part 1 (LanceDB): https://www.lancedb.com/blog/building-rag-on-codebases-part-1
