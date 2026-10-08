# Known Limitations

- The current Apple Silicon DMG is unsigned. Clean-user installation requires a valid Developer ID signature and notarization.
- The complete upstream tool surfaces and JSX are included in the manager runtime. Real editing workflows still need E2E coverage in Illustrator 30.3.0 and InDesign 21.0.0.192.
- The InDesign UXP panel requires manual Creative Cloud approval and a one-time token paste. The installer can open the CCX package and copy the token, but cannot approve Creative Cloud prompts.
- OpenCode and WorkBuddy config files can be updated while preserving unrelated JSONC settings. A conflicting server entry is left untouched and reported for the user to resolve.
- Illustrator `artboard-web` conversion uses the actual selected artboard rectangle. Native `document` and `artboard` conversions still follow Illustrator's `Document.convertCoordinate()` behavior; real multi-artboard positioning must be verified in Illustrator.
- InDesign timeouts and plugin disconnects are reported as possible unknown outcomes. The bridge does not replay operations or block future calls; the agent must inspect the document before deciding what to do next.
- JSX runs as trusted local code with access provided by the Adobe application. It is not sandboxed.
