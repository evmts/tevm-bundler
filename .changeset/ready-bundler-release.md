---
'@tevm/base-bundler': patch
---

Prepare the extracted bundler workspace for independent, provenance-backed releases, including complete native platform packages. Remove the empty WASI package stubs because their Rust dependency graph cannot compile for WASI and the published release-candidate tarballs contain no WebAssembly binary.
