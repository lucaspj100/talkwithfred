<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep live-call caption/history presentation in `voice-transcript.tsx` and caption selection in a pure helper; consume existing voice-hook outputs without changing the audio lifecycle.
- Scope mobile call sizing and visual-viewport observation to the voice-call surface; preserve desktop layout and avoid global scroll locks or viewport overrides.
- Express call sizing through Tailwind utilities and optional avatar/dialog presentation props rather than custom CSS selectors; keep shared defaults unchanged.
