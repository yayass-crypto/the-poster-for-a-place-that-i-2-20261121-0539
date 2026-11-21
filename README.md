# LUMARIS — The Poster for a Place That Isn't There

[![make.fun · the-poster-for-a-place-that-i-2-20261121-0539](https://make.fun/badge/the-poster-for-a-place-that-i-2-20261121-0539.svg)](https://make.fun/bounty/the-poster-for-a-place-that-i-2-20261121-0539?utm_source=github&utm_medium=readme&utm_campaign=the-poster-for-a-place-that-i-2-20261121-0539)
[![rank](https://make.fun/badge/the-poster-for-a-place-that-i-2-20261121-0539/yayass-crypto/the-poster-for-a-place-that-i-2-20261121-0539/rank.svg)](https://make.fun/bounty/the-poster-for-a-place-that-i-2-20261121-0539/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=the-poster-for-a-place-that-i-2-20261121-0539)
[![reward](https://make.fun/badge/the-poster-for-a-place-that-i-2-20261121-0539/yayass-crypto/the-poster-for-a-place-that-i-2-20261121-0539/reward.svg)](https://make.fun/bounty/the-poster-for-a-place-that-i-2-20261121-0539?utm_source=github&utm_medium=readme&utm_campaign=the-poster-for-a-place-that-i-2-20261121-0539)

A travel poster for a place that does not exist, built for the make.fun
competition
[the-poster-for-a-place-that-i-2-20261121-0539](https://make.fun/bounty/the-poster-for-a-place-that-i-2-20261121-0539).

**LUMARIS — Isles of the Lantern Tide.** Three green isles float above a sea
of clouds at dusk, waterfalls pouring off their edges into the mist. On the
great isle stands the lantern tower, its three windows lit, while paper
lanterns drift up from every shore. A low amber sun sinks behind the eastern
isle; an airship crosses the rose sky and a little skiff sails the clouds
below. Come for the light, stay for the tide.

## Run

```sh
node main.ts            # Node 22
# writes $MAKEFUN_OUTPUT_DIR/entry.png (or /output/entry.png)
```

`main.ts` is a single self-contained program: Node's standard library only,
no network, no fonts, no image assets. Every star, lantern, cloud and
waterfall is painted procedurally from one fixed seed, and the place name is
set in a hand-drawn geometric stroke font defined in the same file — so the
poster is fully original and the output is deterministic: two runs write
byte-identical PNGs.

## Output

- `entry.png` — 1024 × 1024 RGB PNG, ~436 KB (gate: ≤ 1,048,576 bytes,
  ≤ 1024 × 1024 px), rendered in ~1.2 s.
- Verified locally: two runs produce identical sha256; the PNG opens as a
  whole image and was visually inspected.

## License

MIT — see [LICENSE](LICENSE).
