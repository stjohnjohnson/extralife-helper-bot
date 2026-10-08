# Test-only JSON codec

`json.lua` is the unmodified MIT-licensed rxi/json.lua v0.1.2 at commit `dbf4b2dd2eb7c23be2773c89eb059dadd6436f94`:
https://github.com/rxi/json.lua/blob/dbf4b2dd2eb7c23be2773c89eb059dadd6436f94/json.lua

The embedded copyright/license is retained. It supplies actual JSON encode/decode to the standalone Lua harness; it is not shipped to Stream Avatars and does not replace its built-in JSON implementation. Tests cannot establish equivalence with the application's embedded codec.
