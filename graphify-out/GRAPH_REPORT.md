# Graph Report - Claude  (2026-11-07)

## Corpus Check
- 41 files · ~47,853 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: .wasm 3, (none) 2, .toml 2)

## Summary
- 1054 nodes · 1873 edges · 71 communities (39 shown, 32 thin omitted)
- Extraction: 89% EXTRACTED · 11% INFERRED · 0% AMBIGUOUS · INFERRED: 199 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9fbdd640`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- i
- reviews.py
- package.json
- src/worker.js
- L
- L
- V
- V
- imgdiff.py
- tesseract-core-lstm.wasm.js
- tesseract-core-simd-lstm.wasm.js
- common.js
- env
- J
- A
- O
- J
- O
- Nb
- Nb
- ji
- A
- ei
- Lh
- Lh
- zb
- zb
- ji
- replica-recon
- p
- Recon map: {{app}} ({{platform}})
- replica-backend
- replica-build
- h
- h
- p
- replica-brand
- replica-deploy
- replica-entrepreneur
- replica-test
- K
- N
- Q
- K
- N
- Q
- replica-architect
- replica-design
- replica-diff
- replica-launch
- Architecture: {{your app}} (a rebuild of {{app}}'s core features)
- Deploy checklist: {{your app}}
- di
- .Gg
- di
- .Gg
- Espace signature
- deploy.sh
- a
- ei
- hi
- M
- a
- M
- ii
- ii
- ocr/worker.js
- install-graphify.sh
- bug-report.md
- test-plan.md

## God Nodes (most connected - your core abstractions)
1. `V()` - 66 edges
2. `V()` - 66 edges
3. `L()` - 47 edges
4. `L()` - 47 edges
5. `i()` - 42 edges
6. `n()` - 38 edges
7. `A()` - 33 edges
8. `A()` - 33 edges
9. `r()` - 30 edges
10. `J()` - 25 edges

## Surprising Connections (you probably didn't know these)
- `Sa()` --indirect_call--> `b()`  [INFERRED]
  atelier-pdf/ocr/core/tesseract-core-lstm.wasm.js → atelier-pdf/ocr/worker.min.js
- `t()` --indirect_call--> `F()`  [INFERRED]
  atelier-pdf/ocr/core/tesseract-core-lstm.wasm.js → atelier-pdf/ocr/worker.min.js
- `a()` --indirect_call--> `b()`  [INFERRED]
  atelier-pdf/ocr/core/tesseract-core-lstm.wasm.js → atelier-pdf/ocr/worker.min.js
- `Sa()` --indirect_call--> `b()`  [INFERRED]
  atelier-pdf/ocr/core/tesseract-core-simd-lstm.wasm.js → atelier-pdf/ocr/worker.min.js
- `t()` --indirect_call--> `F()`  [INFERRED]
  atelier-pdf/ocr/core/tesseract-core-simd-lstm.wasm.js → atelier-pdf/ocr/worker.min.js

## Import Cycles
- None detected.

## Communities (71 total, 32 thin omitted)

### Community 0 - "i"
Cohesion: 0.06
Nodes (80): a(), s(), u(), b(), c(), A(), d(), E() (+72 more)

### Community 1 - "reviews.py"
Cohesion: 0.06
Nodes (40): build_patterns(), is_binary(), main(), norm_hex(), render(), sweep(), check(), colours() (+32 more)

### Community 2 - "package.json"
Cohesion: 0.05
Nodes (45): buffer, esbuild, jszip, mammoth, node-forge, pdf-lib, pdfjs-dist, @signpdf/placeholder-pdf-lib (+37 more)

### Community 3 - "src/worker.js"
Cohesion: 0.17
Nodes (34): b64ToBytes(), client(), emailReady(), err(), esc(), fetch(), getSetting(), handleAdmin() (+26 more)

### Community 8 - "imgdiff.py"
Cohesion: 0.12
Nodes (17): compare(), edges(), gray(), main(), _over_white(), _paeth(), PngError, read_png() (+9 more)

### Community 9 - "tesseract-core-lstm.wasm.js"
Cohesion: 0.07
Nodes (11): ci(), fi(), gi(), R(), Rh(), Th(), Vh(), Wh() (+3 more)

### Community 10 - "tesseract-core-simd-lstm.wasm.js"
Cohesion: 0.07
Nodes (11): ci(), fi(), gi(), R(), Rh(), Th(), Vh(), Wh() (+3 more)

### Community 11 - "common.js"
Cohesion: 0.09
Nodes (9): download(), h(), makeViewer(), v, seg(), signaturePad(), capture(), renderTyped() (+1 more)

### Community 12 - "env"
Cohesion: 0.07
Nodes (26): concurrency, run, defaults, env, runs-on, steps, ADMIN_CODE, CLOUDFLARE_ACCOUNT_ID (+18 more)

### Community 18 - "Nb"
Cohesion: 0.19
Nodes (16): Ab(), d(), Db(), e(), Ha(), Ia(), Nb(), g() (+8 more)

### Community 19 - "Nb"
Cohesion: 0.19
Nodes (16): Ab(), d(), Db(), e(), Ha(), Ia(), Nb(), g() (+8 more)

### Community 20 - "ji"
Cohesion: 0.16
Nodes (3): ai(), ji(), Sh()

### Community 22 - "ei"
Cohesion: 0.13
Nodes (4): ai(), ei(), Sh(), Ya()

### Community 23 - "Lh"
Cohesion: 0.14
Nodes (4): bi(), Lh(), Y(), Zh()

### Community 24 - "Lh"
Cohesion: 0.14
Nodes (4): bi(), Lh(), Y(), Zh()

### Community 25 - "zb"
Cohesion: 0.42
Nodes (13): ac(), $b(), bc(), cc(), Hh(), Pb(), tb(), ub() (+5 more)

### Community 26 - "zb"
Cohesion: 0.42
Nodes (13): ac(), $b(), bc(), cc(), Hh(), Pb(), tb(), ub() (+5 more)

### Community 28 - "replica-recon"
Cohesion: 0.15
Nodes (12): Output, replica-recon, Step 1: scope, Step 2: list the sources, Step 3: screen inventory, Step 4: user flows, Step 5: components, Step 6: inferred data model (+4 more)

### Community 29 - "p"
Cohesion: 0.20
Nodes (9): gb(), hb(), Ma(), Na(), Oa(), p(), Pa(), xa() (+1 more)

### Community 30 - "Recon map: {{app}} ({{platform}})"
Cohesion: 0.18
Nodes (10): Components, Core loop, Feature matrix, Flows, Inferred data model, Out of scope (cannot or should not be cloned), Recon map: {{app}} ({{platform}}), Screens (+2 more)

### Community 31 - "replica-backend"
Cohesion: 0.20
Nodes (9): Auth, Database, Email and jobs, Integrations, Output, Payments, replica-backend, Security checklist (+1 more)

### Community 32 - "replica-build"
Cohesion: 0.20
Nodes (9): Definition of done, per screen, Output, replica-build, Step 1: the shell, Step 2: the vertical slice, Step 3: screen by screen, Step 4: the build log, The rules (+1 more)

### Community 33 - "h"
Cohesion: 0.25
Nodes (5): Eb(), h(), kb(), Ta(), Ua()

### Community 34 - "h"
Cohesion: 0.25
Nodes (5): Eb(), h(), kb(), Ta(), Ua()

### Community 35 - "p"
Cohesion: 0.25
Nodes (8): gb(), hb(), Ma(), Na(), Oa(), p(), Pa(), xa()

### Community 36 - "replica-brand"
Cohesion: 0.22
Nodes (8): Output, replica-brand, Step 1: the name, Step 2: the checks, run, not assumed, Step 3: palette, Step 4: logo brief, Step 5: voice, Step 6: the sweep

### Community 37 - "replica-deploy"
Cohesion: 0.22
Nodes (8): Output, replica-deploy, Step 1: preflight, Step 2: production services, Step 3: host and domain, Step 4: watch it, Step 5: mobile, if there is an app, The rules

### Community 38 - "replica-entrepreneur"
Cohesion: 0.22
Nodes (8): Output, replica-entrepreneur, Step 1: collect, Step 2: rank, Step 3: three lists, Step 4: the fix plan, Step 5: the angle, The rules, which are not negotiable

### Community 39 - "replica-test"
Cohesion: 0.22
Nodes (8): Output, replica-test, Step 1: the plan, Step 2: automate what you can, Step 3: click through the rest, Step 4: report bugs, Step 5: fix loop, The rule

### Community 46 - "replica-architect"
Cohesion: 0.25
Nodes (7): Output, replica-architect, Step 1: the stack, Step 2: the schema, Step 3: the API, Step 4: the parts that bite, Step 5: build order

### Community 47 - "replica-design"
Cohesion: 0.25
Nodes (7): Output, replica-design, Step 1: measure, do not guess, Step 2: write the tokens, Step 3: component specs, Step 4: build the primitives, The rules

### Community 48 - "replica-diff"
Cohesion: 0.25
Nodes (7): Output, replica-diff, Step 1: feature parity, Step 2: layout diff, Step 3: behaviour diff, Step 4: the report, What parity means here

### Community 49 - "replica-launch"
Cohesion: 0.25
Nodes (7): Output, replica-launch, Step 1: landing page, Step 2: pricing, Step 3: store listing, Step 4: launch plan, The rules

### Community 50 - "Architecture: {{your app}} (a rebuild of {{app}}'s core features)"
Cohesion: 0.29
Nodes (6): API, Architecture: {{your app}} (a rebuild of {{app}}'s core features), Build order, Schema, Stack, The parts that bite

### Community 51 - "Deploy checklist: {{your app}}"
Cohesion: 0.33
Nodes (5): Deploy checklist: {{your app}}, Domain, Preflight (all must pass), Production, Watch

### Community 56 - "Espace signature"
Cohesion: 0.40
Nodes (4): Développement local, Espace signature, Mise en ligne (une seule fois), Utilisation

### Community 57 - "deploy.sh"
Cohesion: 0.70
Nodes (4): d1_id(), fail(), kv_id(), deploy.sh script

### Community 58 - "a"
Cohesion: 0.67
Nodes (4): Da(), Kh(), a(), Sa()

### Community 62 - "a"
Cohesion: 0.67
Nodes (4): Da(), Kh(), a(), Sa()

## Knowledge Gaps
- **32 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `b()` connect `i` to `a`, `a`?**
  _High betweenness centrality (0.106) - this node is a cross-community bridge._
- **Are the 21 inferred relationships involving `i()` (e.g. with `a()` and `s()`) actually correct?**
  _`i()` has 21 INFERRED edges - model-reasoned connections that need verification._
- **Should `i` be split into smaller, more focused modules?**
  _Cohesion score 0.06246134817563389 - nodes in this community are weakly interconnected._
- **Why does `L()` connect `L` to `tesseract-core-lstm.wasm.js`, `N`, `J`, `A`, `ji`, `Lh`, `M`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Should `reviews.py` be split into smaller, more focused modules?**
  _Cohesion score 0.0642243328810493 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05370101596516691 - nodes in this community are weakly interconnected._
- **Should `L` be split into smaller, more focused modules?**
  _Cohesion score 0.06060606060606061 - nodes in this community are weakly interconnected._